export function campaignContactsDb(db: D1Database) {
  return {
    async bulkInsert(campaignId: string, rows: {
      contactId: string; phone: string; status: 'pending' | 'skipped'; renderedPayloadJson?: string; renderedPayloadHash?: string
    }[]) {
      if (!rows.length) return
      // Lotes de 50 para respeitar limites de variáveis do D1
      for (let i = 0; i < rows.length; i += 50) {
        await db.batch(rows.slice(i, i + 50).map((r) =>
          db.prepare(
            `INSERT OR IGNORE INTO campaign_contacts
             (campaign_id, contact_id, phone, status, rendered_payload_json, rendered_payload_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
          ).bind(campaignId, r.contactId, r.phone, r.status,
            r.renderedPayloadJson ?? null, r.renderedPayloadHash ?? null)))
      }
    },
    async claimPending(campaignId: string, limit: number, batchId?: string) {
      return (await db.prepare(
        `UPDATE campaign_contacts
         SET status = 'sending', batch_id = ?3, claimed_at = datetime('now'),
             attempt_count = attempt_count + 1, updated_at = datetime('now')
         WHERE rowid IN (
           SELECT rowid FROM campaign_contacts
           WHERE campaign_id = ?1 AND status = 'pending'
           ORDER BY rowid LIMIT ?2
         ) AND status = 'pending'
         RETURNING contact_id, phone, rendered_payload_json`
      ).bind(campaignId, limit, batchId ?? null).all<{ contact_id: string; phone: string; rendered_payload_json: string | null }>()).results
    },
    async failClaimed(campaignId: string, errorCode: string, errorDetail: string): Promise<number> {
      const result = await db.prepare(
        `UPDATE campaign_contacts
         SET status = 'failed', error_code = ?2, error_detail = ?3, updated_at = datetime('now')
         WHERE campaign_id = ?1 AND status = 'sending'`
      ).bind(campaignId, errorCode, errorDetail).run()
      return result.meta.changes ?? 0
    },
    async failUnfinished(campaignId: string, errorCode: string, errorDetail: string): Promise<number> {
      const result = await db.prepare(
        `UPDATE campaign_contacts
         SET status = 'failed', error_code = ?2, error_detail = ?3, updated_at = datetime('now')
         WHERE campaign_id = ?1 AND status IN ('pending', 'sending')`
      ).bind(campaignId, errorCode, errorDetail).run()
      return result.meta.changes ?? 0
    },
    async markResult(campaignId: string, contactId: string,
      r: { status: string; message_id?: string; error_code?: string; error_detail?: string; acceptance_status?: string }) {
      await db.prepare(
        `UPDATE campaign_contacts SET status = ?3, message_id = ?4, error_code = ?5,
         error_detail = ?6, acceptance_status = ?7, updated_at = datetime('now')
         WHERE campaign_id = ?1 AND contact_id = ?2`
      ).bind(campaignId, contactId, r.status, r.message_id ?? null, r.error_code ?? null,
        r.error_detail ?? null, r.acceptance_status ?? null).run()
    },
    async updateByMessageId(
      messageId: string, status: string, error?: { code?: string; detail?: string },
    ): Promise<{ campaign_id: string; contact_id: string; applied: boolean } | null> {
      const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 9 }
      if (!['delivered', 'read', 'failed'].includes(status)) return null
      const target = await db.prepare(
        'SELECT campaign_id, contact_id, batch_id FROM campaign_contacts WHERE message_id = ?1 LIMIT 1'
      ).bind(messageId).first<{ campaign_id: string; contact_id: string; batch_id: string | null }>()
      if (!target) return null

      // Contador e status ficam na mesma transação D1. O UPDATE do contador lê o
      // estado anterior; o UPDATE seguinte aplica a mesma condição. Em retry ou
      // concorrência, a condição já não é verdadeira e nenhum dos dois muda.
      const eligible = `(
        (?2 = 'failed' AND cc.status = 'sent')
        OR (
          ?2 IN ('delivered', 'read') AND cc.status <> 'failed'
          AND CASE cc.status WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2
              WHEN 'read' THEN 3 ELSE 0 END < ?3
        )
      )`
      const results = await db.batch([
        db.prepare(
          `UPDATE campaigns SET
             delivered = delivered + (
               SELECT COUNT(*) FROM campaign_contacts cc
               WHERE cc.message_id = ?1 AND cc.campaign_id = ?4
                 AND ?2 IN ('delivered', 'read') AND cc.status = 'sent' AND ${eligible}
             ),
             read = read + (
               SELECT COUNT(*) FROM campaign_contacts cc
               WHERE cc.message_id = ?1 AND cc.campaign_id = ?4
                 AND ?2 = 'read' AND cc.status IN ('sent', 'delivered') AND ${eligible}
             ),
             failed = failed + (
               SELECT COUNT(*) FROM campaign_contacts cc
               WHERE cc.message_id = ?1 AND cc.campaign_id = ?4
                 AND ?2 = 'failed' AND cc.status = 'sent' AND ${eligible}
             )
           WHERE id = ?4 AND EXISTS (
             SELECT 1 FROM campaign_contacts cc
             WHERE cc.message_id = ?1 AND cc.campaign_id = ?4 AND ${eligible}
           )`
        ).bind(messageId, status, rank[status] ?? 0, target.campaign_id),
        db.prepare(
        `UPDATE campaign_contacts SET status = ?2,
           error_code = CASE WHEN ?2 = 'failed' THEN ?5 ELSE error_code END,
           error_detail = CASE WHEN ?2 = 'failed' THEN ?6 ELSE error_detail END,
           updated_at = datetime('now')
         WHERE message_id = ?1 AND campaign_id = ?4
           AND (
             (?2 = 'failed' AND status = 'sent')
             OR (
               ?2 IN ('delivered', 'read') AND status <> 'failed'
               AND CASE status WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2
                   WHEN 'read' THEN 3 ELSE 0 END < ?3
             )
           )`
        ).bind(messageId, status, rank[status] ?? 0, target.campaign_id,
          error?.code ?? null, error?.detail ?? null),
      ])
      if (!results[0].meta.changes || !results[1].meta.changes)
        return {
          campaign_id: target.campaign_id,
          contact_id: target.contact_id,
          applied: false,
        }
      // Recalcula pelo estado canônico do destinatário. Assim callbacks repetidos,
      // fora de ordem ou replays do webhook não inflam os indicadores do lote.
      if (target.batch_id) {
        await db.prepare(
          `UPDATE campaign_batches SET
             recipient_count = (SELECT COUNT(*) FROM campaign_contacts WHERE batch_id = ?1),
             accepted_count = (SELECT COUNT(*) FROM campaign_contacts WHERE batch_id = ?1 AND status IN ('sent', 'delivered', 'read')),
             delivered_count = (SELECT COUNT(*) FROM campaign_contacts WHERE batch_id = ?1 AND status IN ('delivered', 'read')),
             read_count = (SELECT COUNT(*) FROM campaign_contacts WHERE batch_id = ?1 AND status = 'read'),
             failed_count = (SELECT COUNT(*) FROM campaign_contacts WHERE batch_id = ?1 AND status = 'failed')
           WHERE id = ?1`
        ).bind(target.batch_id).run()
      }
      return { campaign_id: target.campaign_id, contact_id: target.contact_id, applied: true }
    },
    async countByStatus(campaignId: string): Promise<Record<string, number>> {
      const rows = (await db.prepare(
        'SELECT status, COUNT(*) as n FROM campaign_contacts WHERE campaign_id = ?1 GROUP BY status'
      ).bind(campaignId).all<{ status: string; n: number }>()).results
      return Object.fromEntries(rows.map((r) => [r.status, r.n]))
    },
    async listByCampaign(campaignId: string, page: number, pageSize = 50) {
      const items = (await db.prepare(
        `SELECT cc.*, c.name FROM campaign_contacts cc
         LEFT JOIN contacts c ON c.id = cc.contact_id
         WHERE cc.campaign_id = ?1 ORDER BY cc.updated_at DESC, cc.contact_id DESC LIMIT ?2 OFFSET ?3`
      ).bind(campaignId, pageSize, (page - 1) * pageSize).all()).results
      const total = (await db.prepare(
        'SELECT COUNT(*) AS n FROM campaign_contacts WHERE campaign_id = ?1'
      ).bind(campaignId).first<{ n: number }>())?.n ?? 0
      return { items, total }
    },
  }
}
