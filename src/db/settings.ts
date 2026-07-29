export function settingsDb(db: D1Database) {
  return {
    async get(key: string): Promise<string | null> {
      const row = await db.prepare('SELECT value FROM settings WHERE key = ?1').bind(key).first<{ value: string }>()
      return row?.value ?? null
    },
    async set(key: string, value: string): Promise<void> {
      await db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')`
      ).bind(key, value).run()
    },
    async delete(key: string): Promise<void> {
      await db.prepare('DELETE FROM settings WHERE key = ?1').bind(key).run()
    },
  }
}
