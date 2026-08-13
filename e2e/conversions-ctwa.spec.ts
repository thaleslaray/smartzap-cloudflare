import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function expectNoHorizontalOverflow(page: Page) {
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(width.document).toBeLessThanOrEqual(width.viewport + 2);
}

test("painel reconcilia mídia sem confundir agregado com match individual em desktop e mobile", async ({ page }) => {
  await page.route("**/api/conversions/reconciliation?days=*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      days: 30,
      state: "healthy",
      configuration: { adAccountConfigured: true, adAccountSuffix: "1098", graphVersion: "v26.0" },
      latestRun: { id: "run-e2e", status: "succeeded", error_detail: null, started_at: "2026-08-09 12:00:00", completed_at: "2026-08-09 12:00:01" },
      latestSuccessfulRun: { id: "run-e2e", status: "succeeded", insight_rows: 1, scope_start: "2026-05-12", scope_end: "2026-08-09", completed_at: "2026-08-09 12:00:01" },
      datasetQuality: { status: "not_applicable", detail: "Dataset Quality documenta métricas web; não é usado como EMQ do WhatsApp." },
      totals: [{
        currency: "BRL", spendMinor: 1073, impressions: 179, reach: 160,
        clicks: 8, inlineLinkClicks: 5, messagingConnections: 3,
        conversationsStarted: 3, leads: 1, qualifiedLeads: 0, purchases: 0,
        purchaseValueMinor: 0, costPerConversationMinor: 358, costPerLeadMinor: 1073,
        costPerQualifiedLeadMinor: null, costPerPurchaseMinor: null, roas: null,
      }],
      ads: [{
        campaignId: "120252848215600683", campaignName: "SmartZap — CANÁRIO CTWA",
        adsetId: "120252848215620683", adsetName: "CTWA controlado",
        adId: "120252848215610683", adName: "Criativo WhatsApp",
        currency: "BRL", firstDay: "2026-08-08", lastDay: "2026-08-08",
        fetchedAt: "2026-08-09 12:00:01", spendMinor: 1073, impressions: 179,
        reach: 160, clicks: 8, inlineLinkClicks: 5, messagingConnections: 3,
        conversationsStarted: 3, leads: 1, qualifiedLeads: 0, purchases: 0,
        purchaseValueMinor: 0, costPerConversationMinor: 358, costPerLeadMinor: 1073,
        costPerQualifiedLeadMinor: null, costPerPurchaseMinor: null, roas: null,
        smartZap: { conversations: 3, acceptedLeads: 1, acceptedQualifiedLeads: 0, acceptedPurchases: 0, informedPurchaseValueMinor: 0 },
      }],
      alerts: [],
    }),
  }));
  await login(page);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/analytics/conversions");
    await expect(page.getByRole("heading", { name: "Conversões de anúncios" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Visão geral" })).toBeVisible();
    await expect(page.getByText("R$ 10,73", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("3 Meta")).toBeVisible();
    await expect(page.getByText("1 aceitos pela API")).toBeVisible();
    await page.getByRole("tab", { name: "Diagnóstico Meta" }).click();
    await expect(page.getByText("Registrado pelo SmartZap")).toBeVisible();
    await expect(page.getByText("Aceito pela API da Meta", { exact: true })).toBeVisible();
    await expect(page.getByText("Matched individualmente")).toBeVisible();
    await expect(page.getByText("Atribuído individualmente")).toBeVisible();
    await expect(page.getByText("Leads atribuídos no agregado")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  const results = await new AxeBuilder({ page }).include("main").analyze();
  expect(results.violations).toEqual([]);
});

test("Inbox mostra origem mascarada e oferece ajuste sem apagar o fato original", async ({ page }) => {
  await login(page);
  await page.goto("/inbox/22222222-2222-4222-8222-222222222222");
  await expect(page.getByText("Anúncio", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Contexto e memória" }).click();
  await expect(page.getByText("Veio de anúncio Click-to-WhatsApp")).toBeVisible();
  await expect(page.getByText(/e2e-ctwa-click-id-private/)).toHaveCount(0);
  await expect(page.getByText(/Clique e2e-…vate/)).toBeVisible();
  await page.getByRole("button", { name: "Corrigir" }).click();
  await expect(page.getByRole("heading", { name: "Corrigir conversão" })).toBeVisible();
  await expect(page.getByText(/fato original continuará na trilha de auditoria/)).toBeVisible();
});

test("Inbox registra QualifiedLead e Purchase com valor e moeda no contrato local da interface", async ({ page }) => {
  const events: Array<Record<string, unknown>> = [];
  const submitted: Array<Record<string, unknown>> = [];
  await page.route(
    "**/api/conversions/conversations/22222222-2222-4222-8222-222222222222**",
    async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.url().endsWith("/events")) {
        const payload = request.postDataJSON() as Record<string, unknown>;
        submitted.push(payload);
        const item = {
          id: `77777777-7777-4777-8777-77777777777${submitted.length}`,
          event_id: `sz_e2e_${submitted.length}`,
          event_name: payload.eventName,
          event_time: 1_786_226_599,
          business_object_type: payload.businessObjectType,
          business_object_id: payload.businessObjectId,
          value_minor: payload.eventName === "Purchase"
            ? Math.round(Number(payload.value) * 100)
            : null,
          currency: payload.eventName === "Purchase" ? payload.currency : null,
          delivery_status: "pending",
          attempts: 0,
          last_error_detail: null,
          events_received: null,
          accepted_at: null,
          correction_of: null,
          lifecycle_status: "active",
          lifecycle_note: null,
          lifecycle_changed_at: null,
          cancel_reason: null,
          cancelled_at: null,
          match_status: "unknown",
          attribution_status: "unknown",
        };
        events.push(item);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ created: true, queued: true, recovery: null, item }),
        });
        return;
      }
      if (request.method() === "GET") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            attributions: [{
              id: "88888888-8888-4888-8888-888888888888",
              conversation_id: "22222222-2222-4222-8222-222222222222",
              attribution_kind: "ctwa",
              source_id: "120000000001",
              source_type: "ad",
              source_url: "https://facebook.com/ads/e2e",
              occurred_at: 1_786_226_599,
              captured_at: "2026-08-08T22:03:19.000Z",
              has_click_id: true,
              click_id_masked: "e2e-…vate",
            }],
            events,
          }),
        });
        return;
      }
      await route.continue();
    },
  );

  await login(page);
  await page.goto("/inbox/22222222-2222-4222-8222-222222222222");

  const openConversion = async () => {
    await page.getByRole("button", { name: "Mais ações" }).click();
    await page.getByRole("menuitem", { name: "Registrar conversão" }).click();
    await expect(page.getByRole("heading", { name: "Registrar conversão na Meta" })).toBeVisible();
  };

  await openConversion();
  await page.getByLabel("Evento").selectOption("QualifiedLead");
  await page.getByLabel("Identificador no seu negócio").fill("opportunity-e2e-001");
  const qualifiedResponse = page.waitForResponse((response) =>
    response.url().endsWith("/events") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Confirmar registro" }).click();
  expect((await qualifiedResponse).status()).toBe(201);

  await openConversion();
  await page.getByLabel("Evento").selectOption("Purchase");
  await page.getByLabel("Identificador no seu negócio").fill("order-e2e-001");
  const confirmPurchase = page.getByRole("button", { name: "Confirmar registro" });
  await expect(confirmPurchase).toBeDisabled();
  await page.getByLabel("Valor").fill("10,00");
  await page.getByLabel("Moeda").fill("BRL");
  await expect(confirmPurchase).toBeEnabled();
  const purchaseResponse = page.waitForResponse((response) =>
    response.url().endsWith("/events") && response.request().method() === "POST",
  );
  await confirmPurchase.click();
  expect((await purchaseResponse).status()).toBe(201);

  await page.getByRole("button", { name: "Contexto e memória" }).click();
  await expect(page.getByText("Lead qualificado", { exact: true })).toBeVisible();
  await expect(page.getByText("Compra", { exact: true })).toBeVisible();
  expect(submitted).toHaveLength(2);
  expect(submitted[0]).toMatchObject({
    eventName: "QualifiedLead",
    businessObjectType: "opportunity",
    businessObjectId: "opportunity-e2e-001",
  });
  expect(submitted[1]).toMatchObject({
    eventName: "Purchase",
    businessObjectType: "order",
    businessObjectId: "order-e2e-001",
    value: 10,
    currency: "BRL",
  });
});

test("assistente só oferece canário real após os pré-requisitos", async ({ page }) => {
  await page.route("**/api/settings/health", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      databaseOk: true,
      metaConfigured: true,
      metaLive: true,
      webhookConfigured: true,
      webhookSecretsConfigured: true,
      templatesConfigured: true,
      approvedTemplates: 3,
      readyForPilot: true,
      meta: {
        verificationStatus: "complete",
        retryable: false,
        code: null,
        tokenValid: true,
        tokenAppMatches: true,
        tokenRequiredScopesPresent: true,
        phoneBelongsToWaba: true,
        effectiveWebhookCallbackMatches: true,
        appWebhookMessagesSubscribed: true,
        appWebhookRequiredFieldsPresent: true,
        appWebhookMissingFields: [],
        qualityRating: "GREEN",
        messagingLimit: "1000",
        throughputLevel: "STANDARD",
        throughputMps: 80,
        phoneStatus: "CONNECTED",
        error: null,
        fbtraceId: null,
      },
    }),
  }));
  await page.route("**/api/conversions/diagnostics", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      enabled: false,
      ready: false,
      technicalPrerequisitesReady: true,
      prerequisitesReady: true,
      verificationStatus: "complete",
      graphVersion: "v26.0",
      wabaId: "22222",
      permissions: {
        whatsappBusinessManagement: true,
        whatsappBusinessManageEvents: true,
        marketingAccessConfirmed: true,
        operatingMode: "direct",
        ownBusinessDataConfirmed: true,
        advancedAccessRequired: false,
        manageEventsAdvancedAccessConfirmed: false,
      },
      dataset: { status: "found", id: "555555555555555", storedId: "555555555555555", verified: true },
      canary: { eventId: null, status: null, accepted: false, acceptedAt: null },
      meta: { live: true, retryable: false, error: null },
      message: "Execute e confirme o evento controlado antes de ativar conversões.",
    }),
  }));
  await page.route("**/api/conversions/canary-candidates", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [{
      id: "88888888-8888-4888-8888-888888888888",
      conversation_id: "22222222-2222-4222-8222-222222222222",
      attribution_kind: "ctwa",
      source_id: "120000000001",
      source_type: "ad",
      source_url: "https://facebook.com/ads/e2e",
      occurred_at: Math.floor(Date.now() / 1000),
      captured_at: new Date().toISOString(),
      has_click_id: true,
      click_id_masked: "e2e-…vate",
    }] }),
  }));
  await login(page);
  await page.goto("/settings/meta-diagnostics");
  await expect(page.getByText("Evento controlado real")).toBeVisible();
  const candidate = page.getByLabel("Conversa CTWA para o evento controlado");
  await candidate.selectOption({ index: 1 });
  await expect(page.getByRole("button", { name: "Enviar evento controlado" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Ativar conversões" })).toBeDisabled();
});
