import { describe, expect, it } from 'vitest'
import { resolveMetaThroughput, safeRateForMode } from '../src/domain/meta-throughput'

describe('Meta throughput', () => {
  it.each([
    ['STANDARD', 80], ['HIGH', 1000], ['COEXISTENCE', 20],
  ])('mapeia %s para %s mps', (level, mps) => {
    expect(resolveMetaThroughput({ level }).maxMps).toBe(mps)
  })
  it('falha fechado para nível desconhecido', () => {
    expect(resolveMetaThroughput({ level: 'future' })).toMatchObject({ level: 'UNKNOWN', maxMps: null })
  })
  it('não deixa máximo exceder o teto Meta', () => {
    expect(safeRateForMode(20, 'maximum', null)).toBe(18)
    expect(safeRateForMode(80, 'manual', 1000)).toBe(80)
    expect(safeRateForMode(null, 'automatic', null)).toBe(2)
  })
})
