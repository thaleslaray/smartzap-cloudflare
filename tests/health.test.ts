import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('health', () => {
  it('GET /api/health responde 200 {ok:true}', async () => {
    const res = await SELF.fetch('https://example.com/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
  it('aplica headers defensivos e impede cache nas APIs', async () => {
    const res = await SELF.fetch('https://example.com/api/health')
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
