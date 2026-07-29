import { compileSegmentRules, savedSegmentRulesSchema, segmentRulesSchema, type SavedSegmentRules, type SegmentRules } from '../domain/segments'

export type SavedSegment = {
  id: string; name: string; description: string | null; rules_json: string
  created_at: string; updated_at: string
}

export function segmentsDb(db: D1Database) {
  return {
    async list(): Promise<Array<Omit<SavedSegment, 'rules_json'> & { rules: SavedSegmentRules }>> {
      const rows = (await db.prepare(
        'SELECT * FROM saved_segments ORDER BY name COLLATE NOCASE, id'
      ).all<SavedSegment>()).results
      return rows.map(({ rules_json, ...row }) => ({ ...row, rules: savedSegmentRulesSchema.parse(JSON.parse(rules_json)) }))
    },
    async get(id: string): Promise<(Omit<SavedSegment, 'rules_json'> & { rules: SavedSegmentRules }) | null> {
      const row = await db.prepare('SELECT * FROM saved_segments WHERE id = ?1').bind(id).first<SavedSegment>()
      if (!row) return null
      const { rules_json, ...rest } = row
      return { ...rest, rules: savedSegmentRulesSchema.parse(JSON.parse(rules_json)) }
    },
    async create(input: { name: string; description?: string; rules: SegmentRules }) {
      const id = crypto.randomUUID()
      await db.prepare(
        `INSERT INTO saved_segments (id, name, description, rules_json)
         VALUES (?1, ?2, ?3, ?4)`
      ).bind(id, input.name, input.description ?? null, JSON.stringify(input.rules)).run()
      return this.get(id)
    },
    async createAudience(input: { name: string; description?: string; rules: Extract<SavedSegmentRules, { kind: 'campaign_audience' }> }) {
      const id = crypto.randomUUID()
      await db.prepare(
        `INSERT INTO saved_segments (id, name, description, rules_json) VALUES (?1, ?2, ?3, ?4)`
      ).bind(id, input.name, input.description ?? null, JSON.stringify(input.rules)).run()
      return this.get(id)
    },
    async update(id: string, input: { name: string; description?: string; rules: SegmentRules }) {
      const result = await db.prepare(
        `UPDATE saved_segments SET name = ?2, description = ?3, rules_json = ?4,
           updated_at = datetime('now') WHERE id = ?1`
      ).bind(id, input.name, input.description ?? null, JSON.stringify(input.rules)).run()
      return result.meta.changes === 1 ? this.get(id) : null
    },
    async remove(id: string): Promise<boolean> {
      const result = await db.prepare('DELETE FROM saved_segments WHERE id = ?1').bind(id).run()
      return result.meta.changes === 1
    },
    async preview(rules: SegmentRules, limit = 50) {
      const compiled = compileSegmentRules(rules)
      const eligibility = `c.status = 'opt_in'
        AND EXISTS (SELECT 1 FROM consent_events ce WHERE ce.contact_id = c.id
          AND ce.purpose = 'marketing_messages' AND ce.revoked_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM suppressions s WHERE s.phone = c.phone
          AND (s.expires_at IS NULL OR s.expires_at > datetime('now')))`
      const where = `${compiled.sql} AND ${eligibility}`
      const items = (await db.prepare(
        `SELECT c.id, c.name, c.phone, c.status, c.updated_at FROM contacts c
         WHERE ${where} ORDER BY c.updated_at DESC, c.id LIMIT ?${compiled.bindings.length + 1}`
      ).bind(...compiled.bindings, limit).all()).results
      const count = await db.prepare(
        `SELECT COUNT(*) AS n FROM contacts c WHERE ${where}`
      ).bind(...compiled.bindings).first<{ n: number }>()
      return { items, total: count?.n ?? 0 }
    },
  }
}
