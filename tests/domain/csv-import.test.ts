import { describe, expect, it } from 'vitest'
import { parseContactsCsv } from '../../src/domain/csv-import'

describe('parseContactsCsv', () => {
  it('separa válidos, inválidos e duplicados', () => {
    const csv = 'telefone,nome\n11999990001,Ana\nabc,Bruno\n11999990001,Ana de novo\n'
    const r = parseContactsCsv(csv, { phone: 'telefone', name: 'nome' })
    expect(r.valid).toEqual([{ phone: '+5511999990001', name: 'Ana' }])
    expect(r.invalid).toEqual(['abc'])
    expect(r.duplicates).toBe(1)
  })
})
