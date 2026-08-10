export type TemplateDraft = { id: string; name: string; language: string; category: string; components: unknown[]; status: 'DRAFT' | 'SUBMITTING' | 'FAILED'; error_detail: string | null; created_at: string; updated_at: string }
type RawDraft = Omit<TemplateDraft, 'components'> & { components: string }
const decode = (row: RawDraft): TemplateDraft => ({ ...row, components: JSON.parse(row.components || '[]') })
export function templateDraftsDb(db: D1Database) { return {
  async list() { return (await db.prepare('SELECT * FROM template_drafts ORDER BY updated_at DESC, id').all<RawDraft>()).results.map(decode) },
  async get(id: string) { const row = await db.prepare('SELECT * FROM template_drafts WHERE id = ?1').bind(id).first<RawDraft>(); return row ? decode(row) : null },
  async create(input: { name: string; language: string; category: string; components: unknown[] }) { const id = crypto.randomUUID(); await db.prepare('INSERT INTO template_drafts (id,name,language,category,components) VALUES (?1,?2,?3,?4,?5)').bind(id,input.name,input.language,input.category,JSON.stringify(input.components)).run(); return this.get(id) },
  async update(id: string, input: { name: string; language: string; category: string; components: unknown[] }) { await db.prepare("UPDATE template_drafts SET name=?2,language=?3,category=?4,components=?5,status='DRAFT',error_detail=NULL,updated_at=datetime('now') WHERE id=?1").bind(id,input.name,input.language,input.category,JSON.stringify(input.components)).run(); return this.get(id) },
  async setState(id: string, status: TemplateDraft['status'], detail: string | null = null) { await db.prepare("UPDATE template_drafts SET status=?2,error_detail=?3,updated_at=datetime('now') WHERE id=?1").bind(id,status,detail).run() },
  async delete(id: string) { const current = await this.get(id); if (!current) return false; await db.prepare('DELETE FROM template_drafts WHERE id=?1').bind(id).run(); return true },
} }
