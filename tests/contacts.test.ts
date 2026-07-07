import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

const AUTH = { 'x-api-key': 'dev-api-key', 'content-type': 'application/json' }

describe('contacts API', () => {
  it('import exige declaração de opt-in', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts/import', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ csv: 'telefone\n11999990002\n', mapping: { phone: 'telefone' }, optInConfirmed: false }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('opt-in')
  })
  it('import válido insere com status opt_in, reporta números e grava consent event', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts/import', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({
        csv: 'telefone,nome\n11999990002,Bia\nabc,X\n11999990002,Bia2\n',
        mapping: { phone: 'telefone', name: 'nome' }, optInConfirmed: true,
      }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ imported: 1, duplicates: 1, invalid: 1 })
    const list = await SELF.fetch('https://x.com/api/contacts?q=Bia', { headers: AUTH })
    const { items } = (await list.json()) as { items: { phone: string; status: string }[] }
    expect(items[0].phone).toBe('+5511999990002')
    expect(items[0].status).toBe('opt_in')
    const ev = await env.DB.prepare(
      "SELECT * FROM consent_events WHERE source = 'import' ORDER BY created_at DESC"
    ).first<{ declaration_text: string; contact_count: number }>()
    expect(ev?.contact_count).toBe(1)
    expect(ev?.declaration_text).toBeTruthy()
  })
  it('import acima do teto de 20k linhas válidas → 413', async () => {
    const rows = Array.from({ length: 20_001 }, (_, i) => `+55119${10000000 + i}`)
    const res = await SELF.fetch('https://x.com/api/contacts/import', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ csv: `telefone\n${rows.join('\n')}\n`, mapping: { phone: 'telefone' }, optInConfirmed: true }),
    })
    expect(res.status).toBe(413)
  })
  it('POST /api/contacts exige declaração de opt-in', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts', {
      method: 'POST', headers: AUTH, body: JSON.stringify({ phone: '11999990003' }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('opt-in')
  })
  it('POST /api/contacts com opt-in confirmado cria opt_in e grava consent event', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ phone: '11999990003', name: 'Caio', optInConfirmed: true }),
    })
    expect(res.status).toBe(201)
    const contact = (await res.json()) as { phone: string; status: string }
    expect(contact.phone).toBe('+5511999990003')
    expect(contact.status).toBe('opt_in')
    const ev = await env.DB.prepare(
      "SELECT contact_count FROM consent_events WHERE source = 'manual'"
    ).first<{ contact_count: number }>()
    expect(ev?.contact_count).toBe(1)
  })
  it('POST /api/contacts rejeita telefone inválido', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts', {
      method: 'POST', headers: AUTH, body: JSON.stringify({ phone: 'abc', optInConfirmed: true }),
    })
    expect(res.status).toBe(400)
  })
})
