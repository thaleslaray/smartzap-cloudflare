import type { MetaTemplate } from '../whatsapp/client'

export type StoredTemplate = {
  name: string
  language: string
  meta_id: string | null
  category: string
  status: string
  components: unknown
  synced_at: string
  quality_score: string | null
  quality_updated_at: string | null
}
type RawTemplate = Omit<StoredTemplate, 'components'> & { components: string | null }

function parseComponents(raw: unknown): unknown {
  if (typeof raw !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : null
  } catch {
    // Falha fechada: `templateRequiresParameters(null)` bloqueia o disparo.
    return null
  }
}

function decodeTemplate(row: RawTemplate): StoredTemplate {
  return { ...row, components: parseComponents(row.components) }
}

export function templatesDb(db: D1Database) {
  return {
    async tryAcquireSyncLock(lockId: string): Promise<boolean> {
      const result = await db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('templates_sync_lock', ?1, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')
         WHERE settings.updated_at < datetime('now', '-10 minutes')`
      ).bind(lockId).run()
      return result.meta.changes === 1
    },
    async releaseSyncLock(lockId: string): Promise<void> {
      await db.prepare(
        "DELETE FROM settings WHERE key = 'templates_sync_lock' AND value = ?1"
      ).bind(lockId).run()
    },
    async replaceFromMeta(templates: MetaTemplate[]): Promise<void> {
      const syncMarker = new Date().toISOString()

      for (let offset = 0; offset < templates.length; offset += 50) {
        const chunk = templates.slice(offset, offset + 50)
        await db.batch(chunk.map((t) => {
          const quality = t.quality_score && typeof t.quality_score === 'object'
            ? t.quality_score as { score?: unknown; date?: unknown } : null
          const score = typeof quality?.score === 'string' ? quality.score : null
          const qualityDate = typeof quality?.date === 'string' ? quality.date : null
          return db.prepare(
            `INSERT INTO templates
               (name, language, meta_id, category, status, components, synced_at, quality_score, quality_updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(name, language) DO UPDATE SET meta_id=?3, category=?4, status=?5,
               components=?6, synced_at=?7, quality_score=?8, quality_updated_at=?9`
          ).bind(t.name, t.language, t.id ?? null, t.category, t.status,
            JSON.stringify(t.components ?? []), syncMarker, score, qualityDate)
        }))
      }

      await db.prepare('DELETE FROM templates WHERE synced_at <> ?1').bind(syncMarker).run()
    },
    async list() {
      const rows = (await db.prepare(
        'SELECT * FROM templates ORDER BY name, language'
      ).all<RawTemplate>()).results
      return rows.map(decodeTemplate)
    },
    async listByName(name: string) {
      const rows = (await db.prepare(
        'SELECT * FROM templates WHERE name = ?1 ORDER BY language'
      ).bind(name).all<RawTemplate>()).results
      return rows.map(decodeTemplate)
    },
    async get(name: string, language: string) {
      const r = await db.prepare(
        'SELECT * FROM templates WHERE name = ?1 AND language = ?2'
      ).bind(name, language).first<RawTemplate>()
      return r ? decodeTemplate(r) : null
    },
    async deleteByName(name: string): Promise<number> {
      const result = await db.prepare('DELETE FROM templates WHERE name = ?1').bind(name).run()
      return result.meta.changes ?? 0
    },
    async setStatusFromWebhook(input: {
      name: string; language?: string; metaId?: string; status: string; category?: string
    }): Promise<number> {
      const result = await db.prepare(
        `UPDATE templates SET status = ?3, category = COALESCE(?4, category),
           meta_id = COALESCE(meta_id, ?5), synced_at = datetime('now')
         WHERE (name = ?1 AND (?2 IS NULL OR language = ?2))
            OR (?5 IS NOT NULL AND meta_id = ?5)`
      ).bind(input.name, input.language ?? null, input.status, input.category ?? null,
        input.metaId ?? null).run()
      return result.meta.changes ?? 0
    },
  }
}
