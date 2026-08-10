import { describe, expect, it } from 'vitest'
import { parseContactsCsv } from '../../src/domain/csv-import'

describe('parseContactsCsv', () => {
  it('separa válidos, inválidos e duplicados', () => {
    const csv = 'telefone,nome\n11999990001,Ana\nabc,Bruno\n11999990001,Ana de novo\n'
    const r = parseContactsCsv(csv, { phone: 'telefone', name: 'nome' })
    expect(r.valid).toEqual([{
      phone: '+5511999990001', name: 'Ana', tags: [], customFields: {},
    }])
    expect(r.invalid).toEqual(['abc'])
    expect(r.duplicates).toBe(1)
  })

  it('mapeia e-mail, tags e campos personalizados por coluna', () => {
    const fieldId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const csv = 'fone,email,grupos,score\n21999990001,ANA@EXAMPLE.COM,"vip;rio",42\n'
    const result = parseContactsCsv(csv, {
      phone: 'fone', email: 'email', tags: 'grupos', defaultTags: ['lead'],
      customFields: { [fieldId]: 'score' },
    })
    expect(result.valid).toEqual([{
      phone: '+5521999990001', email: 'ana@example.com',
      tags: ['lead', 'vip', 'rio'], customFields: { [fieldId]: '42' },
    }])
  })
})
