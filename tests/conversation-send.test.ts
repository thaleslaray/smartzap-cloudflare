import { env } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/api/router'
import { contactsDb } from '../src/db/contacts'
import { conversationsDb } from '../src/db/conversations'
import { settingsDb } from '../src/db/settings'
import { handleWebhookBatch } from '../src/queue/webhook-consumer'

const auth = { 'content-type': 'application/json', 'x-api-key': 'dev-api-key' }

async function approvedDraft(timestamp = Math.floor(Date.now() / 1000)) {
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10)
  const digits = `55119${suffix.replace(/[^0-9]/g, '').padEnd(8, '7').slice(0, 8)}`
  const contact = await contactsDb(env.DB).ensureInboundContact({
    phone: `+${digits}`, waId: digits, profileName: 'Teste envio',
  })
  const messageId = `wamid.in.${crypto.randomUUID()}`
  const conversation = await conversationsDb(env.DB).ingestInbound(contact, {
    id: messageId, phoneNumberId: '11111', messageType: 'text',
    textBody: 'Pode responder agora', timestamp,
  })
  await conversationsDb(env.DB).setAiEnabled(conversation.conversationId, true)
  const draftId = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO ai_drafts
       (id, request_key, conversation_id, source_message_id, status, text_body,
        model, prompt_version, reviewed_at)
     VALUES (?1, ?2, ?3, ?4, 'approved', 'Olá! Esta é uma resposta revisada.',
             'test-model', 'draft-v1', datetime('now'))`
  ).bind(draftId, crypto.randomUUID(), conversation.conversationId, messageId).run()
  return { conversationId: conversation.conversationId, draftId, contact, messageId }
}

function sendRequest(app: ReturnType<typeof createApp>, input: {
  conversationId: string; draftId: string; requestKey: string; media?: Record<string, unknown>
}) {
  return app.fetch(new Request(
    `https://x.com/api/conversations/${input.conversationId}/ai/drafts/${input.draftId}/send`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ requestKey: input.requestKey, confirm: true, ...(input.media ? { media: input.media } : {}) }),
    }), env)
}

function manualDraftRequest(app: ReturnType<typeof createApp>, conversationId: string, text: string) {
  return app.fetch(new Request(`https://x.com/api/conversations/${conversationId}/manual-drafts`, {
    method: 'POST', headers: auth, body: JSON.stringify({ text, requestKey: crypto.randomUUID() }),
  }), env)
}

function templateSendRequest(
  app: ReturnType<typeof createApp>,
  conversationId: string,
  input: { requestKey: string; name: string; mapping: Record<string, unknown> },
) {
  return app.fetch(new Request(
    `https://x.com/api/conversations/${conversationId}/templates/send`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({
        requestKey: input.requestKey,
        confirm: true,
        name: input.name,
        language: 'pt_BR',
        mapping: input.mapping,
      }),
    },
  ), env)
}

describe('envio manual de rascunho aprovado', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM conversation_draft_sends').run()
    await settingsDb(env.DB).set('whatsapp_phone_id', '11111')
    await settingsDb(env.DB).set('whatsapp_waba_id', '22222')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('reserva antes da Meta, envia uma vez e materializa a mensagem outbound', async () => {
    const app = createApp()
    const draft = await approvedDraft()
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      messages: [{ id: 'wamid.out.1' }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const requestKey = crypto.randomUUID()
    const first = await sendRequest(app, { ...draft, requestKey })
    expect(first.status).toBe(201)
    expect(await first.json()).toMatchObject({ status: 'accepted', message_id: 'wamid.out.1' })
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(payload).toMatchObject({
      type: 'text', text: { preview_url: false, body: 'Olá! Esta é uma resposta revisada.' },
    })
    expect(payload.biz_opaque_callback_data).toMatch(/^[0-9a-f-]{36}$/)

    const repeat = await sendRequest(app, { ...draft, requestKey })
    expect(repeat.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM conversation_messages WHERE conversation_id = ?1 AND direction = 'outbound'"
    ).bind(draft.conversationId).first()).toEqual({ n: 1 })
  })

  it('prepara uma resposta humana no mesmo trilho seguro de envio', async () => {
    const app = createApp()
    const draft = await approvedDraft()
    const response = await manualDraftRequest(app, draft.conversationId, 'Resposta escrita pelo atendente')
    expect(response.status).toBe(201)
    const manual = await response.json() as { id: string; status: string; text_body: string; model: string }
    expect(manual).toMatchObject({ status: 'approved', text_body: 'Resposta escrita pelo atendente', model: 'human' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.manual.1' }] }), { status: 200 })))
    const sent = await sendRequest(app, { conversationId: draft.conversationId, draftId: manual.id, requestKey: crypto.randomUUID() })
    expect(sent.status).toBe(201)
    expect(await env.DB.prepare("SELECT text_body FROM conversation_messages WHERE id = 'wamid.manual.1'").first())
      .toEqual({ text_body: 'Resposta escrita pelo atendente' })
  })

  it('permite a resposta humana mesmo com a IA da conversa desativada', async () => {
    const app = createApp()
    const draft = await approvedDraft()
    await conversationsDb(env.DB).setAiEnabled(draft.conversationId, false)
    const response = await manualDraftRequest(app, draft.conversationId, 'Resposta humana sem IA')
    expect(response.status).toBe(201)
    const manual = await response.json() as { id: string }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.manual.no-ai.1' }] }), { status: 200 })))
    const sent = await sendRequest(app, { conversationId: draft.conversationId, draftId: manual.id, requestKey: crypto.randomUUID() })
    expect(sent.status).toBe(201)
    expect(await env.DB.prepare("SELECT message_type FROM conversation_messages WHERE id = 'wamid.manual.no-ai.1'").first())
      .toEqual({ message_type: 'text' })
  })

  it('envia template aprovado fora da janela de 24h, resolve variáveis e materializa na Inbox', async () => {
    const app = createApp()
    const draft = await approvedDraft(Math.floor(Date.now() / 1000) - 86_401)
    const name = `inbox_utility_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
    await env.DB.prepare(
      `INSERT INTO templates(name, language, meta_id, category, status, components, synced_at)
       VALUES (?1, 'pt_BR', 'meta-inbox', 'UTILITY', 'APPROVED', ?2, datetime('now'))`,
    ).bind(name, JSON.stringify([{ type: 'BODY', text: 'Olá {{1}}, protocolo {{2}}.' }])).run()
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body))
      expect(payload).toMatchObject({
        type: 'template',
        template: {
          name,
          language: { code: 'pt_BR' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: 'Teste envio' },
              { type: 'text', text: 'SZ-123' },
            ],
          }],
        },
      })
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.template.1' }] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const requestKey = crypto.randomUUID()
    const input = {
      requestKey,
      name,
      mapping: {
        'body.1': { source: 'contact_name' },
        'body.2': { source: 'fixed', value: 'SZ-123' },
      },
    }
    const first = await templateSendRequest(app, draft.conversationId, input)
    expect(first.status).toBe(201)
    expect(await first.json()).toMatchObject({ status: 'accepted', message_id: 'wamid.template.1' })
    expect((await templateSendRequest(app, draft.conversationId, input)).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await env.DB.prepare(
      "SELECT message_type, text_body, content_json FROM conversation_messages WHERE id='wamid.template.1'",
    ).first()).toMatchObject({
      message_type: 'template',
      text_body: expect.stringContaining('Olá Teste envio, protocolo SZ-123.'),
    })
  })

  it('não envia template com variável obrigatória ausente', async () => {
    const app = createApp()
    const draft = await approvedDraft()
    const name = `inbox_missing_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
    await env.DB.prepare(
      `INSERT INTO templates(name, language, meta_id, category, status, components, synced_at)
       VALUES (?1, 'pt_BR', 'meta-inbox-missing', 'UTILITY', 'APPROVED', ?2, datetime('now'))`,
    ).bind(name, JSON.stringify([{ type: 'BODY', text: 'Olá {{1}}' }])).run()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await templateSendRequest(app, draft.conversationId, {
      requestKey: crypto.randomUUID(), name, mapping: {},
    })
    expect(response.status).toBe(409)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('permite responder manualmente quando a última entrada é mídia sem legenda', async () => {
    const app = createApp()
    const draft = await approvedDraft()
    await conversationsDb(env.DB).ingestInbound(draft.contact, {
      id: `wamid.media-in.${crypto.randomUUID()}`,
      phoneNumberId: '11111',
      messageType: 'image',
      timestamp: Math.floor(Date.now() / 1000) + 1,
    })
    const response = await manualDraftRequest(app, draft.conversationId, 'Recebi sua imagem.')
    expect(response.status).toBe(201)
    const manual = await response.json() as { id: string }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      messages: [{ id: 'wamid.manual.media.1' }],
    }), { status: 200 })))
    const sent = await sendRequest(app, {
      conversationId: draft.conversationId,
      draftId: manual.id,
      requestKey: crypto.randomUUID(),
    })
    expect(sent.status).toBe(201)
  })

  it('faz upload, envia mídia uma vez e materializa o tipo correto no Inbox', async () => {
    const app = createApp()
    const draft = await approvedDraft()
    const manualResponse = await manualDraftRequest(app, draft.conversationId, 'Legenda revisada')
    const manual = await manualResponse.json() as { id: string }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/11111/media')) {
        expect(init?.body).toBeInstanceOf(FormData)
        return new Response(JSON.stringify({ id: '99887766' }), { status: 200 })
      }
      const payload = JSON.parse(String(init?.body))
      expect(payload).toMatchObject({
        type: 'image', image: { id: '99887766', caption: 'Legenda revisada' },
      })
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.media.1' }] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const form = new FormData()
    form.set('file', new File([
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]),
    ], 'foto.png', { type: 'image/png' }))
    const uploadedResponse = await app.fetch(new Request(
      `https://x.com/api/conversations/${draft.conversationId}/media/uploads`, {
        method: 'POST', headers: { 'x-api-key': 'dev-api-key' }, body: form,
      }), env)
    expect(uploadedResponse.status).toBe(201)
    const media = await uploadedResponse.json() as Record<string, unknown>
    expect(media).toMatchObject({ id: '99887766', type: 'image', filename: 'foto.png' })
    const requestKey = crypto.randomUUID()
    expect((await sendRequest(app, {
      conversationId: draft.conversationId, draftId: manual.id, requestKey,
      media: { ...media, caption: 'Legenda revisada' },
    })).status).toBe(201)
    expect((await sendRequest(app, {
      conversationId: draft.conversationId, draftId: manual.id, requestKey,
      media: { ...media, caption: 'Legenda revisada' },
    })).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await env.DB.prepare(
      "SELECT message_type, text_body, content_json FROM conversation_messages WHERE id = 'wamid.media.1'"
    ).first()).toMatchObject({ message_type: 'image', text_body: 'Legenda revisada' })
  })

  it('rejeita assinatura de mídia incompatível antes da Meta', async () => {
    const app = createApp()
    const draft = await approvedDraft()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const form = new FormData()
    form.set('file', new File(['não é um PDF'], 'fraude.pdf', { type: 'application/pdf' }))
    const response = await app.fetch(new Request(
      `https://x.com/api/conversations/${draft.conversationId}/media/uploads`, {
        method: 'POST', headers: { 'x-api-key': 'dev-api-key' }, body: form,
      }), env)
    expect(response.status).toBe(415)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserva a rejeição de upload da Meta sem criar mensagem outbound', async () => {
    const app = createApp()
    const draft = await approvedDraft()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 100, message: 'Unsupported media type' },
    }), { status: 400 })))
    const form = new FormData()
    form.set('file', new File([
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]),
    ], 'foto.png', { type: 'image/png' }))
    const response = await app.fetch(new Request(
      `https://x.com/api/conversations/${draft.conversationId}/media/uploads`, {
        method: 'POST', headers: { 'x-api-key': 'dev-api-key' }, body: form,
      }), env)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Unsupported media type' })
    expect(await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM conversation_messages WHERE conversation_id = ?1 AND direction = 'outbound'"
    ).bind(draft.conversationId).first()).toEqual({ n: 0 })
  })

  it('duas requisições concorrentes nunca fazem dois POSTs à Meta', async () => {
    const app = createApp()
    const draft = await approvedDraft()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      messages: [{ id: 'wamid.out.concurrent' }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const input = { ...draft, requestKey: crypto.randomUUID() }
    const responses = await Promise.all([sendRequest(app, input), sendRequest(app, input)])
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('não envia rascunho sem aprovação, desatualizado ou fora da janela de 24 horas', async () => {
    const app = createApp()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const pending = await approvedDraft()
    await env.DB.prepare("UPDATE ai_drafts SET status = 'pending_review' WHERE id = ?1")
      .bind(pending.draftId).run()
    expect((await sendRequest(app, { ...pending, requestKey: crypto.randomUUID() })).status).toBe(409)

    const stale = await approvedDraft()
    await conversationsDb(env.DB).ingestInbound(stale.contact, {
      id: `wamid.new.${crypto.randomUUID()}`, phoneNumberId: '11111', messageType: 'text',
      textBody: 'Mensagem mais nova', timestamp: Math.floor(Date.now() / 1000) + 1,
    })
    expect((await sendRequest(app, { ...stale, requestKey: crypto.randomUUID() })).status).toBe(409)

    const expired = await approvedDraft(Math.floor(Date.now() / 1000) - 86_401)
    expect((await sendRequest(app, { ...expired, requestKey: crypto.randomUUID() })).status).toBe(409)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('bloqueia retry após resposta ambígua e recupera pelo callback opaco', async () => {
    const app = createApp()
    const draft = await approvedDraft()
    const fetchMock = vi.fn(async () => new Response('gateway timeout', { status: 504 }))
    vi.stubGlobal('fetch', fetchMock)
    const requestKey = crypto.randomUUID()
    const response = await sendRequest(app, { ...draft, requestKey })
    expect(response.status).toBe(503)
    const body = await response.json() as { send: { id: string; status: string } }
    expect(body.send.status).toBe('ambiguous')
    expect((await sendRequest(app, {
      ...draft, requestKey: crypto.randomUUID(),
    })).status).toBe(409)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await handleWebhookBatch([{
      kind: 'status', wabaId: '22222', phoneNumberId: '11111',
      status: {
        id: 'wamid.recovered', status: 'read',
        timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: draft.contact.wa_id!,
        biz_opaque_callback_data: body.send.id,
      },
    }], env)
    expect(await env.DB.prepare(
      'SELECT status, message_id FROM conversation_draft_sends WHERE id = ?1'
    ).bind(body.send.id).first()).toEqual({ status: 'read', message_id: 'wamid.recovered' })
    expect(await env.DB.prepare(
      'SELECT direction FROM conversation_messages WHERE id = ?1'
    ).bind('wamid.recovered').first()).toEqual({ direction: 'outbound' })
  })

  it('mantém callbacks monotônicos, idempotentes e promove read para delivered', async () => {
    const app = createApp()
    const draft = await approvedDraft()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      messages: [{ id: 'wamid.out.status' }],
    }), { status: 200 })))
    await sendRequest(app, { ...draft, requestKey: crypto.randomUUID() })
    const base = {
      kind: 'status' as const, wabaId: '22222', phoneNumberId: '11111',
    }
    const status = (value: 'sent' | 'delivered' | 'read' | 'failed') => ({
      ...base, status: {
        id: 'wamid.out.status', status: value,
        timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: draft.contact.wa_id!,
      },
    })
    await handleWebhookBatch([status('read'), status('delivered'), status('read')], env)
    const stored = await env.DB.prepare(
      `SELECT status, sent_at IS NOT NULL AS has_sent,
              delivered_at IS NOT NULL AS has_delivered, read_at IS NOT NULL AS has_read
       FROM conversation_draft_sends WHERE message_id = 'wamid.out.status'`
    ).first()
    expect(stored).toEqual({ status: 'read', has_sent: 1, has_delivered: 1, has_read: 1 })
  })
})
