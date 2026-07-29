import { settingsDb } from "../db/settings";

export const EXCHANGE_RATE_URL = "https://economia.awesomeapi.com.br/last/USD-BRL";
export const EXCHANGE_RATE_FALLBACK_URL = "https://open.er-api.com/v6/latest/USD";
export const EXCHANGE_RATE_CACHE_TTL_MS = 60 * 60 * 1_000;

const RATE_KEY = "exchange_rate_usd_brl";
const FETCHED_AT_KEY = "exchange_rate_usd_brl_fetched_at";

type AwesomeApiPayload = {
  USDBRL?: { bid?: unknown };
};

export type ExchangeRateResult = {
  rate: number;
  currency: "BRL";
  pair: "USD/BRL";
  source: "live" | "cache" | "last_valid";
  provider: "awesomeapi" | "exchange-rate-api" | "persisted";
  fetchedAt: string;
  stale: boolean;
};

export function parseUsdBrlRate(value: unknown): number | null {
  if (typeof value === "number")
    return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const rate = Number(value.replace(",", "."));
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function parseAwesomeApiRate(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const bid = (payload as AwesomeApiPayload).USDBRL?.bid;
  return parseUsdBrlRate(bid);
}

export function parseExchangeRateApiRate(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const rates = (payload as { rates?: unknown }).rates;
  if (!rates || typeof rates !== "object") return null;
  return parseUsdBrlRate((rates as { BRL?: unknown }).BRL);
}

type StoredRate = { rate: number; fetchedAt: string };

async function readStoredRate(db: D1Database): Promise<StoredRate | null> {
  const settings = settingsDb(db);
  const [rateRaw, fetchedAt] = await Promise.all([
    settings.get(RATE_KEY),
    settings.get(FETCHED_AT_KEY),
  ]);
  const rate = parseUsdBrlRate(rateRaw);
  if (rate === null || !fetchedAt || Number.isNaN(Date.parse(fetchedAt))) return null;
  return { rate, fetchedAt };
}

async function saveRate(db: D1Database, rate: number, fetchedAt: string): Promise<void> {
  const settings = settingsDb(db);
  await Promise.all([
    settings.set(RATE_KEY, String(rate)),
    settings.set(FETCHED_AT_KEY, fetchedAt),
  ]);
}

export async function resolveUsdBrlRate(
  db: D1Database,
  options: {
    fetcher?: typeof fetch;
    now?: Date;
    cacheTtlMs?: number;
  } = {},
): Promise<ExchangeRateResult | null> {
  const now = options.now ?? new Date();
  const fetcher = options.fetcher ?? globalThis.fetch;
  const cacheTtlMs = options.cacheTtlMs ?? EXCHANGE_RATE_CACHE_TTL_MS;
  const stored = await readStoredRate(db);
  const storedAtMs = stored ? Date.parse(stored.fetchedAt) : NaN;
  const ageMs = stored ? now.getTime() - storedAtMs : NaN;

  if (stored && Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= cacheTtlMs) {
    return {
      rate: stored.rate,
      currency: "BRL",
      pair: "USD/BRL",
      source: "cache",
      provider: "persisted",
      fetchedAt: stored.fetchedAt,
      stale: false,
    };
  }

  const providers: Array<{
    name: "awesomeapi" | "exchange-rate-api";
    url: string;
    parse: (payload: unknown) => number | null;
  }> = [
    { name: "awesomeapi", url: EXCHANGE_RATE_URL, parse: parseAwesomeApiRate },
    { name: "exchange-rate-api", url: EXCHANGE_RATE_FALLBACK_URL, parse: parseExchangeRateApiRate },
  ];
  for (const provider of providers) {
    try {
      const response = await fetcher(provider.url, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        console.warn("exchange-rate provider returned non-OK", provider.name, response.status);
        continue;
      }
      const rate = provider.parse(await response.json());
      if (rate === null) {
        console.warn("exchange-rate provider returned invalid payload", provider.name);
        continue;
      }
      const fetchedAt = now.toISOString();
      await saveRate(db, rate, fetchedAt);
      return {
        rate,
        currency: "BRL",
        pair: "USD/BRL",
        source: "live",
        provider: provider.name,
        fetchedAt,
        stale: false,
      };
    } catch (error) {
      console.warn("exchange-rate provider failed", provider.name, error instanceof Error ? error.message : String(error));
      // Tenta o próximo provedor antes de recorrer ao último valor persistido.
    }
  }
  if (!stored) return null;
  return {
    rate: stored.rate,
    currency: "BRL",
    pair: "USD/BRL",
    source: "last_valid",
    provider: "persisted",
    fetchedAt: stored.fetchedAt,
    stale: true,
  };
}
