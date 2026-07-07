import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { handleWebhookBatch } from '../src/queue/webhook-consumer'
import type { MetaStatus } from '../src/api/webhook'
import { campaignsDb } from '../src/db/campaigns'
import { campaignContactsDb } from '../src/db/campaign-contacts'
import { contactsDb } from '../src/db/contacts'

// Telefones únicos por execução — os arquivos de teste compartilham o mesmo D1
let phoneSeq = 0
const uniquePhone = () =>
  '+5511' + Date.now().toString().slice(-7) +
  Math.floor(Math.random() * 100).toString().padStart(2, '0') +
  String(phoneSeq++).padStart(2, '0')

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return 'sha256=' + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function statusPayload(messageId: string, status: string) {
  return { entry: [{ changes: [{ value: { statuses: [
    { id: messageId, status, timestamp: '1', recipient_id: '5511999990201' },
  ] } }] }] }
}

describe('GET /webhook (verificação da Meta)', () => {
  it('token correto ecoa o challenge', async () => {
    const res = await SELF.fetch(
      'https://x.com/webhook?hub.mode=subscribe&hub.verify_token=dev-verify&hub.challenge=42')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('42')
  })
  it('token errado → 403 sem vazar o challenge', async () => {
    const res = await SELF.fetch(
      'https://x.com/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42')
    expect(res.status).toBe(403)
    expect(await res.text()).not.toContain('42')
  })
})

describe('POST /webhook (fail-closed)', () => {
  it('sem assinatura → 401', async () => {
    const res = await SELF.fetch('https://x.com/webhook', { method: 'POST', body: '{}' })
    expect(res.status).toBe(401)
  })
  it('assinatura válida → 200 rápido', async () => {
    const body = JSON.stringify(statusPayload('wamid.a', 'delivered'))
    const res = await SELF.fetch('https://x.com/webhook', {
      method: 'POST', body,
      headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
    })
    expect(res.status).toBe(200)
  })
})

describe('handleWebhookBatch', () => {
  it('atualiza status por message_id e agrega contador por campanha', async () => {
    const phone = uniquePhone()
    const mid = 'wamid.' + crypto.randomUUID()
    const contact = await contactsDb(env.DB).create({ phone, status: 'opt_in' })
    const campaign = await campaignsDb(env.DB).create({ name: 'W', template_name: 'promo_teste' })
    await campaignContactsDb(env.DB).bulkInsert(campaign.id,
      [{ contactId: contact.id, phone: contact.phone, status: 'pending' }])
    await campaignContactsDb(env.DB).markResult(campaign.id, contact.id, { status: 'sent', message_id: mid })
    await campaignsDb(env.DB).updateCounters(campaign.id, { sent: 1 })

    const evt: MetaStatus = { id: mid, status: 'delivered', timestamp: '1', recipient_id: '5511999990201' }
    await handleWebhookBatch([evt], env)
    const after = (await campaignsDb(env.DB).get(campaign.id))!
    expect(after.delivered).toBe(1)

    // Retry da Queue reentrega o MESMO evento: o UPDATE condicional atômico de
    // updateByMessageId não progride status repetido → não conta duas vezes
    await handleWebhookBatch([evt], env)
    expect(((await campaignsDb(env.DB).get(campaign.id))!).delivered).toBe(1)
  })
})
