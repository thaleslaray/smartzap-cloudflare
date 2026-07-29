import { describe, expect, it } from 'vitest'
import {
  BRAZIL_DDD_COUNT,
  BRAZIL_STATE_OPTIONS,
  COUNTRY_DDI_OPTIONS,
  COUNTRY_PREFIXES,
  UF_PREFIXES,
} from '../app/lib/audience-geography'

describe('catálogo geográfico de audiência', () => {
  it('expõe todos os países e territórios do metadado telefônico', () => {
    expect(COUNTRY_DDI_OPTIONS).toHaveLength(245)
    expect(COUNTRY_PREFIXES.BR).toEqual(['+55'])
    expect(COUNTRY_PREFIXES.US).toEqual(['+1'])
    expect(COUNTRY_PREFIXES.PT).toEqual(['+351'])
    expect(COUNTRY_PREFIXES.JP).toEqual(['+81'])
    expect(COUNTRY_DDI_OPTIONS.every((item) => /^\+\d+$/.test(item.prefix))).toBe(true)
  })

  it('cobre as 27 UFs e os 67 DDDs brasileiros, incluindo o 61 compartilhado', () => {
    expect(BRAZIL_STATE_OPTIONS).toHaveLength(27)
    expect(BRAZIL_DDD_COUNT).toBe(67)
    expect(UF_PREFIXES.SP).toHaveLength(9)
    expect(UF_PREFIXES.DF).toContain('+5561')
    expect(UF_PREFIXES.GO).toContain('+5561')
    expect(Object.values(UF_PREFIXES).flat().every((prefix) => /^\+55\d{2}$/.test(prefix))).toBe(true)
  })
})
