import {
  assertConversionTime,
  conversionIdentity,
  maskedClickId,
  toMinorUnits,
  type ConversionEventInput,
} from "../domain/conversions";

export type AttributionKind = "ctwa" | "referral_without_click_id";

export type AttributionRow = {
  id: string;
  conversation_id: string;
  waba_id: string;
  phone_number_id: string;
  source_message_id: string;
  attribution_kind: AttributionKind;
  ctwa_clid: string | null;
  source_id: string | null;
  source_type: string | null;
  source_url: string | null;
  occurred_at: number;
  captured_at: string;
};

export type ConversionOutboxStatus =
  | "pending"
  | "sending"
  | "accepted"
  | "unknown"
  | "temporary_failed"
  | "permanent_failed"
  | "dead_letter"
  | "cancelled";

export type ClaimedConversion = {
  id: string;
  event_id: string;
  event_name: "LeadSubmitted" | "QualifiedLead" | "Purchase";
  event_time: number;
  conversation_id: string;
  attribution_id: string;
  business_object_type: string;
  business_object_id: string;
  value_minor: number | null;
  currency: string | null;
  dataset_id: string;
  attempts: number;
  lease_id: string;
  waba_id: string;
  phone_number_id: string;
  ctwa_clid: string;
};

export type ConversionDeliveryResult = {
  outcome: "accepted" | "unknown" | "temporary_failed" | "permanent_failed" | "dead_letter";
  httpStatus?: number | null;
  errorCode?: string | null;
  errorSubcode?: string | null;
  errorDetail?: string | null;
  fbtraceId?: string | null;
  eventsReceived?: number | null;
  nextAttemptAt?: number | null;
};

function publicAttribution(row: AttributionRow) {
  const { ctwa_clid: clickId, ...rest } = row;
  return {
    ...rest,
    has_click_id: Boolean(clickId),
    click_id_masked: maskedClickId(clickId),
  };
}

export function conversionsDb(db: D1Database) {
  return {
    async upsertAttribution(input: {
      conversationId: string;
      wabaId: string;
      phoneNumberId: string;
      sourceMessageId: string;
      ctwaClid?: string;
      sourceId?: string;
      sourceType?: string;
      sourceUrl?: string;
      occurredAt: number;
    }): Promise<AttributionRow> {
      const id = crypto.randomUUID();
      const kind: AttributionKind = input.ctwaClid
        ? "ctwa"
        : "referral_without_click_id";
      await db.prepare(
        `INSERT OR IGNORE INTO conversation_attributions
         (id, conversation_id, waba_id, phone_number_id, source_message_id,
          attribution_kind, ctwa_clid, source_id, source_type, source_url, occurred_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
      ).bind(
        id,
        input.conversationId,
        input.wabaId,
        input.phoneNumberId,
        input.sourceMessageId,
        kind,
        input.ctwaClid ?? null,
        input.sourceId ?? null,
        input.sourceType ?? null,
        input.sourceUrl ?? null,
        input.occurredAt,
      ).run();

      const row = await db.prepare(
        `SELECT * FROM conversation_attributions
         WHERE (waba_id=?1 AND source_message_id=?2)
            OR (?3 IS NOT NULL AND waba_id=?1 AND ctwa_clid=?3)
         ORDER BY CASE WHEN source_message_id=?2 THEN 0 ELSE 1 END
         LIMIT 1`,
      ).bind(input.wabaId, input.sourceMessageId, input.ctwaClid ?? null)
        .first<AttributionRow>();
      if (!row) throw new Error("não foi possível persistir a origem CTWA");
      if (row.conversation_id !== input.conversationId)
        throw new Error("clique CTWA já pertence a outra conversa");
      if (row.source_message_id !== input.sourceMessageId)
        throw new Error("clique CTWA reapareceu em outra mensagem");
      return row;
    },

    async listAttributions(conversationId: string) {
      const rows = (await db.prepare(
        `SELECT * FROM conversation_attributions
         WHERE conversation_id=?1 ORDER BY occurred_at DESC,id DESC`,
      ).bind(conversationId).all<AttributionRow>()).results;
      return rows.map(publicAttribution);
    },

    async listCanaryCandidates(limit = 20) {
      const since = Math.floor(Date.now() / 1000) - 7 * 86400;
      const rows = (await db.prepare(
        `SELECT a.* FROM conversation_attributions a
         WHERE a.attribution_kind='ctwa' AND a.ctwa_clid IS NOT NULL
           AND a.occurred_at>=?1
         ORDER BY a.occurred_at DESC,a.id DESC LIMIT ?2`,
      ).bind(since, Math.max(1, Math.min(limit, 50))).all<AttributionRow>()).results;
      return rows.map(publicAttribution);
    },

    async createEvent(input: {
      conversationId: string;
      datasetId: string;
      createdBy: string;
      payload: ConversionEventInput;
    }) {
      const eventTime = input.payload.eventTime ?? Math.floor(Date.now() / 1000);
      assertConversionTime(eventTime);
      const attribution = await db.prepare(
        `SELECT * FROM conversation_attributions
         WHERE id=?1 AND conversation_id=?2`,
      ).bind(input.payload.attributionId, input.conversationId)
        .first<AttributionRow>();
      if (!attribution)
        throw new Error("origem do anúncio não pertence a esta conversa");
      if (!attribution.ctwa_clid || attribution.attribution_kind !== "ctwa")
        throw new Error("esta origem não possui ctwa_clid e não pode ser atribuída pela CAPI");

      if (input.payload.correctionOf) {
        const original = await db.prepare(
          `SELECT id,conversation_id,event_name,lifecycle_status
           FROM conversion_events WHERE id=?1`,
        ).bind(input.payload.correctionOf).first<{
          id: string;
          conversation_id: string;
          event_name: string;
          lifecycle_status: string;
        }>();
        if (!original || original.conversation_id !== input.conversationId)
          throw new Error("evento original não pertence a esta conversa");
        if (original.event_name !== input.payload.eventName)
          throw new Error("a correção deve manter o tipo do evento original");
        if (original.lifecycle_status !== "cancelled")
          throw new Error("cancele o evento original antes de registrar a correção");
      }

      const identity = await conversionIdentity({
        conversationId: input.conversationId,
        eventName: input.payload.eventName,
        businessObjectType: input.payload.businessObjectType,
        businessObjectId: input.payload.businessObjectId,
        correctionOf: input.payload.correctionOf,
      });
      const rowId = crypto.randomUUID();
      const valueMinor = toMinorUnits(input.payload.value);
      const currency = input.payload.currency?.toUpperCase() ?? null;
      const statements = await db.batch([
        db.prepare(
          `INSERT OR IGNORE INTO conversion_events
           (id,event_id,request_key,dedupe_key,conversation_id,attribution_id,
            event_name,event_time,source,business_object_type,business_object_id,
            value_minor,currency,created_by,correction_of)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'manual',?9,?10,?11,?12,?13,?14)`,
        ).bind(
          rowId,
          identity.eventId,
          input.payload.requestKey,
          identity.dedupeKey,
          input.conversationId,
          input.payload.attributionId,
          input.payload.eventName,
          eventTime,
          input.payload.businessObjectType,
          input.payload.businessObjectId,
          valueMinor,
          currency,
          input.createdBy,
          input.payload.correctionOf ?? null,
        ),
        db.prepare(
          `INSERT OR IGNORE INTO conversion_outbox (event_id,dataset_id)
           SELECT id,?2 FROM conversion_events
           WHERE request_key=?1 OR dedupe_key=?3
           ORDER BY CASE WHEN request_key=?1 THEN 0 ELSE 1 END LIMIT 1`,
        ).bind(input.payload.requestKey, input.datasetId, identity.dedupeKey),
      ]);
      const row = await db.prepare(
        `SELECT e.*,o.status AS delivery_status,o.attempts,o.last_error_detail,
                o.events_received,o.accepted_at
         FROM conversion_events e JOIN conversion_outbox o ON o.event_id=e.id
         WHERE e.request_key=?1 OR e.dedupe_key=?2
         ORDER BY CASE WHEN e.request_key=?1 THEN 0 ELSE 1 END LIMIT 1`,
      ).bind(input.payload.requestKey, identity.dedupeKey).first<Record<string, unknown>>();
      if (!row) throw new Error("não foi possível registrar a conversão");
      if (
        row.conversation_id !== input.conversationId ||
        row.event_name !== input.payload.eventName ||
        row.business_object_type !== input.payload.businessObjectType ||
        row.business_object_id !== input.payload.businessObjectId ||
        (row.correction_of ?? null) !== (input.payload.correctionOf ?? null)
      ) throw new Error("chave idempotente já usada por outra conversão");
      return { item: row, created: statements[0].meta.changes === 1 };
    },

    async listEvents(conversationId: string) {
      return (await db.prepare(
        `SELECT e.id,e.event_id,e.event_name,e.event_time,e.business_object_type,
                e.business_object_id,e.value_minor,e.currency,e.match_status,
                e.attribution_status,e.correction_of,e.lifecycle_status,
                e.lifecycle_note,e.lifecycle_changed_at,e.created_at,
                o.status AS delivery_status,o.cancel_reason,o.cancelled_at,
                o.attempts,o.last_error_detail,o.events_received,o.accepted_at,
                a.source_id,a.source_type,a.source_url
         FROM conversion_events e
         JOIN conversion_outbox o ON o.event_id=e.id
         JOIN conversation_attributions a ON a.id=e.attribution_id
         WHERE e.conversation_id=?1 ORDER BY e.event_time DESC,e.id DESC`,
      ).bind(conversationId).all()).results;
    },

    async cancelEvent(input: {
      conversationId: string;
      eventId: string;
      reason: string;
    }) {
      const reason = input.reason.trim().slice(0, 500);
      if (!reason) throw new Error("informe o motivo do cancelamento");
      const existing = await db.prepare(
        `SELECT e.id,e.conversation_id,e.lifecycle_status,o.status AS delivery_status
         FROM conversion_events e JOIN conversion_outbox o ON o.event_id=e.id
         WHERE e.id=?1 AND e.conversation_id=?2`,
      ).bind(input.eventId, input.conversationId).first<{
        id: string;
        conversation_id: string;
        lifecycle_status: string;
        delivery_status: ConversionOutboxStatus;
      }>();
      if (!existing) throw new Error("conversão não encontrada");
      if (existing.lifecycle_status === "cancelled") return { cancelled: false, item: existing };
      if (!["pending", "temporary_failed", "permanent_failed", "dead_letter"].includes(existing.delivery_status))
        throw new Error(existing.delivery_status === "accepted"
          ? "a Meta já aceitou este evento; ele não pode ser cancelado"
          : existing.delivery_status === "unknown"
            ? "o resultado do envio é desconhecido; cancelar poderia duplicar a conversão"
            : "aguarde o envio atual terminar antes de cancelar");

      const results = await db.batch([
        db.prepare(
          `UPDATE conversion_outbox SET status='cancelled',cancel_reason=?3,
             cancelled_at=datetime('now'),next_attempt_at=NULL,lease_id=NULL,
             lease_expires_at=NULL,updated_at=datetime('now')
           WHERE event_id=?1 AND status=?2`,
        ).bind(input.eventId, existing.delivery_status, reason),
        db.prepare(
          `UPDATE conversion_events SET lifecycle_status='cancelled',
             lifecycle_note=?2,lifecycle_changed_at=datetime('now')
           WHERE id=?1 AND EXISTS (
             SELECT 1 FROM conversion_outbox
             WHERE event_id=?1 AND status='cancelled'
           )`,
        ).bind(input.eventId, reason),
      ]);
      if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1)
        throw new Error("a situação da conversão mudou; atualize e tente novamente");
      return { cancelled: true, item: { ...existing, delivery_status: "cancelled" as const } };
    },

    async claim(eventId: string, leaseSeconds = 60): Promise<ClaimedConversion | null> {
      const leaseId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const result = await db.prepare(
        `UPDATE conversion_outbox SET status='sending',lease_id=?2,
             lease_expires_at=?3,attempts=attempts+1,updated_at=datetime('now')
         WHERE event_id=?1 AND (
           (status IN ('pending','temporary_failed') AND COALESCE(next_attempt_at,0)<=?4)
           OR (status='sending' AND COALESCE(lease_expires_at,0)<=?4)
         )`,
      ).bind(eventId, leaseId, now + leaseSeconds, now).run();
      if (result.meta.changes !== 1) return null;
      return db.prepare(
        `SELECT e.id,e.event_id,e.event_name,e.event_time,e.conversation_id,
                e.attribution_id,e.business_object_type,e.business_object_id,
                e.value_minor,e.currency,o.dataset_id,o.attempts,o.lease_id,
                a.waba_id,a.phone_number_id,a.ctwa_clid
         FROM conversion_events e
         JOIN conversion_outbox o ON o.event_id=e.id
         JOIN conversation_attributions a ON a.id=e.attribution_id
         WHERE e.id=?1 AND o.lease_id=?2 AND a.ctwa_clid IS NOT NULL`,
      ).bind(eventId, leaseId).first<ClaimedConversion>();
    },

    async finishClaim(claim: ClaimedConversion, result: ConversionDeliveryResult) {
      const status: ConversionOutboxStatus = result.outcome === "accepted"
        ? "accepted"
        : result.outcome === "unknown"
          ? "unknown"
          : result.outcome === "temporary_failed"
            ? "temporary_failed"
            : result.outcome === "dead_letter"
              ? "dead_letter"
              : "permanent_failed";
      const detail = result.errorDetail?.slice(0, 500) ?? null;
      const batch = await db.batch([
        db.prepare(
          `UPDATE conversion_outbox SET status=?3,next_attempt_at=?4,
             lease_id=NULL,lease_expires_at=NULL,last_http_status=?5,
             last_error_code=?6,last_error_subcode=?7,last_error_detail=?8,
             fbtrace_id=?9,events_received=?10,
             accepted_at=CASE WHEN ?3='accepted' THEN datetime('now') ELSE accepted_at END,
             updated_at=datetime('now')
           WHERE event_id=?1 AND lease_id=?2`,
        ).bind(
          claim.id,
          claim.lease_id,
          status,
          result.nextAttemptAt ?? null,
          result.httpStatus ?? null,
          result.errorCode ?? null,
          result.errorSubcode ?? null,
          detail,
          result.fbtraceId ?? null,
          result.eventsReceived ?? null,
        ),
        db.prepare(
          `INSERT OR IGNORE INTO conversion_attempts
           (id,event_id,attempt,outcome,http_status,error_code,error_subcode,
            error_detail,fbtrace_id,events_received)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
        ).bind(
          crypto.randomUUID(),
          claim.id,
          claim.attempts,
          result.outcome,
          result.httpStatus ?? null,
          result.errorCode ?? null,
          result.errorSubcode ?? null,
          detail,
          result.fbtraceId ?? null,
          result.eventsReceived ?? null,
        ),
      ]);
      if (batch[0].meta.changes !== 1)
        throw new Error("lease da conversão expirou antes da conclusão");
    },

    async due(limit = 100, onlyEventId?: string | null) {
      const now = Math.floor(Date.now() / 1000);
      await db.prepare(
        `UPDATE conversion_outbox SET status='temporary_failed',lease_id=NULL,
             lease_expires_at=NULL,next_attempt_at=?1,
             last_error_detail='lease expirado; reenfileiramento seguro',
             updated_at=datetime('now')
         WHERE status='sending' AND COALESCE(lease_expires_at,0)<=?1`,
      ).bind(now).run();
      return (await db.prepare(
        `SELECT event_id FROM conversion_outbox
         WHERE status IN ('pending','temporary_failed')
           AND COALESCE(next_attempt_at,0)<=?1 AND attempts<6
           AND (?2 IS NULL OR event_id=?2)
         ORDER BY created_at,event_id LIMIT ?3`,
      ).bind(now, onlyEventId ?? null, Math.max(1, Math.min(limit, 100))).all<{ event_id: string }>()).results;
    },

    async deliveryStatus(eventId: string) {
      return db.prepare(
        `SELECT e.id,e.conversation_id,e.event_name,e.event_time,e.lifecycle_status,
                o.status AS delivery_status,o.events_received,o.accepted_at,
                o.last_error_detail,o.last_error_code
         FROM conversion_events e JOIN conversion_outbox o ON o.event_id=e.id
         WHERE e.id=?1`,
      ).bind(eventId).first<Record<string, unknown>>();
    },

    async summary(days: 7 | 30 | 90) {
      const since = Math.floor(Date.now() / 1000) - days * 86400;
      const [totals, revenues, statuses, daily, failures, attributions, latency] = await Promise.all([
        db.prepare(
          `SELECT COUNT(*) AS total,
             COALESCE(SUM(event_name='LeadSubmitted'),0) AS leads,
             COALESCE(SUM(event_name='QualifiedLead'),0) AS qualified,
             COALESCE(SUM(event_name='Purchase'),0) AS purchases,
             COALESCE(SUM(match_status='matched'),0) AS matched,
             COALESCE(SUM(attribution_status='attributed'),0) AS attributed,
             COALESCE(SUM(match_status='unknown'),0) AS match_unknown,
             COALESCE(SUM(attribution_status='unknown'),0) AS attribution_unknown
           FROM conversion_events e JOIN conversion_outbox o ON o.event_id=e.id
           WHERE e.event_time>=?1 AND e.lifecycle_status='active'
             AND o.status<>'cancelled'`,
        ).bind(since).first(),
        db.prepare(
          `SELECT currency,COALESCE(SUM(value_minor),0) AS value_minor
           FROM conversion_events e JOIN conversion_outbox o ON o.event_id=e.id
           WHERE event_time>=?1 AND event_name='Purchase'
             AND e.lifecycle_status='active' AND o.status<>'cancelled'
           GROUP BY currency ORDER BY currency`,
        ).bind(since).all(),
        db.prepare(
          `SELECT status,COUNT(*) AS total FROM conversion_outbox o
           JOIN conversion_events e ON e.id=o.event_id
           WHERE e.event_time>=?1 GROUP BY status`,
        ).bind(since).all(),
        db.prepare(
          `SELECT date(e.event_time,'unixepoch') AS day,e.event_name,COUNT(*) AS total,
                  COALESCE(SUM(e.value_minor),0) AS value_minor
           FROM conversion_events e JOIN conversion_outbox o ON o.event_id=e.id
           WHERE e.event_time>=?1 AND e.lifecycle_status='active'
             AND o.status<>'cancelled'
           GROUP BY day,event_name ORDER BY day`,
        ).bind(since).all(),
        db.prepare(
          `SELECT e.id,e.event_name,e.event_time,o.status,o.attempts,
                  o.last_error_detail,o.last_error_code
           FROM conversion_events e JOIN conversion_outbox o ON o.event_id=e.id
           WHERE e.event_time>=?1 AND o.status IN
             ('unknown','temporary_failed','permanent_failed','dead_letter')
           ORDER BY e.event_time DESC LIMIT 50`,
        ).bind(since).all(),
        db.prepare(
          `SELECT attribution_kind,COUNT(*) AS total
           FROM conversation_attributions WHERE occurred_at>=?1
           GROUP BY attribution_kind`,
        ).bind(since).all(),
        db.prepare(
          `SELECT COUNT(*) AS measured,
                  CAST(AVG(CASE WHEN e.event_time>=a.occurred_at
                    THEN e.event_time-a.occurred_at ELSE 0 END) AS INTEGER) AS average_seconds,
                  MAX(CASE WHEN e.event_time>=a.occurred_at
                    THEN e.event_time-a.occurred_at ELSE 0 END) AS maximum_seconds
           FROM conversion_events e
           JOIN conversation_attributions a ON a.id=e.attribution_id
           JOIN conversion_outbox o ON o.event_id=e.id
           WHERE e.event_time>=?1 AND e.lifecycle_status='active'
             AND o.status<>'cancelled'`,
        ).bind(since).first(),
      ]);
      return {
        days,
        totals,
        revenues: revenues.results,
        delivery: statuses.results,
        daily: daily.results,
        failures: failures.results,
        attributions: attributions.results,
        latency,
      };
    },
  };
}
