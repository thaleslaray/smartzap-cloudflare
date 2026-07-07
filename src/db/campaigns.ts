export type Campaign = {
  id: string; name: string; template_name: string
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused' | 'failed' | 'cancelled'
  scheduled_at: string | null; workflow_id: string | null
  total: number; sent: number; delivered: number; read: number; failed: number
  created_at: string; completed_at: string | null
}
export type Counters = { total: number; sent: number; delivered: number; read: number; failed: number }

export function campaignsDb(db: D1Database) {
  return {
    async create(input: { name: string; template_name: string; scheduled_at?: string }): Promise<Campaign> {
      const id = crypto.randomUUID()
      await db.prepare(
        `INSERT INTO campaigns (id, name, template_name, status, scheduled_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      ).bind(id, input.name, input.template_name,
        input.scheduled_at ? 'draft' : 'draft', input.scheduled_at ?? null).run()
      return (await this.get(id))!
    },
    async get(id: string) {
      return db.prepare('SELECT * FROM campaigns WHERE id = ?1').bind(id).first<Campaign>()
    },
    async list() {
      return (await db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all<Campaign>()).results
    },
    async setStatus(id: string, status: Campaign['status']) {
      const completed = ['completed', 'failed', 'cancelled'].includes(status)
      await db.prepare(
        `UPDATE campaigns SET status = ?2${completed ? ", completed_at = datetime('now')" : ''} WHERE id = ?1`
      ).bind(id, status).run()
    },
    async setWorkflowId(id: string, wfId: string) {
      await db.prepare('UPDATE campaigns SET workflow_id = ?2 WHERE id = ?1').bind(id, wfId).run()
    },
    async setTotal(id: string, total: number) {
      await db.prepare('UPDATE campaigns SET total = ?2 WHERE id = ?1').bind(id, total).run()
    },
    async updateCounters(id: string, d: Partial<Counters>) {
      await db.prepare(
        `UPDATE campaigns SET sent = sent + ?2, delivered = delivered + ?3,
         read = read + ?4, failed = failed + ?5 WHERE id = ?1`
      ).bind(id, d.sent ?? 0, d.delivered ?? 0, d.read ?? 0, d.failed ?? 0).run()
    },
    async isCancelled(id: string): Promise<boolean> {
      const r = await db.prepare('SELECT status FROM campaigns WHERE id = ?1').bind(id).first<{ status: string }>()
      return r?.status === 'cancelled'
    },
  }
}
