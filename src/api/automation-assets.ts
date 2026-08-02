import { Hono } from "hono";
import { z } from "zod";
import { readJsonBody } from "./body";
import { normalizePhone } from "../domain/phone";
import { contactsDb } from "../db/contacts";
import { generateTemplateFactory } from "../ai/template-factory";
import { generateFlowDefinition } from "../ai/flow-generator";
import { getCredentials } from "../whatsapp/credentials";
import { whatsappClient } from "../whatsapp/client";
import { assertPilotInboxRecipient, PilotSafetyError } from "../domain/pilot";
import { googleCalendarStatus } from "../integrations/google-calendar";
import { resolveQaMetaCallbackUrl } from "../domain/meta-callback";
import {
  buildMetaFlowJson,
  validateMetaFlowJson,
  createMetaFlow,
  configureMetaAppWebhookSubscription,
  configureMetaPhoneWebhookOverride,
  getMetaFlowDetails,
  getMetaFlowEncryptionPublicKeyStatus,
  getMetaFlowPreview,
  MetaFlowApiError,
  publishMetaFlow,
  setMetaFlowEncryptionPublicKey,
  updateMetaFlow,
  validateFlowEncryptionKeyPair,
  flowPublicKeysMatch,
} from "../whatsapp/flows";

const flowSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    definition: z.record(z.string(), z.unknown()).optional(),
    mapping: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
const flowSendSchema = z
  .object({
    to: z.string().trim().min(8).max(40),
    body: z.string().trim().min(1).max(1024).default("Vamos começar?"),
    ctaText: z.string().trim().min(1).max(30).default("Abrir"),
    footer: z.string().trim().max(60).optional(),
    mode: z.enum(["draft", "published"]).default("published"),
  })
  .strict();
const formSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{1,100}$/),
    tagId: z.string().uuid().nullable().optional(),
    active: z.boolean().optional(),
    collectEmail: z.boolean().optional(),
    successMessage: z.string().trim().max(1000).nullable().optional(),
    fields: z
      .array(
        z.object({
          key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
          label: z.string().min(1).max(120),
          type: z.enum(["text", "number", "date", "select"]).optional(),
          required: z.boolean().optional(),
          options: z.array(z.string().min(1).max(100)).max(50).optional(),
        }),
      )
      .max(30)
      .optional(),
  })
  .strict();
const decodeForm = (row: Record<string, unknown>) => ({
  ...row,
  active: Boolean(row.active),
  collectEmail: Boolean(row.collect_email),
  successMessage: row.success_message ?? "",
  fields: JSON.parse(String(row.fields_json || "[]")),
  fields_json: undefined,
  collect_email: undefined,
  success_message: undefined,
});
const PUBLIC_FORM_CONSENT =
  "Aceito receber mensagens deste negócio pelo WhatsApp após enviar este formulário.";
const decodeFlow = (row: Record<string, unknown>) => ({
  ...row,
  definition: JSON.parse(String(row.definition_json || "{}")),
  mapping: JSON.parse(String(row.mapping_json || "{}")),
  validationErrors: JSON.parse(
    String(row.meta_validation_errors_json || "null"),
  ),
  healthStatus: JSON.parse(String(row.meta_health_json || "null")),
  definition_json: undefined,
  mapping_json: undefined,
  meta_validation_errors_json: undefined,
  meta_health_json: undefined,
});
const localFlowStatus = (status: string | null, validationErrors: unknown) => {
  if (status === "PUBLISHED") return "PUBLISHED";
  if (
    (Array.isArray(validationErrors) && validationErrors.length > 0) ||
    (validationErrors && typeof validationErrors === "object")
  )
    return "ACTION_REQUIRED";
  if (["BLOCKED", "THROTTLED", "DEPRECATED"].includes(String(status)))
    return "ACTION_REQUIRED";
  return status === "DRAFT" ? "DRAFT" : "IN_REVIEW";
};
const hasMetaValidationErrors = (value: unknown) =>
  Array.isArray(value)
    ? value.length > 0
    : Boolean(value) && typeof value === "object";
const redactFlowValidationErrors = (value: unknown) => {
  const text = JSON.stringify(value);
  return text.length > 4_000 ? `${text.slice(0, 4_000)}…` : value;
};
const percentile = (values: number[], ratio: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
};
async function persistFlowPublication(
  db: D1Database,
  id: string,
  metaId: string,
  metaStatus: string | null,
  validationErrors: unknown,
  previewUrl: string | null,
  details?: {
    healthStatus?: unknown;
    endpointUri?: string | null;
    dataApiVersion?: string | null;
    applicationId?: string | null;
  },
) {
  const status = localFlowStatus(metaStatus, validationErrors);
  await db
    .prepare(
      `UPDATE flows SET meta_id=?2,status=?3,meta_status=?4,meta_preview_url=?5,
       meta_validation_errors_json=?6,meta_health_json=?7,meta_endpoint_uri=?8,
       meta_data_api_version=?9,meta_application_id=?10,
       meta_last_checked_at=datetime('now'),
       meta_published_at=CASE WHEN ?3='PUBLISHED' THEN datetime('now') ELSE meta_published_at END,
       updated_at=datetime('now') WHERE id=?1`,
    )
    .bind(
      id,
      metaId,
      status,
      metaStatus,
      previewUrl,
      JSON.stringify(validationErrors ?? null),
      JSON.stringify(details?.healthStatus ?? null),
      details?.endpointUri ?? null,
      details?.dataApiVersion ?? null,
      details?.applicationId ?? null,
    )
    .run();
}
export const flowsRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) =>
    c.json({
      items: (
        await c.env.DB.prepare(
          "SELECT * FROM flows ORDER BY updated_at DESC,id",
        ).all()
      ).results.map((r) => decodeFlow(r as Record<string, unknown>)),
    }),
  )
  .post("/", async (c) => {
    const raw = await readJsonBody(c, 64_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = flowSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "MiniApp inválido" }, 400);
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO flows(id,name,definition_json,mapping_json)VALUES(?1,?2,?3,?4)",
    )
      .bind(
        id,
        body.data.name,
        JSON.stringify(body.data.definition || {}),
        JSON.stringify(body.data.mapping || {}),
      )
      .run();
    return c.json(
      await c.env.DB.prepare("SELECT * FROM flows WHERE id=?1")
        .bind(id)
        .first(),
      201,
    );
  })
  .post("/generate", async (c) => {
    const raw = await readJsonBody(c, 16_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({ prompt: z.string().trim().min(10).max(4000) })
      .strict()
      .safeParse(raw.value);
    if (!body.success)
      return c.json({ error: "pedido de geração inválido" }, 400);
    try {
      return c.json({
        definition: await generateFlowDefinition(c.env, body.data.prompt),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "provider_error";
      return c.json(
        {
          error:
            code === "ai_not_configured"
              ? "IA não configurada"
              : code === "invalid_ai_output"
                ? "A IA retornou uma estrutura inválida"
                : "O provedor de IA não respondeu",
          code,
        },
        code === "ai_not_configured" ? 503 : 502,
      );
    }
  })
  .get("/meta/health", async (c) => {
    const credentials = await getCredentials(c.env);
    if (!credentials)
      return c.json({ ready: false, error: "Credenciais da Meta não configuradas" }, 400);
    let localKey: { valid: boolean; modulusLength: number | null; configured: boolean } = {
      valid: false,
      modulusLength: null,
      configured: Boolean(c.env.FLOW_PRIVATE_KEY && c.env.FLOW_PUBLIC_KEY),
    };
    if (c.env.FLOW_PRIVATE_KEY && c.env.FLOW_PUBLIC_KEY) {
      try {
        const result = await validateFlowEncryptionKeyPair(
          c.env.FLOW_PRIVATE_KEY,
          c.env.FLOW_PUBLIC_KEY,
        );
        localKey = { configured: true, valid: true, modulusLength: result.modulusLength };
      } catch {
        localKey = { configured: true, valid: false, modulusLength: null };
      }
    }
    let remoteKeyStatus: string | null = null;
    let remoteKeyMatches = false;
    try {
      const remote = await getMetaFlowEncryptionPublicKeyStatus({
          token: credentials.token,
          version: credentials.graphVersion,
          phoneId: credentials.phoneId,
        });
      remoteKeyStatus = remote.status;
      remoteKeyMatches = Boolean(
        c.env.FLOW_PUBLIC_KEY && flowPublicKeysMatch(c.env.FLOW_PUBLIC_KEY, remote.publicKey),
      );
    } catch {
      remoteKeyStatus = null;
    }
    const items = (
      await c.env.DB.prepare(
        `SELECT id,name,meta_id,meta_status,status,meta_health_json,
                meta_endpoint_uri,meta_data_api_version,meta_application_id,
                local_revision,synced_revision,published_meta_id,published_revision
         FROM flows WHERE meta_id IS NOT NULL ORDER BY updated_at DESC LIMIT 100`,
      ).all()
    ).results.map((row) => ({
      ...row,
      health: JSON.parse(String((row as Record<string, unknown>).meta_health_json || "null")),
      meta_health_json: undefined,
      synchronized:
        Number((row as Record<string, unknown>).local_revision) ===
        Number((row as Record<string, unknown>).synced_revision),
    }));
    const metricRows = (
      await c.env.DB.prepare(
        `SELECT success,latency_ms FROM flow_endpoint_metrics
         WHERE recorded_at>=datetime('now','-24 hours')
         ORDER BY recorded_at DESC LIMIT 1000`,
      ).all<{ success: number; latency_ms: number }>()
    ).results;
    const latencies = metricRows.map((row) => row.latency_ms);
    return c.json({
      ready: localKey.valid && remoteKeyStatus === "VALID" && remoteKeyMatches,
      localKey,
      remoteKeyStatus: remoteKeyStatus ?? "UNKNOWN",
      remoteKeyMatches,
      endpointMetrics24h: {
        requests: metricRows.length,
        failures: metricRows.filter((row) => !row.success).length,
        p50Ms: percentile(latencies, 0.5),
        p90Ms: percentile(latencies, 0.9),
      },
      items,
    });
  })
  .post("/meta/webhook-subscription", async (c) => {
    const credentials = await getCredentials(c.env);
    if (!credentials)
      return c.json({ error: "Credenciais da Meta não configuradas" }, 400);
    if (!c.env.META_VERIFY_TOKEN)
      return c.json({ error: "Verify token do webhook não configurado" }, 400);
    const rawBody = await readJsonBody(c, 2_048);
    if (!rawBody.ok) return c.json({ error: rawBody.error }, rawBody.status);
    const requestedTarget =
      rawBody.value && typeof rawBody.value === "object"
        ? (rawBody.value as Record<string, unknown>).qaCallbackTarget
        : undefined;
    const callback = resolveQaMetaCallbackUrl(
      c.env.ENVIRONMENT,
      requestedTarget,
      credentials.callbackUrl,
    );
    if (!callback.ok) return c.json({ error: callback.error }, callback.status);
    try {
      if (callback.target) {
        await configureMetaPhoneWebhookOverride({
          version: credentials.graphVersion,
          phoneId: credentials.phoneId,
          token: credentials.token,
          callbackUrl: callback.url,
          verifyToken: c.env.META_VERIFY_TOKEN,
        });
      } else {
        await configureMetaAppWebhookSubscription({
          version: credentials.graphVersion,
          appId: credentials.appId,
          appSecret: credentials.appSecret,
          callbackUrl: callback.url,
          verifyToken: c.env.META_VERIFY_TOKEN,
        });
      }
      const probe = await whatsappClient(credentials).checkOperational(credentials.wabaId);
      return c.json({
        ok: true,
        callbackUrl: callback.target
          ? probe.phoneWebhookCallbackUrl ?? callback.url
          : probe.appWebhookCallbackUrl ?? callback.url,
        qaCallbackTarget: callback.target,
        fields: probe.appWebhookFields,
        flowsSubscribed: probe.appWebhookFields.includes("flows"),
      });
    } catch (error) {
      if (error instanceof MetaFlowApiError)
        return c.json({ error: error.message, code: error.code, subcode: error.subcode }, 400);
      return c.json({ error: error instanceof Error ? error.message : "Falha ao configurar webhook" }, 502);
    }
  })
  .get("/:id", async (c) => {
    const row = await c.env.DB.prepare("SELECT * FROM flows WHERE id=?1")
      .bind(c.req.param("id"))
      .first();
    return row
      ? c.json(decodeFlow(row as Record<string, unknown>))
      : c.json({ error: "MiniApp não encontrado" }, 404);
  })
  .patch("/:id", async (c) => {
    const raw = await readJsonBody(c, 256_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = flowSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "MiniApp inválido" }, 400);
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO flow_meta_versions
       (id,flow_local_id,meta_flow_id,status,local_revision,definition_json)
       SELECT lower(hex(randomblob(16))),id,meta_id,meta_status,local_revision,definition_json
       FROM flows WHERE id=?1 AND meta_id IS NOT NULL AND meta_status='PUBLISHED'`,
    ).bind(c.req.param("id")).run();
    await c.env.DB.prepare(
      `UPDATE flows SET name=?2,definition_json=?3,mapping_json=?4,status='DRAFT',
       local_revision=local_revision+1,updated_at=datetime('now') WHERE id=?1`,
    )
      .bind(
        c.req.param("id"),
        body.data.name,
        JSON.stringify(body.data.definition || {}),
        JSON.stringify(body.data.mapping || {}),
      )
      .run();
    const row = await c.env.DB.prepare("SELECT * FROM flows WHERE id=?1")
      .bind(c.req.param("id"))
      .first();
    return row
      ? c.json(decodeFlow(row as Record<string, unknown>))
      : c.json({ error: "MiniApp não encontrado" }, 404);
  })
  .post("/:id/send", async (c) => {
    const raw = await readJsonBody(c, 8_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const input = flowSendSchema.safeParse(raw.value);
    if (!input.success) return c.json({ error: "teste da MiniApp inválido" }, 400);
    const to = normalizePhone(input.data.to);
    if (!to) return c.json({ error: "telefone inválido" }, 400);
    const row = await c.env.DB.prepare(
      `SELECT id,name,status,meta_status,meta_id,definition_json,
              published_meta_id,local_revision,synced_revision,
              (SELECT definition_json FROM flow_meta_versions v
               WHERE v.flow_local_id=flows.id AND v.meta_flow_id=flows.published_meta_id
               LIMIT 1) AS published_definition_json
       FROM flows WHERE id=?1`,
    )
      .bind(c.req.param("id"))
      .first<Record<string, unknown>>();
    if (!row) return c.json({ error: "MiniApp não encontrado" }, 404);
    const selectedMetaId = input.data.mode === "published"
      ? String(row.published_meta_id ?? (row.meta_status === "PUBLISHED" ? row.meta_id ?? "" : ""))
      : String(row.meta_id ?? "");
    if (!selectedMetaId)
      return c.json({ error: "envie a MiniApp como rascunho para a Meta antes de testar" }, 409);
    if (
      input.data.mode === "draft" &&
      Number(row.local_revision) !== Number(row.synced_revision)
    )
      return c.json({ error: "sincronize a versão local com a Meta antes de testar" }, 409);
    if (input.data.mode === "published" && !row.published_meta_id && row.meta_status !== "PUBLISHED")
      return c.json({ error: "publique a MiniApp na Meta antes do teste publicado" }, 409);
    if (input.data.mode === "draft" && row.meta_status !== "DRAFT")
      return c.json({ error: "a versão atual não está em modo draft na Meta" }, 409);
    const credentials = await getCredentials(c.env);
    if (!credentials) return c.json({ error: "Credenciais da Meta não configuradas" }, 400);
    try {
      assertPilotInboxRecipient(c.env, to);
    } catch (error) {
      if (error instanceof PilotSafetyError)
        return c.json({ error: error.message }, error.status);
      throw error;
    }
    const definition = JSON.parse(String(
      input.data.mode === "published"
        ? row.published_definition_json ?? row.definition_json ?? "{}"
        : row.definition_json ?? "{}",
    ));
    const dynamic = definition.dynamicBooking === true || Object.values(definition.branchesByScreen ?? {}).some(
      (rules) => Array.isArray(rules) && rules.length > 0,
    );
    const id = crypto.randomUUID();
    const flowToken = `smartzap:${selectedMetaId}:${id}`;
    const result = await whatsappClient(credentials).sendFlow(
      to,
      {
        flowId: selectedMetaId,
        flowToken,
        body: input.data.body,
        ctaText: input.data.ctaText,
        footer: input.data.footer,
        action: dynamic ? "data_exchange" : "navigate",
        mode: input.data.mode,
      },
      id,
    );
    await c.env.DB.prepare(
      `INSERT INTO flow_submissions
       (id,message_id,flow_local_id,meta_flow_id,flow_token,from_phone,response_json,status,message_timestamp)
       VALUES(?1,?2,?3,?4,?5,?6,'{}',?7,datetime('now'))`,
    )
      .bind(
        id,
        result.ok ? result.messageId : null,
        row.id,
        selectedMetaId,
        flowToken,
        to,
        result.ok ? "sent" : result.ambiguous ? "ambiguous" : "rejected",
      )
      .run();
    if (!result.ok)
      return c.json(
        { error: result.detail, code: result.code, ambiguous: result.ambiguous },
        result.ambiguous ? 502 : result.httpStatus >= 400 && result.httpStatus < 500 ? 400 : 502,
      );
    return c.json({ ok: true, messageId: result.messageId, submissionId: id });
  })
  .post("/:id/meta/publish", async (c) => {
    const raw = await readJsonBody(c, 2_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const input = z
      .object({ publish: z.boolean().default(true) })
      .strict()
      .safeParse(raw.value);
    if (!input.success) return c.json({ error: "publicação inválida" }, 400);
    const row = await c.env.DB.prepare("SELECT * FROM flows WHERE id=?1")
      .bind(c.req.param("id"))
      .first<Record<string, unknown>>();
    if (!row) return c.json({ error: "MiniApp não encontrado" }, 404);
    let localDefinition: Record<string, unknown> = {};
    try { localDefinition = JSON.parse(String(row.definition_json || "{}")); } catch { /* validação abaixo preserva o erro existente */ }
    if (localDefinition.dynamicBooking === true) {
      const calendar = await googleCalendarStatus(c.env, c.env.DB);
      if (!calendar.oauthConfigured || !calendar.connected || !calendar.connection)
        return c.json(
          { error: "Conecte e configure o Google Calendar antes de publicar este MiniApp dinâmico" },
          409,
        );
    }
    const credentials = await getCredentials(c.env);
    if (!credentials || !credentials.wabaId)
      return c.json({ error: "Credenciais da Meta não configuradas" }, 400);
    let flowJson: Record<string, unknown>;
    try {
      flowJson = buildMetaFlowJson(
        JSON.parse(String(row.definition_json || "{}")),
        c.env.FLOW_DATA_API_VERSION === "4.0" ? "4.0" : "3.0",
      );
      const jsonErrors = validateMetaFlowJson(flowJson);
      if (jsonErrors.length)
        return c.json({ error: "Flow JSON inválido", issues: jsonErrors }, 400);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "MiniApp inválido" },
        400,
      );
    }
    try {
      const requiresEndpoint = typeof flowJson.data_api_version === "string";
      const endpointUri = requiresEndpoint
        ? `${new URL(c.req.url).origin}/api/flows/endpoint`
        : undefined;
      if (requiresEndpoint) {
        if (!c.env.FLOW_PRIVATE_KEY || !c.env.FLOW_PUBLIC_KEY)
          return c.json(
            { error: "As chaves de criptografia dos MiniApps dinâmicos não estão configuradas" },
            400,
          );
        try {
          await validateFlowEncryptionKeyPair(
            c.env.FLOW_PRIVATE_KEY,
            c.env.FLOW_PUBLIC_KEY,
          );
        } catch (error) {
          return c.json(
            { error: error instanceof Error ? error.message : "Par de chaves inválido" },
            400,
          );
        }
        await setMetaFlowEncryptionPublicKey({
          token: credentials.token,
          version: credentials.graphVersion,
          phoneId: credentials.phoneId,
          publicKey: c.env.FLOW_PUBLIC_KEY,
        });
        const keyStatus = await getMetaFlowEncryptionPublicKeyStatus({
          token: credentials.token,
          version: credentials.graphVersion,
          phoneId: credentials.phoneId,
        });
        if (
          keyStatus.status !== "VALID" ||
          !flowPublicKeysMatch(c.env.FLOW_PUBLIC_KEY, keyStatus.publicKey)
        )
          return c.json(
            {
              error: "A Meta ainda não confirmou a mesma chave pública configurada no Worker",
              keyStatus: keyStatus.status ?? "UNKNOWN",
              keyMatches: flowPublicKeysMatch(c.env.FLOW_PUBLIC_KEY, keyStatus.publicKey),
            },
            409,
          );
      }
      let metaId = typeof row.meta_id === "string" ? row.meta_id : "";
      let validationErrors: unknown = null;
      if (metaId) {
        const before = await getMetaFlowDetails({
          token: credentials.token,
          version: credentials.graphVersion,
          flowId: metaId,
          phoneId: credentials.phoneId,
        });
        if (before.status === "DEPRECATED")
          return c.json(
            { error: "MiniApp depreciado na Meta não pode ser republicado; duplique para criar outro" },
            409,
          );
        if (
          before.status === "PUBLISHED" &&
          Number(row.local_revision) !== Number(row.synced_revision)
        ) {
          const previousMetaId = metaId;
          // A Meta exige que o nome do clone seja único na WABA. O nome local
          // continua sendo o nome amigável do MiniApp, mas a revisão draft
          // precisa manter o sufixo de revisão também no update seguinte.
          const draftCloneName = `${String(row.name).slice(0, 44)} #r${Number(row.local_revision)}-${crypto.randomUUID().slice(0, 8)}`;
          const cloned = await createMetaFlow({
            token: credentials.token,
            version: credentials.graphVersion,
            wabaId: credentials.wabaId,
            name: draftCloneName,
            flowJson,
            publish: false,
            endpointUri,
            applicationId: c.env.META_APP_ID,
            cloneFlowId: previousMetaId,
            includeFlowJson: false,
          });
          metaId = cloned.id;
          validationErrors = await updateMetaFlow({
            token: credentials.token,
            version: credentials.graphVersion,
            flowId: metaId,
            name: draftCloneName,
            flowJson,
            endpointUri,
            applicationId: c.env.META_APP_ID,
          });
          await c.env.DB.prepare(
            `INSERT INTO flow_meta_versions
             (id,flow_local_id,meta_flow_id,status,local_revision,definition_json,replaced_by_meta_flow_id)
             VALUES(?1,?2,?3,'PUBLISHED',?4,?5,?6)
             ON CONFLICT(flow_local_id,meta_flow_id) DO UPDATE SET
               replaced_by_meta_flow_id=excluded.replaced_by_meta_flow_id`,
          ).bind(
            crypto.randomUUID(), row.id, previousMetaId,
            Number(row.synced_revision), String(row.definition_json || "{}"), metaId,
          ).run();
        } else if (before.status !== "PUBLISHED") {
          const draftUpdateName = `${String(row.name).slice(0, 44)} #r${Number(row.local_revision)}-${crypto.randomUUID().slice(0, 8)}`;
          validationErrors = await updateMetaFlow({
            token: credentials.token,
            version: credentials.graphVersion,
            flowId: metaId,
            name: draftUpdateName,
            flowJson,
            endpointUri,
            applicationId: c.env.META_APP_ID,
          });
        }
      } else {
        const suffix = ` #${String(row.id).slice(0, 6)}`;
        const created = await createMetaFlow({
          token: credentials.token,
          version: credentials.graphVersion,
          wabaId: credentials.wabaId,
          name: `${String(row.name).slice(0, Math.max(1, 60 - suffix.length))}${suffix}`,
          flowJson,
          // A Meta devolve validation_errors no rascunho. Publicar antes
          // dessa consulta escondia a causa e deixava Flows inválidos órfãos.
          publish: false,
          endpointUri,
          applicationId: c.env.META_APP_ID,
        });
        metaId = created.id;
        validationErrors = created.validationErrors;
      }
      let details = await getMetaFlowDetails({
        token: credentials.token,
        version: credentials.graphVersion,
        flowId: metaId,
        phoneId: credentials.phoneId,
      });
      validationErrors = details.validationErrors ?? validationErrors;
      if (hasMetaValidationErrors(validationErrors)) {
        await persistFlowPublication(
          c.env.DB,
          row.id as string,
          metaId,
          details.status,
          validationErrors,
          null,
          details,
        );
        return c.json(
          {
            error: "A Meta rejeitou o Flow JSON durante a validação",
            metaId,
            validationErrors: redactFlowValidationErrors(validationErrors),
          },
          400,
        );
      }
      if (input.data.publish && details.status !== "PUBLISHED") {
        await publishMetaFlow({
          token: credentials.token,
          version: credentials.graphVersion,
          flowId: metaId,
        });
        details = await getMetaFlowDetails({
          token: credentials.token,
          version: credentials.graphVersion,
          flowId: metaId,
          phoneId: credentials.phoneId,
        });
        validationErrors = details.validationErrors ?? null;
      }
      const previewUrl = await getMetaFlowPreview({
        token: credentials.token,
        version: credentials.graphVersion,
        flowId: metaId,
      });
      await persistFlowPublication(
        c.env.DB,
        row.id as string,
        metaId,
        details.status,
        validationErrors,
        previewUrl,
        details,
      );
      await c.env.DB.prepare(
        `UPDATE flows SET synced_revision=local_revision,
         published_meta_id=CASE WHEN ?2='PUBLISHED' THEN meta_id ELSE published_meta_id END,
         published_revision=CASE WHEN ?2='PUBLISHED' THEN local_revision ELSE published_revision END
         WHERE id=?1`,
      ).bind(row.id, details.status).run();
      const updated = await c.env.DB.prepare("SELECT * FROM flows WHERE id=?1")
        .bind(row.id)
        .first<Record<string, unknown>>();
      return c.json({ ok: true, item: decodeFlow(updated!), flowJson });
    } catch (error) {
      if (error instanceof MetaFlowApiError)
        return c.json(
          {
            error: error.message,
            code: error.code,
            subcode: error.subcode,
          },
          error.httpStatus >= 400 && error.httpStatus < 500 ? 400 : 502,
        );
      if (error instanceof DOMException && error.name === "TimeoutError")
        return c.json({ error: "A Meta não respondeu no tempo esperado" }, 504);
      throw error;
    }
  })
  .delete("/:id", async (c) => {
    const r = await c.env.DB.prepare("DELETE FROM flows WHERE id=?1")
      .bind(c.req.param("id"))
      .run();
    return r.meta.changes
      ? c.json({ ok: true })
      : c.json({ error: "MiniApp não encontrado" }, 404);
  });

export const formsRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) =>
    c.json({
      items: (
        await c.env.DB.prepare(
          `SELECT f.*,t.name tag_name,
                  (SELECT COUNT(*) FROM lead_form_submissions s WHERE s.form_id=f.id) submission_count
           FROM lead_forms f LEFT JOIN tags t ON t.id=f.tag_id
           ORDER BY f.updated_at DESC,f.id`,
        ).all()
      ).results.map((r) => decodeForm(r as Record<string, unknown>)),
    }),
  )
  .post("/", async (c) => {
    const raw = await readJsonBody(c, 64_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = formSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "formulário inválido" }, 400);
    const id = crypto.randomUUID();
    try {
      await c.env.DB.prepare(
        "INSERT INTO lead_forms(id,title,slug,tag_id,active,fields_json,collect_email,success_message)VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
      )
        .bind(
          id,
          body.data.title,
          body.data.slug,
          body.data.tagId || null,
          body.data.active === false ? 0 : 1,
          JSON.stringify(body.data.fields || []),
          body.data.collectEmail ? 1 : 0,
          body.data.successMessage || null,
        )
        .run();
    } catch (e) {
      if (e instanceof Error && /UNIQUE/.test(e.message))
        return c.json({ error: "slug já utilizado" }, 409);
      throw e;
    }
    return c.json(
      decodeForm(
        (await c.env.DB.prepare("SELECT * FROM lead_forms WHERE id=?1")
          .bind(id)
          .first()) as Record<string, unknown>,
      ),
      201,
    );
  })
  .patch("/:id", async (c) => {
    const raw = await readJsonBody(c, 64_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = formSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "formulário inválido" }, 400);
    await c.env.DB.prepare(
      "UPDATE lead_forms SET title=?2,slug=?3,tag_id=?4,active=?5,fields_json=?6,collect_email=?7,success_message=?8,updated_at=datetime('now') WHERE id=?1",
    )
      .bind(
        c.req.param("id"),
        body.data.title,
        body.data.slug,
        body.data.tagId || null,
        body.data.active === false ? 0 : 1,
        JSON.stringify(body.data.fields || []),
        body.data.collectEmail ? 1 : 0,
        body.data.successMessage || null,
      )
      .run();
    const item = await c.env.DB.prepare("SELECT * FROM lead_forms WHERE id=?1")
      .bind(c.req.param("id"))
      .first();
    return item
      ? c.json(decodeForm(item as Record<string, unknown>))
      : c.json({ error: "formulário não encontrado" }, 404);
  })
  .delete("/:id", async (c) => {
    const r = await c.env.DB.prepare("DELETE FROM lead_forms WHERE id=?1")
      .bind(c.req.param("id"))
      .run();
    return r.meta.changes
      ? c.json({ ok: true })
      : c.json({ error: "formulário não encontrado" }, 404);
  });

export const publicFormsRoutes = new Hono<{ Bindings: Env }>()
  .get("/:slug", async (c) => {
    const item = await c.env.DB.prepare(
      "SELECT id,title,slug,fields_json,collect_email,success_message FROM lead_forms WHERE slug=?1 AND active=1",
    )
      .bind(c.req.param("slug"))
      .first();
    return item
      ? c.json({
          ...item,
          collectEmail: Boolean(item.collect_email),
          successMessage: item.success_message || "",
          fields: JSON.parse(String(item.fields_json || "[]")),
          fields_json: undefined,
          collect_email: undefined,
          success_message: undefined,
        })
      : c.json({ error: "formulário não encontrado" }, 404);
  })
  .post("/:slug", async (c) => {
    const form = await c.env.DB.prepare(
      "SELECT id,tag_id FROM lead_forms WHERE slug=?1 AND active=1",
    )
      .bind(c.req.param("slug"))
      .first<{ id: string; tag_id: string | null }>();
    if (!form) return c.json({ error: "formulário não encontrado" }, 404);
    const raw = await readJsonBody(c, 64_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({
        name: z.string().trim().min(1).max(200),
        phone: z.string().trim().min(1).max(64),
        email: z.string().trim().email().max(320).optional(),
        optInConfirmed: z.literal(true),
        values: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional(),
      })
      .strict()
      .safeParse(raw.value);
    if (!body.success) return c.json({ error: "resposta inválida" }, 400);
    const phone = normalizePhone(body.data.phone);
    if (!phone) return c.json({ error: "telefone inválido" }, 400);
    let contact = await contactsDb(c.env.DB).getByPhone(phone);
    if (!contact) {
      contact = await contactsDb(c.env.DB).createOptInWithConsent(
        { phone, name: body.data.name, email: body.data.email },
        PUBLIC_FORM_CONSENT,
      );
      if (!contact) contact = await contactsDb(c.env.DB).getByPhone(phone);
    } else {
      contact = await contactsDb(c.env.DB).updateIdentity(contact.id, {
        phone,
        name: body.data.name,
        email: body.data.email,
      });
      if (!contact)
        return c.json({ error: "não foi possível atualizar o contato" }, 500);
      if (contact.status !== "opt_in")
        await contactsDb(c.env.DB).setOptInWithConsent(
          [contact.id],
          PUBLIC_FORM_CONSENT,
        );
    }
    if (!contact) return c.json({ error: "não foi possível salvar o contato" }, 500);
    if (form.tag_id)
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO contact_tags(contact_id,tag_id)VALUES(?1,?2)",
      )
        .bind(contact.id, form.tag_id)
        .run();
    await c.env.DB.prepare(
      "INSERT INTO lead_form_submissions(id,form_id,contact_id,payload_json)VALUES(?1,?2,?3,?4)",
    )
      .bind(crypto.randomUUID(), form.id, contact.id, JSON.stringify(body.data))
      .run();
    return c.json({ ok: true }, 201);
  });

const projectSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    strategy: z.enum(["marketing", "utility"]).default("marketing"),
    prompt: z.string().max(20_000).nullable().optional(),
    source: z.enum(["ai", "manual"]).optional(),
  })
  .strict();
const projectItemSchema = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{1,512}$/),
    content: z.string().max(32_000),
    language: z.string().trim().min(2).max(16).default("pt_BR"),
    category: z
      .enum(["MARKETING", "UTILITY", "AUTHENTICATION"])
      .default("UTILITY"),
    header: z.record(z.string(), z.unknown()).nullable().optional(),
    footer: z.record(z.string(), z.unknown()).nullable().optional(),
    buttons: z.array(z.record(z.string(), z.unknown())).max(10).optional(),
    variables: z.record(z.string(), z.string()).optional(),
    sampleVariables: z.record(z.string(), z.string()).optional(),
    marketingVariables: z.record(z.string(), z.string()).optional(),
  })
  .strict();
const decodeProjectItem = (row: Record<string, unknown>): Record<string, unknown> => ({
  ...row,
  components: JSON.parse(String(row.components_json || "[]")),
  sample_variables: JSON.parse(String(row.sample_variables_json || "{}")),
  marketing_variables: JSON.parse(String(row.marketing_variables_json || "{}")),
  header: row.header_json ? JSON.parse(String(row.header_json)) : null,
  footer: row.footer_json ? JSON.parse(String(row.footer_json)) : null,
  buttons: JSON.parse(String(row.buttons_json || "[]")),
  variables: JSON.parse(String(row.variables_json || "{}")),
  components_json: undefined,
  sample_variables_json: undefined,
  marketing_variables_json: undefined,
  header_json: undefined,
  footer_json: undefined,
  buttons_json: undefined,
  variables_json: undefined,
});
export const templateProjectsRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) =>
    c.json({
      items: (
        await c.env.DB.prepare(
          `SELECT p.*,COUNT(i.id) template_count,COALESCE(SUM(CASE WHEN i.meta_status='APPROVED' THEN 1 ELSE 0 END),0) approved_count FROM template_projects p LEFT JOIN template_project_items i ON i.project_id=p.id GROUP BY p.id ORDER BY p.updated_at DESC,p.id`,
        ).all()
      ).results,
    }),
  )
  .post("/", async (c) => {
    const raw = await readJsonBody(c, 32_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = projectSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "projeto inválido" }, 400);
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO template_projects(id,title,strategy,prompt,source)VALUES(?1,?2,?3,?4,?5)",
    )
      .bind(
        id,
        body.data.title,
        body.data.strategy,
        body.data.prompt || null,
        body.data.source || "manual",
      )
      .run();
    return c.json(
      await c.env.DB.prepare("SELECT * FROM template_projects WHERE id=?1")
        .bind(id)
        .first(),
      201,
    );
  })
  .post("/generate", async (c) => {
    const raw = await readJsonBody(c, 32_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({
        content: z.string().trim().min(50).max(20_000),
        prompt: z.string().trim().min(1).max(4_000),
        strategy: z.enum(["marketing", "utility"]),
        quantity: z.number().int().min(1).max(10),
        language: z.enum(["pt_BR", "en_US", "es_ES"]).default("pt_BR"),
      })
      .strict()
      .safeParse(raw.value);
    if (!body.success)
      return c.json({ error: "configuração de geração inválida" }, 400);
    try {
      return c.json({
        templates: await generateTemplateFactory(c.env, body.data),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "unknown";
      return c.json(
        {
          error:
            code === "ai_not_configured"
              ? "IA não configurada"
              : code === "provider_error"
                ? "O provedor de IA não respondeu"
                : "A IA retornou um formato inválido",
          code,
        },
        code === "ai_not_configured" ? 503 : 502,
      );
    }
  })
  .post("/save-generated", async (c) => {
    const raw = await readJsonBody(c, 256_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({
        title: z.string().trim().min(1).max(160),
        strategy: z.enum(["marketing", "utility"]),
        prompt: z.string().max(20_000),
        items: z.array(projectItemSchema).min(1).max(20),
      })
      .strict()
      .safeParse(raw.value);
    if (!body.success) return c.json({ error: "projeto gerado inválido" }, 400);
    const projectId = crypto.randomUUID();
    const statements = [
      c.env.DB.prepare(
        "INSERT INTO template_projects(id,title,strategy,prompt,source,template_count)VALUES(?1,?2,?3,?4,?5,?6)",
      ).bind(
        projectId,
        body.data.title,
        body.data.strategy,
        body.data.prompt,
        "ai",
        body.data.items.length,
      ),
      ...body.data.items.map((item) =>
        c.env.DB.prepare(
          `INSERT INTO template_project_items(id,project_id,name,content,language,category,header_json,footer_json,buttons_json,variables_json,sample_variables_json,marketing_variables_json)VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`,
        ).bind(
          crypto.randomUUID(),
          projectId,
          item.name,
          item.content,
          item.language,
          item.category,
          item.header ? JSON.stringify(item.header) : null,
          item.footer ? JSON.stringify(item.footer) : null,
          JSON.stringify(item.buttons || []),
          JSON.stringify(item.variables || {}),
          JSON.stringify(item.sampleVariables || {}),
          JSON.stringify(item.marketingVariables || {}),
        ),
      ),
    ];
    await c.env.DB.batch(statements);
    return c.json({ id: projectId }, 201);
  })
  .post("/:id/submit", async (c) => {
    const raw = await readJsonBody(c, 32_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({ itemIds: z.array(z.string().uuid()).min(1).max(20) })
      .strict()
      .safeParse(raw.value);
    if (!body.success) return c.json({ error: "seleção inválida" }, 400);
    const placeholders = body.data.itemIds.map(() => "?").join(",");
    const items = (
      await c.env.DB.prepare(
        `SELECT * FROM template_project_items WHERE project_id=? AND id IN (${placeholders}) AND meta_id IS NULL`,
      )
        .bind(c.req.param("id"), ...body.data.itemIds)
        .all()
    ).results as Array<Record<string, unknown>>;
    if (!items.length)
      return c.json({ error: "nenhum rascunho selecionado" }, 409);
    const creds = await getCredentials(c.env);
    if (!creds?.wabaId)
      return c.json({ error: "credenciais Meta não configuradas" }, 400);
    const client = whatsappClient(creds);
    const created: Array<{ id: string; name: string; metaId: string | null }> =
      [];
    const failed: Array<{ id: string; name: string; error: string }> = [];
    for (const item of items) {
      const name = String(item.name);
      try {
        const components: Array<Record<string, unknown>> = [];
        const header = item.header_json
          ? (JSON.parse(String(item.header_json)) as Record<string, unknown>)
          : null;
        if (header) components.push({ type: "HEADER", ...header });
        const bodyComponent: Record<string, unknown> = {
          type: "BODY",
          text: String(item.content || ""),
        };
        const samples = JSON.parse(
          String(item.sample_variables_json || "{}"),
        ) as Record<string, string>;
        const orderedSamples = Object.keys(samples)
          .filter((key) => /^\d+$/.test(key))
          .sort((a, b) => Number(a) - Number(b))
          .map((key) => samples[key]);
        if (orderedSamples.length)
          bodyComponent.example = { body_text: [orderedSamples] };
        components.push(bodyComponent);
        const footer = item.footer_json
          ? (JSON.parse(String(item.footer_json)) as Record<string, unknown>)
          : null;
        if (footer) components.push({ type: "FOOTER", ...footer });
        const buttons = JSON.parse(String(item.buttons_json || "[]")) as Array<
          Record<string, unknown>
        >;
        if (buttons.length) components.push({ type: "BUTTONS", buttons });
        const result = (await client.createTemplate(creds.wabaId, {
          name,
          language: String(item.language || "pt_BR"),
          category: String(item.category || "UTILITY"),
          components,
        })) as Record<string, unknown>;
        const metaId = typeof result.id === "string" ? result.id : null;
        await c.env.DB.prepare(
          "UPDATE template_project_items SET meta_id=?2,meta_status=?3,updated_at=datetime('now') WHERE id=?1",
        )
          .bind(
            String(item.id),
            metaId,
            typeof result.status === "string" ? result.status : "PENDING",
          )
          .run();
        created.push({ id: String(item.id), name, metaId });
      } catch (error) {
        failed.push({
          id: String(item.id),
          name,
          error: error instanceof Error ? error.message : "falha ao enviar",
        });
      }
    }
    return c.json({ created, failed }, failed.length ? 207 : 200);
  })
  .post("/:id/sync", async (c) => {
    const project = await c.env.DB.prepare(
      "SELECT id FROM template_projects WHERE id=?1",
    )
      .bind(c.req.param("id"))
      .first();
    if (!project) return c.json({ error: "projeto não encontrado" }, 404);
    const creds = await getCredentials(c.env);
    if (!creds?.wabaId)
      return c.json({ error: "credenciais Meta não configuradas" }, 400);
    const remote = await whatsappClient(creds).fetchTemplates(creds.wabaId);
    let updated = 0;
    for (const template of remote) {
      const result = await c.env.DB.prepare(
        "UPDATE template_project_items SET meta_id=?3,meta_status=?4,rejected_reason=?5,updated_at=datetime('now') WHERE project_id=?1 AND name=?2",
      )
        .bind(
          c.req.param("id"),
          template.name,
          template.id || null,
          template.status || "PENDING",
          (template as { rejected_reason?: string }).rejected_reason || null,
        )
        .run();
      updated += result.meta.changes;
    }
    return c.json({ updated });
  })
  .get("/:id", async (c) => {
    const project = await c.env.DB.prepare(
      "SELECT * FROM template_projects WHERE id=?1",
    )
      .bind(c.req.param("id"))
      .first();
    if (!project) return c.json({ error: "projeto não encontrado" }, 404);
    const items = (
      await c.env.DB.prepare(
        "SELECT * FROM template_project_items WHERE project_id=?1 ORDER BY created_at,id",
      )
        .bind(c.req.param("id"))
        .all()
    ).results.map((r) => decodeProjectItem(r as Record<string, unknown>));
    return c.json({
      ...project,
      template_count: items.length,
      approved_count: items.filter((i) => i.meta_status === "APPROVED").length,
      items,
    });
  })
  .post("/:id/items", async (c) => {
    const project = await c.env.DB.prepare(
      "SELECT id FROM template_projects WHERE id=?1",
    )
      .bind(c.req.param("id"))
      .first();
    if (!project) return c.json({ error: "projeto não encontrado" }, 404);
    const raw = await readJsonBody(c, 128_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = projectItemSchema.safeParse(raw.value);
    if (!body.success)
      return c.json(
        { error: "template inválido", issues: body.error.issues },
        400,
      );
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO template_project_items(id,project_id,name,content,language,category,header_json,footer_json,buttons_json,variables_json,sample_variables_json,marketing_variables_json)VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`,
    )
      .bind(
        id,
        c.req.param("id"),
        body.data.name,
        body.data.content,
        body.data.language,
        body.data.category,
        body.data.header ? JSON.stringify(body.data.header) : null,
        body.data.footer ? JSON.stringify(body.data.footer) : null,
        JSON.stringify(body.data.buttons || []),
        JSON.stringify(body.data.variables || {}),
        JSON.stringify(body.data.sampleVariables || {}),
        JSON.stringify(body.data.marketingVariables || {}),
      )
      .run();
    await c.env.DB.prepare(
      "UPDATE template_projects SET updated_at=datetime('now') WHERE id=?1",
    )
      .bind(c.req.param("id"))
      .run();
    return c.json(
      decodeProjectItem(
        (await c.env.DB.prepare(
          "SELECT * FROM template_project_items WHERE id=?1",
        )
          .bind(id)
          .first()) as Record<string, unknown>,
      ),
      201,
    );
  })
  .patch("/items/:itemId", async (c) => {
    const raw = await readJsonBody(c, 128_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = projectItemSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "template inválido" }, 400);
    await c.env.DB.prepare(
      `UPDATE template_project_items SET name=?2,content=?3,language=?4,category=?5,header_json=?6,footer_json=?7,buttons_json=?8,variables_json=?9,sample_variables_json=?10,marketing_variables_json=?11,updated_at=datetime('now') WHERE id=?1`,
    )
      .bind(
        c.req.param("itemId"),
        body.data.name,
        body.data.content,
        body.data.language,
        body.data.category,
        body.data.header ? JSON.stringify(body.data.header) : null,
        body.data.footer ? JSON.stringify(body.data.footer) : null,
        JSON.stringify(body.data.buttons || []),
        JSON.stringify(body.data.variables || {}),
        JSON.stringify(body.data.sampleVariables || {}),
        JSON.stringify(body.data.marketingVariables || {}),
      )
      .run();
    const item = await c.env.DB.prepare(
      "SELECT * FROM template_project_items WHERE id=?1",
    )
      .bind(c.req.param("itemId"))
      .first();
    return item
      ? c.json(decodeProjectItem(item as Record<string, unknown>))
      : c.json({ error: "template não encontrado" }, 404);
  })
  .delete("/items/:itemId", async (c) => {
    const r = await c.env.DB.prepare(
      "DELETE FROM template_project_items WHERE id=?1",
    )
      .bind(c.req.param("itemId"))
      .run();
    return r.meta.changes
      ? c.json({ ok: true })
      : c.json({ error: "template não encontrado" }, 404);
  })
  .patch("/:id", async (c) => {
    const raw = await readJsonBody(c, 16_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = projectSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "projeto inválido" }, 400);
    await c.env.DB.prepare(
      "UPDATE template_projects SET title=?2,strategy=?3,updated_at=datetime('now') WHERE id=?1",
    )
      .bind(c.req.param("id"), body.data.title, body.data.strategy)
      .run();
    const item = await c.env.DB.prepare(
      "SELECT * FROM template_projects WHERE id=?1",
    )
      .bind(c.req.param("id"))
      .first();
    return item
      ? c.json(item)
      : c.json({ error: "projeto não encontrado" }, 404);
  })
  .delete("/:id", async (c) => {
    const r = await c.env.DB.prepare(
      "DELETE FROM template_projects WHERE id=?1",
    )
      .bind(c.req.param("id"))
      .run();
    return r.meta.changes
      ? c.json({ ok: true })
      : c.json({ error: "projeto não encontrado" }, 404);
  });

function submissionCsvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export const submissionsRoutes = new Hono<{ Bindings: Env }>()
  .get("/export.csv", async (c) => {
    const q = (c.req.query("q") || "").trim().slice(0, 200);
    const source = (c.req.query("source") || "").trim();
    const formId = (c.req.query("formId") || "").trim().slice(0, 64);
    const escaped = q.replace(/[\\%_]/g, "\\$&");
    const rows = (
      await c.env.DB.prepare(
        `SELECT * FROM (
           SELECT s.id,f.title asset_name,'form' source,f.id form_id,
                  c.name contact_name,c.phone contact_phone,
                  c.email contact_email,s.payload_json response_json,
                  NULL mapped_data_json,NULL message_timestamp,s.created_at
           FROM lead_form_submissions s
           JOIN lead_forms f ON f.id=s.form_id
           LEFT JOIN contacts c ON c.id=s.contact_id
           UNION ALL
           SELECT fs.id,COALESCE(fl.name,'MiniApp da Meta') asset_name,
                  'flow' source,NULL form_id,
                  c.name contact_name,COALESCE(c.phone,fs.from_phone) contact_phone,
                  c.email contact_email,fs.response_json,fs.mapped_data_json,
                  fs.message_timestamp,fs.created_at
           FROM flow_submissions fs
           LEFT JOIN flows fl ON fl.id=fs.flow_local_id
           LEFT JOIN contacts c ON c.id=fs.contact_id
           WHERE fs.status='completed'
         ) all_submissions
         WHERE (?1='' OR contact_phone LIKE ?2 ESCAPE '\\'
              OR contact_name LIKE ?2 ESCAPE '\\' OR asset_name LIKE ?2 ESCAPE '\\')
           AND (?3='' OR source=?3)
           AND (?4='' OR (source='form' AND form_id=?4))
         ORDER BY created_at DESC,id LIMIT 20000`,
      )
        .bind(q, `%${escaped}%`, source, formId)
        .all()
    ).results;
    const header = [
      "id",
      "origem",
      "formulario_ou_miniapp",
      "nome",
      "telefone",
      "email",
      "respostas_json",
      "dados_mapeados_json",
      "recebido_em",
      "criado_em",
    ];
    const lines = [
      header.map(submissionCsvCell).join(","),
      ...rows.map((row) =>
        [
          row.id,
          row.source === "form" ? "Form" : "MiniApp",
          row.asset_name,
          row.contact_name,
          row.contact_phone,
          row.contact_email,
          row.response_json,
          row.mapped_data_json,
          row.message_timestamp,
          row.created_at,
        ]
          .map(submissionCsvCell)
          .join(","),
      ),
    ];
    c.header("content-type", "text/csv; charset=utf-8");
    c.header("content-disposition", 'attachment; filename="submissoes-smartzap.csv"');
    return c.body(`\uFEFF${lines.join("\r\n")}`);
  })
  .get(
  "/",
  async (c) => {
    const q = (c.req.query("q") || "").trim().slice(0, 200);
    const formId = (c.req.query("formId") || "").trim().slice(0, 64);
    const source = (c.req.query("source") || "").trim();
    const escaped = q.replace(/[\\%_]/g, "\\$&");
    const rows = (
      await c.env.DB.prepare(
        `SELECT * FROM (
           SELECT s.id,s.payload_json,s.created_at,f.title form_title,f.slug,f.id form_id,
                  c.name contact_name,c.phone contact_phone,'form' source,
                  NULL mapped_data_json,NULL mapped_at,NULL confirmation_status
           FROM lead_form_submissions s
           JOIN lead_forms f ON f.id=s.form_id
           LEFT JOIN contacts c ON c.id=s.contact_id
           UNION ALL
           SELECT fs.id,fs.response_json payload_json,fs.created_at,
                  COALESCE(fl.name,'MiniApp da Meta') form_title,NULL slug,NULL form_id,
                  c.name contact_name,COALESCE(c.phone,fs.from_phone) contact_phone,'flow' source,
                  fs.mapped_data_json,fs.mapped_at,fs.confirmation_status
           FROM flow_submissions fs
           LEFT JOIN flows fl ON fl.id=fs.flow_local_id
           LEFT JOIN contacts c ON c.id=fs.contact_id
           WHERE fs.status='completed'
         ) all_submissions
         WHERE (?1='' OR contact_phone LIKE ?2 ESCAPE '\\' OR contact_name LIKE ?2 ESCAPE '\\'
                OR form_title LIKE ?2 ESCAPE '\\')
           AND (?3='' OR (source='form' AND form_id=?3))
           AND (?4='' OR source=?4)
         ORDER BY created_at DESC,id LIMIT 500`,
      )
        .bind(q, `%${escaped}%`, formId, source)
        .all()
    ).results.map((r) => ({
      ...r,
      payload:
        r.source === "flow"
          ? { values: JSON.parse(String(r.payload_json || "{}")) }
          : JSON.parse(String(r.payload_json || "{}")),
      payload_json: undefined,
    }));
    return c.json({ items: rows, total: rows.length });
  },
);
