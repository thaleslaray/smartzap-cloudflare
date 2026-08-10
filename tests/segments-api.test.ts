import { SELF, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { contactsDb } from '../src/db/contacts'

const AUTH = { 'x-api-key': 'dev-api-key', 'content-type': 'application/json' }
const marker = crypto.randomUUID().slice(0, 8)

beforeAll(async () => {
  await contactsDb(env.DB).bulkInsertOptInWithConsent([
    { phone: `+55217${Date.now().toString().slice(-8)}`, name: `Ana ${marker}` },
  ], 'consentimento de teste')
})

describe('API de segmentos', () => {
  it('faz preview, salva, lista, edita e exclui', async () => {
    const rules = { combinator: 'and', conditions: [{ field: 'name', operator: 'contains', value: marker }] }
    const preview = await SELF.fetch('https://x.com/api/segments/preview', {
      method: 'POST', headers: AUTH, body: JSON.stringify(rules),
    })
    expect(preview.status).toBe(200)
    expect((await preview.json() as { total: number }).total).toBe(1)

    const create = await SELF.fetch('https://x.com/api/segments', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ name: `Segmento ${marker}`, rules }),
    })
    expect(create.status).toBe(201)
    const segment = await create.json() as { id: string }

    const list = await SELF.fetch('https://x.com/api/segments', { headers: AUTH })
    expect((await list.json() as { items: { id: string }[] }).items.some((item) => item.id === segment.id)).toBe(true)

    expect((await SELF.fetch(`https://x.com/api/segments/${segment.id}`, {
      method: 'PUT', headers: AUTH,
      body: JSON.stringify({ name: `Segmento editado ${marker}`, rules }),
    })).status).toBe(200)
    expect((await SELF.fetch(`https://x.com/api/segments/${segment.id}`, {
      method: 'DELETE', headers: AUTH,
    })).status).toBe(200)
  })

  it('rejeita regra adulterada', async () => {
    const response = await SELF.fetch('https://x.com/api/segments/preview', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ combinator: 'and', conditions: [{ field: 'name', operator: 'raw', value: "' OR 1=1" }] }),
    })
    expect(response.status).toBe(400)
  })

  it('salva o público configurado na campanha para reutilização', async () => {
    const response = await SELF.fetch('https://x.com/api/segments/from-audience', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({
        name: `Público campanha ${marker}`,
        rules: { kind: 'campaign_audience', combinator: 'and', tags: ['VIP'], phonePrefixes: ['+5511', '+5521'] },
      }),
    })
    expect(response.status).toBe(201)
    const saved = await response.json() as { id: string; rules: { kind: string; phonePrefixes: string[] } }
    expect(saved.rules).toMatchObject({ kind: 'campaign_audience', phonePrefixes: ['+5511', '+5521'] })
    await SELF.fetch(`https://x.com/api/segments/${saved.id}`, { method: 'DELETE', headers: AUTH })
  })
})

describe('exportação e histórico', () => {
  it('exporta somente colunas públicas e neutraliza fórmulas', async () => {
    const contact = await contactsDb(env.DB).create({ phone: `+55216${Date.now().toString().slice(-8)}`, name: '=cmd|test' })
    const response = await SELF.fetch(`https://x.com/api/contacts/export.csv?q=${encodeURIComponent(contact.phone)}`, { headers: AUTH })
    const csv = await response.text()
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(csv).toContain("'=cmd|test")
    expect(csv).not.toContain('custom_fields')
    expect(csv).not.toContain('wa_id')
  })

  it('retorna timeline isolada por contato', async () => {
    const contact = await contactsDb(env.DB).create({ phone: `+55215${Date.now().toString().slice(-8)}`, name: 'Timeline' })
    await env.DB.prepare(
      `INSERT INTO contact_history_events (id, contact_id, event_type, summary, metadata_json)
       VALUES (?1, ?2, 'note', 'Teste', '{"safe":true}')`
    ).bind(crypto.randomUUID(), contact.id).run()
    const response = await SELF.fetch(`https://x.com/api/contacts/${contact.id}/history`, { headers: AUTH })
    const body = await response.json() as { events: { summary: string; metadata: unknown }[] }
    expect(body.events).toEqual([expect.objectContaining({ summary: 'Teste', metadata: { safe: true } })])
  })
})
