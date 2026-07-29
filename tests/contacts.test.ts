import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { contactsDb } from '../src/db/contacts'

const AUTH = { 'x-api-key': 'dev-api-key', 'content-type': 'application/json' }

describe('contacts API', () => {
  it('corrige nome e telefone do contato e registra a alteração', async () => {
    const correctedPhone = `+5521${crypto.randomUUID().replace(/\D/g, '').padEnd(8, '7').slice(0, 8)}`
    const contact = await contactsDb(env.DB).create({
      phone: `+5521${String(Date.now()).slice(-8)}`,
      name: 'Nome antes da correção',
    })
    const res = await SELF.fetch(`https://x.com/api/contacts/${contact.id}`, {
      method: 'PATCH', headers: AUTH,
      body: JSON.stringify({ name: 'Nome corrigido', phone: correctedPhone }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: 'Nome corrigido', phone: correctedPhone })
    const history = await env.DB.prepare(
      "SELECT event_type FROM contact_history_events WHERE contact_id = ?1 ORDER BY created_at DESC LIMIT 1"
    ).bind(contact.id).first<{ event_type: string }>()
    expect(history?.event_type).toBe('contact_updated')
  })
  it('rejeita paginação inválida sem enviar NaN ao D1', async () => {
    for (const page of ['abc', '0', '-1', '1.5', '1000001']) {
      const res = await SELF.fetch(`https://x.com/api/contacts?page=${page}`, { headers: AUTH })
      expect(res.status).toBe(400)
    }
  })
  it('rejeita filtros inválidos e trata curingas da busca como texto literal', async () => {
    expect((await SELF.fetch('https://x.com/api/contacts?status=admin', { headers: AUTH })).status).toBe(400)
    expect((await SELF.fetch(`https://x.com/api/contacts?q=${'x'.repeat(201)}`, { headers: AUTH })).status).toBe(400)

    const marker = `Busca%Literal-${crypto.randomUUID()}`
    await contactsDb(env.DB).create({
      phone: `+5561${String(Date.now()).slice(-8)}`,
      name: marker,
    })
    const res = await SELF.fetch('https://x.com/api/contacts?q=%25', { headers: AUTH })
    const body = await res.json() as { items: { name: string | null; phone: string }[] }
    expect(body.items.some((item) => item.name === marker)).toBe(true)
    expect(body.items.every((item) => item.name?.includes('%') || item.phone.includes('%'))).toBe(true)
  })
  it('filtra contatos pela tag vinculada', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const contact = await contactsDb(env.DB).create({ phone: `+5571${String(Date.now()).slice(-8)}`, name: `Tag ${suffix}` })
    const tag = await contactsDb(env.DB).createTag(`Filtro ${suffix}`)
    await contactsDb(env.DB).setContactTags(contact.id, [tag.id])
    const res = await SELF.fetch(`https://x.com/api/contacts?tagId=${tag.id}`, { headers: AUTH })
    expect(res.status).toBe(200)
    const body = await res.json() as { items: Array<{ id: string }> }
    expect(body.items.map((item) => item.id)).toContain(contact.id)
  })
  it('import sem declaração preserva contatos como unknown', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts/import', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ csv: 'telefone,nome\n11999990005,Importado sem consentimento\n', mapping: { phone: 'telefone', name: 'nome' } }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ imported: 1, updated: 0, duplicates: 0, invalid: 0 })
    const list = await SELF.fetch('https://x.com/api/contacts?q=sem%20consentimento', { headers: AUTH })
    const { items } = (await list.json()) as { items: { status: string }[] }
    expect(items[0].status).toBe('unknown')
  })
  it('import válido insere com status opt_in, reporta números e grava consent event', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts/import', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({
        csv: 'telefone,nome\n11999990002,Bia\nabc,X\n11999990002,Bia2\n',
        mapping: { phone: 'telefone', name: 'nome' }, optInConfirmed: true,
      }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ imported: 1, updated: 0, duplicates: 1, invalid: 1 })
    const list = await SELF.fetch('https://x.com/api/contacts?q=Bia', { headers: AUTH })
    const { items } = (await list.json()) as { items: { phone: string; status: string }[] }
    expect(items[0].phone).toBe('+5511999990002')
    expect(items[0].status).toBe('opt_in')
    const ev = await env.DB.prepare(
      "SELECT * FROM consent_events WHERE source = 'import' ORDER BY created_at DESC"
    ).first<{
      declaration_text: string; contact_count: number; contact_id: string | null
      source_detail: string | null; purpose: string | null; declaration_version: string | null
    }>()
    expect(ev?.contact_count).toBe(1)
    expect(ev?.declaration_text).toBeTruthy()
    expect(ev?.contact_id).toBeTruthy()
    expect(ev?.source_detail).toBe('csv_import_dashboard')
    expect(ev?.purpose).toBe('marketing_messages')
    expect(ev?.declaration_version).toBe('smartzap-opt-in-v1')
  })
  it('reporta como duplicado o telefone que já existia antes da importação', async () => {
    const phone = `+5521${String(Date.now()).slice(-8)}`
    await contactsDb(env.DB).create({ phone, name: 'Contato existente' })
    const res = await SELF.fetch('https://x.com/api/contacts/import', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({
        csv: `telefone,nome\n${phone},Contato duplicado`,
        mapping: { phone: 'telefone', name: 'nome' },
        optInConfirmed: true,
      }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ imported: 0, updated: 0, duplicates: 1, invalid: 0 })
  })
  it('gera prévia de importação sem persistir e separa novos, existentes, duplicados e inválidos', async () => {
    const suffix = String(Date.now()).slice(-8)
    const existingPhone = `+5581${suffix}`
    await contactsDb(env.DB).create({ phone: existingPhone, name: 'Já existente' })
    const preview = await SELF.fetch('https://x.com/api/contacts/import-preview', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({
        csv: `telefone,nome\n${existingPhone},Existente\n+5582${suffix},Novo\n+5582${suffix},Duplicado\ninvalido,Inválido\n`,
        mapping: { phone: 'telefone', name: 'nome', defaultTags: [], customFields: {} },
      }),
    })
    expect(preview.status).toBe(200)
    expect(await preview.json()).toMatchObject({ total: 4, valid: 2, existing: 1, duplicates: 1, invalid: 1 })
    expect(await contactsDb(env.DB).getByPhone(`+5582${suffix}`)).toBeNull()
    await contactsDb(env.DB).delete((await contactsDb(env.DB).getByPhone(existingPhone))!.id)
  })
  it('importa e-mail, tags e campos personalizados mapeados e exporta o e-mail', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const field = await contactsDb(env.DB).createCustomField({
      key: `score_import_${suffix}`, label: `Score import ${suffix}`, type: 'number',
    })
    const phone = `+5541${String(Date.now()).slice(-8)}`
    const tagName = `VIP import ${suffix}`
    const res = await SELF.fetch('https://x.com/api/contacts/import', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({
        csv: `fone,email,grupos,score\n${phone},TESTE@EXAMPLE.COM,\"${tagName};Curitiba\",37\n`,
        mapping: {
          phone: 'fone', email: 'email', tags: 'grupos', defaultTags: ['Lead import'],
          customFields: { [field.id]: 'score' },
        },
        optInConfirmed: true,
      }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ imported: 1, invalid: 0 })
    const contact = await contactsDb(env.DB).getByPhone(phone)
    expect(contact?.email).toBe('teste@example.com')
    const profile = await contactsDb(env.DB).getContactProfile(contact!.id)
    expect(profile?.tags.map((tag) => String(tag.name))).toEqual(
      expect.arrayContaining(['Lead import', tagName, 'Curitiba']),
    )
    expect(profile?.customValues).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: field.id, value: 37 })]),
    )
    const exported = await SELF.fetch(
      `https://x.com/api/contacts/export.csv?q=${encodeURIComponent(phone)}`,
      { headers: AUTH },
    )
    expect(exported.status).toBe(200)
    expect(await exported.text()).toContain('teste@example.com')
    await contactsDb(env.DB).deleteCustomField(field.id)
  })
  it('exporta somente os IDs selecionados e a exclusão em massa não atinge os demais', async () => {
    const suffix = String(Date.now()).slice(-8)
    const selected = await contactsDb(env.DB).create({ phone: `+5562${suffix}`, name: `Selecionado ${suffix}` })
    const untouched = await contactsDb(env.DB).create({ phone: `+5563${suffix}`, name: `Não selecionado ${suffix}` })
    const exported = await SELF.fetch(`https://x.com/api/contacts/export.csv?ids=${selected.id}`, { headers: AUTH })
    expect(exported.status).toBe(200)
    const csv = await exported.text()
    expect(csv).toContain(`Selecionado ${suffix}`)
    expect(csv).not.toContain(`Não selecionado ${suffix}`)
    const removed = await SELF.fetch('https://x.com/api/contacts/bulk-delete', {
      method: 'POST', headers: AUTH, body: JSON.stringify({ ids: [selected.id] }),
    })
    expect(removed.status).toBe(200)
    expect(await removed.json()).toEqual({ ok: true, deleted: 1 })
    expect(await contactsDb(env.DB).getByPhone(selected.phone)).toBeNull()
    expect(await contactsDb(env.DB).getByPhone(untouched.phone)).toMatchObject({ id: untouched.id })
    await contactsDb(env.DB).delete(untouched.id)
  })
  it('exclui campo personalizado pela API', async () => {
    const field = await contactsDb(env.DB).createCustomField({
      key: `delete_field_${crypto.randomUUID().slice(0, 8)}`,
      label: 'Campo removível',
      type: 'boolean',
    })
    const res = await SELF.fetch(`https://x.com/api/contacts/custom-fields/${field.id}`, {
      method: 'DELETE', headers: AUTH,
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(await contactsDb(env.DB).listCustomFieldDefs()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: field.id })]),
    )
  })
  it('persiste valor de campo de data no formato ISO', async () => {
    const field = await contactsDb(env.DB).createCustomField({
      key: `date_field_${crypto.randomUUID().slice(0, 8)}`,
      label: 'Data de auditoria',
      type: 'date',
    })
    const contact = await contactsDb(env.DB).create({
      phone: `+5521${String(Date.now()).slice(-8)}`,
      name: 'Contato data',
    })
    const res = await SELF.fetch(
      `https://x.com/api/contacts/${contact.id}/custom-values/${field.id}`,
      {
        method: 'PUT', headers: AUTH,
        body: JSON.stringify({ value: '2026-07-15' }),
      },
    )
    expect(res.status).toBe(200)
    const profile = await contactsDb(env.DB).getContactProfile(contact.id)
    expect(profile?.customValues).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: field.id, value: '2026-07-15' })]),
    )
  })
  it('rejeita CSV malformado ou coluna inexistente sem importar parcialmente', async () => {
    const rejectedPhone = '+5511999990004'
    const before = (await env.DB.prepare('SELECT COUNT(*) AS n FROM contacts WHERE phone = ?1')
      .bind(rejectedPhone)
      .first<{ n: number }>())?.n ?? 0
    for (const input of [
      { csv: 'telefone,nome\n"11999990004,Bia\n', mapping: { phone: 'telefone', name: 'nome' } },
      { csv: 'telefone\n11999990004\n', mapping: { phone: 'celular' } },
    ]) {
      const res = await SELF.fetch('https://x.com/api/contacts/import', {
        method: 'POST', headers: AUTH,
        body: JSON.stringify({ ...input, optInConfirmed: true }),
      })
      expect(res.status).toBe(400)
    }
    const after = (await env.DB.prepare('SELECT COUNT(*) AS n FROM contacts WHERE phone = ?1')
      .bind(rejectedPhone)
      .first<{ n: number }>())?.n ?? 0
    expect(after).toBe(before)
  })
  it('teto de linhas conta também registros inválidos', async () => {
    const rows = Array.from({ length: 20_001 }, () => 'inválido')
    const res = await SELF.fetch('https://x.com/api/contacts/import', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({
        csv: `telefone\n${rows.join('\n')}\n`,
        mapping: { phone: 'telefone' }, optInConfirmed: true,
      }),
    })
    expect(res.status).toBe(413)
  })
  it('import acima do teto de 20k linhas válidas → 413', async () => {
    const rows = Array.from({ length: 20_001 }, (_, i) => `+55119${10000000 + i}`)
    const res = await SELF.fetch('https://x.com/api/contacts/import', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ csv: `telefone\n${rows.join('\n')}\n`, mapping: { phone: 'telefone' }, optInConfirmed: true }),
    })
    expect(res.status).toBe(413)
  })
  it('POST /api/contacts sem declaração cria unknown e não infere opt-in', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts', {
      method: 'POST', headers: AUTH, body: JSON.stringify({ phone: '11999990004' }),
    })
    expect(res.status).toBe(201)
    const contact = (await res.json()) as { status: string }
    expect(contact.status).toBe('unknown')
  })
  it('POST /api/contacts com opt-in confirmado cria opt_in e grava consent event', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ phone: '11999990003', name: 'Caio', optInConfirmed: true }),
    })
    expect(res.status).toBe(201)
    const contact = (await res.json()) as { phone: string; status: string }
    expect(contact.phone).toBe('+5511999990003')
    expect(contact.status).toBe('opt_in')
    const ev = await env.DB.prepare(
      "SELECT contact_count FROM consent_events WHERE source = 'manual'"
    ).first<{ contact_count: number }>()
    expect(ev?.contact_count).toBe(1)
  })
  it('POST /api/contacts duplicado retorna conflito, não erro interno', async () => {
    const phone = `+5511${String(Date.now()).slice(-8)}`
    const request = () => SELF.fetch('https://x.com/api/contacts', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ phone, optInConfirmed: true }),
    })
    expect((await request()).status).toBe(201)
    const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM consent_events')
      .first<{ n: number }>()
    expect((await request()).status).toBe(409)
    const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM consent_events')
      .first<{ n: number }>()
    expect(after?.n).toBe(before?.n)
  })
  it('POST /api/contacts rejeita telefone inválido', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts', {
      method: 'POST', headers: AUTH, body: JSON.stringify({ phone: 'abc', optInConfirmed: true }),
    })
    expect(res.status).toBe(400)
  })
  it('bulk-status exige consentimento para ativar opt-in e grava evidência', async () => {
    const created = await env.DB.prepare(
      `INSERT INTO contacts (id, phone, status) VALUES (?1, ?2, 'unknown') RETURNING id`
    ).bind(crypto.randomUUID(), `+5511${String(Date.now()).slice(-8)}`).first<{ id: string }>()
    const denied = await SELF.fetch('https://x.com/api/contacts/bulk-status', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ ids: [created!.id], status: 'opt_in' }),
    })
    expect(denied.status).toBe(400)

    const allowed = await SELF.fetch('https://x.com/api/contacts/bulk-status', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ ids: [created!.id], status: 'opt_in', optInConfirmed: true }),
    })
    expect(allowed.status).toBe(200)
    const event = await env.DB.prepare(
      "SELECT contact_count FROM consent_events WHERE source = 'manual' ORDER BY created_at DESC"
    ).first<{ contact_count: number }>()
    expect(event?.contact_count).toBe(1)
    expect(await env.DB.prepare(
      "SELECT event_type, actor_type FROM contact_history_events WHERE contact_id = ?1 ORDER BY created_at DESC LIMIT 1"
    ).bind(created!.id).first()).toMatchObject({ event_type: 'status_updated', actor_type: 'admin' })

    const repeated = await SELF.fetch('https://x.com/api/contacts/bulk-status', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ ids: [created!.id], status: 'opt_in', optInConfirmed: true }),
    })
    expect(await repeated.json()).toEqual({ ok: true, changed: 0 })
  })

  it('bulk-status divide 100 ids para respeitar o limite de parâmetros do D1', async () => {
    const ids = Array.from({ length: 100 }, () => crypto.randomUUID())
    const res = await SELF.fetch('https://x.com/api/contacts/bulk-status', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ ids, status: 'opt_out' }),
    })
    expect(res.status).toBe(200)
  })

  it('opt-out revoga a evidência individual ativa', async () => {
    const phone = `+5541${String(Date.now()).slice(-8)}`
    const contact = await contactsDb(env.DB).createOptInWithConsent(
      { phone }, 'declaração de teste')
    await contactsDb(env.DB).setStatus([contact!.id], 'opt_out')
    const evidence = await env.DB.prepare(
      'SELECT contact_id, revoked_at, revoked_reason FROM consent_events WHERE contact_id = ?1'
    ).bind(contact!.id).first<{ contact_id: string; revoked_at: string | null; revoked_reason: string | null }>()
    expect(evidence?.contact_id).toBe(contact!.id)
    expect(evidence?.revoked_at).toBeTruthy()
    expect(evidence?.revoked_reason).toBe('manual_opt_out')
    expect(await env.DB.prepare(
      "SELECT event_type, actor_type FROM contact_history_events WHERE contact_id = ?1 ORDER BY created_at DESC LIMIT 1"
    ).bind(contact!.id).first()).toMatchObject({ event_type: 'status_updated', actor_type: 'admin' })
  })

  it('desfaz cadastro manual se a evidência de consentimento falhar', async () => {
    const phone = `+5511${String(Date.now()).slice(-8)}`
    await env.DB.prepare(`CREATE TRIGGER test_fail_manual_consent
      BEFORE INSERT ON consent_events BEGIN SELECT RAISE(FAIL, 'falha consent'); END`).run()
    try {
      await expect(contactsDb(env.DB).createOptInWithConsent(
        { phone }, 'declaração de teste',
      )).rejects.toThrow()
      expect(await contactsDb(env.DB).getByPhone(phone)).toBeNull()
    } finally {
      await env.DB.prepare('DROP TRIGGER test_fail_manual_consent').run()
    }
  })

  it('desfaz o lote importado se a evidência de consentimento falhar', async () => {
    const phone = `+5521${String(Date.now()).slice(-8)}`
    await env.DB.prepare(`CREATE TRIGGER test_fail_import_consent
      BEFORE INSERT ON consent_events BEGIN SELECT RAISE(FAIL, 'falha consent'); END`).run()
    try {
      await expect(contactsDb(env.DB).bulkInsertOptInWithConsent(
        [{ phone }], 'declaração de teste',
      )).rejects.toThrow()
      expect(await contactsDb(env.DB).getByPhone(phone)).toBeNull()
    } finally {
      await env.DB.prepare('DROP TRIGGER test_fail_import_consent').run()
    }
  })

  it('desfaz ativação opt-in se a evidência de consentimento falhar', async () => {
    const contact = await contactsDb(env.DB).create({
      phone: `+5531${String(Date.now()).slice(-8)}`, status: 'unknown',
    })
    await env.DB.prepare(`CREATE TRIGGER test_fail_status_consent
      BEFORE INSERT ON consent_events BEGIN SELECT RAISE(FAIL, 'falha consent'); END`).run()
    try {
      await expect(contactsDb(env.DB).setOptInWithConsent(
        [contact.id], 'declaração de teste',
      )).rejects.toThrow()
      expect((await contactsDb(env.DB).getByPhone(contact.phone))?.status).toBe('unknown')
    } finally {
      await env.DB.prepare('DROP TRIGGER test_fail_status_consent').run()
    }
  })
})
