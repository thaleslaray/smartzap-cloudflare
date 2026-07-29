import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/api/router'

describe('API da base de conhecimento', () => {
  it('restringe a busca a documentos ativos e prontos', async () => {
    const readyId = crypto.randomUUID()
    const deletedId = crypto.randomUUID()
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO knowledge_documents (id,name,mime_type,r2_key,checksum,status)
        VALUES (?1,'ativo.txt','text/plain',?2,?3,'ready')`).bind(readyId, `knowledge/${readyId}/ativo.txt`, 'c'.repeat(64)),
      env.DB.prepare(`INSERT INTO knowledge_documents (id,name,mime_type,r2_key,checksum,status)
        VALUES (?1,'removido.txt','text/plain',?2,?3,'deleted')`).bind(deletedId, `knowledge/${deletedId}/removido.txt`, 'd'.repeat(64)),
    ])
    let retrieval: unknown
    const searchInstance = { items: { upload: async () => ({ id: 'x' }), delete: async () => {} }, search: async (input: unknown) => { retrieval = input; return { chunks: [] } } }
    const configured = { ...env, AI_SEARCH: { create: async () => searchInstance, get: () => searchInstance } } as unknown as Env
    const response = await createApp().fetch(new Request('https://x.com/api/knowledge/search', {
      method: 'POST', headers: { 'x-api-key': 'dev-api-key', 'content-type': 'application/json' }, body: JSON.stringify({ query: 'conteúdo ativo' }),
    }), configured)
    expect(response.status).toBe(200)
    const documentIds = (
      retrieval as { ai_search_options: { retrieval: { filters: { document_id: { $in: string[] } } } } }
    ).ai_search_options.retrieval.filters.document_id.$in
    expect(documentIds).toContain(readyId)
    expect(documentIds).not.toContain(deletedId)
  })

  it('reindexa pelo arquivo privado e substitui o item antigo', async () => {
    const id = crypto.randomUUID()
    const key = `knowledge/${id}/guia.txt`
    await env.MEDIA.put(key, 'Horário oficial: 9h às 18h.', {
      httpMetadata: { contentType: 'text/plain' },
    })
    await env.DB.prepare(
      `INSERT INTO knowledge_documents
       (id,name,mime_type,r2_key,checksum,status,error_code,ai_search_item_id)
       VALUES (?1,'guia.txt','text/plain',?2,?3,'failed','ai_search_unavailable','item-antigo')`,
    ).bind(id, key, 'a'.repeat(64)).run()
    const removed: string[] = []
    const uploaded: Array<{ name: string; content: string }> = []
    const searchInstance = {
      items: {
        upload: async (name: string, content: string) => {
          uploaded.push({ name, content })
          return { id: 'item-novo', status: 'ready' }
        },
        delete: async (itemId: string) => { removed.push(itemId) },
      },
      search: async () => ({}),
    }
    const configured = {
      ...env,
      AI_SEARCH: {
        create: async () => searchInstance,
        get: () => searchInstance,
      },
    } as unknown as Env
    const response = await createApp().fetch(new Request(
      `https://x.com/api/knowledge/documents/${id}/reindex`,
      { method: 'POST', headers: { 'x-api-key': 'dev-api-key' } },
    ), configured)
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ id, status: 'indexing' })
    expect(removed).toEqual(['item-antigo'])
    expect(uploaded).toEqual([{
      name: `${id}-guia.txt`,
      content: 'Horário oficial: 9h às 18h.',
    }])
    expect(
      await env.DB.prepare(
        'SELECT status,error_code,ai_search_item_id FROM knowledge_documents WHERE id=?1',
      ).bind(id).first(),
    ).toEqual({ status: 'indexing', error_code: null, ai_search_item_id: 'item-novo' })
  })

  it('registra falha recuperável quando o arquivo-fonte desapareceu', async () => {
    const id = crypto.randomUUID()
    await env.DB.prepare(
      `INSERT INTO knowledge_documents
       (id,name,mime_type,r2_key,checksum,status)
       VALUES (?1,'ausente.txt','text/plain',?2,?3,'failed')`,
    ).bind(id, `knowledge/${id}/ausente.txt`, 'b'.repeat(64)).run()
    const response = await createApp().fetch(new Request(
      `https://x.com/api/knowledge/documents/${id}/reindex`,
      { method: 'POST', headers: { 'x-api-key': 'dev-api-key' } },
    ), env)
    expect(response.status).toBe(409)
    expect(
      await env.DB.prepare(
        'SELECT status,error_code FROM knowledge_documents WHERE id=?1',
      ).bind(id).first(),
    ).toEqual({ status: 'failed', error_code: 'source_missing' })
  })
})
