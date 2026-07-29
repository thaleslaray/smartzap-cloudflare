import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  finalizeWorkflowFailure, loadSendConfig, nextBatchPlan, sendCampaignBatch,
} from '../src/workflows/CampaignSendWorkflow'
import { campaignsDb } from '../src/db/campaigns'
import { campaignContactsDb } from '../src/db/campaign-contacts'
import { contactsDb } from '../src/db/contacts'
import type { Credentials } from '../src/whatsapp/credentials'
import { finishPilotAttempt, reservePilotAttempt } from '../src/domain/pilot'

const creds: Credentials = {
  token: 't', phoneId: '111', wabaId: 'w', appId: '123456789', graphVersion: 'v25.0',
  appSecret: 'secret',
  callbackUrl: 'https://worker.example/webhook',
}
// Telefones únicos por execução — os arquivos de teste compartilham o mesmo D1.
// Gerador robusto (contador + Date.now + random): evita a colisão intra-arquivo
// do gerador original ('+...' + Date.now() + 1 dígito aleatório), já root-causada
// e corrigida em tests/campaigns.test.ts.
let phoneSeq = 0
const uniquePhone = () =>
  '+5511' + Date.now().toString().slice(-7) +
  Math.floor(Math.random() * 100).toString().padStart(2, '0') +
  String(phoneSeq++).padStart(2, '0')
const uniquePilotPhone = () =>
  `+55119${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`

afterEach(() => vi.unstubAllGlobals())

async function seedCampaign(phones: string[]) {
  const cdb = campaignsDb(env.DB)
  const ccdb = campaignContactsDb(env.DB)
  await env.DB.prepare(
    `INSERT INTO templates (name, language, category, status, components)
     VALUES ('promo_wf', 'pt_BR', 'MARKETING', 'APPROVED', '[]')
     ON CONFLICT(name, language) DO UPDATE SET status = 'APPROVED'`
  ).run()
  const campaign = await cdb.create({ name: 'WF', template_name: 'promo_wf' })
  const rows: { contactId: string; phone: string; status: 'pending' }[] = []
  for (const phone of phones) {
    const contact = await contactsDb(env.DB).createOptInWithConsent(
      { phone }, 'consentimento de teste')
    rows.push({ contactId: contact!.id, phone, status: 'pending' })
  }
  await ccdb.bulkInsert(campaign.id, rows)
  await cdb.setTotal(campaign.id, rows.length)
  return campaign
}

const metaOk = (id: string) =>
  new Response(JSON.stringify({ messages: [{ id }] }), { status: 200 })
const metaError = (code: number) =>
  new Response(JSON.stringify({ error: { code, message: `erro ${code}` } }), { status: 400 })

describe('sendCampaignBatch', () => {
  it('payload renderizado inválido falha antes de consumir tentativa do piloto', async () => {
    const allowed = uniquePilotPhone()
    await env.DB.prepare('DELETE FROM pilot_send_ledger').run()
    await env.DB.prepare('DELETE FROM pilot_runs').run()
    await env.DB.prepare(
      "INSERT INTO pilot_runs (id,label,status,max_attempts) VALUES (?1,'Payload inválido','active',3)",
    ).bind(crypto.randomUUID()).run()
    const campaign = await seedCampaign([allowed])
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE campaigns SET name='[PILOT REAL] payload inválido' WHERE id=?1",
      ).bind(campaign.id),
      env.DB.prepare(
        "UPDATE campaign_contacts SET rendered_payload_json='{}' WHERE campaign_id=?1",
      ).bind(campaign.id),
    ])
    const fetchMock = vi.fn(async () => metaOk('wamid.nao-deve-enviar'))
    vi.stubGlobal('fetch', fetchMock)
    const productionEnv = {
      PILOT_GUARDS_ENABLED: 'true',
      ...env,
      ENVIRONMENT: 'production',
      PILOT_SEND_ENABLED: 'true',
      PILOT_RECIPIENT_E164: allowed,
      PILOT_RECIPIENT_ALLOWLIST: allowed,
      PILOT_MAX_REAL_SENDS: '3',
      PILOT_TEMPLATE_ALLOWLIST: 'promo_wf',
    } as Env
    expect(await sendCampaignBatch(productionEnv, campaign.id, creds, 80)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(
      await env.DB.prepare(
        'SELECT COUNT(*) n FROM pilot_send_ledger WHERE campaign_id=?1',
      ).bind(campaign.id).first<{ n: number }>(),
    ).toEqual({ n: 0 })
    expect(
      await env.DB.prepare(
        'SELECT status,error_code FROM campaign_contacts WHERE campaign_id=?1',
      ).bind(campaign.id).first(),
    ).toEqual({ status: 'failed', error_code: 'RENDERED_PAYLOAD_INVALID' })
  })

  it('marca sent/failed por contato e 131050 vira opt_out do contato', async () => {
    const pOk = uniquePhone(); const pOut = uniquePhone()
    const campaign = await seedCampaign([pOk, pOut])
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { to: string }
      return body.to === pOut ? metaError(131050) : metaOk('wamid.' + crypto.randomUUID())
    }))
    const done = await sendCampaignBatch(env, campaign.id, creds, 80)
    expect(done).toBe(true) // batch menor que BATCH_SIZE encerra
    const counts = await campaignContactsDb(env.DB).countByStatus(campaign.id)
    expect(counts.sent).toBe(1)
    expect(counts.failed).toBe(1)
    expect((await contactsDb(env.DB).getByPhone(pOut))!.status).toBe('opt_out')
    const after = (await campaignsDb(env.DB).get(campaign.id))!
    expect(after.sent).toBe(1)
    expect(after.failed).toBe(1)
  })

  it('erro crítico 131042 marca a campanha como failed e lança NonRetryableError', async () => {
    const campaign = await seedCampaign([uniquePhone(), uniquePhone()])
    vi.stubGlobal('fetch', vi.fn(async () => metaError(131042)))
    await expect(sendCampaignBatch(env, campaign.id, creds, 80)).rejects.toThrow(/131042/)
    expect((await campaignsDb(env.DB).get(campaign.id))!.status).toBe('failed')
    const counts = await campaignContactsDb(env.DB).countByStatus(campaign.id)
    expect(counts.sending ?? 0).toBe(0)
    expect(counts.failed).toBe(2)
    expect((await campaignsDb(env.DB).get(campaign.id))!.failed).toBe(2)
  })

  it('erro transitório 131056 é repetido e não vira falha definitiva', async () => {
    const campaign = await seedCampaign([uniquePhone()])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(metaError(131056))
      .mockResolvedValueOnce(metaOk('wamid.retry-ok'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(sendCampaignBatch(env, campaign.id, creds, 80)).rejects.toThrow(/transitório/)
    expect((await campaignContactsDb(env.DB).countByStatus(campaign.id)).failed ?? 0).toBe(0)
    expect(await sendCampaignBatch(env, campaign.id, creds, 80)).toBe(true)
    expect((await campaignContactsDb(env.DB).countByStatus(campaign.id)).sent).toBe(1)
  })

  it('piloto não contorna o ledger repetindo automaticamente erro transitório', async () => {
    const allowed = uniquePilotPhone()
    await env.DB.prepare('DELETE FROM pilot_send_ledger').run()
    await env.DB.prepare('DELETE FROM pilot_runs').run()
    await env.DB.prepare(
      "INSERT INTO pilot_runs (id, label, status, max_attempts) VALUES (?1, 'Workflow retry', 'active', 3)"
    ).bind(crypto.randomUUID()).run()
    const campaign = await seedCampaign([allowed])
    await env.DB.prepare("UPDATE campaigns SET name = '[PILOT REAL] retry' WHERE id = ?1")
      .bind(campaign.id).run()
    const fetchMock = vi.fn(async () => metaError(131056))
    vi.stubGlobal('fetch', fetchMock)
    const productionEnv = {
      PILOT_GUARDS_ENABLED: 'true',
      ...env,
      ENVIRONMENT: 'production',
      PILOT_SEND_ENABLED: 'true',
      PILOT_RECIPIENT_E164: allowed,
      PILOT_RECIPIENT_ALLOWLIST: allowed,
      PILOT_MAX_REAL_SENDS: '3',
      PILOT_TEMPLATE_ALLOWLIST: 'promo_wf',
    } as Env

    await expect(sendCampaignBatch(productionEnv, campaign.id, creds, 80))
      .rejects.toThrow(/retry automático bloqueado/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await campaignsDb(env.DB).get(campaign.id))?.status).toBe('failed')
    expect((await campaignContactsDb(env.DB).countByStatus(campaign.id)).failed).toBe(1)
    expect(await env.DB.prepare(
      "SELECT status FROM pilot_send_ledger WHERE campaign_id = ?1"
    ).bind(campaign.id).first()).toEqual({ status: 'rejected' })
  })

  it('timeout ambíguo bloqueia a campanha sem reenviar', async () => {
    const campaign = await seedCampaign([uniquePhone(), uniquePhone()])
    const fetchMock = vi.fn(async () => { throw new DOMException('aborted', 'AbortError') })
    vi.stubGlobal('fetch', fetchMock)
    await expect(sendCampaignBatch(env, campaign.id, creds, 80)).rejects.toThrow(/ambíguo/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await campaignsDb(env.DB).get(campaign.id))?.status).toBe('failed')
    const counts = await campaignContactsDb(env.DB).countByStatus(campaign.id)
    expect(counts.failed).toBe(2)
    expect(counts.pending ?? 0).toBe(0)
    expect(counts.sending ?? 0).toBe(0)
  })

  it('recuperação de crash não recoloca envio desconhecido em pending', async () => {
    const campaign = await seedCampaign([uniquePhone(), uniquePhone()])
    await campaignContactsDb(env.DB).claimPending(campaign.id, 1)
    const fetchMock = vi.fn(async () => metaOk('wamid.nao-deve-enviar'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(sendCampaignBatch(env, campaign.id, creds, 80)).rejects.toThrow(/bloqueada contra duplicação/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await campaignContactsDb(env.DB).countByStatus(campaign.id)).failed).toBe(2)
  })

  it('recupera aceite confirmado no ledger sem repetir o POST', async () => {
    const allowed = uniquePilotPhone()
    await env.DB.prepare('DELETE FROM pilot_send_ledger').run()
    await env.DB.prepare('DELETE FROM pilot_runs').run()
    await env.DB.prepare(
      "INSERT INTO pilot_runs (id, label, status, max_attempts) VALUES (?1, 'Recuperação', 'active', 3)"
    ).bind(crypto.randomUUID()).run()
    const campaign = await seedCampaign([allowed])
    await env.DB.prepare("UPDATE campaigns SET name = '[PILOT REAL] recovery' WHERE id = ?1")
      .bind(campaign.id).run()
    const claimed = await campaignContactsDb(env.DB).claimPending(campaign.id, 1)
    const productionEnv = {
      PILOT_GUARDS_ENABLED: 'true',
      ...env,
      ENVIRONMENT: 'production',
      PILOT_SEND_ENABLED: 'true',
      PILOT_RECIPIENT_E164: allowed,
      PILOT_RECIPIENT_ALLOWLIST: allowed,
      PILOT_MAX_REAL_SENDS: '3',
      PILOT_TEMPLATE_ALLOWLIST: 'promo_wf',
    } as Env
    const reservation = await reservePilotAttempt(productionEnv, {
      campaignId: campaign.id, contactId: claimed[0].contact_id, phone: allowed,
    })
    await finishPilotAttempt(productionEnv, reservation, {
      status: 'accepted', messageId: 'wamid.ledger-recovery',
    })
    const fetchMock = vi.fn(async () => metaOk('wamid.nao-deve-repetir'))
    vi.stubGlobal('fetch', fetchMock)

    expect(await sendCampaignBatch(productionEnv, campaign.id, creds, 80)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await campaignContactsDb(env.DB).countByStatus(campaign.id)).sent).toBe(1)
    expect((await campaignsDb(env.DB).get(campaign.id))?.sent).toBe(1)
    expect(await env.DB.prepare(
      'SELECT message_id FROM campaign_contacts WHERE campaign_id = ?1'
    ).bind(campaign.id).first()).toEqual({ message_id: 'wamid.ledger-recovery' })
  })

  it('campanha cancelada não chama a Meta e encerra com true', async () => {
    const campaign = await seedCampaign([uniquePhone()])
    await campaignsDb(env.DB).setStatus(campaign.id, 'cancelled')
    const spy = vi.fn(async () => metaOk('wamid.x'))
    vi.stubGlobal('fetch', spy)
    expect(await sendCampaignBatch(env, campaign.id, creds, 80)).toBe(true)
    expect(spy).not.toHaveBeenCalled()
  })

  it('produção bloqueia destinatário fora da allowlist antes de chamar a Meta', async () => {
    await env.DB.prepare('DELETE FROM pilot_send_ledger').run()
    const outside = uniquePhone()
    const campaign = await seedCampaign([outside])
    await env.DB.prepare("UPDATE campaigns SET name = '[PILOT REAL] outside' WHERE id = ?1")
      .bind(campaign.id).run()
    const fetchMock = vi.fn(async () => metaOk('wamid.nao-deve-enviar'))
    vi.stubGlobal('fetch', fetchMock)
    const productionEnv = {
      PILOT_GUARDS_ENABLED: 'true',
      ...env,
      ENVIRONMENT: 'production',
      PILOT_SEND_ENABLED: 'true',
      PILOT_RECIPIENT_E164: '+5511999999999',
      PILOT_RECIPIENT_ALLOWLIST: '+5511999999999',
      PILOT_MAX_REAL_SENDS: '3',
      PILOT_TEMPLATE_ALLOWLIST: 'promo_wf',
    } as Env
    await expect(sendCampaignBatch(productionEnv, campaign.id, creds, 80))
      .rejects.toThrow(/allowlist/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await campaignContactsDb(env.DB).countByStatus(campaign.id)).failed).toBe(1)
  })
})

describe('loadSendConfig', () => {
  it('campanha cancelada durante o agendamento → null', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Agendada', template_name: 'promo_wf' })
    await cdb.setStatus(campaign.id, 'cancelled')
    expect(await loadSendConfig(env, campaign.id)).toBeNull()
  })

  it('não inclui credenciais no resultado persistido pelo Workflow', async () => {
    const campaign = await campaignsDb(env.DB).create({ name: 'Sem secrets', template_name: 'promo_wf' })
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('whatsapp_phone_id', '11111')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run()
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('whatsapp_waba_id', '22222')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/debug_token')) return new Response(JSON.stringify({ data: {
        app_id: '123456789', is_valid: true,
        scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
      } }))
      if (url.includes('/123456789/subscriptions')) return new Response(JSON.stringify({ data: [{
        object: 'whatsapp_business_account', active: true, fields: [{ name: 'messages' }],
      }] }))
      if (url.includes('/subscribed_apps')) return new Response(JSON.stringify({ data: [{
        whatsapp_business_api_data: { id: '123456789' },
        override_callback_uri: 'https://worker.example/webhook',
      }] }))
      if (url.includes('/22222/phone_numbers'))
        return new Response(JSON.stringify({ data: [{ id: '11111' }] }))
      if (url.includes('/11111?')) return new Response(JSON.stringify({
        id: '11111', status: 'CONNECTED', platform_type: 'CLOUD_API', account_mode: 'LIVE',
        quality_rating: 'GREEN', code_verification_status: 'VERIFIED',
        webhook_configuration: { application: 'https://worker.example/webhook' },
      }))
      return new Response(JSON.stringify({ id: '22222' }))
    }))
    try {
      const result = await loadSendConfig(env, campaign.id)
      expect(result).toMatchObject({ total: 0 })
      expect(result).not.toHaveProperty('creds')
      expect(JSON.stringify(result)).not.toContain('test-whatsapp-token')
      expect(JSON.stringify(result)).not.toContain('dev-meta-secret')
    } finally {
      await env.DB.prepare(
        "DELETE FROM settings WHERE key IN ('whatsapp_phone_id', 'whatsapp_waba_id')"
      ).run()
    }
  })
})

describe('finalização de erro do Workflow', () => {
  it('não deixa contatos pending/sending nem campanha presa em sending', async () => {
    const campaign = await seedCampaign([uniquePhone(), uniquePhone(), uniquePhone()])
    await campaignsDb(env.DB).setStatus(campaign.id, 'sending')
    await campaignContactsDb(env.DB).claimPending(campaign.id, 1)

    expect(await finalizeWorkflowFailure(env, campaign.id, 'retries esgotados')).toBe(3)
    const after = (await campaignsDb(env.DB).get(campaign.id))!
    expect(after.status).toBe('failed')
    expect(after.failed).toBe(3)
    const counts = await campaignContactsDb(env.DB).countByStatus(campaign.id)
    expect(counts.pending ?? 0).toBe(0)
    expect(counts.sending ?? 0).toBe(0)
    expect(counts.failed).toBe(3)
  })
})

describe('nextBatchPlan', () => {
  it('130 pendentes em batches de 50 = 3 batches', () => {
    expect(nextBatchPlan({ pending: 130 }, 50)).toBe(3)
  })
})
