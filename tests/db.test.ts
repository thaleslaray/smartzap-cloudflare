import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { contactsDb } from '../src/db/contacts'
import { settingsDb } from '../src/db/settings'

describe('contactsDb', () => {
  it('cria e busca por phone', async () => {
    const db = contactsDb(env.DB)
    const created = await db.create({ phone: '+5511999990001', name: 'Ana', status: 'opt_in' })
    expect(created.id).toBeTruthy()
    const found = await db.getByPhone('+5511999990001')
    expect(found?.name).toBe('Ana')
  })
  it('list filtra por status', async () => {
    const db = contactsDb(env.DB)
    const { items, total } = await db.list({ status: 'opt_in', limit: 10, offset: 0 })
    expect(total).toBeGreaterThan(0)
    expect(items.every((c) => c.status === 'opt_in')).toBe(true)
  })
})

describe('settingsDb', () => {
  it('set/get roundtrip', async () => {
    const db = settingsDb(env.DB)
    await db.set('whatsapp_phone_id', '123')
    expect(await db.get('whatsapp_phone_id')).toBe('123')
  })
})
