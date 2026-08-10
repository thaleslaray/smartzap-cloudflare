export type WebhookEventRecord = {
  event_kind: string
  event_key: string
  waba_id: string
  phone_number_id: string | null
  message_id: string | null
  status: string
  raw: string
  error_code?: string | null
  error_detail?: string | null
  fbtrace_id?: string | null
  pricing_model?: string | null
  pricing_type?: string | null
  pricing_category?: string | null
  pricing_billable?: boolean | null
}

export type PendingStatusEvent = {
  event_key: string;
  message_id: string;
  status: string;
  error_code: string | null;
  error_detail: string | null;
};

const reconciliationColumns: Array<[string, string]> = [
  [
    "apply_state",
    "ALTER TABLE status_events ADD COLUMN apply_state TEXT NOT NULL DEFAULT 'pending' CHECK (apply_state IN ('pending', 'applied', 'ignored'))",
  ],
  [
    "apply_attempts",
    "ALTER TABLE status_events ADD COLUMN apply_attempts INTEGER NOT NULL DEFAULT 0",
  ],
  [
    "last_apply_error",
    "ALTER TABLE status_events ADD COLUMN last_apply_error TEXT",
  ],
  ["applied_at", "ALTER TABLE status_events ADD COLUMN applied_at TEXT"],
  ["campaign_id", "ALTER TABLE status_events ADD COLUMN campaign_id TEXT"],
  [
    "campaign_contact_id",
    "ALTER TABLE status_events ADD COLUMN campaign_contact_id TEXT",
  ],
];

/** Fallback operacional para indisponibilidade da API de migrations do D1. */
export async function ensureStatusEventReconciliationSchema(db: D1Database) {
  const columns = new Set(
    (
      await db.prepare("PRAGMA table_info(status_events)").all<{ name: string }>()
    ).results.map((column) => column.name),
  );
  let changed = false;
  for (const [name, sql] of reconciliationColumns) {
    if (columns.has(name)) continue;
    await db.prepare(sql).run();
    changed = true;
  }
  await db.prepare(
    `UPDATE status_events SET apply_state='ignored'
     WHERE event_kind IS NULL OR event_kind <> 'message_status'
        OR status NOT IN ('delivered','read','failed')`,
  ).run();
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_status_events_pending_application
     ON status_events(received_at, id)
     WHERE apply_state='pending' AND event_kind='message_status'`,
  ).run();
  await db.prepare(
    `INSERT OR IGNORE INTO d1_migrations (name)
     VALUES ('0035_status_event_reconciliation.sql')`,
  ).run();
  return { changed, columns: reconciliationColumns.length };
}

export function statusEventsDb(db: D1Database) {
  return {
    async applyState(eventKey: string): Promise<string | null> {
      const row = await db.prepare(
        'SELECT apply_state FROM status_events WHERE event_key=?1 LIMIT 1',
      ).bind(eventKey).first<{ apply_state: string }>()
      return row?.apply_state ?? null
    },
    async insertMany(events: WebhookEventRecord[]) {
      if (!events.length) return
      for (let offset = 0; offset < events.length; offset += 50) {
        await db.batch(events.slice(offset, offset + 50).map((e) =>
          db.prepare(
            `INSERT OR IGNORE INTO status_events
               (message_id, status, raw, event_kind, event_key, waba_id, phone_number_id,
               error_code, error_detail, fbtrace_id, pricing_model, pricing_type,
               pricing_category, pricing_billable)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`
          ).bind(e.message_id, e.status, e.raw, e.event_kind, e.event_key,
            e.waba_id, e.phone_number_id, e.error_code ?? null,
            e.error_detail ?? null, e.fbtrace_id ?? null,
            e.pricing_model ?? null, e.pricing_type ?? null,
            e.pricing_category ?? null, e.pricing_billable ?? null)))
      }
    },
    async markApplied(
      eventKey: string,
      target: { campaignId: string; contactId: string },
    ) {
      await db.prepare(
        `UPDATE status_events SET apply_state='applied', applied_at=datetime('now'),
           apply_attempts=apply_attempts+1, last_apply_error=NULL,
           campaign_id=?2, campaign_contact_id=?3
         WHERE event_key=?1 AND apply_state <> 'applied'`,
      ).bind(eventKey, target.campaignId, target.contactId).run();
    },
    async markPending(eventKey: string, error: string) {
      await db.prepare(
        `UPDATE status_events SET apply_state='pending',
           apply_attempts=apply_attempts+1, last_apply_error=?2
         WHERE event_key=?1 AND apply_state <> 'applied'`,
      ).bind(eventKey, error.slice(0, 255)).run();
    },
    async markIgnored(eventKey: string) {
      await db.prepare(
        `UPDATE status_events SET apply_state='ignored', applied_at=datetime('now')
         WHERE event_key=?1 AND apply_state='pending'`,
      ).bind(eventKey).run();
    },
    async pending(limit = 200): Promise<PendingStatusEvent[]> {
      return (
        await db.prepare(
          `SELECT event_key, message_id, status, error_code, error_detail
           FROM status_events
           WHERE apply_state='pending' AND event_kind='message_status'
             AND message_id IS NOT NULL
             AND status IN ('delivered','read','failed')
           ORDER BY received_at, id LIMIT ?1`,
        ).bind(Math.max(1, Math.min(500, limit))).all<PendingStatusEvent>()
      ).results;
    },
  }
}
