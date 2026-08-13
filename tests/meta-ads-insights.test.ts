import { describe, expect, it, vi } from "vitest";
import { fetchMetaAdInsights } from "../src/whatsapp/meta-ads-insights";

const baseRow = {
  account_currency: "BRL",
  campaign_id: "120000000000001",
  campaign_name: "Canário CTWA",
  adset_id: "120000000000002",
  adset_name: "Instagram",
  ad_id: "120000000000003",
  ad_name: "Criativo WhatsApp",
  date_start: "2026-08-08",
  date_stop: "2026-08-08",
  spend: "10.73",
  impressions: "179",
  reach: "160",
  clicks: "8",
  inline_link_clicks: "5",
  actions: [
    { action_type: "onsite_conversion.total_messaging_connection", value: "4" },
    { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "3" },
    { action_type: "onsite_conversion.lead", value: "1" },
    { action_type: "onsite_conversion.qualified_lead", value: "2" },
    { action_type: "qualified_lead", value: "7" },
    { action_type: "onsite_conversion.messaging_purchase", value: "1" },
    { action_type: "purchase", value: "9" },
  ],
  action_values: [
    { action_type: "onsite_conversion.messaging_purchase", value: "199.90" },
    { action_type: "purchase", value: "999.90" },
  ],
};

describe("Meta Ads Insights", () => {
  it("pagina com cursor seguro, usa Bearer e normaliza métricas sem somar aliases", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.searchParams.has("access_token")).toBe(false);
      expect(init?.headers).toEqual({ authorization: "Bearer secret-token" });
      if (!url.searchParams.has("after"))
        return Response.json({
          data: [baseRow],
          paging: { cursors: { after: "cursor-2" } },
        });
      expect(url.searchParams.get("after")).toBe("cursor-2");
      return Response.json({ data: [{
        ...baseRow,
        ad_id: "120000000000004",
        ad_name: "Segundo criativo",
        spend: "0.27",
        actions: [],
        action_values: [],
      }] });
    });

    const result = await fetchMetaAdInsights({
      token: "secret-token",
      graphVersion: "v26.0",
      adAccountId: "708497467651098",
      since: "2026-08-08",
      until: "2026-08-09",
      fetcher,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pages).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      spendMinor: 1073,
      conversationsStarted: 3,
      leads: 1,
      qualifiedLeads: 2,
      purchases: 1,
      purchaseValueMinor: 19990,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("classifica throttling como retry e não devolve detalhes sensíveis", async () => {
    const result = await fetchMetaAdInsights({
      token: "secret-token",
      graphVersion: "v25.0",
      adAccountId: "708497467651098",
      since: "2026-08-08",
      until: "2026-08-08",
      fetcher: async () => Response.json({
        error: {
          code: 613,
          message: "Rate limit token=EAAG_REDACT_THIS_LONG_SECRET_123456",
        },
      }, { status: 429 }),
    });
    expect(result).toMatchObject({ ok: false, retryable: true, httpStatus: 429, code: "613" });
    expect(JSON.stringify(result)).not.toContain("EAAG_REDACT_THIS_LONG_SECRET_123456");
  });
});
