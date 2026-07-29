import { Hono } from "hono";
import { z } from "zod";
import { settingsDb } from "../db/settings";
import { contactsDb } from "../db/contacts";
import { getCredentials } from "../whatsapp/credentials";
import { whatsappClient } from "../whatsapp/client";
import { templatesDb } from "../db/templates";
import { probeMeta } from "../whatsapp/health";
import { pilotConfiguration, pilotRunConfiguration } from "../domain/pilot";
import { aiConfiguration } from "../ai/drafts";
import { readJsonBody } from "./body";
import { SMARTZAP_REQUIRED_META_WEBHOOK_FIELDS } from "../whatsapp/flows";

// Schema por campo: throttle_mps é numérico com teto (string livre viraria NaN
// e desativaria o throttle no workflow). IDs vazios permitem desconectar uma
// configuração salva; qualquer valor não vazio continua exigindo o formato Meta.
const MetaIdSchema = z.string().trim().refine(
  (value) => value === "" || /^\d{5,32}$/.test(value),
  "ID Meta inválido",
);
const PutSchema = z
  .object({
    whatsapp_phone_id: MetaIdSchema.optional(),
    whatsapp_waba_id: MetaIdSchema.optional(),
    throttle_mode: z.enum(["automatic", "maximum", "manual"]).optional(),
    throttle_mps: z.coerce.number().int().positive().max(1000).optional(),
  })
  .strict();
const InboxSettingsSchema = z
  .object({
    retention_days: z.number().int().min(7).max(365).optional(),
    human_mode_timeout_hours: z.number().int().min(0).max(168).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "configuração vazia");
const TestContactSchema = z.object({
  name: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(32),
}).strict().refine((value) => {
  const digits = value.phone.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}, "telefone inválido");
const AiCenterSchema = z.object({
  strategyMarketing: z.string().max(12_000),
  strategyUtility: z.string().max(12_000),
  utilityJudgeTemplate: z.string().max(12_000),
  flowFormTemplate: z.string().max(12_000),
  generateFlowForm: z.boolean(),
}).strict();
const AI_CENTER_DEFAULTS = {
  strategyMarketing: "Crie mensagens de marketing claras e persuasivas, usando somente os fatos fornecidos. Não invente ofertas, preços ou prazos.",
  strategyUtility: "Crie avisos transacionais objetivos, sem linguagem promocional, urgência artificial ou incentivo de compra.",
  utilityJudgeTemplate: "Classifique o conteúdo como UTILITY ou MARKETING e explique objetivamente qualquer trecho promocional.",
  flowFormTemplate: "Gere um formulário MiniApp em JSON estrito, curto, acessível e com no máximo cinco telas.",
  generateFlowForm: true,
};

type UsageGraphResponse = {
  data?: {
    viewer?: {
      accounts?: Array<{
        workersInvocationsAdaptive?: Array<{ sum?: { requests?: number | null } }>;
        d1AnalyticsAdaptiveGroups?: Array<{
          sum?: {
            rowsRead?: number | null;
            rowsWritten?: number | null;
          };
        }>;
        d1StorageAdaptiveGroups?: Array<{
          max?: { databaseSizeBytes?: number | null };
        }>;
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
};

const monthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

const sum = (values: Array<number | null | undefined>) =>
  values.reduce<number>((total, value) => total + (Number(value) || 0), 0);

/** Métricas que o Worker obtém de bindings, sem depender de token externo. */
async function bindingUsage(env: Env) {
  const [webhookQueue, automationQueue] = await Promise.all([
    env.WEBHOOK_QUEUE.metrics(),
    env.AUTOMATION_QUEUE.metrics(),
  ]);
  return {
    queues: {
      backlog: webhookQueue.backlogCount + automationQueue.backlogCount,
      backlogBytes: webhookQueue.backlogBytes + automationQueue.backlogBytes,
      items: [
        { name: "meta-webhooks", backlog: webhookQueue.backlogCount },
        { name: "inbox-automation", backlog: automationQueue.backlogCount },
      ],
    },
  };
}

/**
 * A Analytics API cobre invocações mensais do Worker e linhas lidas/escritas
 * do D1. O token fica exclusivamente como secret do Worker e nunca é enviado
 * ao navegador. Falha de permissão não derruba as métricas de binding.
 */
async function cloudflareAnalyticsUsage(env: Env) {
  if (!env.CLOUDFLARE_ANALYTICS_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    return { available: false as const, reason: "not_configured" as const };
  }
  const start = monthStart().toISOString();
  const end = new Date().toISOString();
  const query = `query SmartZapInfrastructureUsage(
    $accountTag: string!, $datetimeStart: string!, $datetimeEnd: string!,
    $dateStart: Date!, $dateEnd: Date!, $scriptName: string!, $databaseId: string
  ) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        workersInvocationsAdaptive(limit: 10000, filter: {
          scriptName: $scriptName, datetime_geq: $datetimeStart, datetime_leq: $datetimeEnd
        }) { sum { requests } }
        d1AnalyticsAdaptiveGroups(limit: 10000, filter: {
          date_geq: $dateStart, date_leq: $dateEnd, databaseId: $databaseId
        }) { sum { rowsRead rowsWritten } }
        d1StorageAdaptiveGroups(limit: 10000, filter: {
          date_geq: $dateStart, date_leq: $dateEnd, databaseId: $databaseId
        }) { max { databaseSizeBytes } }
      }
    }
  }`;
  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          accountTag: env.CLOUDFLARE_ACCOUNT_ID,
          datetimeStart: start,
          datetimeEnd: end,
          dateStart: start.slice(0, 10),
          dateEnd: end.slice(0, 10),
          scriptName: env.CLOUDFLARE_WORKER_NAME || "smartzap-cf",
          databaseId: env.CLOUDFLARE_D1_DATABASE_ID,
        },
      }),
    });
    const payload = (await response.json()) as UsageGraphResponse;
    const account = payload.data?.viewer?.accounts?.[0];
    if (!response.ok || payload.errors?.length || !account) {
      return { available: false as const, reason: "unavailable" as const };
    }
    return {
      available: true as const,
      workersRequests: sum(
        (account.workersInvocationsAdaptive ?? []).map((group) => group.sum?.requests),
      ),
      databaseRowsRead: sum(
        (account.d1AnalyticsAdaptiveGroups ?? []).map((group) => group.sum?.rowsRead),
      ),
      databaseRowsWritten: sum(
        (account.d1AnalyticsAdaptiveGroups ?? []).map((group) => group.sum?.rowsWritten),
      ),
      // A métrica de storage é um ponto no tempo por dia; o maior valor no
      // período evita somar o mesmo banco repetidamente.
      databaseStorageBytes: Math.max(
        0,
        ...(account.d1StorageAdaptiveGroups ?? []).map(
          (group) => Number(group.max?.databaseSizeBytes) || 0,
        ),
      ),
    };
  } catch {
    return { available: false as const, reason: "unavailable" as const };
  }
}

async function inboxSettings(db: D1Database) {
  const settings = settingsDb(db);
  const [retentionRaw, timeoutRaw] = await Promise.all([
    settings.get("inbox_retention_days"),
    settings.get("inbox_human_mode_timeout_hours"),
  ]);
  const retention = Number(retentionRaw ?? 365);
  const timeout = Number(timeoutRaw ?? 0);
  return {
    retention_days:
      Number.isInteger(retention) && retention >= 7 && retention <= 365
        ? retention
        : 365,
    human_mode_timeout_hours:
      Number.isInteger(timeout) && timeout >= 0 && timeout <= 168 ? timeout : 0,
  };
}

export const settingsRoutes = new Hono<{ Bindings: Env }>()
  .get("/ai-center", async (c) => {
    const settings = settingsDb(c.env.DB);
    const stored = await settings.get("ai_center_config");
    if (!stored) return c.json(AI_CENTER_DEFAULTS);
    try {
      return c.json(AiCenterSchema.parse({ ...AI_CENTER_DEFAULTS, ...JSON.parse(stored) }));
    } catch {
      return c.json(AI_CENTER_DEFAULTS);
    }
  })
  .put("/ai-center", async (c) => {
    const raw = await readJsonBody(c, 64_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const parsed = AiCenterSchema.safeParse(raw.value);
    if (!parsed.success) return c.json({ error: "configuração de IA inválida" }, 400);
    await settingsDb(c.env.DB).set("ai_center_config", JSON.stringify(parsed.data));
    return c.json(parsed.data);
  })
  .get("/test-contact", async (c) => {
    const settings = settingsDb(c.env.DB);
    const phone = await settings.get("test_contact_phone");
    if (!phone) return c.json({ contact: null });
    return c.json({ contact: { name: await settings.get("test_contact_name") || "", phone } });
  })
  .put("/test-contact", async (c) => {
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const parsed = TestContactSchema.safeParse(raw.value);
    if (!parsed.success) return c.json({ error: "contato de teste inválido" }, 400);
    const phone = `+${parsed.data.phone.replace(/\D/g, "")}`;
    const settings = settingsDb(c.env.DB);
    await Promise.all([
      settings.set("test_contact_name", parsed.data.name),
      settings.set("test_contact_phone", phone),
    ]);
    // Configurar o número é a declaração explícita de que ele será usado
    // apenas para teste. Mantemos o contato elegível para a prévia e a fila
    // seguirem exatamente o mesmo caminho do envio real.
    await contactsDb(c.env.DB).ensureTestRecipient({
      phone,
      name: parsed.data.name || undefined,
    });
    return c.json({ contact: { name: parsed.data.name, phone } });
  })
  .post("/test-contact/ensure", async (c) => {
    const settings = settingsDb(c.env.DB);
    const phone = await settings.get("test_contact_phone");
    if (!phone) return c.json({ error: "nenhum contato de teste configurado" }, 409);
    const name = (await settings.get("test_contact_name")) || undefined;
    const contact = await contactsDb(c.env.DB).ensureTestRecipient({ phone, name });
    return c.json({ contact });
  })
  .delete("/test-contact", async (c) => {
    const settings = settingsDb(c.env.DB);
    await Promise.all([
      settings.delete("test_contact_name"),
      settings.delete("test_contact_phone"),
    ]);
    return c.json({ ok: true });
  })
  .get("/infrastructure-usage", async (c) => {
    const [bindings, analytics, whatsappThisMonth, whatsappLast24h] = await Promise.all([
      bindingUsage(c.env),
      cloudflareAnalyticsUsage(c.env),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS total
         FROM campaign_contacts
         WHERE status IN ('sent', 'delivered', 'read')
           AND updated_at >= datetime('now', 'start of month')`,
      ).first<{ total: number }>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS total
         FROM campaign_contacts
         WHERE status IN ('sent', 'delivered', 'read')
           AND updated_at >= datetime('now', '-24 hours')`,
      ).first<{ total: number }>(),
    ]);
    return c.json({
      periodStart: monthStart().toISOString(),
      fetchedAt: new Date().toISOString(),
      workers: analytics.available
        ? { available: true, requests: analytics.workersRequests }
        : { available: false, requests: null },
      queues: bindings.queues,
      database: {
        storageBytes: analytics.available ? analytics.databaseStorageBytes : null,
        analyticsAvailable: analytics.available,
        rowsRead: analytics.available ? analytics.databaseRowsRead : null,
        rowsWritten: analytics.available ? analytics.databaseRowsWritten : null,
      },
      whatsapp: {
        sentThisMonth: Number(whatsappThisMonth?.total) || 0,
        sentLast24h: Number(whatsappLast24h?.total) || 0,
      },
      analytics: {
        configured: Boolean(c.env.CLOUDFLARE_ANALYTICS_TOKEN),
        available: analytics.available,
        reason: analytics.available ? null : analytics.reason,
      },
    });
  })
  .get("/inbox", async (c) => c.json(await inboxSettings(c.env.DB)))
  .patch("/inbox", async (c) => {
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = InboxSettingsSchema.safeParse(raw.value);
    if (!body.success)
      return c.json({ error: "configurações do Inbox inválidas" }, 400);
    const settings = settingsDb(c.env.DB);
    await Promise.all(
      Object.entries(body.data).map(([key, value]) =>
        settings.set(
          key === "retention_days"
            ? "inbox_retention_days"
            : "inbox_human_mode_timeout_hours",
          String(value),
        ),
      ),
    );
    return c.json(await inboxSettings(c.env.DB));
  })
  .get("/", async (c) => {
    const s = settingsDb(c.env.DB);
    return c.json({
      // Token NUNCA sai da API — nem prefixo; só o fato de existir
      whatsapp_token: { configured: Boolean(c.env.WHATSAPP_TOKEN) },
      meta_app_id: c.env.META_APP_ID || null,
      meta_app_secret: { configured: Boolean(c.env.META_APP_SECRET) },
      whatsapp_phone_id: await s.get("whatsapp_phone_id"),
      whatsapp_waba_id: await s.get("whatsapp_waba_id"),
      throttle_mps: await s.get("throttle_mps"),
      throttle_mode: await s.get("throttle_mode") ?? "automatic",
    });
  })
  .get("/health", async (c) => {
    let databaseOk = false;
    try {
      databaseOk =
        (await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>())
          ?.ok === 1;
    } catch {
      /* reporta false abaixo */
    }
    const credentials = await getCredentials(c.env).catch(() => null);
    const metaConfigured = Boolean(credentials?.token && credentials.phoneId);
    const approvedTemplates = credentials?.wabaId
      ? ((
          await c.env.DB.prepare(
            "SELECT COUNT(*) AS n FROM templates WHERE status = 'APPROVED'",
          ).first<{ n: number }>()
        )?.n ?? 0)
      : 0;
    const templatesConfigured = Boolean(
      credentials?.wabaId && approvedTemplates > 0,
    );
    const metaProbe = credentials?.wabaId ? await probeMeta(credentials) : null;
    const metaLive = metaProbe?.ok ?? false;
    const webhookSecretsConfigured = Boolean(
      c.env.META_APP_SECRET && c.env.META_VERIFY_TOKEN,
    );
    const appWebhookMissingFields = metaProbe?.health
      ? SMARTZAP_REQUIRED_META_WEBHOOK_FIELDS.filter(
          (field) => !metaProbe.health!.appWebhookFields.includes(field),
        )
      : [...SMARTZAP_REQUIRED_META_WEBHOOK_FIELDS];
    const webhookConfigured =
      webhookSecretsConfigured &&
      Boolean(metaProbe?.health?.webhookSubscribed) &&
      appWebhookMissingFields.length === 0;
    const turnstileEnabled = c.env.TURNSTILE_ENABLED === "true";
    const turnstileConfigured =
      !turnstileEnabled ||
      Boolean(c.env.TURNSTILE_SECRET && c.env.TURNSTILE_SITE_KEY);
    const pilot = pilotConfiguration(c.env);
    const ai = aiConfiguration(c.env);
    const pilotRun = await pilotRunConfiguration(c.env.DB).catch(() => ({
      active: false,
      label: null,
      maxAttempts: null,
      attempts: 0,
    }));
    const pilotConfigured =
      !pilot.enforced ||
      (pilot.enabled &&
        pilot.recipientConfigured &&
        pilot.templateAllowlistConfigured &&
        pilot.maxAttempts !== null &&
        pilotRun.active);
    return c.json({
      databaseOk,
      metaConfigured,
      metaLive,
      meta: metaProbe
        ? {
            qualityRating: metaProbe.health?.qualityRating ?? null,
            phoneBelongsToWaba: metaProbe.health?.phoneBelongsToWaba ?? false,
            phoneWebhookCallbackUrl:
              metaProbe.health?.phoneWebhookCallbackUrl ?? null,
            effectiveWebhookCallbackUrl:
              metaProbe.health?.effectiveWebhookCallbackUrl ?? null,
            effectiveWebhookCallbackMatches:
              metaProbe.health?.effectiveWebhookCallbackMatches ?? false,
            codeVerificationStatus:
              metaProbe.health?.codeVerificationStatus ?? null,
            messagingLimit: metaProbe.health?.messagingLimit ?? null,
            throughputLevel: metaProbe.health?.throughputLevel ?? "UNKNOWN",
            throughputMps: metaProbe.health?.throughputMps ?? null,
            webhookSubscribed: metaProbe.health?.webhookSubscribed ?? false,
            phoneStatus: metaProbe.health?.phoneStatus ?? null,
            platformType: metaProbe.health?.platformType ?? null,
            accountMode: metaProbe.health?.accountMode ?? null,
            subscribedAppIds: metaProbe.health?.subscribedAppIds ?? [],
            webhookCallbackUrl: metaProbe.health?.webhookCallbackUrl ?? null,
            webhookCallbackMatches:
              metaProbe.health?.webhookCallbackMatches ?? false,
            tokenAppId: metaProbe.health?.tokenAppId ?? null,
            tokenAppMatches: metaProbe.health?.tokenAppMatches ?? false,
            tokenValid: metaProbe.health?.tokenValid ?? false,
            tokenType: metaProbe.health?.tokenType ?? null,
            tokenScopes: metaProbe.health?.tokenScopes ?? [],
            tokenRequiredScopesPresent:
              metaProbe.health?.tokenRequiredScopesPresent ?? false,
            tokenWabaTargeted: metaProbe.health?.tokenWabaTargeted ?? null,
            tokenExpiresAt: metaProbe.health?.tokenExpiresAt ?? null,
            tokenDataAccessExpiresAt:
              metaProbe.health?.tokenDataAccessExpiresAt ?? null,
            appWebhookActive: metaProbe.health?.appWebhookActive ?? false,
            appWebhookFields: metaProbe.health?.appWebhookFields ?? [],
            appWebhookMessagesSubscribed:
              metaProbe.health?.appWebhookMessagesSubscribed ?? false,
            appWebhookRequiredFieldsPresent:
              appWebhookMissingFields.length === 0,
            appWebhookMissingFields,
            appWebhookCallbackUrl:
              metaProbe.health?.appWebhookCallbackUrl ?? null,
            error: metaProbe.error,
            code: metaProbe.code,
            fbtraceId: metaProbe.fbtraceId,
          }
        : null,
      templatesConfigured,
      approvedTemplates,
      webhookConfigured,
      webhookSecretsConfigured,
      turnstileConfigured,
      turnstileEnabled,
      pilot: { ...pilot, run: pilotRun },
      ai: {
        enabled: ai.enabled,
        configured: ai.configured,
        ready: ai.ready,
        model: ai.model,
      },
      readyForPilot:
        databaseOk &&
        metaConfigured &&
        metaLive &&
        templatesConfigured &&
        webhookConfigured &&
        turnstileConfigured &&
        pilotConfigured,
    });
  })
  .put("/", async (c) => {
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = PutSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "payload inválido" }, 400);
    const s = settingsDb(c.env.DB);
    const connectionChanged =
      body.data.whatsapp_phone_id !== undefined ||
      body.data.whatsapp_waba_id !== undefined;
    for (const [k, v] of Object.entries(body.data)) {
      if (v === undefined) continue;
      await s.set(k, String(v));
    }
    if (!connectionChanged) return c.json({ ok: true });

    // A lista local é a fonte usada por Inbox e campanhas. Ao conectar ou
    // trocar o número/WABA, ela precisa refletir a Meta imediatamente, sem
    // obrigar o operador a descobrir uma segunda ação em Templates.
    const credentials = await getCredentials(c.env);
    if (!credentials?.wabaId)
      return c.json({ ok: true, templateSync: { status: "pending" } });
    const db = templatesDb(c.env.DB);
    const lockId = crypto.randomUUID();
    if (!(await db.tryAcquireSyncLock(lockId)))
      return c.json({ ok: true, templateSync: { status: "in_progress" } });
    try {
      const templates = await whatsappClient(credentials).fetchTemplates(
        credentials.wabaId,
      );
      // replaceFromMeta roda somente depois da resposta completa da Meta;
      // uma falha de rede jamais apaga a cópia local já utilizável.
      await db.replaceFromMeta(templates);
      return c.json({
        ok: true,
        templateSync: { status: "synced", synced: templates.length },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "falha ao sincronizar templates";
      // A sincronização é um efeito posterior à persistência. Falha da Meta não
      // pode transformar um salvamento já concluído em erro nem fazer a UI
      // descartar Phone ID/WABA válidos.
      return c.json({
        ok: true,
        templateSync: { status: "failed", detail },
      });
    } finally {
      await db.releaseSyncLock(lockId);
    }
  });
