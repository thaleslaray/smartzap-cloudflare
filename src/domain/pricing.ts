// Tarifas Meta BRL por mensagem entregue — developers.facebook.com/docs/whatsapp/pricing
// Vigência 2026-07-01. REVISAR TRIMESTRALMENTE (Meta só muda dia 1º de cada trimestre).
const BRL_RATES: Record<string, number> = {
  MARKETING: 0.3217,
  UTILITY: 0.035,
  AUTHENTICATION: 0.035,
}

export function estimateCampaignCostBRL(category: string, recipients: number) {
  const unit = BRL_RATES[category.toUpperCase()] ?? BRL_RATES.MARKETING
  return { unit, total: unit * recipients }
}
