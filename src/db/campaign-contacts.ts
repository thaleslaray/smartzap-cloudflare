export function campaignContactsDb(db: D1Database) {
  return {
    async bulkInsert(campaignId: string, rows: { contactId: string; phone: string; status: 'pending' | 'skipped' }[]) {
      if (!rows.length) return
      // Lotes de 50 para respeitar limites de variáveis do D1
      for (let i = 0; i < rows.length; i += 50) {
        await db.batch(rows.slice(i, i + 50).map((r) =>
          db.prepare(
            `INSERT OR IGNORE INTO campaign_contacts (campaign_id, contact_id, phone, status)
             VALUES (?1, ?2, ?3, ?4)`
          ).bind(campaignId, r.contactId, r.phone, r.status)))
      }
    },
    async claimPending(campaignId: string, limit: number) {
      const rows = (await db.prepare(
        `SELECT contact_id, phone FROM campaign_contacts
         WHERE campaign_id = ?1 AND status = 'pending' LIMIT ?2`
      ).bind(campaignId, limit).all<{ contact_id: string; phone: string }>()).results
      if (rows.length) {
        const marks = rows.map((_, i) => `?${i + 2}`).join(',')
        await db.prepare(
          `UPDATE campaign_contacts SET status = 'sending', updated_at = datetime('now')
           WHERE campaign_id = ?1 AND contact_id IN (${marks})`
        ).bind(campaignId, ...rows.map((r) => r.contact_id)).run()
      }
      return rows
    },
    async markResult(campaignId: string, contactId: string,
      r: { status: string; message_id?: string; error_code?: string; error_detail?: string }) {
      await db.prepare(
        `UPDATE campaign_contacts SET status = ?3, message_id = ?4, error_code = ?5,
         error_detail = ?6, updated_at = datetime('now')
         WHERE campaign_id = ?1 AND contact_id = ?2`
      ).bind(campaignId, contactId, r.status, r.message_id ?? null, r.error_code ?? null, r.error_detail ?? null).run()
    },
    async updateByMessageId(messageId: string, status: string): Promise<{ campaign_id: string; applied: boolean } | null> {
      // UPDATE condicional ATÔMICO: só progride status (delivered não volta pra sent;
      // read não volta pra delivered). Sem read-then-write — dois consumers processando
      // o mesmo evento em paralelo não aplicam a transição duas vezes: `meta.changes`
      // diz se ESTA chamada foi a que aplicou. É daqui que vem a idempotência dos
      // contadores de campanha sob retry da Queue.
      const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 9 }
      const res = await db.prepare(
        `UPDATE campaign_contacts SET status = ?2, updated_at = datetime('now')
         WHERE message_id = ?1
           AND CASE status WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2
               WHEN 'read' THEN 3 WHEN 'failed' THEN 9 ELSE 0 END < ?3`
      ).bind(messageId, status, rank[status] ?? 0).run()
      // message_id inexistente OU evento atrasado/duplicado → nada a contar
      if (!res.meta.changes) return null
      // SELECT separada só quando a transição aplicou (caminho raro por evento duplicado)
      const row = await db.prepare(
        'SELECT campaign_id FROM campaign_contacts WHERE message_id = ?1'
      ).bind(messageId).first<{ campaign_id: string }>()
      return row ? { campaign_id: row.campaign_id, applied: true } : null
    },
    async countByStatus(campaignId: string): Promise<Record<string, number>> {
      const rows = (await db.prepare(
        'SELECT status, COUNT(*) as n FROM campaign_contacts WHERE campaign_id = ?1 GROUP BY status'
      ).bind(campaignId).all<{ status: string; n: number }>()).results
      return Object.fromEntries(rows.map((r) => [r.status, r.n]))
    },
    async listByCampaign(campaignId: string, page: number, pageSize = 50) {
      return (await db.prepare(
        `SELECT cc.*, c.name FROM campaign_contacts cc
         LEFT JOIN contacts c ON c.id = cc.contact_id
         WHERE cc.campaign_id = ?1 ORDER BY cc.updated_at DESC LIMIT ?2 OFFSET ?3`
      ).bind(campaignId, pageSize, (page - 1) * pageSize).all()).results
    },
  }
}
