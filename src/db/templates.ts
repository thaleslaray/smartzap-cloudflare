import type { MetaTemplate } from '../whatsapp/client'

export function templatesDb(db: D1Database) {
  return {
    async upsertMany(templates: MetaTemplate[]): Promise<void> {
      if (!templates.length) return
      await db.batch(templates.map((t) =>
        db.prepare(
          `INSERT INTO templates (name, language, category, status, components, synced_at)
           VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
           ON CONFLICT(name) DO UPDATE SET language=?2, category=?3, status=?4, components=?5, synced_at=datetime('now')`
        ).bind(t.name, t.language, t.category, t.status, JSON.stringify(t.components ?? []))))
    },
    async list() {
      const rows = (await db.prepare('SELECT * FROM templates ORDER BY name').all()).results
      return rows.map((r) => ({ ...r, components: JSON.parse((r.components as string) || '[]') }))
    },
    async get(name: string) {
      const r = await db.prepare('SELECT * FROM templates WHERE name = ?1').bind(name).first()
      return r ? { ...r, components: JSON.parse((r.components as string) || '[]') } : null
    },
  }
}
