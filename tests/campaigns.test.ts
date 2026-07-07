import { SELF, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { contactsDb } from '../src/db/contacts'
import { campaignsDb } from '../src/db/campaigns'
import { resolveAudience } from '../src/domain/audience'
import { cancelCampaign, pauseCampaign, resumeCampaign } from '../src/api/campaigns'

const AUTH = { 'x-api-key': 'dev-api-key', 'content-type': 'application/json' }
// Telefones únicos por execução — os arquivos de teste compartilham o mesmo D1.
// O contador garante unicidade INTRA-arquivo: o gerador original ('+...' + Date.now()
// + 1 dígito aleatório) fazia as 3 chamadas síncronas caírem no mesmo ms e diferirem
// só pelo dígito 0-9 → ~28% de chance de colisão entre phoneOk/phoneSuppressed/phoneOptOut,
// e a colisão com phoneOptOut marcava phoneOk como opt_out (flakiness ~15% na suíte).
// Date.now + random dão diversidade ENTRE arquivos.
let phoneSeq = 0
const uniquePhone = () =>
  '+5511' + Date.now().toString().slice(-7) +
  Math.floor(Math.random() * 100).toString().padStart(2, '0') +
  String(phoneSeq++).padStart(2, '0')

const phoneOk = uniquePhone()
const phoneSuppressed = uniquePhone()
const phoneOptOut = uniquePhone()

beforeAll(async () => {
  const c = contactsDb(env.DB)
  await c.bulkInsert([{ phone: phoneOk }, { phone: phoneSuppressed }], 'opt_in')
  await c.bulkInsert([{ phone: phoneOptOut }], 'opt_in')
  await c.setStatus([(await c.getByPhone(phoneOptOut))!.id], 'opt_out')
  await env.DB.prepare('INSERT OR IGNORE INTO suppressions (phone, reason) VALUES (?1, ?2)')
    .bind(phoneSuppressed, 'reclamou').run()
  await env.DB.prepare(
    `INSERT OR IGNORE INTO templates (name, language, category, status, components)
     VALUES ('promo_teste', 'pt_BR', 'MARKETING', 'APPROVED', '[]')`).run()
})

describe('resolveAudience', () => {
  it('só opt_in e fora de supressão', async () => {
    const { eligible, skipped } = await resolveAudience(env.DB, {})
    const phones = eligible.map((e) => e.phone)
    expect(phones).toContain(phoneOk)
    expect(phones).not.toContain(phoneSuppressed) // suprimido
    expect(phones).not.toContain(phoneOptOut) // opt-out
    expect(skipped).toBeGreaterThanOrEqual(1)
  })
})

describe('campaigns API', () => {
  it('cria, estima custo e despacha', async () => {
    const create = await SELF.fetch('https://x.com/api/campaigns', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ name: 'Julho', template_name: 'promo_teste' }),
    })
    expect(create.status).toBe(201)
    const { id } = (await create.json()) as { id: string }

    const est = await SELF.fetch(`https://x.com/api/campaigns/${id}/estimate`, {
      method: 'POST', headers: AUTH, body: JSON.stringify({}),
    })
    const estimate = (await est.json()) as { recipients: number; unit: number; total: number }
    expect(estimate.unit).toBe(0.3217) // MARKETING
    expect(estimate.recipients).toBeGreaterThanOrEqual(1)

    const dispatch = await SELF.fetch(`https://x.com/api/campaigns/${id}/dispatch`, {
      method: 'POST', headers: AUTH, body: JSON.stringify({}),
    })
    expect(dispatch.status).toBe(202)
    const detail = await SELF.fetch(`https://x.com/api/campaigns/${id}`, { headers: AUTH })
    const camp = (await detail.json()) as { status: string; total: number }
    expect(['sending', 'scheduled']).toContain(camp.status)
    expect(camp.total).toBeGreaterThanOrEqual(1)
  })
  it('dispatch de template não aprovado → 400', async () => {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO templates (name, language, category, status, components)
       VALUES ('pendente', 'pt_BR', 'MARKETING', 'PENDING', '[]')`).run()
    const create = await SELF.fetch('https://x.com/api/campaigns', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ name: 'X', template_name: 'pendente' }),
    })
    const { id } = (await create.json()) as { id: string }
    const dispatch = await SELF.fetch(`https://x.com/api/campaigns/${id}/dispatch`, {
      method: 'POST', headers: AUTH, body: JSON.stringify({}),
    })
    expect(dispatch.status).toBe(400)
  })
})

describe('pause/resume/cancel (contrato com o binding de Workflows)', () => {
  it('persiste o status e chama o método certo no workflow', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Controle', template_name: 'promo_teste' })
    await cdb.setWorkflowId(campaign.id, 'wf-1')
    // Fake do binding: só a interface mínima que as funções de controle exigem
    const instance = {
      pause: vi.fn(async () => {}), resume: vi.fn(async () => {}), terminate: vi.fn(async () => {}),
    }
    const wf = { get: async (_id: string) => instance }

    await pauseCampaign(env.DB, wf, campaign.id)
    expect(instance.pause).toHaveBeenCalledOnce()
    expect((await cdb.get(campaign.id))!.status).toBe('paused')

    await resumeCampaign(env.DB, wf, campaign.id)
    expect(instance.resume).toHaveBeenCalledOnce()
    expect((await cdb.get(campaign.id))!.status).toBe('sending')

    await cancelCampaign(env.DB, wf, campaign.id)
    expect(instance.terminate).toHaveBeenCalledOnce()
    expect((await cdb.get(campaign.id))!.status).toBe('cancelled')
  })
  it('pause sem workflow ativo → 409', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Sem WF', template_name: 'promo_teste' })
    const wf = { get: async (_id: string) => { throw new Error('não deveria chamar') } }
    const r = await pauseCampaign(env.DB, wf, campaign.id)
    expect(r).toEqual({ ok: false, status: 409, error: 'campanha sem workflow ativo' })
  })
})
