import { Hono } from "hono";
import { z } from "zod";
import { readJsonBody } from "./body";
import { settingsDb } from "../db/settings";
import { templatesDb } from "../db/templates";
import { normalizePhone } from "../domain/phone";
import {
  finalizeVaultRotation,
  getVaultRotationInfo,
  hasValidVaultKey,
  META_VAULT_RECORD,
  recoverStaleVaultRotation,
  rotateVaultKey,
  writeVaultJsonWhenIdle,
} from "../security/vault";
import { getCredentials, getMetaSecrets, type MetaSecrets } from "../whatsapp/credentials";
import { whatsappClient } from "../whatsapp/client";
import { probeMeta } from "../whatsapp/health";
import {
  configureMetaAppWebhookSubscription,
  configureMetaPhoneWebhookOverride,
  configureMetaWabaWebhookOverride,
  MetaFlowApiError,
} from "../whatsapp/flows";
import { reconcileSetupMessageDelivery } from "../setup/delivery";

const MetaSetupSchema = z.object({
  token: z.string().min(20).max(4096),
  appId: z.string().regex(/^\d{5,32}$/),
  appSecret: z.string().min(8).max(1024),
  verifyToken: z.string().min(16).max(512),
  phoneId: z.string().regex(/^\d{5,32}$/),
  wabaId: z.string().regex(/^\d{5,32}$/),
  graphVersion: z.string().regex(/^v\d+\.\d+$/).default("v25.0"),
});

const TestMessageSchema = z.object({
  phone: z.string().min(8).max(32),
  templateName: z.string().regex(/^[a-z0-9_]{1,512}$/).default("hello_world"),
  language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/).default("en_US"),
  authorized: z.literal(true),
});

async function setCheck(
  db: D1Database,
  id: string,
  status: "pending" | "passed" | "failed",
  detail: string,
) {
  await db.prepare(
    `INSERT INTO setup_checks(id,status,detail,checked_at)
     VALUES(?1,?2,?3,datetime('now'))
     ON CONFLICT(id) DO UPDATE SET status=excluded.status,detail=excluded.detail,checked_at=excluded.checked_at`,
  ).bind(id, status, detail.slice(0, 500)).run();
}

async function updateInstallation(
  db: D1Database,
  status: "configuring" | "ready" | "failed",
  lastStep: string,
  lastError: string | null = null,
) {
  await db.prepare(
    `UPDATE setup_installation
     SET status=?1,last_step=?2,last_error=?3,revision=revision+1,updated_at=datetime('now')
     WHERE id=1`,
  ).bind(status, lastStep, lastError?.slice(0, 500) ?? null).run();
}

export function workflowProbeOutputOk(output: unknown): boolean {
  let decoded = output;
  if (typeof decoded === "string") {
    try {
      decoded = JSON.parse(decoded);
    } catch {
      return false;
    }
  }
  return Boolean(decoded && typeof decoded === "object" && "ok" in decoded && decoded.ok === true);
}

export function workflowProbeStatusOk(result: { status: string; output?: unknown }): boolean {
  if (result.status !== "complete") return false;
  // A API de Workflows pode sinalizar a conclusão antes de materializar o
  // output final no status. A conclusão já comprova que o step obrigatório
  // terminou; quando o output estiver presente, ainda validamos seu contrato.
  return result.output === undefined || workflowProbeOutputOk(result.output);
}

async function probeWorkflow(workflow: Workflow<{ probe: string }>): Promise<boolean> {
  try {
    const instance = await workflow.create({
      id: `setup-${crypto.randomUUID()}`,
      params: { probe: "smartzap-setup" },
      retention: { successRetention: "1 day", errorRetention: "1 day" },
    });
    for (let attempt = 0; attempt < 18; attempt++) {
      const result = await instance.status();
      if (result.status === "complete") return workflowProbeStatusOk(result);
      if (["errored", "terminated", "unknown"].includes(result.status)) return false;
      await scheduler.wait(Math.min(250 * (2 ** attempt), 4_000));
    }
    return false;
  } catch {
    return false;
  }
}

async function setupState(env: Env) {
  let databaseOk = false;
  try {
    databaseOk = (await env.DB.prepare("SELECT 1 ok").first<{ ok: number }>())?.ok === 1;
  } catch {
    databaseOk = false;
  }
  const [meta, credentials, checks, approved, cronLastRun, vaultMetaCount, rotationInfo, installation, mediaOk, queuesOk, durableObjectsOk, rateLimitOk] = await Promise.all([
    getMetaSecrets(env).catch(() => null),
    getCredentials(env).catch(() => null),
    env.DB.prepare("SELECT id,status,detail,checked_at FROM setup_checks ORDER BY id")
      .all<{ id: string; status: string; detail: string | null; checked_at: string }>()
      .then((result) => result.results)
      .catch(() => []),
    env.DB.prepare("SELECT COUNT(*) total FROM templates WHERE status='APPROVED'")
      .first<{ total: number }>()
      .then((row) => Number(row?.total ?? 0))
      .catch(() => 0),
    settingsDb(env.DB).get("cron_last_run").catch(() => null),
    env.DB.prepare("SELECT COUNT(*) total FROM secret_vault WHERE name=?1")
      .bind(META_VAULT_RECORD)
      .first<{ total: number }>()
      .then((row) => Number(row?.total ?? 0))
      .catch(() => 0),
    getVaultRotationInfo(env.DB).catch(() => ({ status: "idle" as const, updatedAt: null })),
    env.DB.prepare(
      "SELECT status,last_step,last_error,revision,started_at,updated_at FROM setup_installation WHERE id=1",
    ).first<{
      status: "configuring" | "ready" | "failed";
      last_step: string;
      last_error: string | null;
      revision: number;
      started_at: string;
      updated_at: string;
    }>().catch(() => null),
    env.MEDIA.head("__smartzap_setup_probe__").then(() => true).catch(() => false),
    Promise.all([
      env.WEBHOOK_QUEUE.metrics(),
      env.AUTOMATION_QUEUE.metrics(),
      env.CAPI_QUEUE.metrics(),
      env.CAPI_DLQ.metrics(),
      env.WEBHOOK_DLQ.metrics(),
      env.AUTOMATION_DLQ.metrics(),
    ]).then(() => true).catch(() => false),
    Promise.all([
      env.REALTIME.getByName("setup-health").health(),
      env.THROTTLE.getByName("setup-health").health(),
    ]).then((values) => values.every(Boolean)).catch(() => false),
    env.LOGIN_LIMITER.limit({ key: "setup-health" }).then(() => true).catch(() => false),
  ]);
  const rotationStatus = rotationInfo.status;
  const status = Object.fromEntries(checks.map((check) => [check.id, check]));
  const infrastructure = {
    database: databaseOk,
    media: mediaOk,
    webhookQueue: queuesOk,
    automationQueue: queuesOk,
    conversionQueue: queuesOk,
    workflow: status.workflow_probe?.status === "passed" && Boolean(env.CAMPAIGN_WF),
    durableObjects: durableObjectsOk,
    rateLimit: rateLimitOk,
    workersAi: Boolean(env.AI),
    aiSearch: Boolean(env.AI_SEARCH),
    cron: (status.cron_config?.status === "passed" && isRecent(status.cron_config.checked_at, 30 * 60 * 1000))
      || isRecent(cronLastRun, 30 * 60 * 1000),
  };
  const requiredInfrastructure = Object.entries(infrastructure)
    .filter(([name]) => !["workersAi", "aiSearch"].includes(name))
    .every(([, ready]) => ready);
  const persistedComplete = (await settingsDb(env.DB).get("setup_complete")) === "true";
  const complete = persistedComplete
    && requiredInfrastructure
    && hasValidVaultKey(env.SMARTZAP_VAULT_KEY)
    && rotationStatus === "idle"
    && Boolean(credentials)
    && status.meta_credentials?.status === "passed"
    && status.templates?.status === "passed"
    && status.real_message?.status === "passed";
  return {
    infrastructure,
    vault: {
      configured: hasValidVaultKey(env.SMARTZAP_VAULT_KEY),
      rotationReady: hasValidVaultKey(env.SMARTZAP_VAULT_KEY_NEXT),
      rotationStatus,
      rotationUpdatedAt: rotationInfo.updatedAt,
      metaStored: vaultMetaCount === 1,
    },
    meta: {
      configured: Boolean(credentials),
      appId: meta?.appId ?? null,
      phoneId: credentials?.phoneId ?? null,
      wabaId: credentials?.wabaId ?? null,
      callbackUrl: meta?.callbackUrl ?? null,
      graphVersion: meta?.graphVersion ?? env.META_GRAPH_VERSION ?? "v25.0",
    },
    templates: { approved },
    checks: status,
    installation,
    required: env.SETUP_REQUIRED === "true",
    complete,
  };
}

function isRecent(value: string | null | undefined, maxAgeMs: number): boolean {
  if (!value) return false;
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) && Date.now() - timestamp >= 0 && Date.now() - timestamp < maxAgeMs;
}

export const setupRoutes = new Hono<{ Bindings: Env }>()
  .get("/status", async (c) => c.json(await setupState(c.env)))
  .post("/infrastructure/probe", async (c) => {
    const workflowOk = await probeWorkflow(c.env.SETUP_WF);
    await setCheck(
      c.env.DB,
      "workflow_probe",
      workflowOk ? "passed" : "failed",
      workflowOk
        ? "Workflow de diagnóstico executado e binding de campanhas presente"
        : "Workflow indisponível; confira o provisionamento antes de continuar",
    );
    if (!workflowOk) {
      await updateInstallation(c.env.DB, "failed", "infrastructure", "Workflow indisponível");
      return c.json({ error: "Workflow indisponível; confira o provisionamento" }, 503);
    }
    await updateInstallation(c.env.DB, "configuring", "infrastructure");
    return c.json({ ok: true });
  })
  .put("/meta", async (c) => {
    if (!c.env.SMARTZAP_VAULT_KEY || !hasValidVaultKey(c.env.SMARTZAP_VAULT_KEY))
      return c.json({ error: "cofre indisponível; configure SMARTZAP_VAULT_KEY no Worker" }, 503);
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const parsed = MetaSetupSchema.safeParse(raw.value);
    if (!parsed.success)
      return c.json({ error: "dados da Meta inválidos; confira IDs, token e segredos" }, 400);
    const callbackUrl = `${new URL(c.req.url).origin}/webhook`;
    if (new URL(callbackUrl).protocol !== "https:" && c.env.ENVIRONMENT === "production")
      return c.json({ error: "o webhook de produção precisa usar HTTPS" }, 400);
    const meta: MetaSecrets = {
      token: parsed.data.token,
      appId: parsed.data.appId,
      appSecret: parsed.data.appSecret,
      verifyToken: parsed.data.verifyToken,
      callbackUrl,
      graphVersion: parsed.data.graphVersion,
    };
    try {
      await writeVaultJsonWhenIdle(c.env.DB, c.env.SMARTZAP_VAULT_KEY, META_VAULT_RECORD, meta);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "não foi possível salvar no cofre";
      await updateInstallation(c.env.DB, "failed", "meta", detail);
      return c.json({ error: detail }, 409);
    }
    const settings = settingsDb(c.env.DB);
    await Promise.all([
      settings.set("whatsapp_phone_id", parsed.data.phoneId),
      settings.set("whatsapp_waba_id", parsed.data.wabaId),
      settings.set("setup_complete", "false"),
      setCheck(c.env.DB, "meta_credentials", "pending", "credenciais salvas; validação real pendente"),
      updateInstallation(c.env.DB, "configuring", "meta"),
    ]);
    return c.json({ ok: true, callbackUrl });
  })
  .post("/meta/webhook/configure", async (c) => {
    const credentials = await getCredentials(c.env).catch(() => null);
    if (!credentials)
      return c.json({ error: "credenciais da Meta ainda não foram cadastradas" }, 409);
    if (!credentials.verifyToken)
      return c.json({ error: "Verify Token ausente; salve novamente as credenciais da Meta" }, 409);
    const verifyToken = credentials.verifyToken;

    const callbackUrl = `${new URL(c.req.url).origin}/webhook`;
    if (new URL(callbackUrl).protocol !== "https:" && c.env.ENVIRONMENT === "production")
      return c.json({ error: "o webhook de produção precisa usar HTTPS" }, 400);
    const operationalCredentials = { ...credentials, callbackUrl };

    try {
      // A precedência da Meta é número → WABA → aplicativo. Configuramos os
      // três níveis para que um override antigo não desvie os callbacks da
      // instalação nova. Nenhum secret deixa o Worker.
      await configureMetaAppWebhookSubscription({
        version: operationalCredentials.graphVersion,
        appId: operationalCredentials.appId,
        appSecret: operationalCredentials.appSecret,
        callbackUrl,
        verifyToken,
      });
      await configureMetaWabaWebhookOverride({
        version: operationalCredentials.graphVersion,
        wabaId: operationalCredentials.wabaId,
        token: operationalCredentials.token,
        callbackUrl,
        verifyToken,
      });
      await configureMetaPhoneWebhookOverride({
        version: operationalCredentials.graphVersion,
        phoneId: operationalCredentials.phoneId,
        token: operationalCredentials.token,
        callbackUrl,
        verifyToken,
      });

      const result = await probeMeta(operationalCredentials);
      if (!result.ok) {
        const detail = result.error || "a Meta não confirmou o callback desta instalação";
        await Promise.all([
          setCheck(c.env.DB, "meta_credentials", "failed", detail),
          updateInstallation(c.env.DB, "failed", "meta_webhook", detail),
        ]);
        return c.json({ error: detail, code: result.code }, 502);
      }

      await Promise.all([
        setCheck(
          c.env.DB,
          "meta_credentials",
          "passed",
          "token, aplicativo, WABA, número e webhook validados na Meta",
        ),
        updateInstallation(c.env.DB, "configuring", "meta_webhook"),
      ]);
      return c.json({ ok: true, callbackUrl });
    } catch (error) {
      const detail = error instanceof MetaFlowApiError
        ? error.message
        : "não foi possível configurar o webhook automaticamente";
      await Promise.all([
        setCheck(c.env.DB, "meta_credentials", "failed", detail),
        updateInstallation(c.env.DB, "failed", "meta_webhook", detail),
      ]);
      return c.json({ error: detail }, 502);
    }
  })
  .post("/meta/validate", async (c) => {
    const credentials = await getCredentials(c.env).catch(() => null);
    if (!credentials) return c.json({ error: "credenciais da Meta ainda não foram cadastradas" }, 409);
    const result = await probeMeta(credentials);
    if (!result.ok) {
      await Promise.all([
        setCheck(c.env.DB, "meta_credentials", "failed", result.error || "Meta rejeitou a validação"),
        updateInstallation(c.env.DB, "failed", "meta_validation", result.error || "Meta rejeitou a validação"),
      ]);
      return c.json({ error: result.error || "Meta rejeitou a validação", code: result.code }, 502);
    }
    await Promise.all([
      setCheck(c.env.DB, "meta_credentials", "passed", "token, aplicativo, WABA e número validados na Meta"),
      updateInstallation(c.env.DB, "configuring", "meta_validated"),
    ]);
    return c.json({ ok: true, verificationStatus: result.verificationStatus });
  })
  .post("/vault/rotate", async (c) => {
    const currentKey = c.env.SMARTZAP_VAULT_KEY;
    const nextKey = c.env.SMARTZAP_VAULT_KEY_NEXT;
    if (!hasValidVaultKey(currentKey) || !hasValidVaultKey(nextKey))
      return c.json({ error: "configure SMARTZAP_VAULT_KEY_NEXT antes de iniciar a rotação" }, 409);
    try {
      const rotated = await rotateVaultKey(c.env.DB, currentKey!, nextKey!);
      await setCheck(
        c.env.DB,
        "vault_rotation",
        "passed",
        `${rotated} registro(s) recifrado(s); promova a chave temporária e remova SMARTZAP_VAULT_KEY_NEXT`,
      );
      return c.json({ ok: true, rotated, next: "promote_and_remove_temporary_key" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "não foi possível rotacionar o cofre";
      await setCheck(c.env.DB, "vault_rotation", "failed", detail);
      return c.json({ error: detail }, 409);
    }
  })
  .post("/vault/finalize", async (c) => {
    const currentKey = c.env.SMARTZAP_VAULT_KEY;
    const nextKey = c.env.SMARTZAP_VAULT_KEY_NEXT;
    if (!hasValidVaultKey(currentKey))
      return c.json({ error: "SMARTZAP_VAULT_KEY promovida está ausente ou inválida" }, 409);
    if (hasValidVaultKey(nextKey) && nextKey !== currentKey)
      return c.json({ error: "promova a chave temporária e remova SMARTZAP_VAULT_KEY_NEXT antes de finalizar" }, 409);
    try {
      await finalizeVaultRotation(c.env.DB, currentKey!);
      await setCheck(c.env.DB, "vault_rotation", "passed", "nova chave promovida e cofre desbloqueado");
      return c.json({ ok: true });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "não foi possível finalizar a rotação";
      return c.json({ error: detail }, 409);
    }
  })
  .post("/vault/recover", async (c) => {
    const currentKey = c.env.SMARTZAP_VAULT_KEY;
    if (!hasValidVaultKey(currentKey))
      return c.json({ error: "SMARTZAP_VAULT_KEY ativa está ausente ou inválida" }, 409);
    try {
      await recoverStaleVaultRotation(c.env.DB, currentKey!);
      await setCheck(c.env.DB, "vault_rotation", "passed", "rotação interrompida recuperada; cofre desbloqueado");
      return c.json({ ok: true });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "não foi possível recuperar a rotação";
      return c.json({ error: detail }, 409);
    }
  })
  .post("/templates/sync", async (c) => {
    const credentials = await getCredentials(c.env).catch(() => null);
    if (!credentials) return c.json({ error: "Meta ainda não está configurada" }, 409);
    const templates = await whatsappClient(credentials).fetchTemplates(credentials.wabaId);
    await templatesDb(c.env.DB).replaceFromMeta(templates);
    const approved = templates.filter((template) => template.status === "APPROVED").length;
    await setCheck(
      c.env.DB,
      "templates",
      approved > 0 ? "passed" : "failed",
      approved > 0 ? `${approved} template(s) aprovado(s) sincronizado(s)` : "nenhum template aprovado encontrado",
    );
    await updateInstallation(
      c.env.DB,
      approved > 0 ? "configuring" : "failed",
      "templates",
      approved > 0 ? null : "nenhum template aprovado encontrado",
    );
    return c.json({ ok: approved > 0, synced: templates.length, approved }, approved > 0 ? 200 : 409);
  })
  .post("/test-message", async (c) => {
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const parsed = TestMessageSchema.safeParse(raw.value);
    if (!parsed.success) return c.json({ error: "confirme o número autorizado e o template" }, 400);
    const phone = normalizePhone(parsed.data.phone);
    if (!phone) return c.json({ error: "telefone de teste inválido" }, 400);
    const credentials = await getCredentials(c.env).catch(() => null);
    if (!credentials) return c.json({ error: "Meta ainda não está configurada" }, 409);
    const callbackId = crypto.randomUUID();
    const result = await whatsappClient(credentials).sendTemplate(
      phone.replace(/^\+/, ""),
      { name: parsed.data.templateName, language: parsed.data.language },
      callbackId,
    );
    if (!result.ok) {
      await Promise.all([
        setCheck(c.env.DB, "real_message", "failed", result.detail),
        updateInstallation(c.env.DB, "failed", "real_message", result.detail),
      ]);
      return c.json({ error: result.detail, code: result.code }, 502);
    }
    const settings = settingsDb(c.env.DB);
    await Promise.all([
      settings.set("setup_test_message_id", result.messageId),
      settings.set("setup_test_recipient_suffix", phone.slice(-4)),
      setCheck(c.env.DB, "real_message", "pending", "mensagem aceita pela Meta; aguardando delivered/read"),
      updateInstallation(c.env.DB, "configuring", "real_message"),
    ]);
    return c.json({ ok: true, status: "sent", recipient: `…${phone.slice(-4)}` });
  })
  .get("/test-message/status", async (c) => {
    const messageId = await settingsDb(c.env.DB).get("setup_test_message_id");
    if (!messageId) return c.json({ status: "not_sent" });
    const { passed, statuses } = await reconcileSetupMessageDelivery(c.env.DB, messageId);
    return c.json({ status: passed ? "read" : statuses.length ? "incomplete" : "sent", statuses: [...new Set(statuses)] });
  })
  .post("/complete", async (c) => {
    const state = await setupState(c.env);
    const requiredInfrastructure = Object.entries(state.infrastructure)
      .filter(([name]) => !["workersAi", "aiSearch"].includes(name))
      .every(([, ready]) => ready);
    const metaPassed = state.checks.meta_credentials?.status === "passed";
    const templatesPassed = state.checks.templates?.status === "passed";
    const messagePassed = state.checks.real_message?.status === "passed";
    const vaultReady = state.vault.configured && state.vault.rotationStatus === "idle";
    if (!requiredInfrastructure || !vaultReady || !metaPassed || !templatesPassed || !messagePassed)
      return c.json({ error: "o núcleo ainda não está verde; conclua os itens pendentes" }, 409);
    await Promise.all([
      settingsDb(c.env.DB).set("setup_complete", "true"),
      updateInstallation(c.env.DB, "ready", "complete"),
    ]);
    return c.json({ ok: true });
  });
