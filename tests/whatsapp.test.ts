import { describe, expect, it, vi, afterEach } from 'vitest'
import { whatsappClient } from '../src/whatsapp/client'
import { mapWhatsAppError } from '../src/whatsapp/errors'
import { verifyMetaSignature } from '../src/whatsapp/webhook-verify'

afterEach(() => vi.unstubAllGlobals())

describe('whatsappClient.sendTemplate', () => {
  it('sucesso retorna messageId', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ messages: [{ id: 'wamid.123' }] }), { status: 200 })))
    const client = whatsappClient({ token: 't', phoneId: '111' })
    const r = await client.sendTemplate('+5511999990001', { name: 'promo', language: 'pt_BR' })
    expect(r).toEqual({ ok: true, messageId: 'wamid.123' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('https://graph.facebook.com/v24.0/111/messages')
  })
  it('erro da Meta retorna código', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 131056, message: 'pair rate limit' } }), { status: 400 })))
    const client = whatsappClient({ token: 't', phoneId: '111' })
    const r = await client.sendTemplate('+5511999990001', { name: 'promo', language: 'pt_BR' })
    expect(r).toEqual({ ok: false, code: 131056, detail: 'pair rate limit' })
  })
})

describe('mapWhatsAppError', () => {
  it('131042 (pagamento) é crítico', () => {
    expect(mapWhatsAppError(131042).critical).toBe(true)
  })
  it('131050 (opt-out) marca optOut', () => {
    expect(mapWhatsAppError(131050).optOut).toBe(true)
  })
  it('131056 (pair limit) não é crítico', () => {
    expect(mapWhatsAppError(131056).critical).toBe(false)
  })
})

describe('verifyMetaSignature (fail-closed)', () => {
  it('secret vazio → false', async () => {
    expect(await verifyMetaSignature('', 'body', 'sha256=x')).toBe(false)
  })
  it('assinatura correta → true', async () => {
    const secret = 's3cret'; const body = '{"a":1}'
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(await verifyMetaSignature(secret, body, `sha256=${hex}`)).toBe(true)
    expect(await verifyMetaSignature(secret, body, 'sha256=deadbeef')).toBe(false)
  })
})
