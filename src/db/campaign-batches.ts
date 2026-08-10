export type CampaignBatch = {
  id: string; campaign_id: string; sequence: number; status: string
  attempt_count: number; recipient_count: number; accepted_count: number
  delivered_count: number; read_count: number; failed_count: number
  started_at: string | null; completed_at: string | null; created_at: string
}

export function campaignBatchesDb(db: D1Database) {
  return {
    async begin(campaignId: string): Promise<CampaignBatch> {
      const id = crypto.randomUUID()
      const next = (await db.prepare(
        'SELECT COALESCE(MAX(sequence), -1) + 1 AS n FROM campaign_batches WHERE campaign_id = ?1'
      ).bind(campaignId).first<{ n: number }>())?.n ?? 0
      await db.prepare(
        `INSERT INTO campaign_batches (id, campaign_id, sequence, status, attempt_count, started_at)
         VALUES (?1, ?2, ?3, 'processing', 1, datetime('now'))`
      ).bind(id, campaignId, next).run()
      return (await db.prepare('SELECT * FROM campaign_batches WHERE id = ?1').bind(id).first<CampaignBatch>())!
    },
    async complete(id: string, input: { recipients: number; accepted: number; failed: number; status?: 'completed' | 'failed' | 'cancelled' }) {
      await db.prepare(
        `UPDATE campaign_batches SET status = ?2, recipient_count = ?3, accepted_count = ?4,
         failed_count = ?5, completed_at = datetime('now') WHERE id = ?1 AND status = 'processing'`
      ).bind(id, input.status ?? 'completed', input.recipients, input.accepted, input.failed).run()
    },
    async refresh(id: string) {
      await db.prepare(
        `UPDATE campaign_batches SET
           recipient_count = (SELECT COUNT(*) FROM campaign_contacts WHERE batch_id = ?1),
           accepted_count = (SELECT COUNT(*) FROM campaign_contacts WHERE batch_id = ?1 AND status IN ('sent', 'delivered', 'read')),
           delivered_count = (SELECT COUNT(*) FROM campaign_contacts WHERE batch_id = ?1 AND status IN ('delivered', 'read')),
           read_count = (SELECT COUNT(*) FROM campaign_contacts WHERE batch_id = ?1 AND status = 'read'),
           failed_count = (SELECT COUNT(*) FROM campaign_contacts WHERE batch_id = ?1 AND status = 'failed')
         WHERE id = ?1`
      ).bind(id).run()
    },
    async finalizeOpen(campaignId: string, status: 'failed' | 'cancelled') {
      const open = (await db.prepare(
        "SELECT id FROM campaign_batches WHERE campaign_id = ?1 AND status = 'processing'"
      ).bind(campaignId).all<{ id: string }>()).results
      for (const batch of open) {
        await this.refresh(batch.id)
        await db.prepare(
          "UPDATE campaign_batches SET status = ?2, completed_at = datetime('now') WHERE id = ?1 AND status = 'processing'"
        ).bind(batch.id, status).run()
      }
    },
    async trace(campaignId: string, batchId: string | null, eventType: string, severity: 'info' | 'warn' | 'error', detail?: Record<string, unknown>) {
      await db.prepare(
        `INSERT INTO campaign_trace_events (campaign_id, batch_id, event_type, severity, detail_json)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      ).bind(campaignId, batchId, eventType, severity, detail ? JSON.stringify(detail) : null).run()
    },
    async list(campaignId: string) {
      return (await db.prepare(
        'SELECT * FROM campaign_batches WHERE campaign_id = ?1 ORDER BY sequence DESC LIMIT 200'
      ).bind(campaignId).all<CampaignBatch>()).results
    },
    async traces(campaignId: string) {
      return (await db.prepare(
        'SELECT * FROM campaign_trace_events WHERE campaign_id = ?1 ORDER BY id DESC LIMIT 200'
      ).bind(campaignId).all()).results
    },
  }
}
