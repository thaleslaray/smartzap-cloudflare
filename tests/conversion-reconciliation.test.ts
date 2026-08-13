import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileMetaConversions } from "../src/cron/conversion-reconciliation";
import { conversionReconciliationDb } from "../src/db/conversion-reconciliation";
import { conversionsDb } from "../src/db/conversions";
import { settingsDb } from "../src/db/settings";

const NOW = Date.parse("2026-08-09T12:00:00Z");
const AD_ID = "120252848215610683";

function insightsResponse() {
  return Response.json({ data: [{
    account_currency: "BRL",
    campaign_id: "120252848215600683",
    campaign_name: "SmartZap — CANÁRIO CTWA",
    adset_id: "120252848215620683",
    adset_name: "CTWA controlado",
    ad_id: AD_ID,
    ad_name: "SmartZap — Criativo teste",
    date_start: "2026-08-08",
    date_stop: "2026-08-08",
    spend: "10.73",
    impressions: "179",
    reach: "160",
    clicks: "8",
    inline_link_clicks: "5",
    actions: [
      { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "3" },
      { action_type: "onsite_conversion.lead", value: "1" },
    ],
  }] });
}

async function localAcceptedLead() {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8).replace(/\D/g, "7");
  const contactId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO contacts(id,phone,wa_id,status) VALUES(?1,?2,?3,'unknown')",
    ).bind(contactId, `+55119${suffix.padEnd(8, "7")}`, `wa-${crypto.randomUUID()}`),
    env.DB.prepare(
      "INSERT INTO conversations(id,contact_id,wa_id) VALUES(?1,?2,?3)",
    ).bind(conversationId, contactId, `wa-${crypto.randomUUID()}`),
  ]);
  const attribution = await conversionsDb(env.DB).upsertAttribution({
    conversationId,
    wabaId: "22222",
    phoneNumberId: "11111",
    sourceMessageId: `wamid.reconcile.${crypto.randomUUID()}`,
    ctwaClid: `clid-${crypto.randomUUID()}`,
    sourceId: AD_ID,
    sourceType: "ad",
    occurredAt: Math.floor(NOW / 1000) - 600,
  });
  const event = await conversionsDb(env.DB).createEvent({
    conversationId,
    datasetId: "555555555555555",
    createdBy: "test",
    payload: {
      requestKey: crypto.randomUUID(),
      attributionId: attribution.id,
      eventName: "LeadSubmitted",
      businessObjectType: "lead",
      businessObjectId: `lead-${crypto.randomUUID()}`,
      eventTime: Math.floor(NOW / 1000) - 300,
    },
  });
  await env.DB.prepare(
    `UPDATE conversion_outbox SET status='accepted',events_received=1,
      accepted_at=datetime('now') WHERE event_id=?1`,
  ).bind(String(event.item.id)).run();
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM conversion_ad_insights"),
    env.DB.prepare("DELETE FROM conversion_reconciliation_runs"),
  ]);
  await settingsDb(env.DB).set("capi_dataset_id", "555555555555555");
  await settingsDb(env.DB).set("whatsapp_phone_id", "11111");
  await settingsDb(env.DB).set("whatsapp_waba_id", "22222");
});

afterEach(() => vi.unstubAllGlobals());

describe("reconciliação de conversões Meta", () => {
  it("persiste um retrato agregado e compara Ads Insights com fatos locais", async () => {
    await localAcceptedLead();
    const result = await reconcileMetaConversions(env, {
      trigger: "test",
      force: true,
      now: NOW,
      fetcher: async (input, init) => {
        expect(String(input)).not.toContain("test-whatsapp-token");
        expect(init?.headers).toEqual({ authorization: "Bearer test-whatsapp-token" });
        return insightsResponse();
      },
    });
    expect(result).toMatchObject({ status: "succeeded", rows: 1, pages: 1 });

    const summary = await conversionReconciliationDb(env.DB).summary(30);
    expect(summary.providerTotals[0]).toMatchObject({
      currency: "BRL",
      spend_minor: 1073,
      conversations_started: 3,
      leads: 1,
    });
    expect(summary.localAttributions).toContainEqual(expect.objectContaining({
      ad_id: AD_ID,
      conversations: 1,
    }));
    expect(summary.localEvents).toContainEqual(expect.objectContaining({
      ad_id: AD_ID,
      event_name: "LeadSubmitted",
      accepted: 1,
    }));
    const persisted = await env.DB.prepare(
      `SELECT r.ad_account_id,r.dataset_id,i.action_types_json
       FROM conversion_reconciliation_runs r
       JOIN conversion_ad_insights i ON i.run_id=r.id
       WHERE r.id=?1`,
    ).bind(result.runId).first();
    expect(JSON.stringify(persisted)).not.toContain("test-whatsapp-token");
    expect(JSON.stringify(persisted)).not.toContain("clid-");

    const response = await SELF.fetch("https://x.com/api/conversions/reconciliation?days=30", {
      headers: { "x-api-key": "dev-api-key" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: "healthy",
      datasetQuality: { status: "not_applicable" },
      totals: [{ spendMinor: 1073, conversationsStarted: 3, leads: 1, costPerLeadMinor: 1073 }],
      ads: [{
        adId: AD_ID,
        smartZap: { conversations: 1, acceptedLeads: 1 },
      }],
    });
  });

  it("preserva o último retrato válido quando a Meta falha e respeita o throttle", async () => {
    const success = await reconcileMetaConversions(env, {
      trigger: "test",
      force: true,
      now: NOW,
      fetcher: async () => insightsResponse(),
    });
    expect(success.status).toBe("succeeded");

    const throttled = await reconcileMetaConversions(env, {
      trigger: "cron",
      now: NOW + 60 * 60 * 1000,
      fetcher: async () => { throw new Error("não deveria consultar"); },
    });
    expect(throttled).toMatchObject({ status: "skipped", reason: "throttled" });

    const failed = await reconcileMetaConversions(env, {
      trigger: "test",
      force: true,
      now: NOW + 2 * 60 * 60 * 1000,
      fetcher: async () => Response.json({
        error: { code: 613, message: "Rate limit" },
      }, { status: 429 }),
    });
    expect(failed).toMatchObject({ status: "failed", retryable: true });

    const summary = await conversionReconciliationDb(env.DB).summary(30);
    expect(summary.latestRun?.status).toBe("failed");
    expect(summary.latestSuccessfulRun?.id).toBe(success.runId);
    expect(summary.providerTotals[0]).toMatchObject({ spend_minor: 1073 });
  });

  it("oferece sincronização manual autenticada e confirmada", async () => {
    vi.stubGlobal("fetch", async () => insightsResponse());
    const missingConfirmation = await SELF.fetch(
      "https://x.com/api/conversions/reconciliation/sync",
      {
        method: "POST",
        headers: { "x-api-key": "dev-api-key", "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(missingConfirmation.status).toBe(400);

    const response = await SELF.fetch("https://x.com/api/conversions/reconciliation/sync", {
      method: "POST",
      headers: { "x-api-key": "dev-api-key", "content-type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      status: "succeeded",
      rows: 1,
      pages: 1,
    });
  });
});
