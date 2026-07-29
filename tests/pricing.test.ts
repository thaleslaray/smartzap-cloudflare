import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { pricingDb } from "../src/db/pricing";
import { checkUpcomingRateCard, nextQuarterStart } from "../src/cron/pricing";

const AUTH = {
  authorization: "Bearer dev-api-key",
  origin: "https://x.com",
  "content-type": "application/json",
};

const csv = `Meta rate card,,,,,\nMarket,Currency,Marketing,Utility,Authentication,"Authentication-\nInternational",Service\nBrazil,BRL,0.3217,0.0350,0.0350,n/a,n/a\n`;

describe("pricing API e persistência", () => {
  it("importa rate card validado e torna reimportação idempotente", async () => {
    const payload = {
      source: `https://example.com/meta-rate-${crypto.randomUUID()}.csv`,
      effectiveFrom: "2026-07-01",
      currency: "BRL",
      csv: csv.replace("Meta rate card", `Meta rate card ${crypto.randomUUID()}`),
    };
    const first = await SELF.fetch("https://x.com/api/pricing/rate-cards/import", {
      method: "POST", headers: AUTH, body: JSON.stringify(payload),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, imported: true, rows: 3 });
    const second = await SELF.fetch("https://x.com/api/pricing/rate-cards/import", {
      method: "POST", headers: AUTH, body: JSON.stringify(payload),
    });
    expect(await second.json()).toMatchObject({ ok: true, imported: false, rows: 3 });
    const active = await pricingDb(env.DB).activeRateCards("2026-07-16", "BRL");
    expect(active.some((row) => row.market === "Brazil" && row.category === "MARKETING")).toBe(true);
  });

  it("baixa e importa um CSV pela fonte configurada", async () => {
    const previous = globalThis.fetch;
    const source = `https://meta.example/rate-card-${crypto.randomUUID()}.csv`;
    globalThis.fetch = async (input, init) => {
      if (String(input) === source)
        return new Response(csv.replace("Meta rate card", `Meta rate card ${crypto.randomUUID()}`), {
          status: 200,
          headers: { "content-type": "text/csv" },
        });
      return previous(input, init);
    };
    try {
      const response = await SELF.fetch("https://x.com/api/pricing/rate-cards/import-from-url", {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({
          source,
          effectiveFrom: "2026-08-01",
          currency: "BRL",
          kind: "rates",
        }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, imported: true, rows: 3, source });
    } finally {
      globalThis.fetch = previous;
    }
  });

  it("descobre e importa automaticamente o CSV BRL publicado pela Meta", async () => {
    const previous = globalThis.fetch;
    const source = `https://cdn.meta.example/brl-${crypto.randomUUID()}.csv`;
    const officialPage = "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing";
    const page = String.raw`{\"href\":\"${source.replaceAll("/", "\\/")}\"}`;
    const officialCsv = csv.replace(
      "Meta rate card",
      "Cost per message in BRL on the WhatsApp Business Platform, effective July 1, 2026",
    );
    globalThis.fetch = async (input, init) => {
      if (String(input) === officialPage)
        return new Response(page, { status: 200, headers: { "content-type": "text/html" } });
      if (String(input) === source)
        return new Response(officialCsv, { status: 200, headers: { "content-type": "text/csv" } });
      return previous(input, init);
    };
    try {
      const response = await SELF.fetch("https://x.com/api/pricing/rate-cards/import-official", {
        method: "POST", headers: AUTH, body: JSON.stringify({}),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        imported: true,
        rows: 3,
        source: officialPage,
        effectiveFrom: "2026-07-01",
      });
    } finally {
      globalThis.fetch = previous;
    }
  });

  it("usa a calculadora oficial quando a página de pricing não expõe CSV direto", async () => {
    const previous = globalThis.fetch;
    const officialPage = "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing";
    const calculatorPage = "https://business.whatsapp.com/products/platform-pricing#rates";
    const endpoint = "https://whatsappbusiness.com/pt-br/wp-json/wab/v1/pricing";
    const calls: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === officialPage)
        return new Response("Rates and tiers effective July 1, 2026", { status: 200 });
      if (url === calculatorPage)
        return new Response(JSON.stringify({ restUrl: endpoint, restNonce: "nonce", wpNonce: "wp-nonce" }), { status: 200 });
      if (url.startsWith(endpoint)) {
        calls.push(url);
        const category = new URL(url).searchParams.get("category");
        const quote = category === "Marketing" ? "0.3217" : "0.0350";
        expect(init?.headers).toMatchObject({ "X-WP-Nonce": "wp-nonce" });
        return new Response(JSON.stringify({ quote, tier_list: [] }), { status: 200 });
      }
      return previous(input, init);
    };
    try {
      const response = await SELF.fetch("https://x.com/api/pricing/rate-cards/import-official", {
        method: "POST", headers: AUTH, body: JSON.stringify({}),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        imported: true,
        rows: 3,
        source: calculatorPage,
        effectiveFrom: "2026-07-01",
      });
      expect(calls).toHaveLength(3);
      expect(calls.every((url) => new URL(url).searchParams.get("market") === "BR")).toBe(true);
    } finally {
      globalThis.fetch = previous;
    }
  });

  it("rejeita moeda divergente sem ativar importação parcial", async () => {
    const before = (await env.DB.prepare(
      "SELECT COUNT(*) n FROM pricing_rate_card_imports WHERE status='active'",
    ).first<{ n: number }>())!.n;
    const response = await SELF.fetch("https://x.com/api/pricing/rate-cards/import", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        source: "https://example.com/invalid.csv",
        effectiveFrom: "2026-07-01",
        currency: "USD",
        csv,
      }),
    });
    expect(response.status).toBe(400);
    const after = (await env.DB.prepare(
      "SELECT COUNT(*) n FROM pricing_rate_card_imports WHERE status='active'",
    ).first<{ n: number }>())!.n;
    expect(after).toBe(before);
  });

  it("persiste a moeda efetiva devolvida pelo analytics da Meta", async () => {
    const previousCurrency = await env.DB.prepare(
      "SELECT value FROM settings WHERE key='pricing_currency'",
    ).first<{ value: string }>();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO settings(key,value)VALUES('whatsapp_phone_id','11111') ON CONFLICT(key) DO UPDATE SET value='11111'",
      ),
      env.DB.prepare(
        "INSERT INTO settings(key,value)VALUES('whatsapp_waba_id','22222') ON CONFLICT(key) DO UPDATE SET value='22222'",
      ),
    ]);
    const previous = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
      currency: "USD", pricing_analytics: { data: [] },
    }), { status: 200 });
    try {
      const response = await SELF.fetch("https://x.com/api/pricing/analytics/sync", {
        method: "POST", headers: AUTH,
        body: JSON.stringify({ start: 100, end: 200, granularity: "DAILY" }),
      });
      expect(response.status).toBe(200);
      expect((await env.DB.prepare(
        "SELECT value FROM settings WHERE key='pricing_currency'",
      ).first<{ value: string }>())?.value).toBe("USD");
    } finally {
      globalThis.fetch = previous;
      if (previousCurrency)
        await env.DB.prepare(
          "INSERT INTO settings(key,value)VALUES('pricing_currency',?1) ON CONFLICT(key) DO UPDATE SET value=?1",
        ).bind(previousCurrency.value).run();
      else
        await env.DB.prepare("DELETE FROM settings WHERE key='pricing_currency'").run();
    }
  });

  it("preserva o menor tier_update_time em eventos duplicados ou fora de ordem", async () => {
    const key = crypto.randomUUID();
    const base = {
      wabaId: key,
      region: "BR",
      category: "UTILITY",
      effectiveMonth: "2026-07",
      tier: "0:1000",
      tierUpdateTime: 200,
    };
    expect(await pricingDb(env.DB).upsertTier(base)).toBe(true);
    expect(await pricingDb(env.DB).upsertTier({ ...base, tier: "1001:MAX", tierUpdateTime: 300 })).toBe(false);
    expect(await pricingDb(env.DB).upsertTier({ ...base, tier: "0:500", tierUpdateTime: 100 })).toBe(true);
    const stored = await env.DB.prepare(
      "SELECT tier,tier_update_time FROM pricing_tiers WHERE waba_id=?1",
    ).bind(key).first<{ tier: string; tier_update_time: number }>();
    expect(stored).toEqual({ tier: "0:500", tier_update_time: 100 });
  });

  it("torna analytics idempotente mesmo com dimensões nulas", async () => {
    const db = pricingDb(env.DB);
    const input = {
      wabaId: crypto.randomUUID(),
      granularity: "DAILY",
      currency: "BRL",
      points: [{
        start: 1,
        end: 2,
        country: null,
        pricingCategory: null,
        pricingType: null,
        tier: null,
        phoneNumber: null,
        volume: 1,
        cost: 0.1,
      }],
      raw: {},
    };
    await db.saveAnalyticsPoints(input);
    await db.saveAnalyticsPoints({ ...input, points: [{ ...input.points[0], volume: 2 }] });
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n,MAX(volume) AS volume FROM pricing_analytics_points WHERE waba_id=?1",
    ).bind(input.wabaId).first<{ n: number; volume: number }>();
    expect(row).toEqual({ n: 1, volume: 2 });
  });

  it("avisa sobre rate card do trimestre seguinte somente na janela de 35 dias", async () => {
    expect(nextQuarterStart(new Date("2026-07-16T00:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(await checkUpcomingRateCard(env, new Date("2026-07-16T00:00:00Z"))).toMatchObject({
      required: false,
      covered: true,
      effectiveFrom: "2026-10-01",
    });
    expect(await checkUpcomingRateCard(env, new Date("2026-09-01T00:00:00Z"))).toMatchObject({
      required: true,
      covered: false,
      effectiveFrom: "2026-10-01",
    });
  });

  it("confirma custo zero somente quando todos os envios têm pricing gratuito da Meta", async () => {
    const campaignId = crypto.randomUUID();
    const contactId = crypto.randomUUID();
    const messageId = `wamid.${crypto.randomUUID()}`;
    await env.DB.prepare(
      "INSERT INTO contacts(id,phone,status) VALUES(?1,?2,'opt_in')",
    ).bind(contactId, `+55${Math.floor(10_000_000_000 + Math.random() * 89_999_999_999)}`).run();
    await env.DB.prepare(
      "INSERT INTO campaigns(id,name,template_name,status,total,sent) VALUES(?1,'pricing','hello_world','sending',1,1)",
    ).bind(campaignId).run();
    await env.DB.prepare(
      `INSERT INTO campaign_contacts(campaign_id,contact_id,phone,status,message_id)
       SELECT ?1,?2,phone,'delivered',?3 FROM contacts WHERE id=?2`,
    ).bind(campaignId, contactId, messageId).run();
    const db = pricingDb(env.DB);
    expect(await db.reconcileCampaignCost(campaignId)).toMatchObject({ reconciled: false });
    await db.recordMessagePricing({
      messageId,
      campaignId,
      contactId,
      pricingType: "free_customer_service",
      pricingCategory: "SERVICE",
      currency: "BRL",
    });
    expect(await db.reconcileCampaignCost(campaignId)).toEqual({
      reconciled: true,
      amount: 0,
      currency: "BRL",
    });
    expect(await db.latestConfirmedCampaignCost(campaignId)).toMatchObject({
      state: "actual_from_meta",
      amount: 0,
      currency: "BRL",
      source: "meta_message_status_pricing",
    });
  });

  it("reconcilia o valor agregado do Pricing Analytics com uma campanha inequívoca", async () => {
    const campaignId = crypto.randomUUID();
    const contactId = crypto.randomUUID();
    const messageId = `wamid.${crypto.randomUUID()}`;
    const wabaId = crypto.randomUUID().replaceAll("-", "");
    const previousWaba = await env.DB.prepare(
      "SELECT value FROM settings WHERE key='whatsapp_waba_id'",
    ).first<{ value: string }>();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO settings(key,value)VALUES('whatsapp_waba_id',?1) ON CONFLICT(key) DO UPDATE SET value=?1",
      ).bind(wabaId),
      env.DB.prepare(
        "INSERT INTO contacts(id,phone,status) VALUES(?1,?2,'opt_in')",
      ).bind(contactId, `+55${Math.floor(10_000_000_000 + Math.random() * 89_999_999_999)}`),
      env.DB.prepare(
        "INSERT INTO campaigns(id,name,template_name,status,total,sent,created_at) VALUES(?1,'analytics','hello_world','completed',1,1,'2026-07-16 14:00:00')",
      ).bind(campaignId),
      env.DB.prepare(
        `INSERT INTO campaign_contacts(campaign_id,contact_id,phone,status,message_id)
         SELECT ?1,?2,phone,'delivered',?3 FROM contacts WHERE id=?2`,
      ).bind(campaignId, contactId, messageId),
      env.DB.prepare(
        `INSERT INTO pricing_analytics_points
         (id,waba_id,period_start,period_end,granularity,country,pricing_category,
          pricing_type,volume,cost,currency,raw_json)
         VALUES(?1,?2,?3,?4,'DAILY','BR','MARKETING','REGULAR',1,0.0625,'USD','{}')`,
      ).bind(
        crypto.randomUUID(), wabaId,
        Math.floor(Date.parse("2026-07-16T03:00:00Z") / 1_000),
        Math.floor(Date.parse("2026-07-17T03:00:00Z") / 1_000),
      ),
    ]);
    const db = pricingDb(env.DB);
    await db.recordMessagePricing({
      messageId,
      campaignId,
      contactId,
      pricingType: "regular",
      pricingCategory: "marketing",
      countryIso: "BR",
      currency: "BRL",
    });
    expect(await db.reconcilePendingCampaignCosts()).toMatchObject({
      scanned: 1,
      reconciled: 1,
      ambiguous: 0,
    });
    expect(await db.latestConfirmedCampaignCost(campaignId)).toMatchObject({
      state: "actual_from_meta",
      amount: 0.0625,
      currency: "USD",
      source: "meta_pricing_analytics",
    });
    expect(await env.DB.prepare(
      "SELECT state,amount,currency FROM message_cost_reconciliation WHERE message_id=?1",
    ).bind(messageId).first()).toEqual({
      state: "actual_from_meta",
      amount: 0.0625,
      currency: "USD",
    });
    if (previousWaba)
      await env.DB.prepare(
        "INSERT INTO settings(key,value)VALUES('whatsapp_waba_id',?1) ON CONFLICT(key) DO UPDATE SET value=?1",
      ).bind(previousWaba.value).run();
    else await env.DB.prepare("DELETE FROM settings WHERE key='whatsapp_waba_id'").run();
  });

  it("falha fechado em lote parcial e não ativa o rate card", async () => {
    const checksum = crypto.randomUUID();
    const rows = Array.from({ length: 60 }, (_, index) => ({
      source: "https://example.com/partial.csv",
      checksum,
      effectiveFrom: "2026-07-01",
      currency: "BRL",
      market: `Market ${index}`,
      countryIso: null,
      category: "UTILITY" as const,
      tierFrom: 0,
      tierTo: null,
      unitPrice: 0.03,
    }));
    rows[59] = { ...rows[58] };
    await expect(pricingDb(env.DB).importRateCards({
      source: "https://example.com/partial.csv",
      checksum,
      effectiveFrom: "2026-07-01",
      currency: "BRL",
      rows,
    })).rejects.toThrow();
    expect(await env.DB.prepare(
      "SELECT status FROM pricing_rate_card_imports WHERE checksum=?1",
    ).bind(checksum).first()).toEqual({ status: "failed" });
    expect((await env.DB.prepare(
      `SELECT COUNT(*) n FROM pricing_rate_cards r
       JOIN pricing_rate_card_imports i ON i.id=r.import_id
       WHERE i.checksum=?1 AND i.status='active'`,
    ).bind(checksum).first<{ n: number }>())?.n).toBe(0);
  });
});
