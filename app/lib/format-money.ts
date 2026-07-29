type MoneyDisplay = {
  primary: string;
  secondary: string | null;
};

const format = (value: number, currency: string, maximumFractionDigits = 2) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits,
  });

export function formatCampaignMoney(
  value: number | null | undefined,
  currency: string | null | undefined,
  usdBrlRate: number | null | undefined,
  primaryMaximumFractionDigits = 2,
): MoneyDisplay {
  if (value == null || !currency) return { primary: "—", secondary: null };
  const original = format(value, currency, 4);
  if (currency !== "USD") return { primary: original, secondary: null };
  if (usdBrlRate == null || !Number.isFinite(usdBrlRate) || usdBrlRate <= 0) {
    return { primary: "BRL indisponível", secondary: `Valor Meta: ${original}` };
  }
  return {
    primary: format(value * usdBrlRate, "BRL", primaryMaximumFractionDigits),
    secondary: `Valor Meta: ${original}`,
  };
}

export function formatCampaignUnit(
  value: number | null | undefined,
  currency: string | null | undefined,
  usdBrlRate: number | null | undefined,
): MoneyDisplay {
  const result = formatCampaignMoney(value, currency, usdBrlRate, 4);
  return {
    primary: result.primary === "—" ? result.primary : `${result.primary}/msg`,
    secondary: result.secondary,
  };
}
