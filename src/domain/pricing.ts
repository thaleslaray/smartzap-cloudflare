import Papa from "papaparse";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export const PRICING_SOURCE =
  "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing";

export type PricingCategory =
  | "MARKETING"
  | "UTILITY"
  | "AUTHENTICATION"
  | "AUTHENTICATION_INTERNATIONAL"
  | "SERVICE";

export type PricingRateCard = {
  id?: string;
  source: string;
  checksum: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  currency: string;
  market: string;
  countryIso?: string | null;
  category: PricingCategory;
  tierFrom: number;
  tierTo?: number | null;
  unitPrice: number;
};

export type PricingEstimate = {
  state: "estimated" | "unavailable";
  amount: number | null;
  currency: string | null;
  category: PricingCategory | null;
  effectiveFrom: string | null;
  confidence: "high" | "medium" | "low" | "unavailable";
  source: string;
  assumptions: string[];
  unavailableReasons: string[];
  breakdown: Array<{
    countryIso: string;
    market: string;
    recipients: number;
    unitPrice: number;
    amount: number;
    tierFrom: number;
    tierTo: number | null;
  }>;
};

const MARKET_BY_COUNTRY: Record<string, string> = {
  AR: "Argentina", BR: "Brazil", CL: "Chile", CO: "Colombia",
  EG: "Egypt", FR: "France", DE: "Germany", HK: "Hong Kong",
  HU: "Hungary", IN: "India", ID: "Indonesia", IL: "Israel",
  IT: "Italy", MY: "Malaysia", MX: "Mexico", NL: "Netherlands",
  NG: "Nigeria", PK: "Pakistan", PE: "Peru", PL: "Poland",
  QA: "Qatar", RO: "Romania", RU: "Russia", SA: "Saudi Arabia",
  SG: "Singapore", ZA: "South Africa", ES: "Spain", TR: "Turkey",
  AE: "United Arab Emirates", GB: "United Kingdom",
};

export function normalizePricingCategory(value: unknown): PricingCategory | null {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[ -]+/g, "_");
  return [
    "MARKETING",
    "UTILITY",
    "AUTHENTICATION",
    "AUTHENTICATION_INTERNATIONAL",
    "SERVICE",
  ].includes(normalized)
    ? (normalized as PricingCategory)
    : null;
}

export function countryFromE164(phone: string): { countryIso: string; market: string } | null {
  const parsed = parsePhoneNumberFromString(phone.startsWith("+") ? phone : `+${phone}`);
  if (!parsed?.isValid() || !parsed.country) return null;
  const countryIso = parsed.country;
  return { countryIso, market: MARKET_BY_COUNTRY[countryIso] ?? "Other" };
}

function activeAt(card: PricingRateCard, at: string): boolean {
  return card.effectiveFrom <= at && (!card.effectiveTo || card.effectiveTo >= at);
}

function selectRate(
  cards: PricingRateCard[],
  input: { market: string; countryIso: string; category: PricingCategory; at: string; volume: number },
): PricingRateCard | null {
  const candidates = cards
    .filter((card) =>
      card.category === input.category &&
      activeAt(card, input.at) &&
      (card.countryIso === input.countryIso || card.market === input.market || card.market === "Other") &&
      card.tierFrom <= input.volume &&
      (card.tierTo == null || input.volume <= card.tierTo),
    )
    .sort((a, b) => {
      const aExact = Number(a.countryIso === input.countryIso || a.market === input.market);
      const bExact = Number(b.countryIso === input.countryIso || b.market === input.market);
      const aBounded = Number(a.tierTo != null);
      const bBounded = Number(b.tierTo != null);
      return bExact - aExact || b.tierFrom - a.tierFrom || bBounded - aBounded ||
        b.effectiveFrom.localeCompare(a.effectiveFrom);
    });
  return candidates[0] ?? null;
}

export function estimateCampaignCost(input: {
  category: unknown;
  phones: string[];
  rateCards: PricingRateCard[];
  at?: string;
  currency?: string;
  serviceWindowOpen?: boolean;
  freeEntryPointOpen?: boolean;
  monthlyVolumeByMarket?: Record<string, number>;
}): PricingEstimate {
  const category = normalizePricingCategory(input.category);
  const at = (input.at ?? new Date().toISOString()).slice(0, 10);
  const source = input.rateCards[0]?.source ?? PRICING_SOURCE;
  const base: PricingEstimate = {
    state: "unavailable",
    amount: null,
    currency: input.currency ?? null,
    category,
    effectiveFrom: null,
    confidence: "unavailable",
    source,
    assumptions: [],
    unavailableReasons: [],
    breakdown: [],
  };
  if (!category) {
    base.unavailableReasons.push("Categoria de pricing desconhecida");
    return base;
  }
  if (input.phones.length === 0) {
    base.unavailableReasons.push("Nenhum destinatário elegível");
    return base;
  }
  const utilityFreeInServiceWindow =
    category === "UTILITY" && input.serviceWindowOpen && at < "2026-10-01";
  const serviceFreeInServiceWindow =
    category === "SERVICE" && input.serviceWindowOpen && at < "2026-10-01";
  if (input.freeEntryPointOpen || utilityFreeInServiceWindow || serviceFreeInServiceWindow) {
    return {
      ...base,
      state: "estimated",
      amount: 0,
      currency: input.currency ?? input.rateCards[0]?.currency ?? null,
      confidence: "medium",
      assumptions: [
        input.freeEntryPointOpen
          ? "Janela de entrada gratuita informada como aberta"
          : category === "UTILITY"
            ? "Template utility informado dentro da janela de atendimento antes de 01/10/2026"
            : "Mensagem de serviço informada dentro da janela de atendimento antes de 01/10/2026",
      ],
      unavailableReasons: [],
    };
  }

  const groups = new Map<string, { countryIso: string; market: string; count: number }>();
  for (const phone of input.phones) {
    const destination = countryFromE164(phone);
    if (!destination) {
      base.unavailableReasons.push(`País não identificado para um destinatário`);
      continue;
    }
    const key = `${destination.countryIso}:${destination.market}`;
    const group = groups.get(key) ?? { ...destination, count: 0 };
    group.count++;
    groups.set(key, group);
  }
  if (base.unavailableReasons.length) return base;

  const currencies = new Set<string>();
  const effectiveDates = new Set<string>();
  for (const group of groups.values()) {
    const volume =
      input.monthlyVolumeByMarket?.[group.market] ??
      input.monthlyVolumeByMarket?.[group.countryIso] ??
      0;
    const rate = selectRate(input.rateCards, {
      ...group,
      category,
      at,
      volume,
    });
    if (!rate) {
      base.unavailableReasons.push(`Rate card ausente para ${group.market}/${category}`);
      continue;
    }
    currencies.add(rate.currency);
    effectiveDates.add(rate.effectiveFrom);
    base.breakdown.push({
      countryIso: group.countryIso,
      market: group.market,
      recipients: group.count,
      unitPrice: rate.unitPrice,
      amount: rate.unitPrice * group.count,
      tierFrom: rate.tierFrom,
      tierTo: rate.tierTo ?? null,
    });
  }
  if (base.unavailableReasons.length || currencies.size !== 1) {
    if (currencies.size > 1)
      base.unavailableReasons.push("A campanha mistura rate cards em moedas diferentes");
    base.breakdown = [];
    return base;
  }
  const currency = [...currencies][0];
  if (input.currency && currency !== input.currency) {
    base.unavailableReasons.push(`Rate card ${currency} não corresponde à moeda ${input.currency}`);
    base.breakdown = [];
    return base;
  }
  const unknownTier = !input.monthlyVolumeByMarket;
  return {
    ...base,
    state: "estimated",
    amount: base.breakdown.reduce((sum, row) => sum + row.amount, 0),
    currency,
    effectiveFrom: [...effectiveDates].sort().at(-1) ?? null,
    confidence: unknownTier ? "low" : "high",
    assumptions: unknownTier
      ? ["Tier mensal ainda não confirmado; usada a faixa compatível com volume zero"]
      : [],
    unavailableReasons: [],
  };
}

function normalizedHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

export function parseMetaRateCardCsv(
  text: string,
  meta: { source: string; checksum: string; effectiveFrom: string; currency: string },
): PricingRateCard[] {
  const headerOffset = text.search(/^Market,/m);
  if (headerOffset < 0) throw new Error("Cabeçalho Market não encontrado no rate card");
  const parsed = Papa.parse<Record<string, string>>(text.slice(headerOffset), {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.some((error) => error.code !== "UndetectableDelimiter"))
    throw new Error("CSV de rate card inválido");
  const headers = parsed.meta.fields ?? [];
  const field = (name: string) => headers.find((header) => normalizedHeader(header) === name);
  const marketField = field("market");
  const currencyField = field("currency");
  if (!marketField || !currencyField) throw new Error("Colunas obrigatórias ausentes no rate card");
  const categories: Array<[string, PricingCategory]> = [
    ["marketing", "MARKETING"],
    ["utility", "UTILITY"],
    ["authentication", "AUTHENTICATION"],
    ["authenticationinternational", "AUTHENTICATION_INTERNATIONAL"],
    ["service", "SERVICE"],
  ];
  const rows: PricingRateCard[] = [];
  for (const row of parsed.data) {
    const market = String(row[marketField] ?? "").trim();
    const currency = String(row[currencyField] ?? "").trim().toUpperCase();
    if (!market) continue;
    if (currency !== meta.currency.toUpperCase())
      throw new Error(`Moeda inesperada no rate card: ${currency || "vazia"}`);
    for (const [header, category] of categories) {
      const column = field(header);
      if (!column) continue;
      const raw = String(row[column] ?? "").trim();
      if (!raw || /^n\/?a$/i.test(raw)) continue;
      const unitPrice = Number(raw.replace(",", "."));
      if (!Number.isFinite(unitPrice) || unitPrice < 0)
        throw new Error(`Preço inválido para ${market}/${category}`);
      rows.push({
        source: meta.source,
        checksum: meta.checksum,
        effectiveFrom: meta.effectiveFrom,
        currency,
        market,
        countryIso: Object.entries(MARKET_BY_COUNTRY).find(([, value]) => value === market)?.[0] ?? null,
        category,
        tierFrom: 0,
        tierTo: null,
        unitPrice,
      });
    }
  }
  if (!rows.length) throw new Error("Rate card não contém preços utilizáveis");
  return rows;
}

function tierInteger(value: unknown): number | null {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "--" || /^n\/?a$/i.test(normalized)) return null;
  const parsed = Number(normalized.replaceAll(",", ""));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

export function parseMetaVolumeTierCsv(
  text: string,
  meta: { source: string; checksum: string; effectiveFrom: string; currency: string },
): PricingRateCard[] {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  if (parsed.errors.some((error) => error.code !== "UndetectableDelimiter"))
    throw new Error("CSV de tiers inválido");
  const headerIndex = parsed.data.findIndex((row) =>
    normalizedHeader(String(row[1] ?? "")) === "currency" &&
    normalizedHeader(String(row[2] ?? "")) === "from" &&
    normalizedHeader(String(row[3] ?? "")) === "to",
  );
  if (headerIndex < 0) throw new Error("Cabeçalho de volume tiers não encontrado");
  const groups: Array<{ offset: number; category: PricingCategory }> = [
    { offset: 2, category: "UTILITY" },
    { offset: 7, category: "AUTHENTICATION" },
    { offset: 12, category: "AUTHENTICATION_INTERNATIONAL" },
  ];
  const rows: PricingRateCard[] = [];
  let market = "";
  for (const row of parsed.data.slice(headerIndex + 1)) {
    market = String(row[0] ?? "").trim() || market;
    const currency = String(row[1] ?? "").trim().toUpperCase();
    if (!market || !currency) continue;
    if (currency !== meta.currency.toUpperCase())
      throw new Error(`Moeda inesperada no volume tier: ${currency}`);
    for (const group of groups) {
      const from = tierInteger(row[group.offset]);
      const to = tierInteger(row[group.offset + 1]);
      const rawRate = String(row[group.offset + 3] ?? "").trim();
      if (from === null && to === null && (!rawRate || /^n\/?a$/i.test(rawRate))) continue;
      if (!Number.isFinite(from) || (to !== null && !Number.isFinite(to)))
        throw new Error(`Faixa inválida para ${market}/${group.category}`);
      const unitPrice = Number(rawRate.replace(",", "."));
      if (!Number.isFinite(unitPrice) || unitPrice < 0)
        throw new Error(`Preço de tier inválido para ${market}/${group.category}`);
      rows.push({
        source: meta.source,
        checksum: meta.checksum,
        effectiveFrom: meta.effectiveFrom,
        currency,
        market,
        countryIso: Object.entries(MARKET_BY_COUNTRY).find(([, value]) => value === market)?.[0] ?? null,
        category: group.category,
        tierFrom: from as number,
        tierTo: to,
        unitPrice,
      });
    }
  }
  if (!rows.length) throw new Error("CSV não contém volume tiers utilizáveis");
  return rows;
}

export async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
