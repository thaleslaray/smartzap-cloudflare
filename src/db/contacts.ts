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
  }
}
