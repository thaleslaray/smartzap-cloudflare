export type Contact = {
  id: string; phone: string; name: string | null
  status: 'opt_in' | 'opt_out' | 'unknown'
  custom_fields: string | null; created_at: string; updated_at: string
}

export function contactsDb(db: D1Database) {
  return {
    async create(input: { phone: string; name?: string; status?: Contact['status'] }): Promise<Contact> {
      const id = crypto.randomUUID()
      await db.prepare(
        'INSERT INTO contacts (id, phone, name, status) VALUES (?1, ?2, ?3, ?4)'
      ).bind(id, input.phone, input.name ?? null, input.status ?? 'unknown').run()
      return (await this.getByPhone(input.phone))!
    },
    async getByPhone(phone: string): Promise<Contact | null> {
      return db.prepare('SELECT * FROM contacts WHERE phone = ?1').bind(phone).first<Contact>()
    },
    async list(opts: { q?: string; status?: string; limit: number; offset: number }) {
      const where: string[] = []
      const binds: unknown[] = []
      if (opts.status) { where.push(`status = ?${binds.length + 1}`); binds.push(opts.status) }
      if (opts.q) { where.push(`(name LIKE ?${binds.length + 1} OR phone LIKE ?${binds.length + 1})`); binds.push(`%${opts.q}%`) }
      const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const items = (await db.prepare(
        `SELECT * FROM contacts ${w} ORDER BY created_at DESC LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`
      ).bind(...binds, opts.limit, opts.offset).all<Contact>()).results
      const total = (await db.prepare(`SELECT COUNT(*) as n FROM contacts ${w}`).bind(...binds).first<{ n: number }>())!.n
      return { items, total }
    },
    async bulkInsert(rows: { phone: string; name?: string }[], status: Contact['status']): Promise<number> {
      if (!rows.length) return 0
      let inserted = 0
      // Chunks de 50 statements — mesmo limite usado em campaign_contacts (Task 10);
      // evita mandar um batch gigante para o D1 num CSV grande.
      for (let i = 0; i < rows.length; i += 50) {
        const stmts = rows.slice(i, i + 50).map((r) =>
          db.prepare('INSERT OR IGNORE INTO contacts (id, phone, name, status) VALUES (?1, ?2, ?3, ?4)')
            .bind(crypto.randomUUID(), r.phone, r.name ?? null, status)
        )
        const results = await db.batch(stmts)
        inserted += results.reduce((n, r) => n + (r.meta.changes ?? 0), 0)
      }
      return inserted
    },
    async setStatus(ids: string[], status: Contact['status']): Promise<void> {
      if (!ids.length) return
      const marks = ids.map((_, i) => `?${i + 2}`).join(',')
      await db.prepare(`UPDATE contacts SET status = ?1, updated_at = datetime('now') WHERE id IN (${marks})`)
        .bind(status, ...ids).run()
    },
  }
}
