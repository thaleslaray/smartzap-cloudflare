import { SELF, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { contactsDb } from '../src/db/contacts'
import { campaignsDb } from '../src/db/campaigns'
import { campaignContactsDb } from '../src/db/campaign-contacts'
import { resolveAudience } from '../src/domain/audience'
import { segmentsDb } from '../src/db/segments'
import { pricingDb } from '../src/db/pricing'
import { cancelCampaign, pauseCampaign, resendSkippedContacts, resumeCampaign, startCampaignDispatch } from '../src/api/campaigns'
import { COUNTRY_DDI_OPTIONS, UF_PREFIXES } from '../app/lib/audience-geography'

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
  await c.bulkInsertOptInWithConsent([
    { phone: phoneOk }, { phone: phoneSuppressed }, { phone: phoneOptOut },
  ], 'consentimento de teste')
  await c.setStatus([(await c.getByPhone(phoneOptOut))!.id], 'opt_out')
  await env.DB.prepare('INSERT OR IGNORE INTO suppressions (phone, reason) VALUES (?1, ?2)')
    .bind(phoneSuppressed, 'reclamou').run()
  await env.DB.prepare(
    `INSERT OR IGNORE INTO templates (name, language, category, status, components)
     VALUES ('promo_teste', 'pt_BR', 'MARKETING', 'APPROVED', '[]')`).run()
  await env.DB.prepare(
    "DELETE FROM settings WHERE key IN ('whatsapp_token', 'whatsapp_phone_id')"
  ).run()
  await pricingDb(env.DB).importRateCards({
    source: 'https://developers.facebook.com/pricing',
    checksum: 'campaign-tests-brl-2026-07',
    effectiveFrom: '2026-07-01',
    currency: 'BRL',
    rows: [{
      source: 'https://developers.facebook.com/pricing', checksum: 'campaign-tests-brl-2026-07',
      effectiveFrom: '2026-07-01', currency: 'BRL', market: 'Brazil', countryIso: 'BR',
      category: 'MARKETING', tierFrom: 0, tierTo: null, unitPrice: 0.3217,
    }],
  })
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
  it('exclui opt_in legado sem evidência individual vinculada', async () => {
    const legacy = await contactsDb(env.DB).create({ phone: uniquePhone(), status: 'opt_in' })
    const { eligible } = await resolveAudience(env.DB, {})
    expect(eligible.map((item) => item.id)).not.toContain(legacy.id)
  })
  it('reproduz a audiência de um segmento salvo sem incluir contatos fora da regra', async () => {
    const matchingPhone = uniquePhone()
    const otherPhone = uniquePhone()
    await contactsDb(env.DB).bulkInsertOptInWithConsent([
      { phone: matchingPhone, name: 'Segmento Aurora' }, { phone: otherPhone, name: 'Segmento Boreal' },
    ], 'consentimento de segmento')
    const segment = await segmentsDb(env.DB).create({
      name: `Somente Aurora ${crypto.randomUUID()}`,
      rules: { combinator: 'and', conditions: [{ field: 'name', operator: 'contains', value: 'Aurora' }] },
    })
    const { eligible } = await resolveAudience(env.DB, { segmentId: segment!.id })
    expect(eligible.map((item) => item.phone)).toContain(matchingPhone)
    expect(eligible.map((item) => item.phone)).not.toContain(otherPhone)
  })
  it('combina segmento salvo por campo personalizado com filtros rápidos da campanha', async () => {
    const cdb = contactsDb(env.DB)
    const field = await cdb.createCustomField({
      key: `plano_${crypto.randomUUID().slice(0, 8)}`,
      label: 'Plano da campanha', type: 'text',
    })
    const matching = await cdb.createOptInWithConsent({ phone: uniquePhone(), name: 'Cliente VIP' }, 'teste')
    const outsideTag = await cdb.createOptInWithConsent({ phone: uniquePhone(), name: 'Cliente comum' }, 'teste')
    const tag = await cdb.createTag(`Vip campanha ${crypto.randomUUID()}`)
    await cdb.setCustomValue(matching!.id, field.id, 'pro')
    await cdb.setContactTags(matching!.id, [tag.id])
    await cdb.setContactTags(outsideTag!.id, [tag.id])
    const segment = await segmentsDb(env.DB).create({
      name: `Plano pro ${crypto.randomUUID()}`,
      rules: { combinator: 'and', conditions: [{ field: 'custom', customFieldId: field.id, operator: 'eq', value: 'pro' }] },
    })
    const { eligible } = await resolveAudience(env.DB, { segmentId: segment!.id, tags: [tag.name], combinator: 'and' })
    expect(eligible.map((item) => item.id)).toContain(matching!.id)
    expect(eligible.map((item) => item.id)).not.toContain(outsideTag!.id)
  })
  it('restringe envio de teste aos IDs explicitamente selecionados', async () => {
    const first = await contactsDb(env.DB).createOptInWithConsent({ phone: uniquePhone(), name: 'Teste Um' }, 'teste')
    const second = await contactsDb(env.DB).createOptInWithConsent({ phone: uniquePhone(), name: 'Teste Dois' }, 'teste')
    const { eligible } = await resolveAudience(env.DB, { contactIds: [first!.id] })
    expect(eligible.map((item) => item.id)).toContain(first!.id)
    expect(eligible.map((item) => item.id)).not.toContain(second!.id)
  })
  it('combina tags e prefixos telefônicos em alcance ou precisão', async () => {
    const cdb = contactsDb(env.DB)
    const tagged = await cdb.createOptInWithConsent({ phone: '+5521' + Date.now().toString().slice(-8), name: 'Tag fora SP' }, 'teste')
    const sp = await cdb.createOptInWithConsent({ phone: '+5511' + Date.now().toString().slice(-8), name: 'SP sem tag' }, 'teste')
    const tag = await cdb.createTag(`VIP-${crypto.randomUUID()}`)
    await cdb.setContactTags(tagged!.id, [tag.id])
    const broad = await resolveAudience(env.DB, { tags: [tag.name], phonePrefixes: ['+5511'], combinator: 'or' })
    expect(broad.eligible.map((item) => item.id)).toEqual(expect.arrayContaining([tagged!.id, sp!.id]))
    const precise = await resolveAudience(env.DB, { tags: [tag.name], phonePrefixes: ['+5511'], combinator: 'and' })
    expect(precise.eligible.map((item) => item.id)).not.toContain(tagged!.id)
    expect(precise.eligible.map((item) => item.id)).not.toContain(sp!.id)
  })
  it('resolve todos os DDIs e DDDs disponíveis com contatos sintéticos opt-in', async () => {
    const uniqueDdis = [...new Set(COUNTRY_DDI_OPTIONS.map((country) => country.prefix))]
    const uniqueDdds = [...new Set(Object.values(UF_PREFIXES).flat())]
    const marker = `${Date.now()}${Math.floor(Math.random() * 10_000)}`
    const fixtures = [
      ...uniqueDdis.map((prefix, index) => ({
        key: `ddi:${prefix}`,
        prefix,
        phone: `${prefix}${marker}${String(index).padStart(3, '0')}`,
      })),
      ...uniqueDdds.map((prefix, index) => ({
        key: `ddd:${prefix}`,
        prefix,
        phone: `${prefix}${marker}${String(index + uniqueDdis.length).padStart(3, '0')}`,
      })),
    ]
    const inserted = await contactsDb(env.DB).bulkInsertOptInWithConsent(
      fixtures.map((fixture) => ({ phone: fixture.phone, name: `Matriz geográfica ${fixture.key}` })),
      'contatos sintéticos para matriz geográfica',
    )
    expect(inserted.inserted).toBe(fixtures.length)

    // Uma consulta OR cobre o catálogo inteiro sem transformar esta matriz em
    // centenas de scans D1 sequenciais. A verificação por telefone continua
    // garantindo que cada DDI/DDD fixture foi encontrado pelo filtro.
    const eligiblePhones = new Set<string>()
    for (let index = 0; index < fixtures.length; index += 32) {
      const prefixChunk = fixtures.slice(index, index + 32).map((fixture) => fixture.prefix)
      const audience = await resolveAudience(env.DB, { phonePrefixes: prefixChunk, combinator: 'or' })
      for (const contact of audience.eligible) eligiblePhones.add(contact.phone)
    }
    for (const fixture of fixtures) {
      expect(eligiblePhones).toContain(fixture.phone)
    }

    for (const [state, prefixes] of Object.entries(UF_PREFIXES)) {
      const audience = await resolveAudience(env.DB, { phonePrefixes: prefixes, combinator: 'and' })
      const expected = fixtures
        .filter((fixture) => fixture.key.startsWith('ddd:') && prefixes.includes(fixture.prefix))
        .map((fixture) => fixture.phone)
      expect(audience.eligible.map((contact) => contact.phone)).toEqual(expect.arrayContaining(expected))
      expect(expected.length).toBeGreaterThan(0)
      expect(state).toMatch(/^[A-Z]{2}$/)
    }
  })
})

describe('campaigns API', () => {
  it('exige idioma quando existem variantes e persiste a escolha exata', async () => {
    const templateName = `multi_campaign_${crypto.randomUUID()}`
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO templates (name, language, category, status, components)
         VALUES (?1, 'pt_BR', 'UTILITY', 'APPROVED', '[]')`
      ).bind(templateName),
      env.DB.prepare(
        `INSERT INTO templates (name, language, category, status, components)
         VALUES (?1, 'en_US', 'MARKETING', 'APPROVED', '[]')`
      ).bind(templateName),
    ])
    const ambiguous = await SELF.fetch('https://x.com/api/campaigns', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ name: 'Sem idioma', template_name: templateName }),
    })
    expect(ambiguous.status).toBe(400)
    expect((await ambiguous.json() as { error: string }).error).toContain('mais de um idioma')

    const exact = await SELF.fetch('https://x.com/api/campaigns', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({
        name: 'Com idioma', template_name: templateName, template_language: 'en_US',
      }),
    })
    expect(exact.status).toBe(201)
    expect((await exact.json() as { template_language: string }).template_language).toBe('en_US')
  })
  it('pagina e filtra a listagem no servidor sem consulta ilimitada', async () => {
    const marker = `page-${crypto.randomUUID()}`
    const cdb = campaignsDb(env.DB)
    for (let i = 0; i < 51; i++)
      await cdb.create({ name: `${marker}-${String(i).padStart(2, '0')}`, template_name: 'promo_teste' })

    const first = await SELF.fetch(`https://x.com/api/campaigns?q=${encodeURIComponent(marker)}&page=1`, { headers: AUTH })
    const firstBody = await first.json() as { items: unknown[]; total: number }
    expect(first.status).toBe(200)
    expect(firstBody.total).toBe(51)
    expect(firstBody.items).toHaveLength(50)

    const second = await SELF.fetch(`https://x.com/api/campaigns?q=${encodeURIComponent(marker)}&page=2`, { headers: AUTH })
    const secondBody = await second.json() as { items: unknown[]; total: number }
    expect(secondBody.total).toBe(51)
    expect(secondBody.items).toHaveLength(1)
    expect((await SELF.fetch('https://x.com/api/campaigns?status=arbitrary', { headers: AUTH })).status).toBe(400)
    expect((await SELF.fetch('https://x.com/api/campaigns?page=1000001', { headers: AUTH })).status).toBe(400)
  })
  it('inclui campanhas concluídas com falhas no filtro operacional Falhou', async () => {
    const cdb = campaignsDb(env.DB)
    const withFailure = await cdb.create({
      name: `concluida-com-falha-${crypto.randomUUID()}`,
      template_name: 'promo_teste',
    })
    const clean = await cdb.create({
      name: `concluida-sem-falha-${crypto.randomUUID()}`,
      template_name: 'promo_teste',
    })
    await cdb.setStatus(withFailure.id, 'completed')
    await cdb.updateCounters(withFailure.id, { failed: 1 })
    await cdb.setStatus(clean.id, 'completed')

    const response = await SELF.fetch('https://x.com/api/campaigns?status=failed', { headers: AUTH })
    const body = await response.json() as { items: Array<{ id: string }> }

    expect(response.status).toBe(200)
    expect(body.items.map((campaign) => campaign.id)).toContain(withFailure.id)
    expect(body.items.map((campaign) => campaign.id)).not.toContain(clean.id)
  })
  it('exclui campanhas selecionadas em lote e bloqueia o lote com campanha ativa', async () => {
    const cdb = campaignsDb(env.DB)
    const removable = await cdb.create({ name: `lote-removivel-${crypto.randomUUID()}`, template_name: 'promo_teste' })
    const active = await cdb.create({ name: `lote-ativa-${crypto.randomUUID()}`, template_name: 'promo_teste' })
    await cdb.setStatus(active.id, 'sending')

    const blocked = await SELF.fetch('https://x.com/api/campaigns/bulk', {
      method: 'DELETE', headers: AUTH, body: JSON.stringify({ ids: [removable.id, active.id] }),
    })
    expect(blocked.status).toBe(409)
    expect(await cdb.get(removable.id)).not.toBeNull()

    const deleted = await SELF.fetch('https://x.com/api/campaigns/bulk', {
      method: 'DELETE', headers: AUTH, body: JSON.stringify({ ids: [removable.id] }),
    })
    expect(deleted.status).toBe(200)
    expect((await deleted.json() as { removed: number }).removed).toBe(1)
    expect(await cdb.get(removable.id)).toBeNull()
    expect(await cdb.get(active.id)).not.toBeNull()
  })
  it('retorna todos os IDs da seleção em massa respeitando os filtros', async () => {
    const cdb = campaignsDb(env.DB)
    const folder = await cdb.createFolder(`selecionar-todas-${crypto.randomUUID()}`, '#8B5CF6')
    const first = await cdb.create({ name: `selecionar-a-${crypto.randomUUID()}`, template_name: 'promo_teste' })
    const second = await cdb.create({ name: `selecionar-b-${crypto.randomUUID()}`, template_name: 'promo_teste' })
    await cdb.setFolder(first.id, folder.id)
    await cdb.setFolder(second.id, folder.id)

    const response = await SELF.fetch(`https://x.com/api/campaigns/ids?folderId=${folder.id}`, { headers: AUTH })
    const body = await response.json() as { ids: string[]; total: number }

    expect(response.status).toBe(200)
    expect(body.total).toBe(2)
    expect(body.ids).toEqual(expect.arrayContaining([first.id, second.id]))
  })
  it('filtra por múltiplas tags com interseção e mantém CRUD de organização', async () => {
    const suffix = crypto.randomUUID()
    const folderCreate = await SELF.fetch('https://x.com/api/campaigns/folders', {
      method: 'POST', headers: AUTH, body: JSON.stringify({ name: `Pasta ${suffix}`, color: '#8B5CF6' }),
    })
    expect(folderCreate.status).toBe(201)
    const folder = await folderCreate.json() as { id: string; color: string }
    expect(folder.color).toBe('#8B5CF6')
    expect((await SELF.fetch(`https://x.com/api/campaigns/folders/${folder.id}`, {
      method: 'PATCH', headers: AUTH, body: JSON.stringify({ name: `Pasta editada ${suffix}`, color: '#10B981' }),
    })).status).toBe(200)

    const tagA = await campaignsDb(env.DB).createTag(`Tag A ${suffix}`, '#10B981')
    const tagB = await campaignsDb(env.DB).createTag(`Tag B ${suffix}`, '#3B82F6')
    const both = await campaignsDb(env.DB).create({ name: `Ambas ${suffix}`, template_name: 'promo_teste' })
    const onlyA = await campaignsDb(env.DB).create({ name: `Somente A ${suffix}`, template_name: 'promo_teste' })
    await campaignsDb(env.DB).setTags(both.id, [tagA.id, tagB.id])
    await campaignsDb(env.DB).setTags(onlyA.id, [tagA.id])
    const filtered = await SELF.fetch(`https://x.com/api/campaigns?tagIds=${tagA.id},${tagB.id}`, { headers: AUTH })
    const body = await filtered.json() as { items: Array<{ id: string }> }
    expect(body.items.map((item) => item.id)).toContain(both.id)
    expect(body.items.map((item) => item.id)).not.toContain(onlyA.id)

    expect((await SELF.fetch(`https://x.com/api/campaigns/tags/${tagB.id}`, { method: 'DELETE', headers: AUTH })).status).toBe(200)
    expect((await SELF.fetch(`https://x.com/api/campaigns/folders/${folder.id}`, { method: 'DELETE', headers: AUTH })).status).toBe(200)
  })
  it('revalida ignorados e inicia um novo workflow sem duplicar destinatários', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Reenvio de ignorado', template_name: 'promo_teste' })
    const contact = (await contactsDb(env.DB).getByPhone(phoneOk))!
    await campaignContactsDb(env.DB).bulkInsert(campaign.id, [{ contactId: contact.id, phone: contact.phone, status: 'skipped' }])
    await cdb.setStatus(campaign.id, 'completed')
    const create = vi.fn(async ({ id }: { id: string }) => ({ id }))
    const result = await resendSkippedContacts({ ...env, CAMPAIGN_WF: { create } } as unknown as Env, campaign.id)
    expect(result).toMatchObject({ status: 'queued', resent: 1, stillSkipped: 0 })
    expect(create).toHaveBeenCalledOnce()
    expect((await cdb.get(campaign.id))?.status).toBe('sending')
    expect((await campaignContactsDb(env.DB).countByStatus(campaign.id)).pending).toBe(1)
  })
  it('mantém ignorado quando opt-out continua inválido e não cria workflow', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Ignorado ainda inválido', template_name: 'promo_teste' })
    const contact = (await contactsDb(env.DB).getByPhone(phoneOptOut))!
    await campaignContactsDb(env.DB).bulkInsert(campaign.id, [{ contactId: contact.id, phone: contact.phone, status: 'skipped' }])
    const create = vi.fn()
    const result = await resendSkippedContacts({ ...env, CAMPAIGN_WF: { create } } as unknown as Env, campaign.id)
    expect(result).toMatchObject({ status: 'skipped', resent: 0, stillSkipped: 1 })
    expect(create).not.toHaveBeenCalled()
    expect((await campaignContactsDb(env.DB).countByStatus(campaign.id)).skipped).toBe(1)
  })
  it('rejeita paginação inválida nos contatos da campanha', async () => {
    const res = await SELF.fetch('https://x.com/api/campaigns/qualquer/contacts?page=abc', { headers: AUTH })
    expect(res.status).toBe(400)
  })
  it('rejeita audiência malformada em estimate e dispatch', async () => {
    const create = await SELF.fetch('https://x.com/api/campaigns', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ name: 'Payload inválido', template_name: 'promo_teste' }),
    })
    const { id } = (await create.json()) as { id: string }
    for (const action of ['estimate', 'dispatch']) {
      const res = await SELF.fetch(`https://x.com/api/campaigns/${id}/${action}`, {
        method: 'POST', headers: AUTH, body: JSON.stringify({ tags: 'todas' }),
      })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toContain('audiência')
    }
  })

  it('duplo dispatch concorrente cria somente um workflow', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Dispatch único', template_name: 'promo_teste' })
    const contact = (await contactsDb(env.DB).getByPhone(phoneOk))!
    const create = vi.fn(async ({ id }: { id: string }) => {
      expect((await cdb.get(campaign.id))?.workflow_id).toBe(campaign.id)
      return { id }
    })
    const get = vi.fn(async () => ({ status: async () => ({ status: 'unknown' }) }))
    const run = () => startCampaignDispatch(env.DB, { create, get }, campaign.id, [contact], false)
    const results = await Promise.all([run(), run()])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok)).toHaveLength(1)
    expect(create).toHaveBeenCalledOnce()
    const row = await env.DB.prepare(
      'SELECT workflow_id, COUNT(*) OVER () AS n FROM campaigns WHERE id = ?1'
    ).bind(campaign.id).first<{ workflow_id: string | null; n: number }>()
    expect(row?.workflow_id).toBe(campaign.id)
  })

  it('reconcilia create ambíguo sem abandonar Workflow que já está rodando', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Create ambíguo', template_name: 'promo_teste' })
    const contact = (await contactsDb(env.DB).getByPhone(phoneOk))!
    const wf = {
      create: vi.fn(async () => { throw new Error('resposta perdida') }),
      get: vi.fn(async () => ({ status: async () => ({ status: 'running' }) })),
    }
    const result = await startCampaignDispatch(env.DB, wf, campaign.id, [contact], false)
    expect(result).toEqual({ ok: true, workflowId: campaign.id })
    expect((await cdb.get(campaign.id))?.workflow_id).toBe(campaign.id)
  })

  it('faz rollback quando create falha e a instância não existe', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Create ausente', template_name: 'promo_teste' })
    const contact = (await contactsDb(env.DB).getByPhone(phoneOk))!
    const wf = {
      create: vi.fn(async () => { throw new Error('create rejeitado') }),
      get: vi.fn(async () => ({ status: async () => ({ status: 'unknown' }) })),
    }
    await expect(startCampaignDispatch(env.DB, wf, campaign.id, [contact], false))
      .rejects.toThrow('create rejeitado')
    const after = (await cdb.get(campaign.id))!
    expect(after.status).toBe('draft')
    expect(after.workflow_id).toBeNull()
    expect(after.total).toBe(0)
  })

  it('bloqueia template aprovado que exige parâmetros', async () => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO templates (name, language, category, status, components)
       VALUES ('com_variavel', 'pt_BR', 'MARKETING', 'APPROVED', ?1)`
    ).bind(JSON.stringify([{ type: 'BODY', text: 'Olá {{1}}' }])).run()
    const res = await SELF.fetch('https://x.com/api/campaigns', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ name: 'Não suportada', template_name: 'com_variavel' }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('variáveis')
  })
  it('usa o mesmo mapeamento para criar preview de template com variável', async () => {
    const name = `variavel_${crypto.randomUUID()}`
    await env.DB.prepare(
      `INSERT INTO templates (name, language, category, status, components)
       VALUES (?1, 'pt_BR', 'MARKETING', 'APPROVED', ?2)`
    ).bind(name, JSON.stringify([{ type: 'BODY', text: 'Olá {{1}}' }])).run()
    const contact = await contactsDb(env.DB).create({ phone: uniquePhone(), name: 'Renata' })
    const created = await SELF.fetch('https://x.com/api/campaigns', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({
        name: 'Com variável', template_name: name, template_language: 'pt_BR',
        variable_mapping: { 'body.1': { source: 'contact_name' } },
      }),
    })
    expect(created.status).toBe(201)
    const campaign = await created.json() as { id: string }
    const preview = await SELF.fetch(`https://x.com/api/campaigns/${campaign.id}/preview`, {
      method: 'POST', headers: AUTH, body: JSON.stringify({ contactId: contact.id }),
    })
    expect(preview.status).toBe(200)
    expect(await preview.json()).toMatchObject({
      resolved: { 'body.1': 'Renata' },
      template: { components: [{ type: 'BODY', text: 'Olá Renata' }] },
    })
  })

  it('cria e estima custo, mas não despacha sem credenciais Meta', async () => {
    const validPhone = `+55219${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`
    await contactsDb(env.DB).bulkInsertOptInWithConsent(
      [{ phone: validPhone }],
      'consentimento pricing',
    )
    const pricingContact = await contactsDb(env.DB).getByPhone(validPhone)
    const create = await SELF.fetch('https://x.com/api/campaigns', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ name: 'Julho', template_name: 'promo_teste' }),
    })
    expect(create.status).toBe(201)
    const { id } = (await create.json()) as { id: string }

    const est = await SELF.fetch(`https://x.com/api/campaigns/${id}/estimate`, {
      method: 'POST', headers: AUTH, body: JSON.stringify({ contactIds: [pricingContact!.id] }),
    })
    const estimate = (await est.json()) as { recipients: number; state: string; amount: number; breakdown: Array<{ unitPrice: number }> }
    expect(estimate.state).toBe('estimated')
    expect(estimate.breakdown[0].unitPrice).toBe(0.3217)
    expect(estimate.amount).toBeGreaterThan(0)
    expect(estimate.recipients).toBeGreaterThanOrEqual(1)

    const dispatch = await SELF.fetch(`https://x.com/api/campaigns/${id}/dispatch`, {
      method: 'POST', headers: AUTH, body: JSON.stringify({}),
    })
    expect(dispatch.status).toBe(503)
    const detail = await SELF.fetch(`https://x.com/api/campaigns/${id}`, { headers: AUTH })
    const camp = (await detail.json()) as { status: string; total: number }
    expect(camp.status).toBe('draft')
    expect(camp.total).toBe(0)
  })
  it('não inventa custo quando a campanha ainda não tem destinatários materializados', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Custo entregue', template_name: 'promo_teste' })
    await env.DB.prepare(
      'UPDATE campaigns SET total = 10, sent = 8, delivered = 3 WHERE id = ?1'
    ).bind(campaign.id).run()
    const res = await SELF.fetch(`https://x.com/api/campaigns/${campaign.id}`, { headers: AUTH })
    expect(res.status).toBe(200)
    const body = await res.json() as {
      template: { name: string; language: string; components: unknown[] } | null
      cost: { state: string; amount: number | null; unavailableReasons: string[]; confirmed: unknown }
    }
    expect(body.template).toEqual(expect.objectContaining({
      name: 'promo_teste',
      language: 'pt_BR',
      components: expect.any(Array),
    }))
    expect(body.cost.state).toBe('unavailable')
    expect(body.cost.amount).toBeNull()
    expect(body.cost.unavailableReasons).toContain('Nenhum destinatário elegível')
    expect(body.cost.confirmed).toBeNull()
  })
  it('mantém o público visível ao salvar um rascunho após o precheck', async () => {
    const contact = await contactsDb(env.DB).createOptInWithConsent(
      { phone: uniquePhone(), name: 'Rascunho com público' },
      'auditoria rascunho',
    )
    const campaign = await campaignsDb(env.DB).create({
      name: 'Rascunho persistente',
      template_name: 'promo_teste',
    })
    const precheck = await SELF.fetch(`https://x.com/api/campaigns/${campaign.id}/precheck`, {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ contactIds: [contact!.id] }),
    })
    expect(precheck.status).toBe(200)

    const detail = await SELF.fetch(`https://x.com/api/campaigns/${campaign.id}`, { headers: AUTH })
    expect(detail.status).toBe(200)
    const body = await detail.json() as {
      total: number
      cost: { state: string; amount: number | null; unavailableReasons: string[] }
    }
    expect(body.total).toBe(1)
    expect(body.cost.unavailableReasons).not.toContain('Nenhum destinatário elegível')
  })
  it('aceita três contatos explícitos no precheck do canário', async () => {
    const contacts = await Promise.all(
      ['Canário Um', 'Canário Dois', 'Canário Três'].map((name) =>
        contactsDb(env.DB).createOptInWithConsent(
          { phone: uniquePhone(), name },
          'auditoria do canário',
        ),
      ),
    )
    const campaign = await campaignsDb(env.DB).create({
      name: 'Canário com três contatos',
      template_name: 'promo_teste',
    })
    const precheck = await SELF.fetch(`https://x.com/api/campaigns/${campaign.id}/precheck`, {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ contactIds: contacts.map((contact) => contact!.id) }),
    })
    expect(precheck.status).toBe(200)
    const body = await precheck.json() as {
      totals: { valid: number; skipped: number; candidates: number }
    }
    expect(body.totals).toEqual({ valid: 3, skipped: 0, candidates: 3 })
  })
  it('dispatch revalida e bloqueia template não aprovado na Meta', async () => {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO templates (name, language, category, status, components)
       VALUES ('pendente', 'pt_BR', 'MARKETING', 'PENDING', '[]')`).run()
    const create = await SELF.fetch('https://x.com/api/campaigns', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ name: 'X', template_name: 'pendente' }),
    })
    const { id } = (await create.json()) as { id: string }
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('whatsapp_phone_id', '11111')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run()
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('whatsapp_waba_id', '22222')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/debug_token')) return new Response(JSON.stringify({ data: {
        app_id: '123456789', type: 'SYSTEM_USER', is_valid: true,
        scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
      } }), { status: 200 })
      if (url.includes('/123456789/subscriptions')) return new Response(JSON.stringify({ data: [{
        object: 'whatsapp_business_account', active: true, fields: [{ name: 'messages' }],
      }] }), { status: 200 })
      if (url.includes('message_templates')) return new Response(JSON.stringify({ data: [{
        name: 'pendente', language: 'pt_BR', category: 'MARKETING', status: 'PENDING', components: [],
      }] }), { status: 200 })
      if (url.includes('subscribed_apps')) return new Response(JSON.stringify({
        data: [{
          whatsapp_business_api_data: { id: '123456789', name: 'SmartZap Test' },
          override_callback_uri: 'https://worker.example/webhook',
        }],
      }), { status: 200 })
      if (url.includes('/22222/phone_numbers'))
        return new Response(JSON.stringify({ data: [{ id: '11111' }] }), { status: 200 })
      if (url.includes('/11111?')) return new Response(JSON.stringify({
        id: '11111', status: 'CONNECTED', platform_type: 'CLOUD_API', account_mode: 'LIVE',
        quality_rating: 'GREEN', code_verification_status: 'VERIFIED',
        webhook_configuration: { whatsapp_business_account: 'https://worker.example/webhook' },
      }), { status: 200 })
      return new Response(JSON.stringify({ id: '22222' }), { status: 200 })
    }))
    try {
      const dispatch = await SELF.fetch(`https://x.com/api/campaigns/${id}/dispatch`, {
        method: 'POST', headers: AUTH, body: JSON.stringify({}),
      })
      expect(dispatch.status).toBe(409)
    } finally {
      vi.unstubAllGlobals()
      await env.DB.prepare(
        "DELETE FROM settings WHERE key IN ('whatsapp_phone_id', 'whatsapp_waba_id')"
      ).run()
    }
  })
  it('salva e remove o agendamento enquanto a campanha ainda é rascunho', async () => {
    const campaign = await campaignsDb(env.DB).create({ name: 'Agenda', template_name: 'promo_teste' })
    const scheduledAt = '2030-03-14T15:09:00.000Z'
    const scheduled = await SELF.fetch(`https://x.com/api/campaigns/${campaign.id}/schedule`, {
      method: 'PUT', headers: AUTH, body: JSON.stringify({ scheduledAt }),
    })
    expect(scheduled.status).toBe(200)
    expect((await campaignsDb(env.DB).get(campaign.id))?.scheduled_at).toBe(scheduledAt)

    const immediate = await SELF.fetch(`https://x.com/api/campaigns/${campaign.id}/schedule`, {
      method: 'PUT', headers: AUTH, body: JSON.stringify({ scheduledAt: null }),
    })
    expect(immediate.status).toBe(200)
    expect((await campaignsDb(env.DB).get(campaign.id))?.scheduled_at).toBeNull()
  })
  it('clona a configuração como rascunho e permite excluir campanhas inativas', async () => {
    const source = await campaignsDb(env.DB).create({
      name: 'Campanha original', template_name: 'promo_teste', template_language: 'pt_BR',
      variable_mapping_json: JSON.stringify({ 'body.1': { source: 'fixed', value: 'Olá' } }),
    })
    const sourceContact = await contactsDb(env.DB).getByPhone(phoneOk)
    await campaignsDb(env.DB).setAudienceDefinition(source.id, { contactIds: [sourceContact!.id] })
    const duplicate = await SELF.fetch(`https://x.com/api/campaigns/${source.id}/duplicate`, {
      method: 'POST', headers: AUTH,
    })
    expect(duplicate.status).toBe(201)
    const copy = await duplicate.json() as { id: string; name: string; status: string; scheduled_at: string | null; audience_definition_json: string; total: number }
    expect(copy).toMatchObject({ name: 'Cópia de Campanha original', status: 'draft', scheduled_at: null, total: 1 })
    expect(JSON.parse(copy.audience_definition_json)).toMatchObject({ contactIds: [sourceContact!.id] })

    const removed = await SELF.fetch(`https://x.com/api/campaigns/${copy.id}`, { method: 'DELETE', headers: AUTH })
    expect(removed.status).toBe(200)
    expect(await campaignsDb(env.DB).get(copy.id)).toBeNull()
  })
  it('não exclui uma campanha ativa', async () => {
    const campaign = await campaignsDb(env.DB).create({ name: 'Campanha ativa', template_name: 'promo_teste' })
    await campaignsDb(env.DB).setStatus(campaign.id, 'sending')
    const response = await SELF.fetch(`https://x.com/api/campaigns/${campaign.id}`, { method: 'DELETE', headers: AUTH })
    expect(response.status).toBe(409)
    expect(await campaignsDb(env.DB).get(campaign.id)).not.toBeNull()
  })
  it('precheck detalha contato ignorado por variável obrigatória ausente', async () => {
    const templateName = `precheck_${crypto.randomUUID()}`
    await env.DB.prepare(
      `INSERT INTO templates (name, language, category, status, components)
       VALUES (?1, 'pt_BR', 'UTILITY', 'APPROVED', ?2)`
    ).bind(templateName, JSON.stringify([{ type: 'BODY', text: 'Olá {{1}}' }])).run()
    const contact = await contactsDb(env.DB).createOptInWithConsent({ phone: uniquePhone(), name: 'Sem campo' }, 'teste')
    const fieldId = crypto.randomUUID()
    const campaign = await campaignsDb(env.DB).create({
      name: 'Precheck detalhado', template_name: templateName,
      variable_mapping_json: JSON.stringify({ 'body.1': { source: 'custom_field', fieldId } }),
    })
    const response = await SELF.fetch(`https://x.com/api/campaigns/${campaign.id}/precheck`, {
      method: 'POST', headers: AUTH, body: JSON.stringify({ contactIds: [contact!.id] }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { totals: { valid: number; skipped: number; candidates: number }; skippedItems: Array<{ id: string; reason: string }> }
    expect(body.totals).toEqual({ valid: 0, skipped: 1, candidates: 1 })
    expect(body.skippedItems).toContainEqual(expect.objectContaining({ id: contact!.id, reason: 'missing_template_data' }))
  })
})

describe('pause/resume/cancel (contrato com o binding de Workflows)', () => {
  it('persiste o status e chama o método certo no workflow', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Controle', template_name: 'promo_teste' })
    await cdb.setWorkflowId(campaign.id, 'wf-1')
    await cdb.setStatus(campaign.id, 'sending')
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
  it('cancelamento é idempotente quando a instância do Workflow já não existe', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Instância ausente', template_name: 'promo_teste' })
    await cdb.setWorkflowId(campaign.id, 'wf-missing')
    await cdb.setStatus(campaign.id, 'sending')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wf = { get: async () => { throw new Error('instance.not_found') } }
    try {
      await expect(cancelCampaign(env.DB, wf, campaign.id)).resolves.toEqual({ ok: true })
      expect(warn).not.toHaveBeenCalled()
      expect((await cdb.get(campaign.id))?.status).toBe('cancelled')
    } finally {
      warn.mockRestore()
    }
  })
  it('pause sem workflow ativo → 409', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Sem WF', template_name: 'promo_teste' })
    const wf = { get: async (_id: string) => { throw new Error('não deveria chamar') } }
    const r = await pauseCampaign(env.DB, wf, campaign.id)
    expect(r).toEqual({ ok: false, status: 409, error: 'campanha sem workflow ativo' })
  })
  it('não retoma campanha cancelada ou concluída', async () => {
    const cdb = campaignsDb(env.DB)
    const instance = {
      pause: vi.fn(async () => {}), resume: vi.fn(async () => {}), terminate: vi.fn(async () => {}),
    }
    const wf = { get: async (_id: string) => instance }
    for (const status of ['cancelled', 'completed'] as const) {
      const campaign = await cdb.create({ name: `Terminal ${status}`, template_name: 'promo_teste' })
      await cdb.setWorkflowId(campaign.id, crypto.randomUUID())
      await cdb.setStatus(campaign.id, status)
      const r = await resumeCampaign(env.DB, wf, campaign.id)
      expect(r.ok).toBe(false)
    }
    expect(instance.resume).not.toHaveBeenCalled()
  })

  it('retoma o Workflow se persistir o pause no D1 falhar', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Compensa pause', template_name: 'promo_teste' })
    await cdb.setWorkflowId(campaign.id, crypto.randomUUID())
    await cdb.setStatus(campaign.id, 'sending')
    const instance = {
      pause: vi.fn(async () => {}), resume: vi.fn(async () => {}), terminate: vi.fn(async () => {}),
    }
    await env.DB.prepare(`CREATE TRIGGER test_fail_pause_persistence
      BEFORE UPDATE OF status ON campaigns
      WHEN NEW.id = '${campaign.id}' AND NEW.status = 'paused'
      BEGIN SELECT RAISE(FAIL, 'falha pause D1'); END`).run()
    try {
      await expect(pauseCampaign(env.DB, { get: async () => instance }, campaign.id)).rejects.toThrow()
      expect(instance.pause).toHaveBeenCalledOnce()
      expect(instance.resume).toHaveBeenCalledOnce()
      expect((await cdb.get(campaign.id))?.status).toBe('sending')
    } finally {
      await env.DB.prepare('DROP TRIGGER test_fail_pause_persistence').run()
    }
  })

  it('pausa novamente o Workflow se persistir o resume no D1 falhar', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Compensa resume', template_name: 'promo_teste' })
    await cdb.setWorkflowId(campaign.id, crypto.randomUUID())
    await cdb.setStatus(campaign.id, 'paused')
    const instance = {
      pause: vi.fn(async () => {}), resume: vi.fn(async () => {}), terminate: vi.fn(async () => {}),
    }
    await env.DB.prepare(`CREATE TRIGGER test_fail_resume_persistence
      BEFORE UPDATE OF status ON campaigns
      WHEN NEW.id = '${campaign.id}' AND NEW.status = 'sending'
      BEGIN SELECT RAISE(FAIL, 'falha resume D1'); END`).run()
    try {
      await expect(resumeCampaign(env.DB, { get: async () => instance }, campaign.id)).rejects.toThrow()
      expect(instance.resume).toHaveBeenCalledOnce()
      expect(instance.pause).toHaveBeenCalledOnce()
      expect((await cdb.get(campaign.id))?.status).toBe('paused')
    } finally {
      await env.DB.prepare('DROP TRIGGER test_fail_resume_persistence').run()
    }
  })

  it('cancelamento concorrente não é sobrescrito por pause atrasado', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Cancel vence pause', template_name: 'promo_teste' })
    await cdb.setWorkflowId(campaign.id, crypto.randomUUID())
    await cdb.setStatus(campaign.id, 'sending')
    let releasePause!: () => void
    const pauseGate = new Promise<void>((resolve) => { releasePause = resolve })
    let pauseStarted!: () => void
    const pauseStartedGate = new Promise<void>((resolve) => { pauseStarted = resolve })
    const instance = {
      pause: vi.fn(async () => { pauseStarted(); await pauseGate }),
      resume: vi.fn(async () => {}),
      terminate: vi.fn(async () => {}),
    }
    const binding = { get: async () => instance }

    const pausing = pauseCampaign(env.DB, binding, campaign.id)
    await pauseStartedGate
    expect((await cancelCampaign(env.DB, binding, campaign.id)).ok).toBe(true)
    releasePause()
    const paused = await pausing

    expect(paused.ok).toBe(false)
    expect((await cdb.get(campaign.id))?.status).toBe('cancelled')
    expect(instance.terminate).toHaveBeenCalled()
  })

  it('cancelamento concorrente não é sobrescrito por resume atrasado', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Cancel vence resume', template_name: 'promo_teste' })
    await cdb.setWorkflowId(campaign.id, crypto.randomUUID())
    await cdb.setStatus(campaign.id, 'paused')
    let releaseResume!: () => void
    const resumeGate = new Promise<void>((resolve) => { releaseResume = resolve })
    let resumeStarted!: () => void
    const resumeStartedGate = new Promise<void>((resolve) => { resumeStarted = resolve })
    const instance = {
      pause: vi.fn(async () => {}),
      resume: vi.fn(async () => { resumeStarted(); await resumeGate }),
      terminate: vi.fn(async () => {}),
    }
    const binding = { get: async () => instance }

    const resuming = resumeCampaign(env.DB, binding, campaign.id)
    await resumeStartedGate
    expect((await cancelCampaign(env.DB, binding, campaign.id)).ok).toBe(true)
    releaseResume()
    const resumed = await resuming

    expect(resumed.ok).toBe(false)
    expect((await cdb.get(campaign.id))?.status).toBe('cancelled')
    expect(instance.terminate).toHaveBeenCalled()
  })
})

describe('campaignContactsDb concorrência', () => {
  it('retorna total junto com a página de destinatários', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Página destinatários', template_name: 'promo_teste' })
    const recipients = [
      { id: crypto.randomUUID(), phone: uniquePhone() },
      { id: crypto.randomUUID(), phone: uniquePhone() },
    ]
    await campaignContactsDb(env.DB).bulkInsert(campaign.id, recipients.map((recipient) => ({
      contactId: recipient.id, phone: recipient.phone, status: 'pending' as const,
    })))
    const result = await campaignContactsDb(env.DB).listByCampaign(campaign.id, 2, 1)
    expect(result.total).toBe(2)
    expect(result.items).toHaveLength(1)

    const response = await SELF.fetch(`https://x.com/api/campaigns/${campaign.id}/contacts?page=1`, { headers: AUTH })
    const body = await response.json() as { items: unknown[]; total: number }
    expect(response.status).toBe(200)
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.total).toBe(2)
  })
  it('claims simultâneas retornam lotes disjuntos', async () => {
    const cdb = campaignsDb(env.DB)
    const ccdb = campaignContactsDb(env.DB)
    const campaign = await cdb.create({ name: 'Claims', template_name: 'promo_teste' })
    const rows = []
    for (let i = 0; i < 4; i++) {
      const contact = await contactsDb(env.DB).create({ phone: uniquePhone(), status: 'opt_in' })
      rows.push({ contactId: contact.id, phone: contact.phone, status: 'pending' as const })
    }
    await ccdb.bulkInsert(campaign.id, rows)
    const [a, b] = await Promise.all([ccdb.claimPending(campaign.id, 2), ccdb.claimPending(campaign.id, 2)])
    expect(a).toHaveLength(2)
    expect(b).toHaveLength(2)
    expect(new Set([...a, ...b].map((r) => r.contact_id)).size).toBe(4)
  })
})
