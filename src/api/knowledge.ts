import { Hono } from 'hono'
import { z } from 'zod'
import { deleteKnowledgeDocument, extractPdfText, normalizeKnowledgeText, searchKnowledge, sha256, uploadKnowledgeDocument } from '../knowledge/service'
import { readJsonBody } from './body'

const documentSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mimeType: z.enum(['text/plain', 'text/markdown', 'text/html']),
  content: z.string().min(1).max(500_000),
}).strict()
const searchSchema = z.object({ query: z.string().trim().min(2).max(1_000) }).strict()
const idSchema = z.string().uuid()

async function queueIndex(env: Env, documentId: string) {
  await env.AUTOMATION_QUEUE.send(
    { kind: 'knowledge_index', documentId, checks: 0 },
    { delaySeconds: 5 },
  )
}

export const knowledgeRoutes = new Hono<{ Bindings: Env }>()
  .get('/documents', async (c) => c.json({ items: (await c.env.DB.prepare(
    `SELECT id, name, mime_type, checksum, status, error_code, created_at, updated_at
     FROM knowledge_documents WHERE status <> 'deleted' ORDER BY created_at DESC, id DESC`
  ).all()).results }))
  .post('/documents', async (c) => {
    const raw = await readJsonBody(c, 550_000); if (!raw.ok) return c.json({ error: raw.error }, raw.status)
    const body = documentSchema.safeParse(raw.value); if (!body.success) return c.json({ error: 'documento inválido' }, 400)
    let content: string
    try { content = normalizeKnowledgeText(body.data.mimeType, body.data.content) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : 'documento inválido' }, 400) }
    const id = crypto.randomUUID(); const checksum = await sha256(content); const r2Key = `knowledge/${id}/${body.data.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    await c.env.MEDIA.put(r2Key, content, { httpMetadata: { contentType: body.data.mimeType } })
    await c.env.DB.prepare(
      `INSERT INTO knowledge_documents (id, name, mime_type, r2_key, checksum, status)
       VALUES (?1, ?2, ?3, ?4, ?5, 'indexing')`
    ).bind(id, body.data.name, body.data.mimeType, r2Key, checksum).run()
    try {
      const item = await uploadKnowledgeDocument(c.env.AI_SEARCH, body.data.name, content, id, body.data.mimeType)
      await c.env.DB.prepare(
        `UPDATE knowledge_documents SET ai_search_item_id = ?2, status = 'indexing', updated_at = datetime('now') WHERE id = ?1`
      ).bind(id, item.id).run()
      await queueIndex(c.env, id)
      return c.json({ id, status: 'indexing' }, 202)
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error', msg: 'indexação de documento falhou',
        error: error instanceof Error ? error.message.slice(0, 500) : 'erro desconhecido',
      }))
      await c.env.DB.prepare(
        `UPDATE knowledge_documents SET status = 'failed', error_code = 'ai_search_unavailable', updated_at = datetime('now') WHERE id = ?1`
      ).bind(id).run()
      return c.json({ error: 'documento salvo, mas indexação no AI Search falhou', id }, 503)
    }
  })
  .post('/documents/upload', async (c) => {
    const form = await c.req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File) || file.size < 1 || file.size > 20 * 1024 * 1024) return c.json({ error: 'arquivo inválido ou grande demais' }, 400)
    const name = file.name.trim().slice(0, 255) || 'documento.pdf'
    const mimeType = file.type || 'application/pdf'
    if (mimeType !== 'application/pdf' && !name.toLowerCase().endsWith('.pdf')) return c.json({ error: 'somente PDF é aceito neste envio' }, 400)
    let content: string
    try { content = await extractPdfText(await file.arrayBuffer()) } catch (error) { return c.json({ error: error instanceof Error ? error.message : 'não foi possível extrair o PDF' }, 400) }
    const id = crypto.randomUUID(); const checksum = await sha256(content); const r2Key = `knowledge/${id}/${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    await c.env.MEDIA.put(r2Key, await file.arrayBuffer(), { httpMetadata: { contentType: 'application/pdf' } })
    await c.env.DB.prepare(`INSERT INTO knowledge_documents (id, name, mime_type, r2_key, checksum, status) VALUES (?1, ?2, 'application/pdf', ?3, ?4, 'indexing')`).bind(id, name, r2Key, checksum).run()
    try { const item = await uploadKnowledgeDocument(c.env.AI_SEARCH, name, content, id, 'application/pdf'); await c.env.DB.prepare("UPDATE knowledge_documents SET ai_search_item_id = ?2, status = 'indexing', updated_at = datetime('now') WHERE id = ?1").bind(id, item.id).run(); await queueIndex(c.env, id); return c.json({ id, status: 'indexing' }, 202) }
    catch (error) { console.error(JSON.stringify({ level: 'error', msg: 'indexação de PDF falhou', error: error instanceof Error ? error.message.slice(0, 500) : 'erro desconhecido' })); await c.env.DB.prepare("UPDATE knowledge_documents SET status = 'failed', error_code = 'ai_search_unavailable', updated_at = datetime('now') WHERE id = ?1").bind(id).run(); return c.json({ error: 'PDF salvo, mas indexação falhou', id }, 503) }
  })
  .get('/documents/:id', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'))
    if (!id.success) return c.json({ error: 'documento inválido' }, 400)
    const doc = await c.env.DB.prepare(
      `SELECT id,name,mime_type,r2_key FROM knowledge_documents
       WHERE id=?1 AND status<>'deleted'`,
    ).bind(id.data).first<{ id: string; name: string; mime_type: string; r2_key: string }>()
    if (!doc) return c.json({ error: 'documento não encontrado' }, 404)
    if (doc.mime_type === 'application/pdf')
      return c.json({ error: 'PDF não pode ser editado; envie uma nova versão' }, 409)
    const stored = await c.env.MEDIA.get(doc.r2_key)
    if (!stored) return c.json({ error: 'arquivo-fonte não está mais disponível' }, 409)
    return c.json({
      id: doc.id,
      name: doc.name,
      mimeType: doc.mime_type,
      content: new TextDecoder().decode(await stored.arrayBuffer()),
    })
  })
  .put('/documents/:id', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'))
    if (!id.success) return c.json({ error: 'documento inválido' }, 400)
    const raw = await readJsonBody(c, 550_000); if (!raw.ok) return c.json({ error: raw.error }, raw.status)
    const body = documentSchema.safeParse(raw.value)
    if (!body.success) return c.json({ error: 'documento inválido' }, 400)
    const doc = await c.env.DB.prepare(
      `SELECT id,r2_key,ai_search_item_id,mime_type FROM knowledge_documents
       WHERE id=?1 AND status<>'deleted'`,
    ).bind(id.data).first<{ id: string; r2_key: string; ai_search_item_id: string | null; mime_type: string }>()
    if (!doc) return c.json({ error: 'documento não encontrado' }, 404)
    if (doc.mime_type === 'application/pdf')
      return c.json({ error: 'PDF não pode ser editado; envie uma nova versão' }, 409)
    let content: string
    try { content = normalizeKnowledgeText(body.data.mimeType, body.data.content) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : 'documento inválido' }, 400) }
    const checksum = await sha256(content)
    await c.env.MEDIA.put(doc.r2_key, content, { httpMetadata: { contentType: body.data.mimeType } })
    await c.env.DB.prepare(
      `UPDATE knowledge_documents SET name=?2,mime_type=?3,checksum=?4,status='indexing',
       error_code=NULL,updated_at=datetime('now') WHERE id=?1`,
    ).bind(doc.id, body.data.name, body.data.mimeType, checksum).run()
    try {
      if (doc.ai_search_item_id) await deleteKnowledgeDocument(c.env.AI_SEARCH, doc.ai_search_item_id)
      const item = await uploadKnowledgeDocument(c.env.AI_SEARCH, body.data.name, content, doc.id, body.data.mimeType)
      await c.env.DB.prepare(
        `UPDATE knowledge_documents SET ai_search_item_id=?2,status='indexing',error_code=NULL,
         updated_at=datetime('now') WHERE id=?1`,
      ).bind(doc.id, item.id).run()
      await queueIndex(c.env, doc.id)
      return c.json({ id: doc.id, status: 'indexing' }, 202)
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', msg: 'edição de documento falhou', error: error instanceof Error ? error.message.slice(0, 500) : 'erro desconhecido' }))
      await c.env.DB.prepare(
        `UPDATE knowledge_documents SET status='failed',error_code='reindex_failed',updated_at=datetime('now') WHERE id=?1`,
      ).bind(doc.id).run()
      return c.json({ error: 'documento salvo, mas não foi possível reindexar' }, 503)
    }
  })
  .post('/documents/:id/reindex', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'))
    if (!id.success) return c.json({ error: 'documento inválido' }, 400)
    const doc = await c.env.DB.prepare(
      `SELECT id,name,mime_type,r2_key,ai_search_item_id
       FROM knowledge_documents WHERE id=?1 AND status<>'deleted'`,
    ).bind(id.data).first<{
      id: string; name: string; mime_type: string; r2_key: string;
      ai_search_item_id: string | null
    }>()
    if (!doc) return c.json({ error: 'documento não encontrado' }, 404)
    const stored = await c.env.MEDIA.get(doc.r2_key)
    if (!stored) {
      await c.env.DB.prepare(
        `UPDATE knowledge_documents SET status='failed',error_code='source_missing',
         updated_at=datetime('now') WHERE id=?1`,
      ).bind(doc.id).run()
      return c.json({ error: 'arquivo-fonte não está mais disponível' }, 409)
    }
    await c.env.DB.prepare(
      `UPDATE knowledge_documents SET status='indexing',error_code=NULL,
       updated_at=datetime('now') WHERE id=?1`,
    ).bind(doc.id).run()
    try {
      const bytes = await stored.arrayBuffer()
      const content = doc.mime_type === 'application/pdf'
        ? await extractPdfText(bytes)
        : normalizeKnowledgeText(doc.mime_type, new TextDecoder().decode(bytes))
      // O item antigo sai antes do novo upload. Se qualquer etapa falhar, o D1
      // permanece em failed e a mesma ação pode ser repetida sem declarar sucesso.
      if (doc.ai_search_item_id)
        await deleteKnowledgeDocument(c.env.AI_SEARCH, doc.ai_search_item_id)
      const item = await uploadKnowledgeDocument(c.env.AI_SEARCH, doc.name, content, doc.id, doc.mime_type)
      await c.env.DB.prepare(
        `UPDATE knowledge_documents SET ai_search_item_id=?2,status='indexing',
         error_code=NULL,updated_at=datetime('now') WHERE id=?1`,
      ).bind(doc.id, item.id).run()
      await queueIndex(c.env, doc.id)
      return c.json({ id: doc.id, status: 'indexing' }, 202)
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error', msg: 'reindexação de documento falhou',
        error: error instanceof Error ? error.message.slice(0, 500) : 'erro desconhecido',
      }))
      await c.env.DB.prepare(
        `UPDATE knowledge_documents SET status='failed',error_code='reindex_failed',
         updated_at=datetime('now') WHERE id=?1`,
      ).bind(doc.id).run()
      return c.json({ error: 'não foi possível reindexar o documento' }, 503)
    }
  })
  .delete('/documents/:id', async (c) => {
    const doc = await c.env.DB.prepare(
      'SELECT id, r2_key, ai_search_item_id FROM knowledge_documents WHERE id = ?1 AND status <> \'deleted\''
    ).bind(c.req.param('id')).first<{ id: string; r2_key: string; ai_search_item_id: string | null }>()
    if (!doc) return c.json({ error: 'documento não encontrado' }, 404)
    if (doc.ai_search_item_id) {
      try { await deleteKnowledgeDocument(c.env.AI_SEARCH, doc.ai_search_item_id) }
      catch (error) {
        console.error(JSON.stringify({
          level: 'error',
          msg: 'remoção de documento no AI Search falhou',
          name: error && typeof error === 'object' && 'name' in error ? String(error.name) : 'UnknownError',
          message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        }))
        return c.json({ error: 'não foi possível remover o documento do AI Search' }, 503)
      }
    }
    await c.env.MEDIA.delete(doc.r2_key)
    await c.env.DB.prepare(
      `UPDATE knowledge_documents SET status = 'deleted', deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1`
    ).bind(doc.id).run()
    return c.json({ ok: true })
  })
  .post('/search', async (c) => {
    const raw = await readJsonBody(c, 8_192); if (!raw.ok) return c.json({ error: raw.error }, raw.status)
    const body = searchSchema.safeParse(raw.value); if (!body.success) return c.json({ error: 'consulta inválida' }, 400)
    const documentIds = (await c.env.DB.prepare(
      "SELECT id FROM knowledge_documents WHERE status='ready' ORDER BY created_at,id LIMIT 500",
    ).all<{ id: string }>()).results.map((document) => document.id)
    try { return c.json({ result: await searchKnowledge(c.env.AI_SEARCH, body.data.query, { documentIds }) }) }
    catch { return c.json({ error: 'AI Search indisponível' }, 503) }
  })
