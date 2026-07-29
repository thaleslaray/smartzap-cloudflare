import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPricingAnalytics } from "../src/whatsapp/pricing-analytics";

describe("Meta pricing analytics", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("monta consulta v25 e normaliza data_points com e sem COST/tier", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("v25.0/123456");
      expect(decodeURIComponent(url)).toContain("dimensions(PRICING_CATEGORY,PRICING_TYPE,TIER,COUNTRY,PHONE)");
      return new Response(JSON.stringify({
        currency: "BRL",
        pricing_analytics: { data: [{ data_points: [
          { start: 100, end: 200, country: "BR", tier: "0:MAX", pricing_type: "REGULAR", pricing_category: "MARKETING", volume: 2, cost: 0.6434 },
          { start: 100, end: 200, country: "BR", pricing_type: "FREE_CUSTOMER_SERVICE", pricing_category: "SERVICE", volume: 1 },
        ] }] },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchPricingAnalytics({
      token: "redacted", version: "v25.0", wabaId: "123456", start: 100, end: 200,
    });
    expect(result.currency).toBe("BRL");
    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toMatchObject({ cost: 0.6434, tier: "0:MAX" });
    expect(result.points[1]).toMatchObject({ cost: null, tier: null });
  });

  it("rejeita intervalos inválidos e propaga código Graph sem token", async () => {
    await expect(fetchPricingAnalytics({
      token: "x", version: "v25.0", wabaId: "123456", start: 200, end: 100,
    })).rejects.toThrow("intervalo");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { code: 100, message: "invalid" },
    }), { status: 400 })));
    await expect(fetchPricingAnalytics({
      token: "x", version: "v25.0", wabaId: "123456", start: 100, end: 200,
    })).rejects.toMatchObject({ code: 100, status: 400 });
  });
});
