import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseAwesomeApiRate,
  parseExchangeRateApiRate,
  resolveUsdBrlRate,
} from "../src/domain/exchange-rate";

const RATE_KEYS = [
  "exchange_rate_usd_brl",
  "exchange_rate_usd_brl_fetched_at",
];

describe("câmbio USD/BRL", () => {
  beforeEach(async () => {
    for (const key of RATE_KEYS)
      await env.DB.prepare("DELETE FROM settings WHERE key=?1").bind(key).run();
  });

  it("interpreta o bid da AwesomeAPI e persiste a última cotação válida", async () => {
    expect(parseAwesomeApiRate({ USDBRL: { bid: "5,42" } })).toBe(5.42);
    const now = new Date("2026-07-16T14:00:00.000Z");
    const result = await resolveUsdBrlRate(env.DB, {
      now,
      fetcher: vi.fn(async () => new Response(JSON.stringify({ USDBRL: { bid: "5.42" } }), { status: 200 })),
    });
    expect(result).toMatchObject({ rate: 5.42, source: "live", stale: false });
    expect(await env.DB.prepare(
      "SELECT value FROM settings WHERE key='exchange_rate_usd_brl'",
    ).first<{ value: string }>()).toEqual({ value: "5.42" });
  });

  it("tenta o segundo provedor quando a AwesomeAPI está indisponível", async () => {
    const now = new Date("2026-07-16T14:00:00.000Z");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("indisponível", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ rates: { BRL: 5.23 } }), { status: 200 }));

    expect(parseExchangeRateApiRate({ rates: { BRL: 5.23 } })).toBe(5.23);
    const result = await resolveUsdBrlRate(env.DB, { now, fetcher });

    expect(result).toMatchObject({
      rate: 5.23,
      source: "live",
      provider: "exchange-rate-api",
      stale: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("usa cache recente sem consultar o provedor novamente", async () => {
    const now = new Date("2026-07-16T14:00:00.000Z");
    await resolveUsdBrlRate(env.DB, {
      now,
      fetcher: async () => new Response(JSON.stringify({ USDBRL: { bid: "5.42" } }), { status: 200 }),
    });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ USDBRL: { bid: "6.00" } }), { status: 200 }));
    const result = await resolveUsdBrlRate(env.DB, {
      now: new Date("2026-07-16T14:30:00.000Z"),
      fetcher,
    });
    expect(result).toMatchObject({ rate: 5.42, source: "cache", stale: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("usa a última cotação válida quando a API cai, sem usar valor fixo", async () => {
    const now = new Date("2026-07-16T14:00:00.000Z");
    await resolveUsdBrlRate(env.DB, {
      now,
      fetcher: async () => new Response(JSON.stringify({ USDBRL: { bid: "5.42" } }), { status: 200 }),
    });
    const result = await resolveUsdBrlRate(env.DB, {
      now: new Date("2026-07-16T18:00:00.000Z"),
      fetcher: async () => { throw new Error("provedor indisponível"); },
    });
    expect(result).toMatchObject({ rate: 5.42, source: "last_valid", stale: true });
  });

  it("não inventa cotação quando nunca houve valor válido", async () => {
    const result = await resolveUsdBrlRate(env.DB, {
      fetcher: async () => { throw new Error("provedor indisponível"); },
    });
    expect(result).toBeNull();
  });
});
