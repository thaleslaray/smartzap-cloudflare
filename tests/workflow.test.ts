import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadSendConfig, nextBatchPlan, sendCampaignBatch } from '../src/workflows/CampaignSendWorkflow'
import { campaignsDb } from '../src/db/campaigns'
import { campaignContactsDb } from '../src/db/campaign-contacts'
import { contactsDb } from '../src/db/contacts'
import type { Credentials } from '../src/whatsapp/credentials'

const creds: Credentials = { token: 't', phoneId: '111', wabaId: 'w' }
// Telefones únicos por execução — os arquivos de teste compartilham o mesmo D1.
// Gerador robusto (contador + Date.now + random): evita a colisão intra-arquivo
// do gerador original ('+...' + Date.now() + 1 dígito aleatório), já root-causada
// e corrigida em tests/campaigns.test.ts.
let phoneSeq = 0
const uniquePhone = () =>
  '+5511' + Date.now().toString().slice(-7) +
  Math.floor(Math.random() * 100).toString().padStart(2, '0') +
  String(phoneSeq++).padStart(2, '0')

afterEach(() => vi.unstubAllGlobals())

async function seedCampaign(phones: string[]) {
  const cdb = campaignsDb(env.DB)
  const ccdb = campaignContactsDb(env.DB)
  const campaign = await cdb.create({ name: 'WF', template_name: 'promo_wf' })
  const rows: { contactId: string; phone: string; status: 'pending' }[] = []
  for (const phone of phones) {
    const contact = await contactsDb(env.DB).create({ phone, status: 'opt_in' })
    rows.push({ contactId: contact.id, phone, status: 'pending' })
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
    const campaign = await seedCampaign([uniquePhone()])
    vi.stubGlobal('fetch', vi.fn(async () => metaError(131042)))
    await expect(sendCampaignBatch(env, campaign.id, creds, 80)).rejects.toThrow(/131042/)
    expect((await campaignsDb(env.DB).get(campaign.id))!.status).toBe('failed')
  })

  it('campanha cancelada não chama a Meta e encerra com true', async () => {
    const campaign = await seedCampaign([uniquePhone()])
    await campaignsDb(env.DB).setStatus(campaign.id, 'cancelled')
    const spy = vi.fn(async () => metaOk('wamid.x'))
    vi.stubGlobal('fetch', spy)
    expect(await sendCampaignBatch(env, campaign.id, creds, 80)).toBe(true)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('loadSendConfig', () => {
  it('campanha cancelada durante o agendamento → null', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Agendada', template_name: 'promo_wf' })
    await cdb.setStatus(campaign.id, 'cancelled')
    expect(await loadSendConfig(env, campaign.id)).toBeNull()
  })
})

describe('nextBatchPlan', () => {
  it('130 pendentes em batches de 50 = 3 batches', () => {
    expect(nextBatchPlan({ pending: 130 }, 50)).toBe(3)
  })
})
