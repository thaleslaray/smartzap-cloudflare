import { SELF, env } from 'cloudflare:test'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { getCredentials } from '../src/whatsapp/credentials'
import { settingsDb } from '../src/db/settings'

const AUTH = { 'x-api-key': 'dev-api-key', 'content-type': 'application/json' }
afterEach(() => vi.unstubAllGlobals())

describe('credentials', () => {
  it('settings do banco vencem env; cache KV guarda só os ids, nunca o token', async () => {
    await settingsDb(env.DB).set('whatsapp_phone_id', 'db-phone')
    await settingsDb(env.DB).set('whatsapp_token', 'tok-secreto')
    await env.CACHE.delete('creds:v1')
    const creds = await getCredentials(env)
    expect(creds?.phoneId).toBe('db-phone')
    expect(creds?.token).toBe('tok-secreto')
    const cached = await env.CACHE.get('creds:v1')
    expect(cached).toBeTruthy()
    expect(cached).not.toContain('tok-secreto') // token nunca vai pro KV
  })
})

describe('templates sync', () => {
  it('sync busca da Meta, salva e lista', async () => {
    // brief não seta waba_id em lugar nenhum e o cache do teste anterior já guardou wabaId vazio;
    // sem isso o guard de wabaId do handler sempre retorna 400
    await settingsDb(env.DB).set('whatsapp_waba_id', 'db-waba')
    await env.CACHE.delete('creds:v1')
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      if (String(url).includes('message_templates'))
        return new Response(JSON.stringify({ data: [
          { name: 'promo_julho', language: 'pt_BR', category: 'MARKETING', status: 'APPROVED', components: [] },
        ] }), { status: 200 })
      throw new Error(`fetch inesperado: ${url}`)
    }))
    const res = await SELF.fetch('https://x.com/api/templates/sync', { method: 'POST', headers: AUTH })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ synced: 1 })
    const list = await SELF.fetch('https://x.com/api/templates', { headers: AUTH })
    const { items } = (await list.json()) as { items: { name: string }[] }
    // Não usar items[0]: Task 10 (campaigns.test.ts) também grava na tabela
    // templates compartilhada e pode ordenar antes de 'promo_julho'.
    expect(items.map((i) => i.name)).toContain('promo_julho')
  })
})

describe('settings API', () => {
  it('PUT valida throttle_mps e GET não vaza o token', async () => {
    const bad = await SELF.fetch('https://x.com/api/settings', {
      method: 'PUT', headers: AUTH, body: JSON.stringify({ throttle_mps: 'abc' }),
    })
    expect(bad.status).toBe(400)
    const ok = await SELF.fetch('https://x.com/api/settings', {
      method: 'PUT', headers: AUTH,
      body: JSON.stringify({ whatsapp_token: 'tok-secreto', throttle_mps: '40' }),
    })
    expect(ok.status).toBe(200)
    const res = await SELF.fetch('https://x.com/api/settings', { headers: AUTH })
    const raw = await res.text()
    expect(raw).not.toContain('tok-secreto') // nem valor nem prefixo
    const body = JSON.parse(raw) as { whatsapp_token: { configured: boolean }; throttle_mps: string | null }
    expect(body.whatsapp_token).toEqual({ configured: true })
    expect(body.throttle_mps).toBe('40')
  })
})
