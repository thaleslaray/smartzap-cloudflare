import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('health', () => {
  it('GET /api/health responde 200 {ok:true}', async () => {
    const res = await SELF.fetch('https://example.com/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
