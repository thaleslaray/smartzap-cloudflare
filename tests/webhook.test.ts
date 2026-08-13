import { SELF, env } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import { handleWebhookBatch } from '../src/queue/webhook-consumer'
import type { MetaStatus, MetaWebhookEvent } from '../src/api/webhook'
import { campaignsDb } from '../src/db/campaigns'
import { campaignContactsDb } from '../src/db/campaign-contacts'
import { contactsDb } from '../src/db/contacts'
import { templatesDb } from '../src/db/templates'
import { processWebhookMessages } from '../src/index'
import { resolveAudience } from '../src/domain/audience'
import { createApp } from '../src/api/router'

const WABA = '102290129340398'
const PHONE_ID = '106540352242922'
let phoneSeq = 0
const uniquePhone = () =>
  '+5511' + Date.now().toString().slice(-7) +
  Math.floor(Math.random() * 100).toString().padStart(2, '0') +
  String(phoneSeq++).padStart(2, '0')
const uniqueInboundPhone = () =>
  `+55119${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`

async function sign(secret: string, body: string | Uint8Array) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : Uint8Array.from(body)
  const sig = await crypto.subtle.sign('HMAC', key, bytes)
  return 'sha256=' + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function statusEvent(messageId: string, status: MetaStatus['status'], errors?: MetaStatus['errors']): MetaWebhookEvent {
  return {
    kind: 'status', wabaId: WABA, phoneNumberId: PHONE_ID,
    status: { id: messageId, status, timestamp: '1749416383', recipient_id: '5511999990201', errors },
  }
}

function statusPayload(messageId: string, status: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: WABA, changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '15550783881', phone_number_id: PHONE_ID },
      statuses: [{ id: messageId, status, timestamp: '1749416383', recipient_id: '5511999990201' }],
    } }] }],
  }
}

function inboundPayload(messageId: string, from: string, body = 'Olá, preciso de ajuda') {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: WABA, changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '15550783881', phone_number_id: PHONE_ID },
      contacts: [{ profile: { name: 'Contato Inbox' }, wa_id: from }],
      messages: [{ from, id: messageId, timestamp: '1749416383', type: 'text', text: { body } }],
    } }] }],
  }
}

async function enqueueOfficialWebhook(payload: unknown): Promise<MetaWebhookEvent> {
  const body = JSON.stringify(payload)
  const sendBatch = vi.spyOn(env.WEBHOOK_QUEUE, 'sendBatch')
  try {
    const response = await SELF.fetch('https://x.com/webhook', {
      method: 'POST', body,
      headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
    })
    expect(response.status).toBe(200)
    expect(sendBatch).toHaveBeenCalledOnce()
    return Array.from(sendBatch.mock.calls[0][0])[0].body as MetaWebhookEvent
  } finally {
    sendBatch.mockRestore()
  }
}

function templateWebhook(field: string, value: Record<string, unknown>, time: number) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: WABA, time, changes: [{ field, value }] }],
  }
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
  it('interrompe corpo fragmentado acima de 3 MB mesmo sem Content-Length', async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('x'.repeat(2_000_000)))
        controller.enqueue(encoder.encode('x'.repeat(1_200_000)))
        controller.close()
      },
    })
    const sendBatch = vi.spyOn(env.WEBHOOK_QUEUE, 'sendBatch')
    try {
      const res = await SELF.fetch('https://x.com/webhook', { method: 'POST', body })
      expect(res.status).toBe(413)
      expect(sendBatch).not.toHaveBeenCalled()
    } finally {
      sendBatch.mockRestore()
    }
  })
  it('aceita envelope oficial assinado maior que 1 MB e menor que 3 MB', async () => {
    const payload = statusPayload('wamid.large-valid', 'delivered')
    ;(payload.entry[0].changes[0].value as Record<string, unknown>).extension_data =
      'x'.repeat(1_200_000)
    const body = JSON.stringify(payload)
    const res = await SELF.fetch('https://x.com/webhook', {
      method: 'POST', body,
      headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
    })
    expect(res.status).toBe(200)
  })
  it('assinatura HMAC incorreta → 401 e nada entra na Queue', async () => {
    const body = JSON.stringify(statusPayload('wamid.invalid-signature', 'delivered'))
    const sendBatch = vi.spyOn(env.WEBHOOK_QUEUE, 'sendBatch')
    const res = await SELF.fetch('https://x.com/webhook', {
      method: 'POST', body,
      headers: { 'x-hub-signature-256': await sign('segredo-incorreto', body) },
    })
    expect(res.status).toBe(401)
    expect(sendBatch).not.toHaveBeenCalled()
    sendBatch.mockRestore()
  })
  it('envelope oficial assinado → 200', async () => {
    const body = JSON.stringify(statusPayload('wamid.a', 'delivered'))
    const res = await SELF.fetch('https://x.com/webhook', {
      method: 'POST', body,
      headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
    })
    expect(res.status).toBe(200)
  })
  it('aceita estados intermediários e preserva pricing do status', async () => {
    const payload = statusPayload('wamid.held', 'held_for_quality_assessment')
    ;(payload.entry[0].changes[0].value.statuses[0] as Record<string, unknown>).pricing = {
      pricing_model: 'PMP', type: 'regular', category: 'utility', billable: true,
    }
    const body = JSON.stringify(payload)
    const sendBatch = vi.spyOn(env.WEBHOOK_QUEUE, 'sendBatch')
    try {
      const res = await SELF.fetch('https://x.com/webhook', {
        method: 'POST', body,
        headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
      })
      expect(res.status).toBe(200)
      const queued = Array.from(sendBatch.mock.calls[0][0])[0].body as MetaWebhookEvent
      expect(queued.kind).toBe('status')
      if (queued.kind !== 'status') throw new Error('evento de status esperado')
      expect(queued.status.status).toBe('held_for_quality_assessment')
      expect(queued.status.pricing?.category).toBe('utility')
    } finally {
      sendBatch.mockRestore()
    }
  })
  it('aceita status por BSUID sem recipient_id', async () => {
    const payload = statusPayload('wamid.bsuid-status', 'delivered')
    const status = payload.entry[0].changes[0].value.statuses[0] as Record<string, unknown>
    delete status.recipient_id
    status.recipient_user_id = 'US.13491208655302741918'
    const body = JSON.stringify(payload)
    const sendBatch = vi.spyOn(env.WEBHOOK_QUEUE, 'sendBatch')
    try {
      const res = await SELF.fetch('https://x.com/webhook', {
        method: 'POST', body,
        headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
      })
      expect(res.status).toBe(200)
      const queued = Array.from(sendBatch.mock.calls[0][0])[0].body as MetaWebhookEvent
      expect(queued).toMatchObject({
        kind: 'status',
        status: { recipient_user_id: 'US.13491208655302741918' },
      })
    } finally {
      sendBatch.mockRestore()
    }
  })
  it('valida HMAC sobre os bytes exatos antes de decodificar o JSON', async () => {
    const json = JSON.stringify(statusPayload('wamid.bytes', 'delivered'))
    const encoded = new TextEncoder().encode(json)
    const body = new Uint8Array(encoded.length + 3)
    body.set([0xef, 0xbb, 0xbf])
    body.set(encoded, 3)
    const res = await SELF.fetch('https://x.com/webhook', {
      method: 'POST', body,
      headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
    })
    expect(res.status).toBe(200)
  })
  it('evento reconhecido malformado → 400 para a Meta repetir', async () => {
    const payload = statusPayload('wamid.bad', 'invalid-status')
    const body = JSON.stringify(payload)
    const res = await SELF.fetch('https://x.com/webhook', {
      method: 'POST', body,
      headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
    })
    expect(res.status).toBe(400)
  })
  it('aceita todos os estados oficiais de ciclo de vida do template', async () => {
    const statuses = [
      'APPROVED', 'ARCHIVED', 'UNARCHIVED', 'DELETED', 'DISABLED', 'FLAGGED',
      'IN_APPEAL', 'LIMIT_EXCEEDED', 'LOCKED', 'PAUSED', 'PENDING',
      'REINSTATED', 'PENDING_DELETION', 'REJECTED',
    ] as const
    for (const [index, event] of statuses.entries()) {
      const queued = await enqueueOfficialWebhook(templateWebhook(
        'message_template_status_update',
        {
          event,
          message_template_id: 9_000_000 + index,
          message_template_name: `lifecycle_${event.toLowerCase()}`,
          message_template_language: 'pt_BR',
          message_template_category: 'UTILITY',
          reason: event === 'REJECTED' ? 'INVALID_FORMAT' : 'NONE',
        },
        1_750_000_000 + index,
      ))
      expect(queued).toMatchObject({ kind: 'template_status', timestamp: 1_750_000_000 + index })
      if (queued.kind !== 'template_status') throw new Error('status de template esperado')
      expect(queued.template.event).toBe(event)
    }
  })
  it('rejeita eventos de qualidade, componentes e categoria incompletos', async () => {
    for (const payload of [
      templateWebhook('message_template_quality_update', {
        message_template_id: 1, message_template_name: 'incompleto',
        message_template_language: 'pt_BR', new_quality_score: 'GREEN',
      }, 100),
      templateWebhook('message_template_components_update', {
        message_template_id: 2, message_template_name: 'incompleto',
        message_template_language: 'pt_BR',
      }, 100),
      templateWebhook('template_category_update', {
        message_template_id: 3, message_template_name: 'incompleto',
        message_template_language: 'pt_BR', new_category: 'MARKETING',
      }, 100),
    ]) {
      const body = JSON.stringify(payload)
      const response = await SELF.fetch('https://x.com/webhook', {
        method: 'POST', body,
        headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
      })
      expect(response.status).toBe(400)
    }
  })
  it('rejeita lote agregado acima de 1000 eventos sem enfileirar parcialmente', async () => {
    const payload = statusPayload('wamid.batch-0', 'delivered')
    payload.entry[0].changes[0].value.statuses = Array.from({ length: 1001 }, (_, index) => ({
      id: `wamid.batch-${index}`, status: 'delivered', timestamp: '1749416383',
      recipient_id: '5511999990201',
    }))
    const body = JSON.stringify(payload)
    const sendBatch = vi.spyOn(env.WEBHOOK_QUEUE, 'sendBatch')
    try {
      const res = await SELF.fetch('https://x.com/webhook', {
        method: 'POST', body,
        headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
      })
      expect(res.status).toBe(400)
      expect(sendBatch).not.toHaveBeenCalled()
    } finally {
      sendBatch.mockRestore()
    }
  })
  it('extrai mensagem inbound oficial para a Queue sem carregar campos arbitrários', async () => {
    const from = uniqueInboundPhone().replace('+', '')
    const payload = inboundPayload(`wamid.${crypto.randomUUID()}`, from)
    ;(payload.entry[0].changes[0].value.messages[0] as Record<string, unknown>).unexpected = 'não-propagar'
    const body = JSON.stringify(payload)
    const sendBatch = vi.spyOn(env.WEBHOOK_QUEUE, 'sendBatch')
    try {
      const res = await SELF.fetch('https://x.com/webhook', {
        method: 'POST', body,
        headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
      })
      expect(res.status).toBe(200)
      const queued = Array.from(sendBatch.mock.calls[0][0])[0].body as MetaWebhookEvent
      expect(queued.kind).toBe('inbound_message')
      expect(JSON.stringify(queued)).not.toContain('não-propagar')
    } finally {
      sendBatch.mockRestore()
    }
  })

  it('materializa mensagem username-only por BSUID sem inventar telefone', async () => {
    const userId = `US.${Date.now()}${Math.floor(Math.random() * 1000)}`
    const messageId = `wamid.bsuid.${crypto.randomUUID()}`
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ id: WABA, changes: [{ field: 'messages', value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15550783881', phone_number_id: PHONE_ID },
        contacts: [{
          profile: { name: 'Pessoa Username', username: 'pessoa.username' },
          user_id: userId,
        }],
        messages: [{
          from_user_id: userId,
          id: messageId,
          timestamp: '1749416383',
          type: 'text',
          text: { body: 'Mensagem sem telefone' },
        }],
      } }] }],
    }
    const body = JSON.stringify(payload)
    const sendBatch = vi.spyOn(env.WEBHOOK_QUEUE, 'sendBatch')
    try {
      const res = await SELF.fetch('https://x.com/webhook', {
        method: 'POST', body,
        headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
      })
      expect(res.status).toBe(200)
      const queued = Array.from(sendBatch.mock.calls[0][0])[0].body as MetaWebhookEvent
      expect(queued).toMatchObject({
        kind: 'inbound_message',
        message: {
          from: userId,
          userId,
          username: 'pessoa.username',
          textBody: 'Mensagem sem telefone',
        },
      })
      await handleWebhookBatch([queued], env)
      const contact = await env.DB.prepare(
        'SELECT phone,user_id,username,status FROM contacts WHERE user_id=?1',
      ).bind(userId).first<{
        phone: string; user_id: string; username: string; status: string
      }>()
      expect(contact).toEqual({
        phone: `bsuid:${userId}`,
        user_id: userId,
        username: 'pessoa.username',
        status: 'unknown',
      })
      expect((await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM conversation_messages WHERE id=?1',
      ).bind(messageId).first<{ n: number }>())?.n).toBe(1)

      const laterPhone = uniqueInboundPhone()
      await handleWebhookBatch([{
        kind: 'inbound_message', wabaId: WABA, phoneNumberId: PHONE_ID,
        message: {
          id: `wamid.bsuid-phone.${crypto.randomUUID()}`,
          from: userId,
          phone: laterPhone.replace('+', ''),
          userId,
          username: 'pessoa.username',
          timestamp: '1749416384',
          type: 'text',
          textBody: 'Agora com telefone',
        },
      }], env)
      expect(await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM contacts WHERE user_id=?1',
      ).bind(userId).first<{ n: number }>()).toEqual({ n: 1 })
      expect((await contactsDb(env.DB).getByUserId(userId))?.phone).toBe(laterPhone)
    } finally {
      sendBatch.mockRestore()
    }
  })

  it('extrai a origem CTWA mínima sem copiar texto, mídia ou query do anúncio', async () => {
    const from = uniqueInboundPhone().replace('+', '')
    const messageId = `wamid.ctwa.${crypto.randomUUID()}`
    const payload = inboundPayload(messageId, from, 'Quero saber mais')
    const message = payload.entry[0].changes[0].value.messages[0] as Record<string, unknown>
    message.referral = {
      ctwa_clid: `clid-${crypto.randomUUID()}`,
      source_id: '120000000000001',
      source_type: 'ad',
      source_url: 'https://www.facebook.com/ads/example?customer=secret#campaign',
      headline: 'Texto do anúncio que não deve ser persistido',
      body: 'Conteúdo promocional que não deve ser persistido',
      image_url: 'https://cdn.example/private-image.jpg',
    }
    const queued = await enqueueOfficialWebhook(payload)
    expect(queued).toMatchObject({
      kind: 'inbound_message',
      message: {
        id: messageId,
        referral: {
          sourceId: '120000000000001',
          sourceType: 'ad',
          sourceUrl: 'https://www.facebook.com/ads/example',
        },
      },
    })
    expect(JSON.stringify(queued)).not.toContain('Texto do anúncio')
    expect(JSON.stringify(queued)).not.toContain('private-image')
    expect(JSON.stringify(queued)).not.toContain('customer=secret')

    await handleWebhookBatch([queued], env)
    await handleWebhookBatch([queued], env)
    const row = await env.DB.prepare(
      `SELECT a.attribution_kind,a.source_id,a.source_type,a.source_url,
              LENGTH(a.ctwa_clid) AS click_length
       FROM conversation_attributions a WHERE a.source_message_id=?1`,
    ).bind(messageId).first<{
      attribution_kind: string
      source_id: string
      source_type: string
      source_url: string
      click_length: number
    }>()
    expect(row).toMatchObject({
      attribution_kind: 'ctwa',
      source_id: '120000000000001',
      source_type: 'ad',
      source_url: 'https://www.facebook.com/ads/example',
    })
    expect(row?.click_length).toBeGreaterThan(10)
    expect((await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM conversation_attributions WHERE source_message_id=?1',
    ).bind(messageId).first<{ n: number }>())?.n).toBe(1)
  })

  it('extrai nfm_reply oficial e preserva somente a resposta JSON da MiniApp', async () => {
    const from = uniqueInboundPhone().replace('+', '')
    const payload = inboundPayload(`wamid.${crypto.randomUUID()}`, from)
    const message = payload.entry[0].changes[0].value.messages[0] as Record<string, unknown>
    message.type = 'interactive'
    delete message.text
    message.interactive = {
      type: 'nfm_reply',
      nfm_reply: {
        name: 'flow',
        response_json: JSON.stringify({
          flow_token: 'smartzap:9988776655:nonce',
          interesse: 'curso',
        }),
        unexpected: 'não-propagar',
      },
    }
    const body = JSON.stringify(payload)
    const sendBatch = vi.spyOn(env.WEBHOOK_QUEUE, 'sendBatch')
    try {
      const res = await SELF.fetch('https://x.com/webhook', {
        method: 'POST', body,
        headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
      })
      expect(res.status).toBe(200)
      const queued = Array.from(sendBatch.mock.calls[0][0])[0].body as Extract<
        MetaWebhookEvent,
        { kind: 'inbound_message' }
      >
      expect(queued.message.content?.flowResponse).toEqual({
        flow_token: 'smartzap:9988776655:nonce',
        interesse: 'curso',
      })
      expect(JSON.stringify(queued)).not.toContain('não-propagar')
    } finally {
      sendBatch.mockRestore()
    }
  })

  it('rejeita texto inbound sem body para a Meta repetir', async () => {
    const payload = inboundPayload(`wamid.${crypto.randomUUID()}`, uniqueInboundPhone().replace('+', ''))
    delete (payload.entry[0].changes[0].value.messages[0] as { text?: unknown }).text
    const body = JSON.stringify(payload)
    const res = await SELF.fetch('https://x.com/webhook', {
      method: 'POST', body,
      headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
    })
    expect(res.status).toBe(400)
  })

  it('produção rejeita evento assinado de outra WABA ou outro número', async () => {
    const productionEnv = {
      ...env,
      ENVIRONMENT: 'production',
      META_EXPECTED_WABA_ID: 'expected-waba',
      META_EXPECTED_PHONE_ID: 'expected-phone',
    } as unknown as Env
    const app = createApp()
    const sendBatch = vi.spyOn(env.WEBHOOK_QUEUE, 'sendBatch')
    try {
      for (const payload of [
        inboundPayload(`wamid.${crypto.randomUUID()}`, uniqueInboundPhone().replace('+', '')),
        {
          ...inboundPayload(`wamid.${crypto.randomUUID()}`, uniqueInboundPhone().replace('+', '')),
          entry: [{
            ...inboundPayload('unused', '5511999999999').entry[0],
            id: 'expected-waba',
            changes: [{ field: 'messages', value: {
              ...inboundPayload('unused', '5511999999999').entry[0].changes[0].value,
              metadata: { phone_number_id: 'other-phone' },
            } }],
          }],
        },
      ]) {
        const body = JSON.stringify(payload)
        const res = await app.fetch(new Request('https://x.com/webhook', {
          method: 'POST', body,
          headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
        }), productionEnv)
        expect(res.status).toBe(400)
      }
      expect(sendBatch).not.toHaveBeenCalled()
    } finally {
      sendBatch.mockRestore()
    }
  })
})

describe('handleWebhookBatch', () => {
  it('retoma download de mídia inbound após falha sem duplicar a mensagem', async () => {
    const phone = uniqueInboundPhone()
    const waId = phone.replace('+', '')
    const messageId = `wamid.${crypto.randomUUID()}`
    const mediaId = String(Date.now())
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('whatsapp_phone_id', ?1)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      ).bind(PHONE_ID),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('whatsapp_waba_id', ?1)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      ).bind(WABA),
    ])
    const event: MetaWebhookEvent = {
      kind: 'inbound_message', wabaId: WABA, phoneNumberId: PHONE_ID,
      message: {
        id: messageId, from: waId, timestamp: '1749416383', type: 'image',
        profileName: 'Pessoa com mídia',
        content: { mediaId, mimeType: 'image/png', caption: 'Comprovante' },
      },
    }
    let metadataAttempts = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes(`/${mediaId}`)) {
        metadataAttempts += 1
        if (metadataAttempts === 1) throw new Error('falha transitória')
        return Response.json({ url: 'https://lookaside.fbsbx.com/test-media' })
      }
      if (url === 'https://lookaside.fbsbx.com/test-media')
        return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          headers: { 'content-type': 'image/png', 'content-length': '4' },
        })
      throw new Error(`fetch inesperado: ${url}`)
    }))
    try {
      await expect(handleWebhookBatch([event], env)).rejects.toThrow()
      await handleWebhookBatch([event], env)

      const conversation = await env.DB.prepare(
        `SELECT c.id FROM conversations c JOIN contacts ct ON ct.id=c.contact_id
         WHERE ct.wa_id=?1`,
      ).bind(waId).first<{ id: string }>()
      const messageCount = await env.DB.prepare(
        'SELECT COUNT(*) n FROM conversation_messages WHERE id=?1',
      ).bind(messageId).first<{ n: number }>()
      const stored = await env.DB.prepare(
        'SELECT r2_key,mime_type,byte_size FROM conversation_media WHERE message_id=?1',
      ).bind(messageId).first<{ r2_key: string; mime_type: string; byte_size: number }>()
      expect(conversation).toBeTruthy()
      expect(messageCount?.n).toBe(1)
      expect(stored).toMatchObject({ mime_type: 'image/png', byte_size: 4 })
      expect(await env.MEDIA.get(stored!.r2_key)).not.toBeNull()
      expect(metadataAttempts).toBe(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('persiste inbound uma vez, cria contato unknown e expõe inbox autenticada', async () => {
    const phone = uniqueInboundPhone()
    const waId = phone.replace('+', '')
    const messageId = `wamid.${crypto.randomUUID()}`
    const event: MetaWebhookEvent = {
      kind: 'inbound_message', wabaId: WABA, phoneNumberId: PHONE_ID,
      message: {
        id: messageId, from: waId, timestamp: '1749416383', type: 'text',
        profileName: 'Pessoa Inbox', textBody: 'Quero falar com alguém',
      },
    }
    await handleWebhookBatch([event], env)
    await handleWebhookBatch([event], env)

    const contact = await contactsDb(env.DB).getByWaId(waId)
    expect(contact).toMatchObject({ phone, name: 'Pessoa Inbox', status: 'unknown', wa_id: waId })
    const conversation = await env.DB.prepare(
      'SELECT id, unread_count, last_message_preview FROM conversations WHERE contact_id = ?1'
    ).bind(contact!.id).first<{ id: string; unread_count: number; last_message_preview: string }>()
    expect(conversation).toMatchObject({ unread_count: 1, last_message_preview: 'Quero falar com alguém' })
    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM conversation_messages WHERE id = ?1'
    ).bind(messageId).first<{ n: number }>()
    expect(count?.n).toBe(1)

    const list = await SELF.fetch('https://x.com/api/conversations', { headers: { 'x-api-key': 'dev-api-key' } })
    expect(list.status).toBe(200)
    const listBody = await list.json() as { items: { id: string }[] }
    expect(listBody.items.some((item) => item.id === conversation!.id)).toBe(true)
    const messages = await SELF.fetch(`https://x.com/api/conversations/${conversation!.id}/messages`, {
      headers: { 'x-api-key': 'dev-api-key' },
    })
    expect(await messages.json()).toMatchObject({
      total: 1, items: [{ id: messageId, text_body: 'Quero falar com alguém' }],
    })
    const read = await SELF.fetch(`https://x.com/api/conversations/${conversation!.id}/read`, {
      method: 'POST', headers: { 'x-api-key': 'dev-api-key' },
    })
    expect(read.status).toBe(200)
    expect(await read.json()).toEqual({ ok: true, changed: 1 })
    expect((await env.DB.prepare(
      'SELECT unread_count FROM conversations WHERE id = ?1'
    ).bind(conversation!.id).first<{ unread_count: number }>())?.unread_count).toBe(0)
  })

  it('mensagem inbound não rebaixa contato que já possui opt-in', async () => {
    const phone = uniqueInboundPhone()
    const contact = await contactsDb(env.DB).createOptInWithConsent({ phone }, 'consentimento')
    const waId = phone.replace('+', '')
    await handleWebhookBatch([{
      kind: 'inbound_message', wabaId: WABA, phoneNumberId: PHONE_ID,
      message: {
        id: `wamid.${crypto.randomUUID()}`, from: waId,
        timestamp: '1749416383', type: 'text', textBody: 'Oi',
      },
    }], env)
    expect((await contactsDb(env.DB).getByPhone(phone))?.status).toBe('opt_in')
    expect((await contactsDb(env.DB).getByPhone(phone))?.id).toBe(contact?.id)
  })

  it('inbound fora de ordem não regride o preview da conversa', async () => {
    const phone = uniqueInboundPhone()
    const waId = phone.replace('+', '')
    const base = {
      kind: 'inbound_message' as const, wabaId: WABA, phoneNumberId: PHONE_ID,
    }
    await handleWebhookBatch([{ ...base, message: {
      id: `wamid.${crypto.randomUUID()}`, from: waId,
      timestamp: '200', type: 'text', textBody: 'mensagem nova',
    } }], env)
    await handleWebhookBatch([{ ...base, message: {
      id: `wamid.${crypto.randomUUID()}`, from: waId,
      timestamp: '100', type: 'text', textBody: 'mensagem atrasada',
    } }], env)
    const conversation = await env.DB.prepare(
      'SELECT last_message_at, last_message_preview, unread_count FROM conversations WHERE wa_id = ?1'
    ).bind(waId).first<{
      last_message_at: number; last_message_preview: string; unread_count: number
    }>()
    expect(conversation).toEqual({
      last_message_at: 200, last_message_preview: 'mensagem nova', unread_count: 2,
    })
  })
  it('atualiza status e deduplica por WABA + número + mensagem + transição', async () => {
    const mid = 'wamid.' + crypto.randomUUID()
    const contact = await contactsDb(env.DB).create({ phone: uniquePhone(), status: 'opt_in' })
    const campaign = await campaignsDb(env.DB).create({ name: 'W', template_name: 'promo_teste' })
    await campaignContactsDb(env.DB).bulkInsert(campaign.id,
      [{ contactId: contact.id, phone: contact.phone, status: 'pending' }])
    await campaignContactsDb(env.DB).markResult(campaign.id, contact.id, { status: 'sent', message_id: mid })
    await campaignsDb(env.DB).updateCounters(campaign.id, { sent: 1 })

    const evt = statusEvent(mid, 'delivered')
    await handleWebhookBatch([evt], env)
    await handleWebhookBatch([evt], env)
    expect((await campaignsDb(env.DB).get(campaign.id))?.delivered).toBe(1)
    const recorded = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM status_events WHERE message_id = ?1 AND status = 'delivered'"
    ).bind(mid).first<{ n: number }>()
    expect(recorded?.n).toBe(1)

    await handleWebhookBatch([{ ...evt, wabaId: 'another-waba' }], env)
    const contextual = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM status_events WHERE message_id = ?1 AND status = 'delivered'"
    ).bind(mid).first<{ n: number }>()
    expect(contextual?.n).toBe(2)
  })

  it('não regride read com delivered/sent atrasados nem aceita failed tardio', async () => {
    const mid = 'wamid.' + crypto.randomUUID()
    const contact = await contactsDb(env.DB).create({ phone: uniquePhone(), status: 'opt_in' })
    const campaign = await campaignsDb(env.DB).create({ name: 'Out of order', template_name: 'promo_teste' })
    await campaignContactsDb(env.DB).bulkInsert(campaign.id,
      [{ contactId: contact.id, phone: contact.phone, status: 'pending' }])
    await campaignContactsDb(env.DB).markResult(campaign.id, contact.id, {
      status: 'sent', message_id: mid,
    })
    await campaignsDb(env.DB).updateCounters(campaign.id, { sent: 1 })

    await handleWebhookBatch([statusEvent(mid, 'read')], env)
    await handleWebhookBatch([statusEvent(mid, 'delivered')], env)
    await handleWebhookBatch([statusEvent(mid, 'sent')], env)
    await handleWebhookBatch([statusEvent(mid, 'failed')], env)

    const row = await env.DB.prepare(
      'SELECT status FROM campaign_contacts WHERE message_id = ?1'
    ).bind(mid).first<{ status: string }>()
    const counters = await campaignsDb(env.DB).get(campaign.id)
    expect(row?.status).toBe('read')
    expect(counters).toMatchObject({ sent: 1, delivered: 1, read: 1, failed: 0 })
  })

  it('preserva erro assíncrono, redige PII e aplica opt-out 131050', async () => {
    const mid = 'wamid.' + crypto.randomUUID()
    const phone = uniquePhone()
    const contact = await contactsDb(env.DB).createOptInWithConsent({ phone }, 'consentimento teste')
    const campaign = await campaignsDb(env.DB).create({ name: 'Async', template_name: 'promo_teste' })
    await campaignContactsDb(env.DB).bulkInsert(campaign.id,
      [{ contactId: contact!.id, phone, status: 'pending' }])
    await campaignContactsDb(env.DB).markResult(campaign.id, contact!.id, { status: 'sent', message_id: mid })

    await handleWebhookBatch([statusEvent(mid, 'failed', [{
      code: 131050, message: 'Stopped',
      error_data: { details: `User ${phone} requested stop` }, fbtrace_id: 'TRACE_TEST',
    }])], env)

    expect((await contactsDb(env.DB).getByPhone(phone))?.status).toBe('opt_out')
    const row = await env.DB.prepare(
      'SELECT error_code, error_detail FROM campaign_contacts WHERE message_id = ?1'
    ).bind(mid).first<{ error_code: string; error_detail: string }>()
    expect(row?.error_code).toBe('131050')
    expect(row?.error_detail).not.toContain(phone)
    const stored = await env.DB.prepare(
      'SELECT raw, fbtrace_id FROM status_events WHERE message_id = ?1'
    ).bind(mid).first<{ raw: string; fbtrace_id: string }>()
    expect(stored?.raw).not.toContain(phone.replace('+', ''))
    expect(stored?.fbtrace_id).toBe('TRACE_TEST')
  })

  it('processa user_preferences stop e resume sem recriar opt-in', async () => {
    const phone = uniquePhone()
    const waId = phone.replace('+', '')
    const contact = await contactsDb(env.DB).createOptInWithConsent({ phone }, 'consentimento teste')
    await contactsDb(env.DB).setWaId(contact!.id, waId)
    const preference = (value: 'stop' | 'resume'): MetaWebhookEvent => ({
      kind: 'user_preference', wabaId: WABA, phoneNumberId: PHONE_ID,
      preference: { wa_id: waId, category: 'marketing_messages', value, timestamp: Date.now() },
    })
    await handleWebhookBatch([preference('stop')], env)
    expect((await contactsDb(env.DB).getByPhone(phone))?.status).toBe('opt_out')
    expect((await resolveAudience(env.DB, {})).eligible.some((item) => item.id === contact!.id)).toBe(false)
    const revoked = await env.DB.prepare(
      'SELECT revoked_at FROM consent_events WHERE contact_id = ?1'
    ).bind(contact!.id).first<{ revoked_at: string | null }>()
    expect(revoked?.revoked_at).toBeTruthy()

    await handleWebhookBatch([preference('resume')], env)
    expect((await contactsDb(env.DB).getByPhone(phone))?.status).toBe('unknown')
    expect((await resolveAudience(env.DB, {})).eligible.some((item) => item.id === contact!.id)).toBe(false)
  })

  it('resume isolado revoga evidência antiga e exige novo consentimento explícito', async () => {
    const phone = uniquePhone()
    const waId = phone.replace('+', '')
    const contact = await contactsDb(env.DB).createOptInWithConsent({ phone }, 'consentimento antigo')
    await contactsDb(env.DB).setWaId(contact!.id, waId)
    await handleWebhookBatch([{
      kind: 'user_preference', wabaId: WABA, phoneNumberId: PHONE_ID,
      preference: {
        wa_id: waId, category: 'marketing_messages', value: 'resume', timestamp: Date.now(),
      },
    }], env)

    expect((await contactsDb(env.DB).getByPhone(phone))?.status).toBe('unknown')
    expect(await env.DB.prepare(
      'SELECT revoked_at, revoked_reason FROM consent_events WHERE contact_id = ?1'
    ).bind(contact!.id).first()).toEqual(expect.objectContaining({
      revoked_at: expect.any(String),
      revoked_reason: 'meta_user_preferences_resume_requires_reconsent',
    }))
    expect((await resolveAudience(env.DB, {})).eligible.some((item) => item.id === contact!.id)).toBe(false)
  })

  it('aplica status oficial com diagnóstico, deduplica e não regride por evento antigo', async () => {
    const name = 'template_' + crypto.randomUUID()
    const metaId = String(Date.now() + 123)
    await templatesDb(env.DB).replaceFromMeta([{
      id: metaId, name, language: 'pt_BR', category: 'MARKETING', status: 'APPROVED', components: [],
    }])
    const rejected = await enqueueOfficialWebhook(templateWebhook(
      'message_template_status_update',
      {
        event: 'REJECTED', message_template_id: metaId, message_template_name: name,
        message_template_language: 'pt_BR', message_template_category: 'MARKETING',
        reason: 'INVALID_FORMAT',
        rejection_info: {
          reason: 'Variáveis {{1}}{{2}} estão juntas sem texto.',
          recommendation: 'Separe as variáveis com texto descritivo.',
        },
      },
      200,
    ))
    await handleWebhookBatch([rejected, rejected], env)
    expect(await env.DB.prepare(
      `SELECT status,status_reason,status_detail,status_recommendation,status_event_at
       FROM templates WHERE meta_id=?1`,
    ).bind(metaId).first()).toEqual({
      status: 'REJECTED',
      status_reason: 'INVALID_FORMAT',
      status_detail: 'Variáveis {{1}}{{2}} estão juntas sem texto.',
      status_recommendation: 'Separe as variáveis com texto descritivo.',
      status_event_at: 200,
    })
    expect((await env.DB.prepare(
      `SELECT COUNT(*) n FROM status_events
       WHERE event_kind='template_status' AND raw LIKE ?1`,
    ).bind(`%${name}%`).first<{ n: number }>())?.n).toBe(1)

    const reinstated = await enqueueOfficialWebhook(templateWebhook(
      'message_template_status_update',
      {
        event: 'REINSTATED', message_template_id: metaId, message_template_name: name,
        message_template_language: 'pt_BR', message_template_category: 'MARKETING', reason: 'NONE',
      },
      300,
    ))
    const stalePause = await enqueueOfficialWebhook(templateWebhook(
      'message_template_status_update',
      {
        event: 'PAUSED', message_template_id: metaId, message_template_name: name,
        message_template_language: 'pt_BR', message_template_category: 'MARKETING', reason: 'NONE',
        other_info: { title: 'FIRST_PAUSE', description: 'Evento anterior atrasado.' },
      },
      250,
    ))
    await handleWebhookBatch([reinstated], env)
    await handleWebhookBatch([stalePause], env)
    expect(await env.DB.prepare(
      `SELECT status,status_reason,status_detail,status_recommendation,status_event_at
       FROM templates WHERE meta_id=?1`,
    ).bind(metaId).first()).toEqual({
      status: 'APPROVED', status_reason: null, status_detail: null,
      status_recommendation: null, status_event_at: 300,
    })
  })

  it('preserva erro assíncrono no nível value.errors sem PII', async () => {
    await handleWebhookBatch([{
      kind: 'platform_error', wabaId: WABA, phoneNumberId: PHONE_ID,
      scope: 'value.errors', error: {
        code: 131005, message: 'Permission denied for +5511999999999', fbtrace_id: 'TRACE_PLATFORM',
      },
    }], env)
    const row = await env.DB.prepare(
      "SELECT error_code, error_detail, fbtrace_id FROM status_events WHERE fbtrace_id = 'TRACE_PLATFORM'"
    ).first<{ error_code: string; error_detail: string; fbtrace_id: string }>()
    expect(row?.error_code).toBe('131005')
    expect(row?.error_detail).not.toContain('5511999999999')
  })
})

describe('consumer da Queue', () => {
  it('persiste a resposta nfm_reply de um MiniApp e a torna concluída', async () => {
    const flowId = crypto.randomUUID()
    await env.DB.prepare(
      "INSERT INTO flows(id,name,status,meta_id,definition_json)VALUES(?1,'Flow webhook','PUBLISHED','9988776655','{}')"
    ).bind(flowId).run()
    const from = uniqueInboundPhone().replace('+', '')
    await handleWebhookBatch([{
      kind: 'inbound_message',
      wabaId: WABA,
      phoneNumberId: PHONE_ID,
      message: {
        id: `wamid.flow-reply-${crypto.randomUUID()}`,
        from,
        timestamp: '1749416383',
        type: 'interactive',
        content: {
          flowResponse: {
            flow_token: 'smartzap:9988776655:nonce',
            flow_id: '9988776655',
            interesse: 'curso',
          },
        },
      },
    }], env)
    const submission = await env.DB.prepare(
      "SELECT flow_local_id,status,response_json FROM flow_submissions WHERE flow_token='smartzap:9988776655:nonce'"
    ).first<{ flow_local_id: string; status: string; response_json: string }>()
    expect(submission?.flow_local_id).toBe(flowId)
    expect(submission?.status).toBe('completed')
    expect(JSON.parse(submission!.response_json)).toEqual(
      expect.objectContaining({ interesse: 'curso' }),
    )
  })

  it('aplica o mapeamento da resposta ao contato e registra a automação', async () => {
    const flowId = crypto.randomUUID()
    const customFieldId = crypto.randomUUID()
    const metaId = String(Date.now()).slice(0, 12)
    await env.DB.prepare(
      "INSERT INTO custom_field_defs(id,key,label,type)VALUES(?1,'interesse_flow','Interesse do Flow','text')"
    ).bind(customFieldId).run()
    await env.DB.prepare(
      `INSERT INTO flows(id,name,status,meta_id,definition_json,mapping_json)
       VALUES(?1,'Flow mapeado','PUBLISHED',?2,?3,?4)`
    ).bind(
      flowId,
      metaId,
      JSON.stringify({ confirmation: { enabled: false }, screens: [] }),
      JSON.stringify({
        contact: { nameField: 'nome', emailField: 'email' },
        customFields: { [customFieldId]: 'interesse' },
      }),
    ).run()
    const from = uniqueInboundPhone().replace('+', '')
    await handleWebhookBatch([{
      kind: 'inbound_message', wabaId: WABA, phoneNumberId: PHONE_ID,
      message: {
        id: `wamid.flow-mapping-${crypto.randomUUID()}`,
        from, timestamp: '1749416383', type: 'interactive',
        content: { flowResponse: {
          flow_token: `smartzap:${metaId}:nonce`,
          nome: 'Ana Mapeada', email: 'ana@example.com', interesse: 'curso',
        } },
      },
    }], env)
    const contact = await env.DB.prepare(
      'SELECT id,name,email FROM contacts WHERE phone=?1'
    ).bind(`+${from}`).first<{ id: string; name: string; email: string }>()
    expect(contact).toMatchObject({ name: 'Ana Mapeada', email: 'ana@example.com' })
    const custom = await env.DB.prepare(
      'SELECT value_text FROM contact_custom_values WHERE contact_id=?1 AND field_id=?2'
    ).bind(contact!.id, customFieldId).first<{ value_text: string }>()
    expect(custom?.value_text).toBe('curso')
    const submission = await env.DB.prepare(
      'SELECT mapped_data_json,mapped_at,confirmation_status FROM flow_submissions WHERE flow_local_id=?1'
    ).bind(flowId).first<{ mapped_data_json: string; mapped_at: string; confirmation_status: string }>()
    expect(JSON.parse(submission!.mapped_data_json)).toEqual({
      name: 'Ana Mapeada', email: 'ana@example.com', custom_fields: { interesse_flow: 'curso' },
    })
    expect(submission?.mapped_at).toBeTruthy()
    expect(submission?.confirmation_status).toBe('disabled')
    const history = await env.DB.prepare(
      "SELECT summary FROM contact_history_events WHERE contact_id=?1 AND event_type='flow_response_mapped'"
    ).bind(contact!.id).first<{ summary: string }>()
    expect(history?.summary).toContain('MiniApp')
    await env.DB.prepare('DELETE FROM custom_field_defs WHERE id=?1').bind(customFieldId).run()
  })

  it('confirma sucessos e repete somente a mensagem que falhou', async () => {
    const good = { body: statusEvent('ok', 'delivered'), attempts: 1, ack: vi.fn(), retry: vi.fn() }
    const poison = { body: statusEvent('poison', 'delivered'), attempts: 2, ack: vi.fn(), retry: vi.fn() }
    const handler = vi.fn(async (events: MetaWebhookEvent[]) => {
      if (events[0].kind === 'status' && events[0].status.id === 'poison') throw new Error('falha isolada')
    })
    await processWebhookMessages([good, poison], env, handler)
    expect(good.ack).toHaveBeenCalledOnce()
    expect(good.retry).not.toHaveBeenCalled()
    expect(poison.ack).not.toHaveBeenCalled()
    expect(poison.retry).toHaveBeenCalledWith({ delaySeconds: 10 })
  })

  it('aplica tier de pricing idempotente e preserva o evento oficial mais antigo', async () => {
    const wabaId = String(Date.now())
    const event = (time: number, tier: string): MetaWebhookEvent => ({
      kind: 'platform_event',
      wabaId,
      field: 'account_update',
      summary: {
        event: 'VOLUME_BASED_PRICING_TIER_UPDATE',
        tier_update_time: time,
        pricing_category: 'UTILITY',
        tier,
        effective_month: '2026-07',
        region: 'BR',
      },
    })
    await handleWebhookBatch([event(200, '0:1000'), event(300, '1001:2000'), event(100, '0:500')], env)
    const stored = await env.DB.prepare(
      'SELECT tier,tier_update_time FROM pricing_tiers WHERE waba_id=?1',
    ).bind(wabaId).first<{ tier: string; tier_update_time: number }>()
    expect(stored).toEqual({ tier: '0:500', tier_update_time: 100 })
  })

  it('aceita webhook oficial de upgrade de throughput e registra a observação', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ id: WABA, changes: [{
        field: 'phone_number_quality_update',
        value: {
          display_phone_number: '15550783881',
          event: 'THROUGHPUT_UPGRADE',
          current_limit: 'TIER_UNLIMITED',
          max_daily_conversations_per_business: 'TIER_UNLIMITED',
        },
      }] }],
    }
    const body = JSON.stringify(payload)
    const sendBatch = vi.spyOn(env.WEBHOOK_QUEUE, 'sendBatch')
    try {
      const res = await SELF.fetch('https://x.com/webhook', {
        method: 'POST', body,
        headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
      })
      expect(res.status).toBe(200)
      const queued = Array.from(sendBatch.mock.calls[0][0])[0].body as MetaWebhookEvent
      expect(queued).toMatchObject({
        kind: 'platform_event', field: 'phone_number_quality_update',
        summary: {
          event: 'THROUGHPUT_UPGRADE',
          max_daily_conversations_per_business: 'TIER_UNLIMITED',
        },
      })
      await handleWebhookBatch([queued], env)
      expect(await env.DB.prepare(
        "SELECT value FROM settings WHERE key='meta_throughput_webhook_mps'",
      ).first<{ value: string }>()).toEqual({ value: '1000' })
    } finally {
      sendBatch.mockRestore()
    }
  })

  it('aplica categoria oficial programada e efetiva sem regredir nem duplicar custo', async () => {
    const templateName = `category_${crypto.randomUUID().slice(0, 8)}`
    const metaId = String(Date.now() + 7)
    const campaignId = crypto.randomUUID()
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO templates(name,language,meta_id,category,status,components)
         VALUES(?1,'pt_BR',?2,'UTILITY','APPROVED','[]')`,
      ).bind(templateName, metaId),
      env.DB.prepare(
        `INSERT INTO campaigns(id,name,template_name,template_language,status)
         VALUES(?1,'Categoria webhook',?2,'pt_BR','draft')`,
      ).bind(campaignId, templateName),
      env.DB.prepare(
        `INSERT INTO campaign_cost_snapshots
         (id,campaign_id,state,amount,currency,source)
         VALUES(?1,?2,'estimated',0.03,'BRL','rate-card-before-change')`,
      ).bind(crypto.randomUUID(), campaignId),
    ])
    const impending = await enqueueOfficialWebhook(templateWebhook(
      'template_category_update',
      {
        message_template_id: Number(metaId), message_template_name: templateName,
        message_template_language: 'pt_BR', new_category: 'UTILITY',
        correct_category: 'MARKETING', category_update_timestamp: 300,
      },
      200,
    ))
    await handleWebhookBatch([impending, impending], env)
    expect(await env.DB.prepare(
      `SELECT category,pending_category,category_update_at,category_event_at
       FROM templates WHERE meta_id=?1`,
    ).bind(metaId).first()).toEqual({
      category: 'UTILITY', pending_category: 'MARKETING',
      category_update_at: 300, category_event_at: 200,
    })
    expect((await env.DB.prepare(
      `SELECT COUNT(*) n FROM campaign_cost_snapshots
       WHERE campaign_id=?1 AND state='unavailable'`,
    ).bind(campaignId).first<{ n: number }>())?.n).toBe(1)

    const completed = await enqueueOfficialWebhook(templateWebhook(
      'template_category_update',
      {
        message_template_id: Number(metaId), message_template_name: templateName,
        message_template_language: 'pt_BR', previous_category: 'UTILITY',
        new_category: 'MARKETING',
      },
      300,
    ))
    await handleWebhookBatch([completed], env)
    if (impending.kind !== 'platform_event') throw new Error('evento de categoria esperado')
    await handleWebhookBatch([{
      ...impending,
      summary: { ...impending.summary, webhook_timestamp: 150 },
    }], env)
    expect(await env.DB.prepare(
      `SELECT category,pending_category,category_update_at,category_event_at
       FROM templates WHERE meta_id=?1`,
    ).bind(metaId).first()).toEqual({
      category: 'MARKETING', pending_category: null,
      category_update_at: null, category_event_at: 300,
    })
  })

  it('persiste qualidade oficial e ignora atualização atrasada', async () => {
    const name = `quality_${crypto.randomUUID().slice(0, 8)}`
    const metaId = String(Date.now() + 17)
    await templatesDb(env.DB).replaceFromMeta([{
      id: metaId, name, language: 'pt_BR', category: 'MARKETING',
      status: 'APPROVED', components: [], quality_score: { score: 'GREEN' },
    }])
    const quality = async (score: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN', time: number) =>
      enqueueOfficialWebhook(templateWebhook(
        'message_template_quality_update',
        {
          previous_quality_score: score === 'YELLOW' ? 'GREEN' : 'YELLOW',
          new_quality_score: score,
          message_template_id: Number(metaId), message_template_name: name,
          message_template_language: 'pt_BR',
        },
        time,
      ))
    await handleWebhookBatch([await quality('YELLOW', 200)], env)
    await handleWebhookBatch([await quality('RED', 150)], env)
    expect(await env.DB.prepare(
      `SELECT quality_score,quality_event_at FROM templates WHERE meta_id=?1`,
    ).bind(metaId).first()).toEqual({ quality_score: 'YELLOW', quality_event_at: 200 })
    await handleWebhookBatch([await quality('RED', 300)], env)
    expect(await env.DB.prepare(
      `SELECT quality_score,quality_event_at FROM templates WHERE meta_id=?1`,
    ).bind(metaId).first()).toEqual({ quality_score: 'RED', quality_event_at: 300 })
  })

  it('sincroniza componentes pela Graph API e não repete a ação para duplicata', async () => {
    const name = `components_${crypto.randomUUID().slice(0, 8)}`
    const metaId = String(Date.now() + 27)
    await templatesDb(env.DB).replaceFromMeta([{
      id: metaId, name, language: 'pt_BR', category: 'UTILITY',
      status: 'APPROVED', components: [{ type: 'BODY', text: 'Texto antigo' }],
    }])
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO settings(key,value) VALUES('whatsapp_phone_id',?1)
         ON CONFLICT(key) DO UPDATE SET value=?1`,
      ).bind(PHONE_ID),
      env.DB.prepare(
        `INSERT INTO settings(key,value) VALUES('whatsapp_waba_id',?1)
         ON CONFLICT(key) DO UPDATE SET value=?1`,
      ).bind(WABA),
    ])
    const metaPayload = JSON.stringify({
      data: [{
        id: metaId, name, language: 'pt_BR', category: 'UTILITY', status: 'APPROVED',
        components: [
          { type: 'BODY', text: 'Texto atualizado pela Meta' },
          { type: 'BUTTONS', buttons: [{ type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+15550783881' }] },
        ],
        quality_score: { score: 'GREEN', date: '2026-08-03' },
      }],
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(metaPayload, { status: 200, headers: { 'content-type': 'application/json' } }))
    try {
      const event = await enqueueOfficialWebhook(templateWebhook(
        'message_template_components_update',
        {
          message_template_id: Number(metaId), message_template_name: name,
          message_template_language: 'pt_BR',
          message_template_element: 'Texto atualizado pela Meta',
          message_template_buttons: [{
            message_template_button_type: 'PHONE_NUMBER',
            message_template_button_text: 'Ligar',
            message_template_button_phone_number: '+15550783881',
          }],
        },
        400,
      ))
      await handleWebhookBatch([event, event], env)
      const templateReads = fetchMock.mock.calls.filter(([input]) =>
        String(input).includes(`/${WABA}/message_templates`))
      expect(templateReads).toHaveLength(1)
      expect((await templatesDb(env.DB).get(name, 'pt_BR'))?.components).toEqual([
        { type: 'BODY', text: 'Texto atualizado pela Meta' },
        { type: 'BUTTONS', buttons: [{ type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+15550783881' }] },
      ])
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('preserva status e health de webhook flows', async () => {
    const localId = crypto.randomUUID()
    const metaId = String(Date.now()).slice(0, 12)
    await env.DB.prepare(
      `INSERT INTO flows(id,name,status,meta_id,definition_json)
       VALUES(?1,'Flow health','DRAFT',?2,'{}')`,
    ).bind(localId, metaId).run()
    await handleWebhookBatch([{
      kind: 'platform_event', wabaId: WABA, field: 'flows',
      summary: { flow_id: metaId, event: 'FLOW_STATUS_CHANGE', status: 'BLOCKED' },
    }], env)
    const stored = await env.DB.prepare(
      'SELECT status,meta_status,meta_health_json FROM flows WHERE id=?1',
    ).bind(localId).first<{ status: string; meta_status: string; meta_health_json: string }>()
    expect(stored?.status).toBe('ACTION_REQUIRED')
    expect(stored?.meta_status).toBe('BLOCKED')
    expect(JSON.parse(stored!.meta_health_json)).toMatchObject({ event: 'FLOW_STATUS_CHANGE' })

    await handleWebhookBatch([{
      kind: 'platform_event', wabaId: WABA, field: 'flows',
      summary: { flow_id: metaId, event: 'ENDPOINT_LATENCY', endpoint_latency: 321 },
    }], env)
    const healthOnly = await env.DB.prepare(
      'SELECT status,meta_status,meta_health_json FROM flows WHERE id=?1',
    ).bind(localId).first<{ status: string; meta_status: string; meta_health_json: string }>()
    expect(healthOnly?.status).toBe('ACTION_REQUIRED')
    expect(healthOnly?.meta_status).toBe('BLOCKED')
    expect(JSON.parse(healthOnly!.meta_health_json)).toMatchObject({
      event: 'ENDPOINT_LATENCY', endpoint_latency: 321,
    })
  })

  it('limita o backoff individual a cinco minutos antes da DLQ', async () => {
    const poison = {
      body: statusEvent('poison-cap', 'failed'), attempts: 99,
      ack: vi.fn(), retry: vi.fn(),
    }
    await processWebhookMessages([poison], env, async () => { throw new Error('poison') })
    expect(poison.ack).not.toHaveBeenCalled()
    expect(poison.retry).toHaveBeenCalledWith({ delaySeconds: 300 })
  })
})
