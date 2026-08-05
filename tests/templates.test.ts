import { SELF, env } from 'cloudflare:test'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { getCredentials } from '../src/whatsapp/credentials'
import { settingsDb } from '../src/db/settings'
import { templatesDb } from '../src/db/templates'
import { templateDraftsDb } from '../src/db/template-drafts'
import { templateRequiresParameters } from '../src/domain/template'
import { contactsDb } from '../src/db/contacts'

const AUTH = { 'x-api-key': 'dev-api-key', 'content-type': 'application/json' }
afterEach(() => vi.unstubAllGlobals())

describe('credentials', () => {
  it('persiste a configuração da Central de IA sem aceitar campos desconhecidos', async () => {
    const current = await SELF.fetch('https://x.com/api/settings/ai-center', { headers: AUTH })
    const config = await current.json() as Record<string, unknown>
    expect(config.generateFlowForm).toBe(true)
    const saved = await SELF.fetch('https://x.com/api/settings/ai-center', {
      method: 'PUT', headers: AUTH, body: JSON.stringify({ ...config, strategyUtility: 'Somente fatos transacionais.' }),
    })
    expect(saved.status).toBe(200)
    expect((await saved.json() as { strategyUtility: string }).strategyUtility).toBe('Somente fatos transacionais.')
    const invalid = await SELF.fetch('https://x.com/api/settings/ai-center', {
      method: 'PUT', headers: AUTH, body: JSON.stringify({ ...config, secret: 'não aceitar' }),
    })
    expect(invalid.status).toBe(400)
  })

  it('salva, normaliza, consulta e remove o contato de teste', async () => {
    const saved = await SELF.fetch('https://x.com/api/settings/test-contact', {
      method: 'PUT', headers: AUTH, body: JSON.stringify({ name: 'Teste', phone: '55 (21) 98221-9966' }),
    })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ contact: { name: 'Teste', phone: '+5521982219966' } })
    const ensured = await SELF.fetch('https://x.com/api/settings/test-contact/ensure', {
      method: 'POST', headers: AUTH,
    })
    expect(ensured.status).toBe(200)
    const recipient = await contactsDb(env.DB).getByPhone('+5521982219966')
    expect(recipient?.status).toBe('opt_in')
    const read = await SELF.fetch('https://x.com/api/settings/test-contact', { headers: AUTH })
    expect(await read.json()).toEqual({ contact: { name: 'Teste', phone: '+5521982219966' } })
    expect((await SELF.fetch('https://x.com/api/settings/test-contact', { method: 'DELETE', headers: AUTH })).status).toBe(200)
    const empty = await SELF.fetch('https://x.com/api/settings/test-contact', { headers: AUTH })
    expect(await empty.json()).toEqual({ contact: null })
  })

  it('token vem do secret e identificadores do D1 refletem mudanças imediatamente', async () => {
    await settingsDb(env.DB).set('whatsapp_phone_id', 'db-phone')
    const configuredEnv = { ...env, WHATSAPP_TOKEN: 'tok-secret-binding' }
    const creds = await getCredentials(configuredEnv)
    expect(creds?.phoneId).toBe('db-phone')
    expect(creds?.token).toBe('tok-secret-binding')
    await settingsDb(env.DB).set('whatsapp_phone_id', 'db-phone-novo')
    expect((await getCredentials(configuredEnv))?.phoneId).toBe('db-phone-novo')
  })
  it('produção bloqueia Phone ID ou WABA diferentes dos ativos esperados', async () => {
    await settingsDb(env.DB).set('whatsapp_phone_id', '99999')
    await settingsDb(env.DB).set('whatsapp_waba_id', '22222')
    const productionEnv = {
      ...env,
      ENVIRONMENT: 'production',
      META_EXPECTED_PHONE_ID: '11111',
      META_EXPECTED_WABA_ID: '22222',
    } as Env
    expect(await getCredentials(productionEnv)).toBeNull()
  })
})

describe('templates sync', () => {
  it('permite somente uma sincronização concorrente', async () => {
    const db = templatesDb(env.DB)
    const [a, b] = await Promise.all([
      db.tryAcquireSyncLock('lock-a'), db.tryAcquireSyncLock('lock-b'),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    await db.releaseSyncLock(a ? 'lock-a' : 'lock-b')
  })
  it('sync busca da Meta, salva e lista', async () => {
    // brief não seta waba_id em lugar nenhum e o cache do teste anterior já guardou wabaId vazio;
    // sem isso o guard de wabaId do handler sempre retorna 400
    await settingsDb(env.DB).set('whatsapp_waba_id', 'db-waba')
    await templatesDb(env.DB).replaceFromMeta([
      { name: 'template_removido_na_meta', language: 'pt_BR', category: 'MARKETING', status: 'APPROVED', components: [] },
    ])
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
    expect(items.map((i) => i.name)).not.toContain('template_removido_na_meta')
  })
  it('falha fechada quando componentes persistidos estão corrompidos', async () => {
    const name = `corrompido_${crypto.randomUUID()}`
    await env.DB.prepare(
      `INSERT INTO templates (name, language, category, status, components)
       VALUES (?1, 'pt_BR', 'MARKETING', 'APPROVED', '{json-invalido')`
    ).bind(name).run()
    const template = await templatesDb(env.DB).get(name, 'pt_BR')
    expect(template?.components).toBeNull()
    expect(templateRequiresParameters(template?.components)).toBe(true)

    const res = await SELF.fetch('https://x.com/api/templates', { headers: AUTH })
    const body = await res.json() as { items: { name: string; requiresParameters: boolean; simpleSendSupported: boolean }[] }
    expect(body.items.find((item) => item.name === name)?.requiresParameters).toBe(true)
    expect(body.items.find((item) => item.name === name)?.simpleSendSupported).toBe(false)
  })
  it('expõe capacidade de envio por contrato, sem confundir categoria com suporte', async () => {
    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10)
    const simpleName = `simple_contract_${suffix}`
    const advancedName = `video_contract_${suffix}`
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO templates (name, language, category, status, components)
         VALUES (?1, 'pt_BR', 'MARKETING', 'APPROVED', ?2)`,
      ).bind(simpleName, JSON.stringify([{ type: 'BODY', text: 'Mensagem simples' }])),
      env.DB.prepare(
        `INSERT INTO templates (name, language, category, status, components)
         VALUES (?1, 'pt_BR', 'MARKETING', 'APPROVED', ?2)`,
      ).bind(advancedName, JSON.stringify([
        { type: 'HEADER', format: 'VIDEO', example: { header_handle: ['meta-video'] } },
        { type: 'BODY', text: 'Mensagem com vídeo' },
      ])),
    ])
    const response = await SELF.fetch('https://x.com/api/templates', { headers: AUTH })
    const body = await response.json() as { items: Array<{
      name: string; simpleEditorSupported: boolean; simpleSendSupported: boolean
    }> }
    expect(body.items.find((item) => item.name === simpleName)).toMatchObject({
      simpleEditorSupported: true, simpleSendSupported: true,
    })
    expect(body.items.find((item) => item.name === advancedName)).toMatchObject({
      simpleEditorSupported: true, simpleSendSupported: false,
    })
  })
  it('preserva variantes com o mesmo nome e idiomas diferentes', async () => {
    const name = `multi_${crypto.randomUUID()}`
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO templates (name, language, meta_id, category, status, components)
         VALUES (?1, 'pt_BR', ?2, 'UTILITY', 'APPROVED', '[]')`
      ).bind(name, crypto.randomUUID()),
      env.DB.prepare(
        `INSERT INTO templates (name, language, meta_id, category, status, components)
         VALUES (?1, 'en_US', ?2, 'MARKETING', 'APPROVED', '[]')`
      ).bind(name, crypto.randomUUID()),
    ])
    const variants = await templatesDb(env.DB).listByName(name)
    expect(variants.map((variant) => variant.language)).toEqual(['en_US', 'pt_BR'])
    expect((await templatesDb(env.DB).get(name, 'pt_BR'))?.category).toBe('UTILITY')
    expect((await templatesDb(env.DB).get(name, 'en_US'))?.category).toBe('MARKETING')
  })
})

describe('rascunhos de template', () => {
  it('cria, edita, lista e exclui rascunho', async () => {
    const name = `lembrete_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
    const input = { name, language: 'pt_BR', category: 'UTILITY', components: [{ type: 'BODY', text: 'Olá {{1}}' }] }
    const createdResponse = await SELF.fetch('https://x.com/api/templates/drafts', { method: 'POST', headers: AUTH, body: JSON.stringify(input) })
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json() as { id: string }
    const updated = await SELF.fetch(`https://x.com/api/templates/drafts/${created.id}`, { method: 'PATCH', headers: AUTH, body: JSON.stringify({ ...input, components: [{ type: 'BODY', text: 'Olá {{1}}, tudo bem?' }] }) })
    expect(updated.status).toBe(200)
    const list = await SELF.fetch('https://x.com/api/templates', { headers: AUTH })
    expect((await list.json() as { items: Array<{ name: string; source: string }> }).items).toEqual(expect.arrayContaining([expect.objectContaining({ name, source: 'draft' })]))
    expect((await SELF.fetch(`https://x.com/api/templates/drafts/${created.id}`, { method: 'DELETE', headers: AUTH })).status).toBe(200)
  })

  it('bloqueia no envio um rascunho que viola as regras de variáveis da Meta', async () => {
    const name = `invalido_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
    const input = {
      name,
      language: 'pt_BR',
      category: 'UTILITY',
      components: [{ type: 'BODY', text: '{{1}} oi?' }],
    }
    const createdResponse = await SELF.fetch('https://x.com/api/templates/drafts', {
      method: 'POST', headers: AUTH, body: JSON.stringify(input),
    })
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json() as { id: string }

    const submit = await SELF.fetch(`https://x.com/api/templates/drafts/${created.id}/submit`, {
      method: 'POST', headers: AUTH,
    })
    expect(submit.status).toBe(400)
    expect(await submit.json()).toMatchObject({
      error: 'template fora das regras da Meta',
      issues: expect.arrayContaining([expect.objectContaining({ code: 'variable_at_edge' })]),
    })
  })

  it('clona template sincronizado como rascunho editável', async () => {
    const name = `origem_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
    await env.DB.prepare("INSERT INTO templates (name,language,category,status,components) VALUES (?1,'pt_BR','MARKETING','APPROVED',?2)").bind(name, JSON.stringify([{ type: 'BODY', text: 'Promoção' }])).run()
    const response = await SELF.fetch(`https://x.com/api/templates/${name}/clone`, { method: 'POST', headers: AUTH })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ name: `${name}_copia`, status: 'DRAFT' })
  })

  it('resolve colisões com templates Meta e rascunhos ao clonar', async () => {
    const name = `origem_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
    const components = [{ type: 'BODY', text: 'Lembrete {{1}}' }]
    await env.DB.batch([
      env.DB.prepare("INSERT INTO templates (name,language,category,status,components) VALUES (?1,'pt_BR','UTILITY','APPROVED',?2)")
        .bind(name, JSON.stringify(components)),
      env.DB.prepare("INSERT INTO templates (name,language,category,status,components) VALUES (?1,'pt_BR','UTILITY','APPROVED',?2)")
        .bind(`${name}_copia`, JSON.stringify(components)),
    ])
    await templateDraftsDb(env.DB).create({
      name: `${name}_copia_2`, language: 'pt_BR', category: 'UTILITY', components,
    })
    const response = await SELF.fetch(`https://x.com/api/templates/${name}/clone`, {
      method: 'POST', headers: AUTH,
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      name: `${name}_copia_3`, language: 'pt_BR', category: 'UTILITY', components,
    })
  })

  it.each(['MARKETING', 'UTILITY'] as const)(
    'publica a matriz simples completa na categoria %s',
    async (category) => {
      const name = `autoqa_${category.toLowerCase()}_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`
      const components = [
        {
          type: 'BODY',
          text: 'Olá {{1}}, seu pedido está pronto.',
          example: { body_text: [['Cliente']] },
        },
        { type: 'FOOTER', text: 'Equipe SmartZap' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'Confirmar' },
            { type: 'QUICK_REPLY', text: 'Cancelar' },
            { type: 'URL', text: 'Acompanhar', url: 'https://example.com/pedido' },
            {
              type: 'URL', text: 'Abrir pedido',
              url: 'https://example.com/pedido/{{1}}', example: ['pedido-123'],
            },
            { type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+5521982219966' },
          ],
        },
      ]
      const createdResponse = await SELF.fetch('https://x.com/api/templates/drafts', {
        method: 'POST', headers: AUTH,
        body: JSON.stringify({ name, language: 'pt_BR', category, components }),
      })
      expect(createdResponse.status).toBe(201)
      const created = await createdResponse.json() as { id: string }
      await settingsDb(env.DB).set('whatsapp_waba_id', 'db-waba')
      const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toEqual({
          name, language: 'pt_BR', category, components,
        })
        return new Response(JSON.stringify({ id: `meta-${category}`, status: 'PENDING', category }), { status: 200 })
      })
      vi.stubGlobal('fetch', fetchMock)

      const submit = await SELF.fetch(`https://x.com/api/templates/drafts/${created.id}/submit`, {
        method: 'POST', headers: AUTH,
      })
      expect(submit.status).toBe(200)
      expect(await submit.json()).toMatchObject({ ok: true, result: { status: 'PENDING', category } })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(await templateDraftsDb(env.DB).get(created.id)).toBeNull()
      expect(await templatesDb(env.DB).get(name, 'pt_BR')).toMatchObject({
        name,
        language: 'pt_BR',
        meta_id: `meta-${category}`,
        category,
        status: 'PENDING',
        components,
      })
    },
  )

  it('recusa criar, publicar ou clonar Autenticação pelo editor simples', async () => {
    const name = `auth_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
    const input = {
      name,
      language: 'pt_BR',
      category: 'AUTHENTICATION',
      components: [{ type: 'BODY', add_security_recommendation: true }],
    }
    const create = await SELF.fetch('https://x.com/api/templates/drafts', {
      method: 'POST', headers: AUTH, body: JSON.stringify(input),
    })
    expect(create.status).toBe(409)
    expect(await create.json()).toMatchObject({ code: 'AUTHENTICATION_TEMPLATE_UNSUPPORTED' })

    const legacy = await templateDraftsDb(env.DB).create(input)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const submit = await SELF.fetch(`https://x.com/api/templates/drafts/${legacy!.id}/submit`, {
      method: 'POST', headers: AUTH,
    })
    expect(submit.status).toBe(409)
    expect(await submit.json()).toMatchObject({ code: 'AUTHENTICATION_TEMPLATE_UNSUPPORTED' })
    expect(fetchMock).not.toHaveBeenCalled()

    await env.DB.prepare(
      `INSERT INTO templates (name,language,category,status,components)
       VALUES (?1,'pt_BR','AUTHENTICATION','APPROVED',?2)`,
    ).bind(name, JSON.stringify(input.components)).run()
    const clone = await SELF.fetch(`https://x.com/api/templates/${name}/clone`, {
      method: 'POST', headers: AUTH,
    })
    expect(clone.status).toBe(409)
    expect(await clone.json()).toMatchObject({ code: 'AUTHENTICATION_TEMPLATE_UNSUPPORTED' })
    await templateDraftsDb(env.DB).delete(legacy!.id)
  })
})

describe('settings API', () => {
  it('sincroniza templates automaticamente ao salvar Phone ID e WABA', async () => {
    await templatesDb(env.DB).replaceFromMeta([
      { name: 'template_antigo_config', language: 'pt_BR', category: 'UTILITY', status: 'APPROVED', components: [] },
    ])
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      if (String(url).includes('message_templates')) {
        return new Response(JSON.stringify({ data: [
          { name: 'template_apos_config', language: 'pt_BR', category: 'MARKETING', status: 'APPROVED', components: [] },
        ] }), { status: 200 })
      }
      throw new Error(`fetch inesperado: ${url}`)
    }))
    const response = await SELF.fetch('https://x.com/api/settings', {
      method: 'PUT', headers: AUTH,
      body: JSON.stringify({ whatsapp_phone_id: '11111', whatsapp_waba_id: '22222' }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      templateSync: { status: 'synced', synced: 1 },
    })
    const names = (await templatesDb(env.DB).list()).map((item) => item.name)
    expect(names).toContain('template_apos_config')
    expect(names).not.toContain('template_antigo_config')
  })

  it('preserva a cópia local se a sincronização automática falhar', async () => {
    await templatesDb(env.DB).replaceFromMeta([
      { name: 'template_preservado', language: 'pt_BR', category: 'UTILITY', status: 'APPROVED', components: [] },
    ])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: {
      code: 190, message: 'Token inválido',
    } }), { status: 401 })) )
    const response = await SELF.fetch('https://x.com/api/settings', {
      method: 'PUT', headers: AUTH,
      body: JSON.stringify({ whatsapp_phone_id: '11111', whatsapp_waba_id: '22222' }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      templateSync: { status: 'failed', detail: expect.stringContaining('Token inválido') },
    })
    expect((await templatesDb(env.DB).list()).map((item) => item.name)).toContain('template_preservado')
  })

  it('PUT valida throttle_mps, rejeita token no D1 e GET não vaza segredo', async () => {
    const bad = await SELF.fetch('https://x.com/api/settings', {
      method: 'PUT', headers: AUTH, body: JSON.stringify({ throttle_mps: 'abc' }),
    })
    expect(bad.status).toBe(400)
    const tokenInDb = await SELF.fetch('https://x.com/api/settings', {
      method: 'PUT', headers: AUTH,
      body: JSON.stringify({ whatsapp_token: 'tok-secreto' }),
    })
    expect(tokenInDb.status).toBe(400)
    const ok = await SELF.fetch('https://x.com/api/settings', {
      method: 'PUT', headers: AUTH, body: JSON.stringify({ throttle_mps: '40' }),
    })
    expect(ok.status).toBe(200)
    const res = await SELF.fetch('https://x.com/api/settings', { headers: AUTH })
    const raw = await res.text()
    expect(raw).not.toContain('tok-secreto') // nem valor nem prefixo
    const body = JSON.parse(raw) as { whatsapp_token: { configured: boolean }; throttle_mps: string | null }
    expect(body.whatsapp_token).toEqual({ configured: true })
    expect(body.throttle_mps).toBe('40')
  })
  it('health não inventa conexão e reporta os pré-requisitos', async () => {
    await settingsDb(env.DB).set('whatsapp_phone_id', '11111')
    await settingsDb(env.DB).set('whatsapp_waba_id', '22222')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: {
      code: 190, message: 'Invalid OAuth access token',
      error_data: { details: 'Token expired' }, fbtrace_id: 'TRACE_HEALTH',
    } }), { status: 401 })))
    const res = await SELF.fetch('https://x.com/api/settings/health', { headers: AUTH })
    expect(res.status).toBe(200)
    const body = await res.json() as {
      databaseOk: boolean; webhookConfigured: boolean; webhookSecretsConfigured: boolean
      turnstileConfigured: boolean; turnstileEnabled: boolean
      metaConfigured: boolean; metaLive: boolean; readyForPilot: boolean
      meta: { code: number; fbtraceId: string }
      knowledge: { total: number; ready: number; indexing: number; failed: number; searchConfigured: boolean }
      agents: { total: number; active: number; globalEnabled: boolean }
    }
    expect(body.databaseOk).toBe(true)
    expect(body.webhookSecretsConfigured).toBe(true)
    expect(body.webhookConfigured).toBe(false)
    expect(body.turnstileEnabled).toBe(false)
    expect(body.turnstileConfigured).toBe(true)
    expect(body.metaConfigured).toBe(true)
    expect(body.metaLive).toBe(false)
    expect(body.readyForPilot).toBe(false)
    expect(body.meta).toMatchObject({ code: 190, fbtraceId: 'TRACE_HEALTH' })
    expect(body.knowledge).toEqual({ total: 0, ready: 0, indexing: 0, failed: 0, searchConfigured: false })
    expect(body.agents).toEqual(expect.objectContaining({ total: 1, active: 1, globalEnabled: true }))
  })
})

describe('elegibilidade de template estático', () => {
  it('aceita body estático e header de texto sem variáveis', () => {
    expect(templateRequiresParameters([
      { type: 'HEADER', format: 'TEXT', text: 'Aviso' },
      { type: 'BODY', text: 'Olha isso' },
    ])).toBe(false)
  })

  it.each(['VIDEO', 'DOCUMENT', 'IMAGE', 'GIF', 'LOCATION'])(
    'bloqueia header %s mesmo sem placeholder', (format) => {
      expect(templateRequiresParameters([{ type: 'HEADER', format }])).toBe(true)
    },
  )

  it('bloqueia placeholder e botões que precisam de payload dinâmico', () => {
    expect(templateRequiresParameters([{ type: 'BODY', text: 'Olá {{1}}' }])).toBe(true)
    expect(templateRequiresParameters([
      { type: 'BUTTONS', buttons: [{ type: 'COPY_CODE', text: 'Copiar' }] },
    ])).toBe(true)
  })
})
