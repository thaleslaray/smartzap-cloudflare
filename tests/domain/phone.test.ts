import { describe, expect, it } from 'vitest'
import { normalizePhone } from '../../src/domain/phone'

describe('normalizePhone', () => {
  it('normaliza BR local para E.164', () => {
    expect(normalizePhone('11 99999-0001', 'BR')).toBe('+5511999990001')
  })
  it('aceita E.164 pronto', () => {
    expect(normalizePhone('+5511999990001')).toBe('+5511999990001')
  })
  it('rejeita lixo', () => {
    expect(normalizePhone('abc')).toBeNull()
  })
})
