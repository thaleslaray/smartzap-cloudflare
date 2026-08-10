import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { conversionsDb } from "../src/db/conversions";
import { settingsDb } from "../src/db/settings";
import { handleConversionQueueMessage } from "../src/queue/conversion-consumer";
import { isConversionQueue, processConversionMessages } from "../src";

async function fixture() {
  const contactId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const messageId = `wamid.ctwa.${crypto.randomUUID()}`;
  const attributionId = crypto.randomUUID();
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const phone = `+55119${suffix.replace(/[^0-9]/g, "1").padEnd(8, "1").slice(0, 8)}`;
  const waId = phone.slice(1);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO contacts(id,phone,wa_id,status) VALUES(?1,?2,?3,'unknown')`,
    ).bind(contactId, phone, waId),
    env.DB.prepare(
      `INSERT INTO conversations(id,contact_id,wa_id) VALUES(?1,?2,?3)`,
    ).bind(conversationId, contactId, waId),
  ]);
  const attribution = await conversionsDb(env.DB).upsertAttribution({
    conversationId,
    wabaId: "22222",
    phoneNumberId: "11111",
    sourceMessageId: messageId,
    ctwaClid: `clid-${crypto.randomUUID()}`,
    sourceId: "120000000001",
    sourceType: "ad",
    sourceUrl: "https://facebook.com/ads/example",
    occurredAt: Math.floor(Date.now() / 1000),
  });
  expect(attribution.id).toBeTruthy();
  return { conversationId, attributionId: attribution.id };
}

async function createLead() {
  const item = await fixture();
  const created = await conversionsDb(env.DB).createEvent({
    conversationId: item.conversationId,
    datasetId: "555555555555555",
    createdBy: "test",
    payload: {
      requestKey: crypto.randomUUID(),
      attributionId: item.attributionId,
      eventName: "LeadSubmitted",
      businessObjectType: "lead",
      businessObjectId: `lead-${crypto.randomUUID()}`,
      eventTime: Math.floor(Date.now() / 1000),
    },
  });
  return { ...item, created };
}

afterEach(() => vi.unstubAllGlobals());

describe("persistência e entrega de conversões", () => {
  it("roteia a Queue dedicada e respeita ack/retry por mensagem", async () => {
    expect(isConversionQueue({ CAPI_QUEUE_NAME: "meta-conversions-staging" }, "meta-conversions-staging")).toBe(true);
    expect(isConversionQueue({}, "meta-conversions")).toBe(true);
    const ack = vi.fn();
    const retry = vi.fn();
    await processConversionMessages([{
      body: { kind: "conversion_delivery", eventId: crypto.randomUUID() },
      attempts: 2,
      ack,
      retry,
    }], env, async () => ({ action: "retry", delaySeconds: 40 }));
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 40 });
    expect(ack).not.toHaveBeenCalled();
  });

  it("é idempotente por request e por fato comercial sem expor ctwa_clid", async () => {
    const item = await fixture();
    const requestKey = crypto.randomUUID();
    const payload = {
      requestKey,
      attributionId: item.attributionId,
      eventName: "Purchase" as const,
      businessObjectType: "order" as const,
      businessObjectId: `order-${crypto.randomUUID()}`,
      value: 199.9,
      currency: "brl",
      eventTime: Math.floor(Date.now() / 1000),
    };
    const first = await conversionsDb(env.DB).createEvent({
      conversationId: item.conversationId,
      datasetId: "555555555555555",
      createdBy: "test",
      payload,
    });
    const sameRequest = await conversionsDb(env.DB).createEvent({
      conversationId: item.conversationId,
      datasetId: "555555555555555",
      createdBy: "test",
      payload,
    });
    const sameFact = await conversionsDb(env.DB).createEvent({
      conversationId: item.conversationId,
      datasetId: "555555555555555",
      createdBy: "test",
      payload: { ...payload, requestKey: crypto.randomUUID() },
    });
    expect(first.created).toBe(true);
    expect(sameRequest.created).toBe(false);
    expect(sameFact.created).toBe(false);
    expect(first.item.id).toBe(sameFact.item.id);

    const attributions = await conversionsDb(env.DB).listAttributions(item.conversationId);
    expect(attributions).toEqual([expect.objectContaining({
      attribution_kind: "ctwa",
      has_click_id: true,
      click_id_masked: expect.stringContaining("…"),
    })]);
    expect(JSON.stringify(attributions)).not.toContain("ctwa_clid");
    const outbox = await env.DB.prepare(
      "SELECT status,attempts FROM conversion_outbox WHERE event_id=?1",
    ).bind(String(first.item.id)).first();
    expect(outbox).toEqual({ status: "pending", attempts: 0 });
  });

  it("preserva múltiplos cliques distintos na mesma conversa sem colapsar touchpoints", async () => {
    const item = await fixture();
    const second = await conversionsDb(env.DB).upsertAttribution({
      conversationId: item.conversationId,
      wabaId: "22222",
      phoneNumberId: "11111",
      sourceMessageId: `wamid.ctwa.${crypto.randomUUID()}`,
      ctwaClid: `clid-${crypto.randomUUID()}`,
      sourceId: "120000000002",
      sourceType: "ad",
      occurredAt: Math.floor(Date.now() / 1000) + 1,
    });

    const publicRows = await conversionsDb(env.DB).listAttributions(item.conversationId);
    expect(publicRows).toHaveLength(2);
    expect(publicRows[0]).toMatchObject({
      id: second.id,
      attribution_kind: "ctwa",
      has_click_id: true,
    });
    expect(publicRows.every((row) => row.click_id_masked?.includes("…") === true)).toBe(true);
    expect(JSON.stringify(publicRows)).not.toContain("ctwa_clid");

    const integrity = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
              COUNT(DISTINCT source_message_id) AS messages,
              COUNT(DISTINCT ctwa_clid) AS clicks
       FROM conversation_attributions WHERE conversation_id=?1`,
    ).bind(item.conversationId).first<Record<string, number>>();
    expect(integrity).toEqual({ total: 2, messages: 2, clicks: 2 });
  });

  it("registra referral sem click ID como origem não atribuível e impede CAPI", async () => {
    const contactId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO contacts(id,phone,wa_id,status) VALUES(?1,?2,?3,'unknown')`,
      ).bind(contactId, "+5511999999001", `wa-${crypto.randomUUID()}`),
      env.DB.prepare(
        `INSERT INTO conversations(id,contact_id,wa_id) VALUES(?1,?2,?3)`,
      ).bind(conversationId, contactId, `wa-${crypto.randomUUID()}`),
    ]);
    const attribution = await conversionsDb(env.DB).upsertAttribution({
      conversationId,
      wabaId: "22222",
      phoneNumberId: "11111",
      sourceMessageId: `wamid.referral.${crypto.randomUUID()}`,
      sourceId: "status-or-organic-referral",
      sourceType: "post",
      occurredAt: Math.floor(Date.now() / 1000),
    });

    expect(await conversionsDb(env.DB).listAttributions(conversationId)).toEqual([
      expect.objectContaining({
        id: attribution.id,
        attribution_kind: "referral_without_click_id",
        has_click_id: false,
        click_id_masked: null,
      }),
    ]);
    await expect(conversionsDb(env.DB).createEvent({
      conversationId,
      datasetId: "555555555555555",
      createdBy: "test",
      payload: {
        requestKey: crypto.randomUUID(),
        attributionId: attribution.id,
        eventName: "LeadSubmitted",
        businessObjectType: "lead",
        businessObjectId: `lead-${crypto.randomUUID()}`,
      },
    })).rejects.toThrow("não possui ctwa_clid");
  });

  it("rejeita o mesmo click ID reaparecendo em outra mensagem", async () => {
    const item = await fixture();
    const raw = await env.DB.prepare(
      `SELECT ctwa_clid FROM conversation_attributions WHERE id=?1`,
    ).bind(item.attributionId).first<{ ctwa_clid: string }>();
    await expect(conversionsDb(env.DB).upsertAttribution({
      conversationId: item.conversationId,
      wabaId: "22222",
      phoneNumberId: "11111",
      sourceMessageId: `wamid.replay.${crypto.randomUUID()}`,
      ctwaClid: raw?.ctwa_clid,
      sourceId: "120000000001",
      sourceType: "ad",
      occurredAt: Math.floor(Date.now() / 1000) + 1,
    })).rejects.toThrow("reapareceu em outra mensagem");
    expect((await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM conversation_attributions WHERE conversation_id=?1`,
    ).bind(item.conversationId).first<{ total: number }>())?.total).toBe(1);
  });

  it("recusa semântica inválida e atribuição de outra conversa", async () => {
    const first = await fixture();
    const second = await fixture();
    await expect(conversionsDb(env.DB).createEvent({
      conversationId: second.conversationId,
      datasetId: "555555555555555",
      createdBy: "test",
      payload: {
        requestKey: crypto.randomUUID(),
        attributionId: first.attributionId,
        eventName: "LeadSubmitted",
        businessObjectType: "lead",
        businessObjectId: "lead-cross-conversation",
      },
    })).rejects.toThrow("não pertence a esta conversa");
  });

  it("preserva o fato original ao cancelar e cria correção somente depois do cancelamento seguro", async () => {
    const { conversationId, attributionId, created } = await createLead();
    const eventId = String(created.item.id);
    const cancelled = await conversionsDb(env.DB).cancelEvent({
      conversationId,
      eventId,
      reason: "Identificador comercial informado incorretamente",
    });
    expect(cancelled.cancelled).toBe(true);
    const original = await env.DB.prepare(
      `SELECT e.lifecycle_status,e.business_object_id,o.status,o.cancel_reason
       FROM conversion_events e JOIN conversion_outbox o ON o.event_id=e.id
       WHERE e.id=?1`,
    ).bind(eventId).first<Record<string, unknown>>();
    expect(original).toMatchObject({
      lifecycle_status: "cancelled",
      status: "cancelled",
      cancel_reason: "Identificador comercial informado incorretamente",
    });

    const correction = await conversionsDb(env.DB).createEvent({
      conversationId,
      datasetId: "555555555555555",
      createdBy: "test",
      payload: {
        requestKey: crypto.randomUUID(),
        attributionId,
        eventName: "LeadSubmitted",
        businessObjectType: "lead",
        businessObjectId: String(original?.business_object_id),
        correctionOf: eventId,
      },
    });
    expect(correction.created).toBe(true);
    expect(correction.item).toMatchObject({ correction_of: eventId, lifecycle_status: "active" });
    expect(correction.item.id).not.toBe(eventId);
  });

  it("confirma events_received=1 e fecha a outbox como aceita", async () => {
    const { created } = await createLead();
    const settings = settingsDb(env.DB);
    await Promise.all([
      settings.set("whatsapp_phone_id", "11111"),
      settings.set("whatsapp_waba_id", "22222"),
      settings.set("capi_enabled", "true"),
      settings.set("capi_dataset_id", "555555555555555"),
      settings.set("capi_dataset_verified_waba_id", "22222"),
    ]);
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.data[0]).toMatchObject({
        event_name: "LeadSubmitted",
        action_source: "business_messaging",
        messaging_channel: "whatsapp",
      });
      return Response.json({ events_received: 1, fbtrace_id: "TRACE_ACCEPTED" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(handleConversionQueueMessage({
      kind: "conversion_delivery",
      eventId: String(created.item.id),
    }, env, 1)).resolves.toEqual({ action: "ack" });
    const outbox = await env.DB.prepare(
      `SELECT status,attempts,events_received,fbtrace_id,accepted_at
       FROM conversion_outbox WHERE event_id=?1`,
    ).bind(String(created.item.id)).first<Record<string, unknown>>();
    expect(outbox).toMatchObject({
      status: "accepted",
      attempts: 1,
      events_received: 1,
      fbtrace_id: "TRACE_ACCEPTED",
    });
    expect(outbox?.accepted_at).toBeTruthy();
  });

  it("expõe somente os três eventos suportados pela API e enfileira após commit", async () => {
    const item = await fixture();
    const settings = settingsDb(env.DB);
    await Promise.all([
      settings.set("whatsapp_phone_id", "11111"),
      settings.set("whatsapp_waba_id", "22222"),
      settings.set("capi_enabled", "true"),
      settings.set("capi_dataset_id", "555555555555555"),
      settings.set("capi_dataset_verified_waba_id", "22222"),
    ]);
    const send = vi.spyOn(env.CAPI_QUEUE, "send");
    try {
      const invalid = await SELF.fetch(
        `https://x.com/api/conversions/conversations/${item.conversationId}/events`,
        {
          method: "POST",
          headers: { "x-api-key": "dev-api-key", "content-type": "application/json" },
          body: JSON.stringify({
            requestKey: crypto.randomUUID(),
            attributionId: item.attributionId,
            eventName: "AddToCart",
            businessObjectType: "order",
            businessObjectId: "cart-1",
          }),
        },
      );
      expect(invalid.status).toBe(400);
      const response = await SELF.fetch(
        `https://x.com/api/conversions/conversations/${item.conversationId}/events`,
        {
          method: "POST",
          headers: { "x-api-key": "dev-api-key", "content-type": "application/json" },
          body: JSON.stringify({
            requestKey: crypto.randomUUID(),
            attributionId: item.attributionId,
            eventName: "QualifiedLead",
            businessObjectType: "opportunity",
            businessObjectId: `opportunity-${crypto.randomUUID()}`,
          }),
        },
      );
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ created: true, queued: true });
      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0]).toMatchObject({
        kind: "conversion_delivery",
        eventId: expect.any(String),
      });
    } finally {
      send.mockRestore();
    }
  });

  it("distingue WABA própria de operação parceira e só ativa após Dataset, Access Tier e canário real", async () => {
    const item = await fixture();
    const settings = settingsDb(env.DB);
    await Promise.all([
      settings.set("whatsapp_phone_id", "11111"),
      settings.set("whatsapp_waba_id", "22222"),
      settings.set("capi_enabled", "false"),
      settings.delete("capi_dataset_id"),
      settings.delete("capi_dataset_verified_waba_id"),
      settings.delete("capi_marketing_access_confirmed"),
      settings.delete("capi_operating_mode"),
      settings.delete("capi_own_business_data_confirmed"),
      settings.delete("capi_manage_events_advanced_access_confirmed"),
      settings.delete("capi_canary_event_id"),
      settings.delete("capi_canary_accepted_at"),
      settings.delete("capi_canary_dataset_id"),
      settings.delete("capi_canary_waba_id"),
    ]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/debug_token")) return Response.json({ data: {
        app_id: "123456789",
        is_valid: true,
        scopes: [
          "whatsapp_business_management",
          "whatsapp_business_messaging",
          "whatsapp_business_manage_events",
        ],
      } });
      if (url.includes("/123456789/subscriptions")) return Response.json({ data: [{
        object: "whatsapp_business_account",
        active: true,
        fields: [{ name: "messages" }],
      }] });
      if (url.includes("/22222/subscribed_apps")) return Response.json({ data: [{
        whatsapp_business_api_data: { id: "123456789" },
        override_callback_uri: "https://worker.example/webhook",
      }] });
      if (url.includes("/22222/phone_numbers"))
        return Response.json({ data: [{ id: "11111" }] });
      if (url.includes("/22222/dataset"))
        return Response.json({ data: [{ id: "555555555555555" }] });
      if (url.includes("/555555555555555/events"))
        return Response.json({ events_received: 1, fbtrace_id: "TRACE_CANARY" });
      if (url.includes("/11111?")) return Response.json({
        id: "11111",
        status: "CONNECTED",
        platform_type: "CLOUD_API",
        account_mode: "LIVE",
        quality_rating: "GREEN",
        code_verification_status: "VERIFIED",
        // O callback pode continuar em produção enquanto o staging homologa a
        // CAPI. A saúde de uma integração não deve bloquear a outra.
        webhook_configuration: { application: "https://production.example/webhook" },
      });
      if (url.includes("/22222?")) return Response.json({ id: "22222" });
      throw new Error(`fetch não previsto: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const before = await SELF.fetch("https://x.com/api/conversions/diagnostics", {
      headers: { "x-api-key": "dev-api-key" },
    });
    expect(before.status).toBe(200);
    expect(await before.json()).toMatchObject({
      enabled: false,
      ready: false,
      permissions: {
        whatsappBusinessManagement: true,
        whatsappBusinessManageEvents: true,
        marketingAccessConfirmed: false,
        operatingMode: null,
        ownBusinessDataConfirmed: false,
        advancedAccessRequired: null,
        manageEventsAdvancedAccessConfirmed: false,
      },
      technicalPrerequisitesReady: false,
      prerequisitesReady: false,
      dataset: { status: "found", id: "555555555555555", verified: false },
      message: expect.stringContaining("Dataset"),
    });

    const missingOperatingMode = await SELF.fetch("https://x.com/api/conversions/activation", {
      method: "PUT",
      headers: { "x-api-key": "dev-api-key", "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        confirm: true,
        marketingAccessConfirmed: true,
      }),
    });
    expect(missingOperatingMode.status).toBe(400);

    const premature = await SELF.fetch("https://x.com/api/conversions/activation", {
      method: "PUT",
      headers: { "x-api-key": "dev-api-key", "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        confirm: true,
        marketingAccessConfirmed: true,
        operatingMode: "direct",
        ownBusinessDataConfirmed: true,
      }),
    });
    expect(premature.status).toBe(409);

    const verifiedDataset = await SELF.fetch("https://x.com/api/conversions/dataset", {
      method: "POST",
      headers: { "x-api-key": "dev-api-key", "content-type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    expect(verifiedDataset.status).toBe(200);

    const technicallyReady = await SELF.fetch("https://x.com/api/conversions/diagnostics", {
      headers: { "x-api-key": "dev-api-key" },
    });
    expect(await technicallyReady.json()).toMatchObject({
      technicalPrerequisitesReady: true,
      prerequisitesReady: false,
      permissions: {
        whatsappBusinessManageEvents: true,
        operatingMode: null,
        advancedAccessRequired: null,
        manageEventsAdvancedAccessConfirmed: false,
      },
      message: expect.stringContaining("WABA própria"),
    });

    const partnerWithoutAdvanced = await SELF.fetch("https://x.com/api/conversions/canary", {
      method: "POST",
      headers: { "x-api-key": "dev-api-key", "content-type": "application/json" },
      body: JSON.stringify({
        confirm: true,
        marketingAccessConfirmed: true,
        operatingMode: "partner",
        conversationId: item.conversationId,
        attributionId: item.attributionId,
      }),
    });
    expect(partnerWithoutAdvanced.status).toBe(400);

    const canary = await SELF.fetch("https://x.com/api/conversions/canary", {
      method: "POST",
      headers: { "x-api-key": "dev-api-key", "content-type": "application/json" },
      body: JSON.stringify({
        confirm: true,
        marketingAccessConfirmed: true,
        operatingMode: "direct",
        ownBusinessDataConfirmed: true,
        conversationId: item.conversationId,
        attributionId: item.attributionId,
      }),
    });
    expect(canary.status).toBe(202);
    const canaryBody = await canary.json<{ eventId: string }>();
    await expect(handleConversionQueueMessage({
      kind: "conversion_delivery",
      eventId: canaryBody.eventId,
    }, env, 1)).resolves.toEqual({ action: "ack" });

    const activated = await SELF.fetch("https://x.com/api/conversions/activation", {
      method: "PUT",
      headers: { "x-api-key": "dev-api-key", "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        confirm: true,
        marketingAccessConfirmed: true,
        operatingMode: "direct",
        ownBusinessDataConfirmed: true,
      }),
    });
    expect(activated.status).toBe(200);
    expect(await activated.json()).toEqual({ ok: true, enabled: true });

    const after = await SELF.fetch("https://x.com/api/conversions/diagnostics", {
      headers: { "x-api-key": "dev-api-key" },
    });
    expect(await after.json()).toMatchObject({
      enabled: true,
      ready: true,
      dataset: { verified: true },
      canary: { accepted: true, status: "accepted" },
      permissions: {
        marketingAccessConfirmed: true,
        operatingMode: "direct",
        ownBusinessDataConfirmed: true,
        advancedAccessRequired: false,
        manageEventsAdvancedAccessConfirmed: false,
      },
    });
  });
});
