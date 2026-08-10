export type Campaign = {
  id: string; name: string; template_name: string; template_language: string
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused' | 'failed' | 'cancelled'
  scheduled_at: string | null; workflow_id: string | null
  variable_mapping_json: string | null; audience_snapshot_hash: string | null
  audience_definition_json?: string | null
  total: number; sent: number; delivered: number; read: number; failed: number
  created_at: string; completed_at: string | null
  folder_id?: string | null
  tags?: Array<{ id: string; name: string; color: string | null }>
}
export type Counters = { total: number; sent: number; delivered: number; read: number; failed: number }
export type CampaignStatus = Campaign['status']

export function campaignsDb(db: D1Database) {
  return {
    async listFolders() {
      return (await db.prepare(
        `SELECT f.id, f.name, f.color, COUNT(c.id) AS campaign_count
         FROM campaign_folders f LEFT JOIN campaigns c ON c.folder_id = f.id
         GROUP BY f.id ORDER BY f.name COLLATE NOCASE, f.id`
      ).all()).results
    },
    async createFolder(name: string, color: string | null = null) {
      const row = { id: crypto.randomUUID(), name, color }
      await db.prepare('INSERT INTO campaign_folders (id, name, color) VALUES (?1, ?2, ?3)')
        .bind(row.id, row.name, row.color).run()
      return row
    },
    async updateFolder(id: string, name: string, color: string | null) {
      const result = await db.prepare("UPDATE campaign_folders SET name = ?2, color = ?3, updated_at = datetime('now') WHERE id = ?1")
        .bind(id, name, color).run()
      return result.meta.changes === 1
    },
    async deleteFolder(id: string) {
      if (!await db.prepare('SELECT id FROM campaign_folders WHERE id = ?1').bind(id).first()) return false
      await db.prepare('DELETE FROM campaign_folders WHERE id = ?1').bind(id).run()
      return true
    },
    async listTags() {
      return (await db.prepare(
        `SELECT t.id, t.name, t.color, COUNT(a.campaign_id) AS campaign_count
         FROM campaign_tags t LEFT JOIN campaign_tag_assignments a ON a.tag_id = t.id
         GROUP BY t.id ORDER BY t.name COLLATE NOCASE, t.id`
      ).all()).results
    },
    async createTag(name: string, color: string | null) {
      const row = { id: crypto.randomUUID(), name, color }
      await db.prepare('INSERT INTO campaign_tags (id, name, color) VALUES (?1, ?2, ?3)')
        .bind(row.id, row.name, row.color).run()
      return row
    },
    async deleteTag(id: string) {
      if (!await db.prepare('SELECT id FROM campaign_tags WHERE id = ?1').bind(id).first()) return false
      await db.prepare('DELETE FROM campaign_tags WHERE id = ?1').bind(id).run()
      return true
    },
    async setTags(campaignId: string, tagIds: string[]): Promise<boolean> {
      const campaign = await this.get(campaignId)
      if (!campaign) return false
      const unique = [...new Set(tagIds)]
      if (unique.length) {
        const placeholders = unique.map((_, i) => `?${i + 1}`).join(',')
        const found = (await db.prepare(`SELECT COUNT(*) AS n FROM campaign_tags WHERE id IN (${placeholders})`)
          .bind(...unique).first<{ n: number }>())?.n ?? 0
        if (found !== unique.length) throw new Error('tag não encontrada')
      }
      await db.batch([
        db.prepare('DELETE FROM campaign_tag_assignments WHERE campaign_id = ?1').bind(campaignId),
        ...unique.map((tagId) => db.prepare(
          'INSERT INTO campaign_tag_assignments (campaign_id, tag_id) VALUES (?1, ?2)'
        ).bind(campaignId, tagId)),
      ])
      return true
    },
    async setFolder(campaignId: string, folderId: string | null): Promise<boolean> {
      if (folderId) {
        const folder = await db.prepare('SELECT id FROM campaign_folders WHERE id = ?1').bind(folderId).first()
        if (!folder) throw new Error('pasta não encontrada')
      }
      const result = await db.prepare('UPDATE campaigns SET folder_id = ?2 WHERE id = ?1')
        .bind(campaignId, folderId).run()
      return result.meta.changes === 1
    },
    async setSchedule(campaignId: string, scheduledAt: string | null): Promise<boolean> {
      const result = await db.prepare(
        `UPDATE campaigns SET scheduled_at = ?2
         WHERE id = ?1 AND status IN ('draft', 'scheduled') AND workflow_id IS NULL`
      ).bind(campaignId, scheduledAt).run()
      return result.meta.changes === 1
    },
    async create(input: {
      name: string; template_name: string; template_language?: string; scheduled_at?: string; variable_mapping_json?: string
    }): Promise<Campaign> {
      const id = crypto.randomUUID()
      await db.prepare(
        `INSERT INTO campaigns (id, name, template_name, template_language, status, scheduled_at, variable_mapping_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(id, input.name, input.template_name, input.template_language ?? 'pt_BR',
        'draft', input.scheduled_at ?? null, input.variable_mapping_json ?? null).run()
      return (await this.get(id))!
    },
    async duplicate(id: string): Promise<Campaign | null> {
      const source = await this.get(id)
      if (!source) return null
      const copyId = crypto.randomUUID()
      await db.batch([
        db.prepare(
          `INSERT INTO campaigns (id, name, template_name, template_language, status, scheduled_at,
            variable_mapping_json, audience_definition_json, folder_id)
           VALUES (?1, ?2, ?3, ?4, 'draft', NULL, ?5, ?6, ?7)`
        ).bind(copyId, `Cópia de ${source.name}`.slice(0, 200), source.template_name,
          source.template_language, source.variable_mapping_json, source.audience_definition_json ?? null,
          source.folder_id ?? null),
        db.prepare(
          `INSERT OR IGNORE INTO campaign_tag_assignments (campaign_id, tag_id)
           SELECT ?1, tag_id FROM campaign_tag_assignments WHERE campaign_id = ?2`
        ).bind(copyId, id),
      ])
      return this.get(copyId)
    },
    async remove(id: string): Promise<'removed' | 'not_found' | 'active'> {
      const campaign = await this.get(id)
      if (!campaign) return 'not_found'
      if (['sending', 'paused'].includes(campaign.status)) return 'active'
      await db.prepare('DELETE FROM campaigns WHERE id = ?1').bind(id).run()
      return 'removed'
    },
    async removeMany(ids: string[]): Promise<{ removed: number; active: number; missing: number }> {
      const uniqueIds = [...new Set(ids)]
      if (!uniqueIds.length) return { removed: 0, active: 0, missing: 0 }
      const markers = uniqueIds.map((_, index) => `?${index + 1}`).join(', ')
      const matching = (await db.prepare(
        `SELECT id, status FROM campaigns WHERE id IN (${markers})`
      ).bind(...uniqueIds).all<{ id: string; status: string }>()).results
      const active = matching.filter((campaign) => ['sending', 'paused'].includes(campaign.status))
      if (active.length) return { removed: 0, active: active.length, missing: uniqueIds.length - matching.length }
      if (!matching.length) return { removed: 0, active: 0, missing: uniqueIds.length }
      const existingIds = matching.map((campaign) => campaign.id)
      const existingMarkers = existingIds.map((_, index) => `?${index + 1}`).join(', ')
      await db.prepare(`DELETE FROM campaigns WHERE id IN (${existingMarkers})`).bind(...existingIds).run()
      return { removed: existingIds.length, active: 0, missing: uniqueIds.length - existingIds.length }
    },
    async get(id: string) {
      return db.prepare('SELECT * FROM campaigns WHERE id = ?1').bind(id).first<Campaign>()
    },
    async list(opts: { q?: string; status?: CampaignStatus; folderId?: string; tagIds?: string[]; limit: number; offset: number }) {
      const where: string[] = []
      const binds: unknown[] = []
      if (opts.status) {
        // “Falhou” é um filtro operacional: deve incluir também campanhas que
        // terminaram o workflow (`completed`) mas registraram ao menos uma falha.
        if (opts.status === 'failed') where.push(`(status = 'failed' OR failed > 0)`)
        else {
          where.push(`status = ?${binds.length + 1}`)
          binds.push(opts.status)
        }
      }
      if (opts.q) {
        const escaped = opts.q.replace(/[\\%_]/g, '\\$&')
        where.push(`name LIKE ?${binds.length + 1} ESCAPE '\\'`)
        binds.push(`%${escaped}%`)
      }
      if (opts.folderId) {
        where.push(`folder_id = ?${binds.length + 1}`)
        binds.push(opts.folderId)
      }
      for (const tagId of opts.tagIds ?? []) {
        where.push(`EXISTS (SELECT 1 FROM campaign_tag_assignments cta WHERE cta.campaign_id = campaigns.id AND cta.tag_id = ?${binds.length + 1})`)
        binds.push(tagId)
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const rows = (await db.prepare(
        `SELECT campaigns.*, COALESCE((SELECT json_group_array(json_object('id', t.id, 'name', t.name, 'color', t.color))
           FROM campaign_tag_assignments cta JOIN campaign_tags t ON t.id = cta.tag_id
           WHERE cta.campaign_id = campaigns.id), '[]') AS tags_json
         FROM campaigns ${clause} ORDER BY created_at DESC, id DESC
         LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`
      ).bind(...binds, opts.limit, opts.offset).all<Campaign & { tags_json: string }>()).results
      const items = rows.map(({ tags_json, ...campaign }) => ({ ...campaign, tags: JSON.parse(tags_json) as Campaign['tags'] }))
      const total = (await db.prepare(`SELECT COUNT(*) AS n FROM campaigns ${clause}`)
        .bind(...binds).first<{ n: number }>())?.n ?? 0
      return { items, total }
    },
    async setStatus(id: string, status: Campaign['status']) {
      const completed = ['completed', 'failed', 'cancelled'].includes(status)
      await db.prepare(
        `UPDATE campaigns SET status = ?2${completed ? ", completed_at = datetime('now')" : ''} WHERE id = ?1`
      ).bind(id, status).run()
    },
    async transitionStatus(
      id: string,
      expected: Campaign['status'][],
      next: Campaign['status'],
    ): Promise<boolean> {
      if (!expected.length) return false
      const marks = expected.map((_, index) => `?${index + 3}`).join(',')
      const completed = ['completed', 'failed', 'cancelled'].includes(next)
      const result = await db.prepare(
        `UPDATE campaigns SET status = ?2${completed ? ", completed_at = datetime('now')" : ''}
         WHERE id = ?1 AND status IN (${marks})`
      ).bind(id, next, ...expected).run()
      return result.meta.changes === 1
    },
    async claimDispatch(id: string, status: 'scheduled' | 'sending'): Promise<boolean> {
      const result = await db.prepare(
        `UPDATE campaigns SET status = ?2
         WHERE id = ?1 AND status IN ('draft', 'scheduled') AND workflow_id IS NULL`
      ).bind(id, status).run()
      return result.meta.changes === 1
    },
    async releaseDispatch(id: string): Promise<void> {
      await db.prepare(
        `UPDATE campaigns SET status = 'draft'
         WHERE id = ?1 AND workflow_id IS NULL AND status IN ('scheduled', 'sending')`
      ).bind(id).run()
    },
    async rollbackDispatch(id: string, workflowId: string): Promise<void> {
      await db.batch([
        db.prepare(
          `DELETE FROM campaign_contacts
           WHERE campaign_id = ?1 AND status = 'pending' AND message_id IS NULL`
        ).bind(id),
        db.prepare(
          `UPDATE campaigns SET status = 'draft', workflow_id = NULL, total = 0
           WHERE id = ?1 AND status IN ('scheduled', 'sending')
             AND (workflow_id IS NULL OR workflow_id = ?2)`
        ).bind(id, workflowId),
      ])
    },
    async setWorkflowId(id: string, wfId: string) {
      await db.prepare('UPDATE campaigns SET workflow_id = ?2 WHERE id = ?1').bind(id, wfId).run()
    },
    async markFailedUnlessTerminal(id: string): Promise<boolean> {
      const result = await db.prepare(
        `UPDATE campaigns SET status = 'failed', completed_at = datetime('now')
         WHERE id = ?1 AND status NOT IN ('cancelled', 'completed', 'failed')`
      ).bind(id).run()
      return result.meta.changes === 1
    },
    async setTotal(id: string, total: number) {
      await db.prepare('UPDATE campaigns SET total = ?2 WHERE id = ?1').bind(id, total).run()
    },
    async setAudienceSnapshotHash(id: string, hash: string) {
      await db.prepare('UPDATE campaigns SET audience_snapshot_hash = ?2 WHERE id = ?1').bind(id, hash).run()
    },
    async setAudienceDefinition(id: string, definition: unknown) {
      await db.prepare('UPDATE campaigns SET audience_definition_json = ?2 WHERE id = ?1')
        .bind(id, JSON.stringify(definition)).run()
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
