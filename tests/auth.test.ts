import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

// Bindings de teste vêm do vitest.config.ts: MASTER_PASSWORD=dev, SMARTZAP_API_KEY=dev-api-key,
// TURNSTILE_SECRET vazio, ENVIRONMENT=test (bypass explícito do Turnstile fora de produção)
describe('auth', () => {
  it('rota protegida sem credencial → 401', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts')
    expect(res.status).toBe(401)
  })
  it('cookie presente mas sessão inexistente no KV → 401', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts', {
      headers: { cookie: 'smartzap_session=token-que-nao-existe-no-kv' },
    })
    expect(res.status).toBe(401)
  })
  it('login com senha errada → 401', async () => {
    const res = await SELF.fetch('https://x.com/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'errada' }),
    })
    expect(res.status).toBe(401)
  })
  it('login correto seta cookie e o cookie autentica', async () => {
    const login = await SELF.fetch('https://x.com/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'dev' }),
    })
    expect(login.status).toBe(200)
    const cookie = login.headers.get('set-cookie')!
    expect(cookie).toContain('smartzap_session=')
    const status = await SELF.fetch('https://x.com/api/auth/status', { headers: { cookie } })
    expect(await status.json()).toEqual({ authenticated: true })
  })
  it('API key válida autentica; inválida não', async () => {
    const ok = await SELF.fetch('https://x.com/api/auth/status', { headers: { 'x-api-key': 'dev-api-key' } })
    expect((await ok.json() as { authenticated: boolean }).authenticated).toBe(true)
    const bad = await SELF.fetch('https://x.com/api/contacts', { headers: { 'x-api-key': 'nope' } })
    expect(bad.status).toBe(401)
  })
})
