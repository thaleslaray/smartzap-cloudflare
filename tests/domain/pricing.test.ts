import { describe, expect, it } from 'vitest'
import { estimateCampaignCostBRL } from '../../src/domain/pricing'

describe('estimateCampaignCostBRL', () => {
  it('marketing: 1000 destinatários = R$ 321,70', () => {
    const { unit, total } = estimateCampaignCostBRL('MARKETING', 1000)
    expect(unit).toBe(0.3217)
    expect(total).toBeCloseTo(321.7)
  })
  it('utility usa tarifa menor', () => {
    expect(estimateCampaignCostBRL('UTILITY', 100).total).toBeCloseTo(3.5)
  })
})
