import { Hono } from "hono";
import { z } from "zod";
import { conversationsDb } from "../db/conversations";
import { conversionsDb } from "../db/conversions";
import { conversionReconciliationDb } from "../db/conversion-reconciliation";
import { settingsDb } from "../db/settings";
import { ConversionEventInputSchema } from "../domain/conversions";
import { getCredentials } from "../whatsapp/credentials";
import { businessMessagingCapi } from "../whatsapp/conversions";
import { probeMeta } from "../whatsapp/health";
import { readJsonBody } from "./body";
import type { ConversionQueueEvent } from "../queue/conversion-consumer";
import { reconcileMetaConversions } from "../cron/conversion-reconciliation";

const ConversationIdSchema = z.string().uuid();
const EventIdSchema = z.string().uuid();
const DatasetMutationSchema = z.object({ confirm: z.literal(true) }).strict();
const CancelEventSchema = z.object({
  confirm: z.literal(true),
  reason: z.string().trim().min(3).max(500),
}).strict();
const CanaryBase = {
  confirm: z.literal(true),
  marketingAccessConfirmed: z.literal(true),
  conversationId: z.string().uuid(),
  attributionId: z.string().uuid(),
};
const CanarySchema = z.discriminatedUnion("operatingMode", [
  z.object({
    ...CanaryBase,
    operatingMode: z.literal("direct"),
    ownBusinessDataConfirmed: z.literal(true),
  }).strict(),
  z.object({
    ...CanaryBase,
    operatingMode: z.literal("partner"),
    manageEventsAdvancedAccessConfirmed: z.literal(true),
  }).strict(),
]);
const ActivationSchema = z.union([
  z.object({ enabled: z.literal(false) }).strict(),
  z.object({
    enabled: z.literal(true),
    confirm: z.literal(true),
    marketingAccessConfirmed: z.literal(true),
    operatingMode: z.literal("direct"),
    ownBusinessDataConfirmed: z.literal(true),
  }).strict(),
  z.object({
    enabled: z.literal(true),
    confirm: z.literal(true),
    marketingAccessConfirmed: z.literal(true),
    operatingMode: z.literal("partner"),
    manageEventsAdvancedAccessConfirmed: z.literal(true),
  }).strict(),
]);
const SummaryQuerySchema = z.coerce.number().int().refine(
  (value): value is 7 | 30 | 90 => [7, 30, 90].includes(value),
  "período inválido",
);
const ReconciliationMutationSchema = z.object({ confirm: z.literal(true) }).strict();

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function unitCost(spendMinor: number, resultCount: number) {
  return resultCount > 0 ? Math.round(spendMinor / resultCount) : null;
}

async function reconciliationView(env: Env, days: 7 | 30 | 90) {
  const raw = await conversionReconciliationDb(env.DB).summary(days);
  const localAttributions = new Map(
    raw.localAttributions.map((row) => {
      const item = row as Record<string, unknown>;
      return [asString(item.ad_id), asNumber(item.conversations)] as const;
    }),
  );
  const localEvents = new Map<string, {
    lead: number;
    qualified: number;
    purchase: number;
    purchaseValueMinor: number;
    latestEventAt: number;
  }>();
  for (const row of raw.localEvents) {
    const item = row as Record<string, unknown>;
    const adId = asString(item.ad_id);
    const current = localEvents.get(adId) ?? {
      lead: 0,
      qualified: 0,
      purchase: 0,
      purchaseValueMinor: 0,
      latestEventAt: 0,
    };
    const accepted = asNumber(item.accepted);
    if (item.event_name === "LeadSubmitted") current.lead += accepted;
    if (item.event_name === "QualifiedLead") current.qualified += accepted;
    if (item.event_name === "Purchase") {
      current.purchase += accepted;
      current.purchaseValueMinor += asNumber(item.value_minor);
    }
    current.latestEventAt = Math.max(current.latestEventAt, asNumber(item.latest_event_at));
    localEvents.set(adId, current);
  }

  const ads = raw.providerAds.map((row) => {
    const item = row as Record<string, unknown>;
    const adId = asString(item.ad_id);
    const spendMinor = asNumber(item.spend_minor);
    const conversationsStarted = asNumber(item.conversations_started);
    const leads = asNumber(item.leads);
    const qualifiedLeads = asNumber(item.qualified_leads);
    const purchases = asNumber(item.purchases);
    const purchaseValueMinor = asNumber(item.purchase_value_minor);
    const local = localEvents.get(adId) ?? {
      lead: 0,
      qualified: 0,
      purchase: 0,
      purchaseValueMinor: 0,
      latestEventAt: 0,
    };
    return {
      campaignId: asString(item.campaign_id),
      campaignName: asString(item.campaign_name),
      adsetId: asString(item.adset_id),
      adsetName: asString(item.adset_name),
      adId,
      adName: asString(item.ad_name),
      currency: asString(item.currency),
      firstDay: asString(item.first_day),
      lastDay: asString(item.last_day),
      fetchedAt: asString(item.fetched_at),
      spendMinor,
      impressions: asNumber(item.impressions),
      reach: asNumber(item.reach),
      clicks: asNumber(item.clicks),
      inlineLinkClicks: asNumber(item.inline_link_clicks),
      messagingConnections: asNumber(item.messaging_connections),
      conversationsStarted,
      leads,
      qualifiedLeads,
      purchases,
      purchaseValueMinor,
      costPerConversationMinor: unitCost(spendMinor, conversationsStarted),
      costPerLeadMinor: unitCost(spendMinor, leads),
      costPerQualifiedLeadMinor: unitCost(spendMinor, qualifiedLeads),
      costPerPurchaseMinor: unitCost(spendMinor, purchases),
      roas: spendMinor > 0 && purchaseValueMinor > 0
        ? Number((purchaseValueMinor / spendMinor).toFixed(2))
        : null,
      smartZap: {
        conversations: localAttributions.get(adId) ?? 0,
        acceptedLeads: local.lead,
        acceptedQualifiedLeads: local.qualified,
        acceptedPurchases: local.purchase,
        informedPurchaseValueMinor: local.purchaseValueMinor,
      },
    };
  });

  const totals = raw.providerTotals.map((row) => {
    const item = row as Record<string, unknown>;
    const spendMinor = asNumber(item.spend_minor);
    const conversationsStarted = asNumber(item.conversations_started);
    const leads = asNumber(item.leads);
    const qualifiedLeads = asNumber(item.qualified_leads);
    const purchases = asNumber(item.purchases);
    const purchaseValueMinor = asNumber(item.purchase_value_minor);
    return {
      currency: asString(item.currency),
      spendMinor,
      impressions: asNumber(item.impressions),
      reach: asNumber(item.reach),
      clicks: asNumber(item.clicks),
      inlineLinkClicks: asNumber(item.inline_link_clicks),
      messagingConnections: asNumber(item.messaging_connections),
      conversationsStarted,
      leads,
      qualifiedLeads,
      purchases,
      purchaseValueMinor,
      costPerConversationMinor: unitCost(spendMinor, conversationsStarted),
      costPerLeadMinor: unitCost(spendMinor, leads),
      costPerQualifiedLeadMinor: unitCost(spendMinor, qualifiedLeads),
      costPerPurchaseMinor: unitCost(spendMinor, purchases),
      roas: spendMinor > 0 && purchaseValueMinor > 0
        ? Number((purchaseValueMinor / spendMinor).toFixed(2))
        : null,
    };
  });

  const alerts: Array<{
    severity: "info" | "warning" | "critical";
    code: string;
    title: string;
    detail: string;
  }> = [];
  const lastRun = raw.latestRun;
  const lastSuccess = raw.latestSuccessfulRun;
  if (!env.META_AD_ACCOUNT_ID)
    alerts.push({
      severity: "critical",
      code: "ad_account_missing",
      title: "Conta de anúncios não configurada",
      detail: "A sincronização de investimento e atribuição está desativada.",
    });
  if (!lastSuccess)
    alerts.push({
      severity: "warning",
      code: "never_synced",
      title: "A Meta ainda não foi sincronizada",
      detail: "Use Sincronizar agora para buscar gasto e resultados atribuídos.",
    });
  if (lastRun?.status === "failed")
    alerts.push({
      severity: "warning",
      code: "last_sync_failed",
      title: "A última sincronização falhou",
      detail: lastRun.error_detail || "O último retrato válido foi preservado.",
    });
  const lastSuccessMs = lastSuccess?.completed_at
    ? Date.parse(`${lastSuccess.completed_at.replace(" ", "T")}Z`)
    : Number.NaN;
  if (Number.isFinite(lastSuccessMs) && Date.now() - lastSuccessMs > 8 * 60 * 60 * 1000)
    alerts.push({
      severity: "warning",
      code: "stale_sync",
      title: "Dados da Meta estão atrasados",
      detail: "A última sincronização válida tem mais de 8 horas.",
    });
  if (lastSuccess && ads.length === 0)
    alerts.push({
      severity: "info",
      code: "no_insights",
      title: "Nenhum anúncio com dados no período",
      detail: `A sincronização funcionou, mas a Meta não retornou mídia nos últimos ${days} dias.`,
    });

  const olderThan48h = Math.floor(Date.now() / 1000) - 48 * 60 * 60;
  for (const ad of ads) {
    const local = localEvents.get(ad.adId);
    if (!local || !local.latestEventAt || local.latestEventAt > olderThan48h) continue;
    const pending = [
      ["lead", local.lead, ad.leads],
      ["lead qualificado", local.qualified, ad.qualifiedLeads],
      ["compra", local.purchase, ad.purchases],
    ].find(([, acceptedCount, attributedCount]) => Number(acceptedCount) > Number(attributedCount));
    if (pending)
      alerts.push({
        severity: "warning",
        code: `attribution_gap_${ad.adId}`,
        title: `Resultado sem atribuição agregada: ${pending[0]}`,
        detail: `${ad.adName}: SmartZap aceito ${pending[1]}, Meta atribuiu ${pending[2]} após 48 horas.`,
      });
  }

  return {
    days,
    state: !lastSuccess ? "not_synced" : alerts.some((item) => item.severity !== "info")
      ? "attention"
      : "healthy",
    configuration: {
      adAccountConfigured: Boolean(env.META_AD_ACCOUNT_ID),
      adAccountSuffix: env.META_AD_ACCOUNT_ID?.replace(/^act_/, "").slice(-4) ?? null,
      graphVersion: env.META_GRAPH_VERSION || null,
    },
    latestRun: lastRun,
    latestSuccessfulRun: lastSuccess,
    datasetQuality: raw.datasetQuality,
    totals,
    ads,
    alerts,
  };
}

type AccessRequirements = {
  marketingAccessConfirmed: boolean;
  operatingMode: "direct" | "partner" | null;
  ownBusinessDataConfirmed: boolean;
  manageEventsAdvancedAccessConfirmed: boolean;
};

function accessRequirementsFromBody(body: {
  marketingAccessConfirmed: true;
  operatingMode: "direct" | "partner";
  ownBusinessDataConfirmed?: true;
  manageEventsAdvancedAccessConfirmed?: true;
}): AccessRequirements {
  return {
    marketingAccessConfirmed: true,
    operatingMode: body.operatingMode,
    ownBusinessDataConfirmed:
      body.operatingMode === "direct" && body.ownBusinessDataConfirmed === true,
    manageEventsAdvancedAccessConfirmed:
      body.operatingMode === "partner" &&
      body.manageEventsAdvancedAccessConfirmed === true,
  };
}

async function capiDiagnostics(env: Env, options?: { accessRequirements?: AccessRequirements }) {
  const settings = settingsDb(env.DB);
  const [enabled, storedDatasetId, verifiedWabaId, confirmedSetting, canaryEventId,
    operatingModeSetting, ownBusinessDataSetting, manageEventsAdvancedSetting, canaryAcceptedAt,
    canaryDatasetId, canaryWabaId] = await Promise.all([
    settings.get("capi_enabled"),
    settings.get("capi_dataset_id"),
    settings.get("capi_dataset_verified_waba_id"),
    settings.get("capi_marketing_access_confirmed"),
    settings.get("capi_canary_event_id"),
    settings.get("capi_operating_mode"),
    settings.get("capi_own_business_data_confirmed"),
    settings.get("capi_manage_events_advanced_access_confirmed"),
    settings.get("capi_canary_accepted_at"),
    settings.get("capi_canary_dataset_id"),
    settings.get("capi_canary_waba_id"),
  ]);
  const storedOperatingMode = operatingModeSetting === "direct" || operatingModeSetting === "partner"
    ? operatingModeSetting
    : null;
  const marketingAccessConfirmed =
    options?.accessRequirements?.marketingAccessConfirmed ?? confirmedSetting === "true";
  const operatingMode = options?.accessRequirements?.operatingMode ?? storedOperatingMode;
  const ownBusinessDataConfirmed =
    options?.accessRequirements?.ownBusinessDataConfirmed ?? ownBusinessDataSetting === "true";
  const manageEventsAdvancedAccessConfirmed =
    options?.accessRequirements?.manageEventsAdvancedAccessConfirmed ?? manageEventsAdvancedSetting === "true";
  const advancedAccessRequired = operatingMode === "partner"
    ? true
    : operatingMode === "direct"
      ? false
      : null;
  const accessRequirementsReady = Boolean(
    marketingAccessConfirmed && (
      (operatingMode === "direct" && ownBusinessDataConfirmed) ||
      (operatingMode === "partner" && manageEventsAdvancedAccessConfirmed)
    ),
  );
  const credentials = await getCredentials(env).catch(() => null);
  if (!credentials) {
    return {
      enabled: false,
      ready: false,
      verificationStatus: "configuration_missing" as const,
      graphVersion: env.META_GRAPH_VERSION || null,
      wabaId: null,
      permissions: {
        whatsappBusinessManagement: null,
        whatsappBusinessManageEvents: null,
        marketingAccessConfirmed,
        operatingMode,
        ownBusinessDataConfirmed,
        advancedAccessRequired,
        manageEventsAdvancedAccessConfirmed,
      },
      dataset: { status: "unknown" as const, id: null, storedId: storedDatasetId },
      canary: {
        eventId: canaryEventId,
        status: null,
        accepted: false,
        acceptedAt: canaryAcceptedAt,
      },
      technicalPrerequisitesReady: false,
      prerequisitesReady: false,
      message: "Configure a conexão oficial do WhatsApp antes de ativar conversões.",
    };
  }

  const [meta, datasetResult] = await Promise.all([
    probeMeta(credentials),
    businessMessagingCapi({
      token: credentials.token,
      graphVersion: credentials.graphVersion,
    }).getDataset(credentials.wabaId),
  ]);
  const scopes = meta.health?.tokenScopes ?? null;
  const capiConnectionLive = Boolean(
    meta.health?.tokenValid === true &&
    meta.health?.tokenAppMatches === true &&
    meta.health?.phoneBelongsToWaba === true,
  );
  const management = scopes
    ? scopes.includes("whatsapp_business_management")
    : null;
  const manageEvents = scopes
    ? scopes.includes("whatsapp_business_manage_events")
    : null;
  const datasetId = datasetResult.ok ? datasetResult.datasetId : null;
  const datasetStatus = datasetResult.ok
    ? datasetId ? "found" as const : "missing" as const
    : "unknown" as const;
  const datasetVerified = Boolean(
    datasetId &&
    storedDatasetId === datasetId &&
    verifiedWabaId === credentials.wabaId,
  );
  const technicalPrerequisitesReady = Boolean(
    capiConnectionLive &&
    management === true &&
    manageEvents === true &&
    datasetId &&
    datasetVerified,
  );
  const prerequisitesReady = Boolean(
    technicalPrerequisitesReady &&
    accessRequirementsReady,
  );
  const canaryStatus = canaryEventId
    ? await conversionsDb(env.DB).deliveryStatus(canaryEventId)
    : null;
  const canaryAccepted = Boolean(
    canaryEventId &&
    canaryStatus?.delivery_status === "accepted" &&
    canaryStatus.events_received === 1 &&
    canaryAcceptedAt &&
    canaryDatasetId === datasetId &&
    canaryWabaId === credentials.wabaId,
  );
  const ready = prerequisitesReady && canaryAccepted;
  return {
    enabled: enabled === "true" && ready,
    ready,
    verificationStatus: meta.verificationStatus,
    graphVersion: credentials.graphVersion,
    wabaId: credentials.wabaId,
    permissions: {
      whatsappBusinessManagement: management,
      whatsappBusinessManageEvents: manageEvents,
      marketingAccessConfirmed,
      operatingMode,
      ownBusinessDataConfirmed,
      advancedAccessRequired,
      manageEventsAdvancedAccessConfirmed,
    },
    dataset: {
      status: datasetStatus,
      id: datasetId,
      storedId: storedDatasetId,
      verified: datasetVerified,
      retryable: datasetResult.ok ? false : datasetResult.retryable,
      error: datasetResult.ok ? null : datasetResult.detail,
    },
    canary: {
      eventId: canaryEventId,
      status: typeof canaryStatus?.delivery_status === "string"
        ? canaryStatus.delivery_status
        : null,
      accepted: canaryAccepted,
      acceptedAt: canaryAcceptedAt,
      error: typeof canaryStatus?.last_error_detail === "string"
        ? canaryStatus.last_error_detail
        : null,
    },
    technicalPrerequisitesReady,
    prerequisitesReady,
    meta: {
      live: capiConnectionLive,
      retryable: meta.retryable,
      error: capiConnectionLive ? null : meta.error,
    },
    message: ready
      ? "Conversões Meta estão prontas para uso."
      : management === false || manageEvents === false
        ? "O token precisa dos escopos whatsapp_business_management e whatsapp_business_manage_events."
        : datasetStatus === "missing"
            ? "A WABA ainda não possui Dataset associado."
            : datasetStatus === "unknown"
              ? "Não foi possível confirmar o Dataset agora."
              : !datasetVerified
                ? "O Dataset encontrado ainda precisa ser verificado pelo SmartZap."
                : operatingMode === null
                  ? "Confirme se o SmartZap opera somente a WABA própria ou WABAs de clientes."
                  : operatingMode === "direct" && !ownBusinessDataConfirmed
                    ? "Confirme que a integração acessa somente dados da própria empresa."
                    : operatingMode === "partner" && !manageEventsAdvancedAccessConfirmed
                      ? "Solicite e confirme o acesso avançado a whatsapp_business_manage_events para operar WABAs de clientes."
                      : !marketingAccessConfirmed
                        ? "Confirme o Marketing API Access Tier no App Dashboard."
                : !canaryAccepted
                  ? "Execute e confirme o evento controlado antes de ativar conversões."
                : (capiConnectionLive ? null : meta.error) ?? "Configuração de conversões incompleta.",
  };
}

export const conversionsRoutes = new Hono<{ Bindings: Env }>()
  .get("/diagnostics", async (c) => c.json(await capiDiagnostics(c.env)))
  .post("/dataset", async (c) => {
    const raw = await readJsonBody(c, 4_096);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = DatasetMutationSchema.safeParse(raw.value);
    if (!body.success)
      return c.json({ error: "confirmação explícita obrigatória" }, 400);
    const credentials = await getCredentials(c.env);
    if (!credentials)
      return c.json({ error: "WhatsApp oficial não configurado" }, 409);
    const meta = await probeMeta(credentials);
    const scopes = meta.health?.tokenScopes;
    const capiConnectionLive = Boolean(
      meta.health?.tokenValid === true &&
      meta.health?.tokenAppMatches === true &&
      meta.health?.phoneBelongsToWaba === true,
    );
    if (
      !capiConnectionLive ||
      !scopes?.includes("whatsapp_business_management") ||
      !scopes.includes("whatsapp_business_manage_events")
    )
      return c.json({
        error: "a Meta ainda não confirmou os escopos whatsapp_business_management e whatsapp_business_manage_events",
        retryable: meta.retryable,
      }, 409);
    const capi = businessMessagingCapi({
      token: credentials.token,
      graphVersion: credentials.graphVersion,
    });
    const existing = await capi.getDataset(credentials.wabaId);
    if (!existing.ok)
      return c.json({ error: existing.detail, retryable: existing.retryable }, existing.retryable ? 503 : 409);
    const result = existing.datasetId
      ? existing
      : await capi.createDataset(credentials.wabaId);
    if (!result.ok)
      return c.json({ error: result.detail, retryable: result.retryable }, result.retryable ? 503 : 409);
    if (!result.datasetId)
      return c.json({ error: "Meta não retornou o Dataset associado" }, 502);
    const settings = settingsDb(c.env.DB);
    await Promise.all([
      settings.set("capi_dataset_id", result.datasetId),
      settings.set("capi_dataset_verified_waba_id", credentials.wabaId),
      settings.set("capi_dataset_verified_at", new Date().toISOString()),
    ]);
    return c.json({ ok: true, datasetId: result.datasetId });
  })
  .get("/canary-candidates", async (c) => {
    const diagnostics = await capiDiagnostics(c.env);
    if (!diagnostics.technicalPrerequisitesReady)
      return c.json({ error: diagnostics.message, diagnostics }, 409);
    return c.json({ items: await conversionsDb(c.env.DB).listCanaryCandidates(20) });
  })
  .post("/canary", async (c) => {
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = CanarySchema.safeParse(raw.value);
    if (!body.success)
      return c.json({ error: "confirme o teste e selecione uma conversa CTWA autorizada" }, 400);
    if (!(await conversationsDb(c.env.DB).get(body.data.conversationId)))
      return c.json({ error: "conversa não encontrada" }, 404);
    const accessRequirements = accessRequirementsFromBody(body.data);
    const diagnostics = await capiDiagnostics(c.env, { accessRequirements });
    if (
      !diagnostics.prerequisitesReady ||
      !diagnostics.dataset.id ||
      !diagnostics.wabaId
    ) return c.json({ error: diagnostics.message, diagnostics }, 409);

    const settings = settingsDb(c.env.DB);
    const previousCanaryId = await settings.get("capi_canary_event_id");
    if (previousCanaryId) {
      const previous = await conversionsDb(c.env.DB).deliveryStatus(previousCanaryId);
      if (["pending", "sending", "temporary_failed", "accepted", "unknown"].includes(String(previous?.delivery_status)))
        return c.json({
          error: previous?.delivery_status === "accepted"
            ? "o evento controlado já foi aceito pela Meta"
            : "já existe um evento controlado em processamento",
          canary: previous,
        }, 409);
    }

    const requestKey = crypto.randomUUID();
    let created;
    try {
      created = await conversionsDb(c.env.DB).createEvent({
        conversationId: body.data.conversationId,
        datasetId: diagnostics.dataset.id,
        createdBy: "administrator:activation-canary",
        payload: {
          requestKey,
          attributionId: body.data.attributionId,
          eventName: "LeadSubmitted",
          businessObjectType: "lead",
          businessObjectId: `capi-canary-${requestKey}`,
        },
      });
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : "não foi possível criar o evento controlado",
      }, 400);
    }
    const eventId = String(created.item.id);
    await Promise.all([
      settings.set("capi_dataset_id", diagnostics.dataset.id),
      settings.set("capi_dataset_verified_waba_id", diagnostics.wabaId),
      settings.set("capi_marketing_access_confirmed", "true"),
      settings.set("capi_operating_mode", accessRequirements.operatingMode ?? ""),
      settings.set("capi_own_business_data_confirmed", String(accessRequirements.ownBusinessDataConfirmed)),
      settings.set("capi_manage_events_advanced_access_confirmed", String(accessRequirements.manageEventsAdvancedAccessConfirmed)),
      settings.set("capi_canary_event_id", eventId),
      settings.set("capi_canary_accepted_at", ""),
      settings.set("capi_canary_dataset_id", diagnostics.dataset.id),
      settings.set("capi_canary_waba_id", diagnostics.wabaId),
    ]);
    try {
      await c.env.CAPI_QUEUE.send({
        kind: "conversion_delivery",
        eventId,
      } satisfies ConversionQueueEvent);
    } catch {
      // A outbox e o ID do canário já estão confirmados; o cron recuperará.
    }
    return c.json({ ok: true, eventId, status: "pending" }, 202);
  })
  .put("/activation", async (c) => {
    const raw = await readJsonBody(c, 4_096);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = ActivationSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "ativação inválida" }, 400);
    const settings = settingsDb(c.env.DB);
    if (!body.data.enabled) {
      await settings.set("capi_enabled", "false");
      return c.json({ ok: true, enabled: false });
    }
    const accessRequirements = accessRequirementsFromBody(body.data);
    const diagnostics = await capiDiagnostics(c.env, { accessRequirements });
    if (
      diagnostics.permissions.whatsappBusinessManagement !== true ||
      diagnostics.permissions.whatsappBusinessManageEvents !== true ||
      diagnostics.dataset.status !== "found" ||
      !diagnostics.dataset.id ||
      !diagnostics.wabaId ||
      !diagnostics.canary.accepted ||
      !diagnostics.meta?.live
    ) return c.json({ error: diagnostics.message, diagnostics }, 409);
    await Promise.all([
      settings.set("capi_dataset_id", diagnostics.dataset.id),
      settings.set("capi_dataset_verified_waba_id", diagnostics.wabaId),
      settings.set("capi_dataset_verified_at", new Date().toISOString()),
      settings.set("capi_marketing_access_confirmed", "true"),
      settings.set("capi_operating_mode", accessRequirements.operatingMode ?? ""),
      settings.set("capi_own_business_data_confirmed", String(accessRequirements.ownBusinessDataConfirmed)),
      settings.set("capi_manage_events_advanced_access_confirmed", String(accessRequirements.manageEventsAdvancedAccessConfirmed)),
      settings.set("capi_enabled", "true"),
    ]);
    return c.json({ ok: true, enabled: true });
  })
  .get("/summary", async (c) => {
    const parsed = SummaryQuerySchema.safeParse(c.req.query("days") ?? 30);
    if (!parsed.success) return c.json({ error: "período inválido" }, 400);
    return c.json(await conversionsDb(c.env.DB).summary(parsed.data));
  })
  .get("/reconciliation", async (c) => {
    const parsed = SummaryQuerySchema.safeParse(c.req.query("days") ?? 30);
    if (!parsed.success) return c.json({ error: "período inválido" }, 400);
    return c.json(await reconciliationView(c.env, parsed.data));
  })
  .post("/reconciliation/sync", async (c) => {
    const raw = await readJsonBody(c, 2_048);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = ReconciliationMutationSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "confirmação obrigatória" }, 400);
    const result = await reconcileMetaConversions(c.env, {
      trigger: "manual",
      force: true,
    });
    if (result.status === "failed")
      return c.json({ error: result.detail || "sincronização com a Meta falhou", ...result }, 502);
    if (result.status === "skipped")
      return c.json({ error: result.detail || "sincronização não configurada", ...result }, 409);
    return c.json({ ok: true, ...result });
  })
  .get("/conversations/:id", async (c) => {
    const id = ConversationIdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    if (!(await conversationsDb(c.env.DB).get(id.data)))
      return c.json({ error: "conversa não encontrada" }, 404);
    const db = conversionsDb(c.env.DB);
    const [attributions, events] = await Promise.all([
      db.listAttributions(id.data),
      db.listEvents(id.data),
    ]);
    return c.json({ attributions, events });
  })
  .post("/conversations/:id/events", async (c) => {
    const id = ConversationIdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    if (!(await conversationsDb(c.env.DB).get(id.data)))
      return c.json({ error: "conversa não encontrada" }, 404);
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = ConversionEventInputSchema.safeParse(raw.value);
    if (!body.success)
      return c.json({ error: body.error.issues[0]?.message ?? "conversão inválida" }, 400);
    const settings = settingsDb(c.env.DB);
    const [enabled, datasetId, verifiedWabaId] = await Promise.all([
      settings.get("capi_enabled"),
      settings.get("capi_dataset_id"),
      settings.get("capi_dataset_verified_waba_id"),
    ]);
    const credentials = await getCredentials(c.env);
    if (
      enabled !== "true" ||
      !datasetId ||
      !credentials?.wabaId ||
      verifiedWabaId !== credentials.wabaId
    ) return c.json({ error: "ative e verifique Conversões Meta antes de registrar eventos" }, 409);
    let created;
    try {
      created = await conversionsDb(c.env.DB).createEvent({
        conversationId: id.data,
        datasetId,
        createdBy: "administrator",
        payload: body.data,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "conversão inválida";
      return c.json({ error: message }, /idempotente|outra conversa|evento original|cancele/.test(message) ? 409 : 400);
    }
    let queued = false;
    if (created.created) {
      try {
        await c.env.CAPI_QUEUE.send({
          kind: "conversion_delivery",
          eventId: String(created.item.id),
        } satisfies ConversionQueueEvent);
        queued = true;
      } catch {
        // A outbox já está confirmada no D1; o cron fará o reenfileiramento.
      }
    }
    return c.json(
      { ...created, queued, recovery: queued || !created.created ? null : "cron" },
      created.created ? 201 : 200,
    );
  })
  .post("/conversations/:id/events/:eventId/cancel", async (c) => {
    const conversationId = ConversationIdSchema.safeParse(c.req.param("id"));
    const eventId = EventIdSchema.safeParse(c.req.param("eventId"));
    if (!conversationId.success || !eventId.success)
      return c.json({ error: "conversa ou conversão inválida" }, 400);
    const raw = await readJsonBody(c, 4_096);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = CancelEventSchema.safeParse(raw.value);
    if (!body.success)
      return c.json({ error: "confirmação e motivo são obrigatórios" }, 400);
    try {
      const result = await conversionsDb(c.env.DB).cancelEvent({
        conversationId: conversationId.data,
        eventId: eventId.data,
        reason: body.data.reason,
      });
      return c.json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "não foi possível cancelar";
      return c.json({ error: message }, /não encontrada/.test(message) ? 404 : 409);
    }
  });
