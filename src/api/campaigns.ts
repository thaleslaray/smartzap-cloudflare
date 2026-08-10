import { Hono } from "hono";
import { z } from "zod";
import { campaignsDb } from "../db/campaigns";
import { campaignContactsDb } from "../db/campaign-contacts";
import { templatesDb } from "../db/templates";
import { resolveAudience } from "../domain/audience";
import { estimateCampaignCost } from "../domain/pricing";
import { pricingDb } from "../db/pricing";
import { templateRequiresParameters } from "../domain/template";
import {
  assertPilotAudience,
  assertPilotCampaign,
  PilotSafetyError,
} from "../domain/pilot";
import { parsePage } from "../domain/pagination";
import { assertSameOrigin } from "./origin";
import { getCredentials } from "../whatsapp/credentials";
import { whatsappClient, MetaApiRequestError } from "../whatsapp/client";
import { probeMeta } from "../whatsapp/health";
import { redactOperationalDetail } from "../domain/redaction";
import { readJsonBody } from "./body";
import {
  extractTemplateVariables,
  renderTemplateParameters,
  variableMappingSchema,
} from "../domain/template-render";
import { campaignBatchesDb } from "../db/campaign-batches";
import { settingsDb } from "../db/settings";
import {
  isSimpleTemplateCategory,
  isSimpleTemplateSendContract,
} from "../../shared/template-validation";

const unsupportedTemplateCategory = {
  error: "templates de autenticação exigem um fluxo OTP próprio e não podem ser enviados por campanhas",
  code: "AUTHENTICATION_TEMPLATE_UNSUPPORTED",
};

const unsupportedTemplateContract = {
  error: "este template exige mídia, OTP, Flow ou outro componente que o envio simples da campanha não representa",
  code: "TEMPLATE_CONTRACT_UNSUPPORTED",
};

function previewComponents(components: unknown, resolved: Record<string, string>): unknown[] {
  if (!Array.isArray(components)) return [];
  return components.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const component = { ...(raw as Record<string, unknown>) };
    const type = String(component.type ?? "").toLowerCase();
    if (type === "header" || type === "body") {
      const key = type;
      component.text = String(component.text ?? "").replace(/{{\s*(\d+)\s*}}/g, (_match, index) => resolved[`${key}.${index}`] ?? _match);
    }
    if (type === "buttons" && Array.isArray(component.buttons)) {
      component.buttons = component.buttons.map((button, buttonIndex) => {
        if (!button || typeof button !== "object") return button;
        const next = { ...(button as Record<string, unknown>) };
        if (typeof next.url === "string")
          next.url = next.url.replace(/{{\s*(\d+)\s*}}/g, (_match, index) => resolved[`button.${buttonIndex}.${index}`] ?? _match);
        return next;
      });
    }
    return component;
  });
}

const audienceSchema = z
  .object({
    tags: z
      .array(z.string().min(1).max(128))
      .max(100)
      .transform((tags) => [...new Set(tags)])
      .optional(),
    segmentId: z.string().uuid().optional(),
    contactIds: z.array(z.string().uuid()).min(1).max(3).optional(),
    phonePrefixes: z
      .array(z.string().regex(/^\+[1-9]\d{0,5}$/))
      .max(100)
      .optional(),
    combinator: z.enum(["and", "or"]).optional(),
    skipInvalid: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      !(
        value.contactIds &&
        (value.segmentId || value.tags?.length || value.phonePrefixes?.length)
      ),
    {
      message: "contatos de teste não podem ser combinados com segmentos",
    },
  );
const IdSchema = z.string().uuid();
const createCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    template_name: z.string().trim().min(1).max(512),
    template_language: z.string().trim().min(2).max(32).optional(),
    scheduled_at: z.string().datetime().optional(),
    variable_mapping: variableMappingSchema.optional(),
  })
  .strict();
const previewSchema = z.object({ contactId: z.string().uuid() }).strict();
const CAMPAIGNS_PAGE_SIZE = 50;
const campaignListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z
    .enum([
      "draft",
      "scheduled",
      "sending",
      "completed",
      "paused",
      "failed",
      "cancelled",
    ])
    .optional(),
  folderId: z.string().uuid().optional(),
  tagIds: z.array(z.string().uuid()).max(50).optional(),
});
const FolderSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
  })
  .strict();
const CampaignTagSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
  })
  .strict();
const CampaignTagsSchema = z
  .object({ tagIds: z.array(z.string().uuid()).max(50) })
  .strict();
const CampaignBulkDeleteSchema = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(200) })
  .strict();
const CampaignScheduleSchema = z
  .object({ scheduledAt: z.string().datetime().nullable() })
  .strict();

// templatesDb.get() não anota o shape da linha retornada — cast local só para os
// campos que este arquivo lê (category, status), sem alterar o db de templates (Task 7).
type TemplateRow = {
  language: string;
  category: string;
  status: string;
  components?: unknown;
  quality_score?: string | null;
};

type RenderContactRow = { id: string; name: string | null; phone: string; email: string | null };

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

async function loadRenderContact(db: D1Database, contactId: string) {
  const contact = await db
    .prepare("SELECT id, name, phone, email FROM contacts WHERE id = ?1")
    .bind(contactId)
    .first<RenderContactRow>();
  if (!contact) return null;
  const rows = (
    await db
      .prepare(
        `SELECT field_id, value_text, value_number, value_date, value_boolean
     FROM contact_custom_values WHERE contact_id = ?1`,
      )
      .bind(contactId)
      .all<Record<string, unknown>>()
  ).results;
  const customValues: Record<string, string | number | boolean | null> = {};
  for (const row of rows) {
    const fieldId = String(row.field_id);
    const raw = row.value_text ?? row.value_number ?? row.value_date;
    customValues[fieldId] =
      typeof raw === "string" || typeof raw === "number"
        ? raw
        : row.value_boolean == null
          ? null
          : Boolean(row.value_boolean);
  }
  return { ...contact, customValues };
}

async function renderRecipients(
  db: D1Database,
  campaign: { variable_mapping_json: string | null },
  template: TemplateRow,
  eligible: { id: string; phone: string }[],
  skipInvalid = false,
) {
  const mapping = campaign.variable_mapping_json
    ? JSON.parse(campaign.variable_mapping_json)
    : {};
  const recipients: {
    id: string;
    phone: string;
    renderedPayloadJson?: string;
    renderedPayloadHash?: string;
  }[] = [];
  for (const recipient of eligible) {
    const contact = await loadRenderContact(db, recipient.id);
    if (!contact) continue;
    try {
      const rendered = renderTemplateParameters(
        template.components,
        mapping,
        contact,
      );
      const payload = JSON.stringify(rendered.components);
      recipients.push({
        ...recipient,
        renderedPayloadJson: payload,
        renderedPayloadHash: await sha256(payload),
      });
    } catch (error) {
      if (!skipInvalid) throw error;
    }
  }
  return recipients;
}

// Binding mínimo de Workflows — interface estreita para as funções de controle
// serem testáveis com fake (o binding real `env.CAMPAIGN_WF` a satisfaz por estrutura)
export type WorkflowBinding = {
  get(
    id: string,
  ): Promise<{
    pause(): Promise<void>;
    resume(): Promise<void>;
    terminate(): Promise<void>;
  }>;
};
export type WorkflowCreateBinding = {
  create(options: {
    id: string;
    params: { campaignId: string };
  }): Promise<{ id: string }>;
  get(id: string): Promise<{ status(): Promise<{ status: string }> }>;
};
type ControlResult =
  { ok: true } | { ok: false; status: 404 | 409; error: string };
type DispatchResult =
  { ok: true; workflowId: string } | { ok: false; status: 409; error: string };
type ResendSkippedResult = {
  status: "nothing" | "skipped" | "queued";
  resent: number;
  stillSkipped: number;
  workflowId?: string;
  message: string;
};

function isMissingWorkflowInstance(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /(?:instance[._ -]?not[._ -]?found|workflow instance.*not found)/i.test(
    error.message,
  );
}

export async function startCampaignDispatch(
  db: D1Database,
  wf: WorkflowCreateBinding,
  campaignId: string,
  recipients: {
    id: string;
    phone: string;
    renderedPayloadJson?: string;
    renderedPayloadHash?: string;
  }[],
  scheduled: boolean,
): Promise<DispatchResult> {
  const cdb = campaignsDb(db);
  const claimed = await cdb.claimDispatch(
    campaignId,
    scheduled ? "scheduled" : "sending",
  );
  if (!claimed)
    return {
      ok: false,
      status: 409,
      error: "campanha já foi reivindicada para disparo",
    };

  let creationAttempted = false;
  try {
    await campaignContactsDb(db).bulkInsert(
      campaignId,
      recipients.map((recipient) => ({
        contactId: recipient.id,
        phone: recipient.phone,
        status: "pending" as const,
        renderedPayloadJson: recipient.renderedPayloadJson,
        renderedPayloadHash: recipient.renderedPayloadHash,
      })),
    );
    await cdb.setTotal(campaignId, recipients.length);
    // O ID é determinístico e fica visível para pause/cancel ANTES da criação.
    // Assim, uma falha no D1 depois de create() nunca produz Workflow órfão.
    await cdb.setWorkflowId(campaignId, campaignId);
    creationAttempted = true;
    const instance = await wf.create({
      id: campaignId,
      params: { campaignId },
    });
    return { ok: true, workflowId: instance.id };
  } catch (error) {
    if (creationAttempted) {
      try {
        const instance = await wf.get(campaignId);
        const state = await instance.status();
        if (
          [
            "queued",
            "running",
            "paused",
            "waiting",
            "waitingForPause",
          ].includes(state.status)
        )
          return { ok: true, workflowId: campaignId };
      } catch {
        /* status desconhecido: rollback seguro abaixo */
      }
    }
    await cdb.rollbackDispatch(campaignId, campaignId);
    throw error;
  }
}

export async function resendSkippedContacts(
  env: Env,
  campaignId: string,
): Promise<ResendSkippedResult> {
  const cdb = campaignsDb(env.DB);
  const campaign = await cdb.get(campaignId);
  if (!campaign) throw new Error("campanha não encontrada");
  const skippedRows = (
    await env.DB.prepare(
      "SELECT contact_id FROM campaign_contacts WHERE campaign_id = ?1 AND status = 'skipped' ORDER BY contact_id",
    )
      .bind(campaignId)
      .all<{ contact_id: string }>()
  ).results;
  if (!skippedRows.length)
    return {
      status: "nothing",
      resent: 0,
      stillSkipped: 0,
      message: "Não há contatos ignorados para reenviar.",
    };

  const template = (await templatesDb(env.DB).get(
    campaign.template_name,
    campaign.template_language,
  )) as TemplateRow | null;
  if (!template) throw new Error("template não encontrado no banco local");
  if (template.status !== "APPROVED")
    throw new Error("template não está aprovado na Meta");
  if (template.quality_score === "RED")
    throw new Error("template com qualidade RED");

  const eligible: Array<{ id: string; phone: string }> = [];
  for (let offset = 0; offset < skippedRows.length; offset += 50) {
    const ids = skippedRows
      .slice(offset, offset + 50)
      .map((row) => row.contact_id);
    const resolved = await resolveAudience(env.DB, { contactIds: ids });
    eligible.push(...resolved.eligible);
  }
  const recipients = await renderRecipients(
    env.DB,
    campaign,
    template,
    eligible,
    true,
  );
  if (!recipients.length)
    return {
      status: "skipped",
      resent: 0,
      stillSkipped: skippedRows.length,
      message: "Nenhum contato ignorado passou na revalidação.",
    };

  assertPilotCampaign(env, {
    name: campaign.name,
    templateName: campaign.template_name,
  });
  assertPilotAudience(env, recipients);
  for (let offset = 0; offset < recipients.length; offset += 50) {
    await env.DB.batch(
      recipients.slice(offset, offset + 50).map((recipient) =>
        env.DB.prepare(
          `UPDATE campaign_contacts SET status = 'pending', phone = ?3,
         rendered_payload_json = ?4, rendered_payload_hash = ?5,
         message_id = NULL, error_code = NULL, error_detail = NULL,
         batch_id = NULL, claimed_at = NULL, updated_at = datetime('now')
       WHERE campaign_id = ?1 AND contact_id = ?2 AND status = 'skipped'`,
        ).bind(
          campaignId,
          recipient.id,
          recipient.phone,
          recipient.renderedPayloadJson ?? null,
          recipient.renderedPayloadHash ?? null,
        ),
      ),
    );
  }
  const stillSkipped = skippedRows.length - recipients.length;
  if (campaign.status === "sending" || campaign.status === "paused")
    return {
      status: "queued",
      resent: recipients.length,
      stillSkipped,
      workflowId: campaign.workflow_id ?? undefined,
      message: `${recipients.length} contatos reenfileirados • ${stillSkipped} ainda ignorados`,
    };

  const workflowId = `${campaignId}-resend-${crypto.randomUUID()}`;
  await env.DB.prepare(
    "UPDATE campaigns SET status = 'sending', workflow_id = ?2, completed_at = NULL WHERE id = ?1",
  )
    .bind(campaignId, workflowId)
    .run();
  try {
    await env.CAMPAIGN_WF.create({ id: workflowId, params: { campaignId } });
  } catch (error) {
    for (let offset = 0; offset < recipients.length; offset += 50) {
      await env.DB.batch(
        recipients.slice(offset, offset + 50).map((recipient) =>
          env.DB.prepare(
            `UPDATE campaign_contacts SET status = 'skipped', error_code = 'RESEND_WORKFLOW_CREATE_FAILED',
           error_detail = 'Falha ao iniciar reenvio; nenhuma nova tentativa foi executada.', updated_at = datetime('now')
         WHERE campaign_id = ?1 AND contact_id = ?2 AND status = 'pending'`,
          ).bind(campaignId, recipient.id),
        ),
      );
    }
    await env.DB.prepare(
      "UPDATE campaigns SET status = ?2, workflow_id = ?3, completed_at = ?4 WHERE id = ?1",
    )
      .bind(
        campaignId,
        campaign.status,
        campaign.workflow_id,
        campaign.completed_at,
      )
      .run();
    throw error;
  }
  return {
    status: "queued",
    resent: recipients.length,
    stillSkipped,
    workflowId,
    message: `${recipients.length} contatos reenfileirados • ${stillSkipped} ainda ignorados`,
  };
}

export async function cancelCampaign(
  db: D1Database,
  wf: WorkflowBinding,
  id: string,
): Promise<ControlResult> {
  const cdb = campaignsDb(db);
  const campaign = await cdb.get(id);
  if (!campaign)
    return { ok: false, status: 404, error: "campanha não encontrada" };
  if (!["draft", "scheduled", "sending", "paused"].includes(campaign.status))
    return {
      ok: false,
      status: 409,
      error: `campanha em status ${campaign.status} não pode ser cancelada`,
    };
  const changed = await cdb.transitionStatus(
    campaign.id,
    ["draft", "scheduled", "sending", "paused"],
    "cancelled",
  );
  if (!changed) {
    const current = await cdb.get(id);
    if (current?.status !== "cancelled")
      return {
        ok: false,
        status: 409,
        error: `campanha em status ${current?.status ?? "desconhecido"} não pode ser cancelada`,
      };
  }
  // O D1 é a trava terminal; mesmo se terminate falhar, o Workflow checa
  // cancelled a cada batch. Ainda assim, registra a falha para intervenção.
  const workflowId = (await cdb.get(id))?.workflow_id ?? campaign.workflow_id;
  if (workflowId) {
    try {
      await (await wf.get(workflowId)).terminate();
    } catch (error) {
      // Instância ausente/finalizada é idempotência esperada: o estado terminal
      // do D1 já impede qualquer envio. Outros erros continuam observáveis.
      if (!isMissingWorkflowInstance(error))
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "terminate falhou após cancelamento",
            error: redactOperationalDetail(
              error instanceof Error ? error.message : error,
            ),
          }),
        );
    }
  }
  return { ok: true };
}

export async function pauseCampaign(
  db: D1Database,
  wf: WorkflowBinding,
  id: string,
): Promise<ControlResult> {
  const cdb = campaignsDb(db);
  const campaign = await cdb.get(id);
  if (!campaign?.workflow_id)
    return { ok: false, status: 409, error: "campanha sem workflow ativo" };
  if (!["scheduled", "sending"].includes(campaign.status))
    return {
      ok: false,
      status: 409,
      error: `campanha em status ${campaign.status} não pode ser pausada`,
    };
  const instance = await wf.get(campaign.workflow_id);
  await instance.pause();
  let changed: boolean;
  try {
    changed = await cdb.transitionStatus(
      campaign.id,
      ["scheduled", "sending"],
      "paused",
    );
  } catch (error) {
    // Workflow e D1 não compartilham transação. Se o D1 falhar depois do pause,
    // devolve o Workflow ao estado anterior para não ficar pausado e invisível.
    try {
      await instance.resume();
    } catch (compensationError) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "falha ao compensar pause após erro no D1",
          error: redactOperationalDetail(
            compensationError instanceof Error
              ? compensationError.message
              : compensationError,
          ),
        }),
      );
    }
    throw error;
  }
  if (!changed) {
    const current = await cdb.get(campaign.id);
    if (current?.status === "paused") return { ok: true };
    if (
      current &&
      ["cancelled", "completed", "failed"].includes(current.status)
    ) {
      try {
        await instance.terminate();
      } catch {
        /* estado terminal do D1 prevalece */
      }
    } else {
      try {
        await instance.resume();
      } catch {
        /* resposta já será conflito */
      }
    }
    return {
      ok: false,
      status: 409,
      error: `campanha mudou para ${current?.status ?? "estado desconhecido"} durante o pause`,
    };
  }
  return { ok: true };
}

export async function resumeCampaign(
  db: D1Database,
  wf: WorkflowBinding,
  id: string,
): Promise<ControlResult> {
  const cdb = campaignsDb(db);
  const campaign = await cdb.get(id);
  if (!campaign?.workflow_id)
    return { ok: false, status: 409, error: "campanha sem workflow ativo" };
  if (!['paused', 'sending'].includes(campaign.status))
    return {
      ok: false,
      status: 409,
      error: `campanha em status ${campaign.status} não pode ser retomada`,
    };
  const instance = await wf.get(campaign.workflow_id);
  let resumed = false;
  let resumeError: unknown;
  // O runtime de Workflows pode levar alguns milissegundos para materializar
  // a pausa. Repetimos a operação curta e idempotente antes de expor erro ao
  // operador, evitando a janela de corrida pausa -> retomada imediata.
  for (let attempt = 0; attempt < 3 && !resumed; attempt++) {
    try {
      await instance.resume();
      resumed = true;
    } catch (error) {
      resumeError = error;
      if (attempt < 2)
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  if (!resumed) throw resumeError;
  let changed: boolean;
  if (campaign.status === 'sending') return { ok: true };
  try {
    changed = await cdb.transitionStatus(campaign.id, ["paused"], "sending");
  } catch (error) {
    // Simétrico ao pause: se persistir falhar, restaura a pausa antes de
    // propagar o erro, mantendo o D1 como fonte de verdade para a operação.
    try {
      await instance.pause();
    } catch (compensationError) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "falha ao compensar resume após erro no D1",
          error: redactOperationalDetail(
            compensationError instanceof Error
              ? compensationError.message
              : compensationError,
          ),
        }),
      );
    }
    throw error;
  }
  if (!changed) {
    const current = await cdb.get(campaign.id);
    if (current?.status === "sending") return { ok: true };
    if (
      current &&
      ["cancelled", "completed", "failed"].includes(current.status)
    ) {
      try {
        await instance.terminate();
      } catch {
        /* estado terminal do D1 prevalece */
      }
    } else {
      try {
        await instance.pause();
      } catch {
        /* resposta já será conflito */
      }
    }
    return {
      ok: false,
      status: 409,
      error: `campanha mudou para ${current?.status ?? "estado desconhecido"} durante o resume`,
    };
  }
  return { ok: true };
}

export const campaignsRoutes = new Hono<{ Bindings: Env }>()
  .get("/folders", async (c) =>
    c.json({ items: await campaignsDb(c.env.DB).listFolders() }),
  )
  .post("/folders", async (c) => {
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = FolderSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "pasta inválida" }, 400);
    try {
      return c.json(
        await campaignsDb(c.env.DB).createFolder(
          body.data.name,
          body.data.color ?? null,
        ),
        201,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        /UNIQUE constraint failed/.test(error.message)
      )
        return c.json({ error: "já existe uma pasta com esse nome" }, 409);
      throw error;
    }
  })
  .patch("/folders/:folderId", async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("folderId"));
    if (!id.success) return c.json({ error: "pasta inválida" }, 400);
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = FolderSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "pasta inválida" }, 400);
    try {
      return (await campaignsDb(c.env.DB).updateFolder(
        id.data,
        body.data.name,
        body.data.color ?? null,
      ))
        ? c.json({ ok: true })
        : c.json({ error: "pasta não encontrada" }, 404);
    } catch (error) {
      if (
        error instanceof Error &&
        /UNIQUE constraint failed/.test(error.message)
      )
        return c.json({ error: "já existe uma pasta com esse nome" }, 409);
      throw error;
    }
  })
  .delete("/folders/:folderId", async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("folderId"));
    if (!id.success) return c.json({ error: "pasta inválida" }, 400);
    return (await campaignsDb(c.env.DB).deleteFolder(id.data))
      ? c.json({ ok: true })
      : c.json({ error: "pasta não encontrada" }, 404);
  })
  .get("/tags", async (c) =>
    c.json({ items: await campaignsDb(c.env.DB).listTags() }),
  )
  .post("/tags", async (c) => {
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = CampaignTagSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "tag inválida" }, 400);
    try {
      return c.json(
        await campaignsDb(c.env.DB).createTag(
          body.data.name,
          body.data.color ?? null,
        ),
        201,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        /UNIQUE constraint failed/.test(error.message)
      )
        return c.json({ error: "já existe uma tag com esse nome" }, 409);
      throw error;
    }
  })
  .delete("/tags/:tagId", async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("tagId"));
    if (!id.success) return c.json({ error: "tag inválida" }, 400);
    return (await campaignsDb(c.env.DB).deleteTag(id.data))
      ? c.json({ ok: true })
      : c.json({ error: "tag não encontrada" }, 404);
  })
  .get("/", async (c) => {
    const page = parsePage(c.req.query("page"));
    if (page === null) return c.json({ error: "página inválida" }, 400);
    const query = campaignListQuerySchema.safeParse({
      q: c.req.query("q") || undefined,
      status: c.req.query("status") || undefined,
      folderId: c.req.query("folderId") || undefined,
      tagIds: c.req.query("tagIds")?.split(",").filter(Boolean) || undefined,
    });
    if (!query.success) return c.json({ error: "filtros inválidos" }, 400);
    return c.json(
      await campaignsDb(c.env.DB).list({
        ...query.data,
        limit: CAMPAIGNS_PAGE_SIZE,
        offset: (page - 1) * CAMPAIGNS_PAGE_SIZE,
      }),
    );
  })
  .get("/ids", async (c) => {
    const query = campaignListQuerySchema.safeParse({
      q: c.req.query("q") || undefined,
      status: c.req.query("status") || undefined,
      folderId: c.req.query("folderId") || undefined,
      tagIds: c.req.query("tagIds")?.split(",").filter(Boolean) || undefined,
    });
    if (!query.success) return c.json({ error: "filtros inválidos" }, 400);
    const result = await campaignsDb(c.env.DB).list({
      ...query.data,
      limit: 200,
      offset: 0,
    });
    if (result.total > 200)
      return c.json({ error: "refine os filtros para selecionar no máximo 200 campanhas" }, 422);
    return c.json({ ids: result.items.map((campaign) => campaign.id), total: result.total });
  })
  .post("/", async (c) => {
    const raw = await readJsonBody(c, 65_536);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = createCampaignSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "payload inválido" }, 400);
    const tdb = templatesDb(c.env.DB);
    let template = body.data.template_language
      ? await tdb.get(body.data.template_name, body.data.template_language)
      : null;
    if (!body.data.template_language) {
      const variants = await tdb.listByName(body.data.template_name);
      if (variants.length > 1)
        return c.json(
          {
            error:
              "template possui mais de um idioma — selecione a variante explicitamente",
          },
          400,
        );
      template = variants[0] ?? null;
    }
    if (!template)
      return c.json(
        { error: "template/idioma não encontrado — sincronize com a Meta" },
        400,
      );
    if (!isSimpleTemplateCategory(template.category))
      return c.json(unsupportedTemplateCategory, 409);
    if (!isSimpleTemplateSendContract(template.components))
      return c.json(unsupportedTemplateContract, 409);
    const variables = extractTemplateVariables(template.components);
    if (templateRequiresParameters(template.components) && !variables.length)
      return c.json(
        {
          error:
            "template usa componente dinâmico ainda não suportado neste fluxo",
        },
        400,
      );
    if (variables.length && !body.data.variable_mapping)
      return c.json(
        { error: "mapeamento das variáveis do template é obrigatório" },
        400,
      );
    if (body.data.variable_mapping) {
      try {
        renderTemplateParameters(
          template.components,
          body.data.variable_mapping,
          { name: "Preview", phone: "+5500000000000" },
        );
      } catch (error) {
        return c.json(
          {
            error:
              error instanceof Error ? error.message : "mapeamento inválido",
          },
          400,
        );
      }
    }
    const campaign = await campaignsDb(c.env.DB).create({
      ...body.data,
      template_language: String(template.language),
      variable_mapping_json: body.data.variable_mapping
        ? JSON.stringify(body.data.variable_mapping)
        : undefined,
    });
    return c.json(campaign, 201);
  })
  .put("/:id/folder", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "campanha inválida" }, 400);
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({ folderId: z.string().uuid().nullable() })
      .strict()
      .safeParse(raw.value);
    if (!body.success) return c.json({ error: "pasta inválida" }, 400);
    try {
      return (await campaignsDb(c.env.DB).setFolder(
        id.data,
        body.data.folderId,
      ))
        ? c.json({ ok: true })
        : c.json({ error: "campanha não encontrada" }, 404);
    } catch (error) {
      if (error instanceof Error && error.message === "pasta não encontrada")
        return c.json({ error: error.message }, 400);
      throw error;
    }
  })
  .put("/:id/tags", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "campanha inválida" }, 400);
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = CampaignTagsSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "tags inválidas" }, 400);
    try {
      return (await campaignsDb(c.env.DB).setTags(id.data, body.data.tagIds))
        ? c.json({ ok: true })
        : c.json({ error: "campanha não encontrada" }, 404);
    } catch (error) {
      if (error instanceof Error && error.message === "tag não encontrada")
        return c.json({ error: error.message }, 400);
      throw error;
    }
  })
  .put("/:id/schedule", async (c) => {
    const denied = assertSameOrigin(c);
    if (denied) return denied;
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "campanha inválida" }, 400);
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = CampaignScheduleSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "agendamento inválido" }, 400);
    return (await campaignsDb(c.env.DB).setSchedule(
      id.data,
      body.data.scheduledAt,
    ))
      ? c.json({ ok: true })
      : c.json(
          { error: "campanha não encontrada ou não pode ser reagendada" },
          409,
        );
  })
  .get("/:id", async (c) => {
    const campaign = await campaignsDb(c.env.DB).get(c.req.param("id"));
    if (!campaign) return c.json({ error: "campanha não encontrada" }, 404);
    const statusCounts = await campaignContactsDb(c.env.DB).countByStatus(
      campaign.id,
    );
    const template = (await templatesDb(c.env.DB).get(
      campaign.template_name,
      campaign.template_language,
    )) as TemplateRow | null;
    let phones = (
      await c.env.DB.prepare(
        "SELECT phone FROM campaign_contacts WHERE campaign_id=?1 ORDER BY rowid",
      ).bind(campaign.id).all<{ phone: string }>()
    ).results.map((row) => row.phone);
    if (
      phones.length === 0 &&
      ["draft", "scheduled"].includes(campaign.status) &&
      campaign.audience_definition_json
    ) {
      try {
        const storedAudience = audienceSchema.safeParse(
          JSON.parse(campaign.audience_definition_json),
        );
        if (storedAudience.success) {
          const resolved = await resolveAudience(c.env.DB, storedAudience.data);
          phones = resolved.eligible.map((contact) => contact.phone);
        }
      } catch {
        // O detalhe continua disponível mesmo se um registro legado de audiência
        // estiver corrompido; nesse caso, pricing permanece indisponível.
      }
    }
    const pricingCurrency = await settingsDb(c.env.DB).get("pricing_currency");
    const rateCards = await pricingDb(c.env.DB).activeRateCards(
      new Date().toISOString().slice(0, 10),
      pricingCurrency ?? undefined,
    );
    const now = new Date();
    const monthlyVolumeByMarket = await pricingDb(c.env.DB).monthlyVolumeByMarket(
      Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000),
      Math.floor(now.getTime() / 1000),
    );
    const cost = estimateCampaignCost({
      category: template?.category,
      phones,
      rateCards,
      monthlyVolumeByMarket,
      currency: pricingCurrency ?? undefined,
    });
    const confirmed = await pricingDb(c.env.DB).latestConfirmedCampaignCost(campaign.id);
    return c.json({
      ...campaign,
      total: campaign.total || phones.length,
      status_counts: statusCounts,
      template: template
        ? {
            name: campaign.template_name,
            language: campaign.template_language,
            components: template.components ?? [],
          }
        : null,
      cost: {
        ...cost,
        confirmed: confirmed ?? null,
      },
    });
  })
  .get("/:id/contacts", async (c) => {
    const page = parsePage(c.req.query("page"));
    if (page === null) return c.json({ error: "página inválida" }, 400);
    return c.json(
      await campaignContactsDb(c.env.DB).listByCampaign(
        c.req.param("id"),
        page,
      ),
    );
  })
  .get("/:id/report.csv", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "campanha inválida" }, 400);
    const campaign = await campaignsDb(c.env.DB).get(id.data);
    if (!campaign) return c.json({ error: "campanha não encontrada" }, 404);
    const rows = (
      await c.env.DB.prepare(
        `SELECT COALESCE(c.name, '') AS name, cc.phone, cc.status,
        COALESCE(cc.error_code, '') AS error_code, COALESCE(cc.error_detail, '') AS error_detail,
        cc.updated_at
       FROM campaign_contacts cc LEFT JOIN contacts c ON c.id = cc.contact_id
       WHERE cc.campaign_id = ?1 ORDER BY cc.updated_at DESC, cc.contact_id`,
      )
        .bind(id.data)
        .all<Record<string, string>>()
    ).results;
    const csvCell = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      "nome,telefone,status,codigo_erro,detalhe_erro,atualizado_em",
      ...rows.map((row) =>
        [
          row.name,
          row.phone,
          row.status,
          row.error_code,
          row.error_detail,
          row.updated_at,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n");
    const filename =
      campaign.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "campanha";
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}.csv"`,
        "cache-control": "no-store",
      },
    });
  })
  .get("/:id/batches", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "campanha inválida" }, 400);
    if (!(await campaignsDb(c.env.DB).get(id.data)))
      return c.json({ error: "campanha não encontrada" }, 404);
    const batches = campaignBatchesDb(c.env.DB);
    return c.json({
      items: await batches.list(id.data),
      traces: await batches.traces(id.data),
    });
  })
  .post("/:id/preview", async (c) => {
    const campaign = await campaignsDb(c.env.DB).get(c.req.param("id"));
    if (!campaign) return c.json({ error: "campanha não encontrada" }, 404);
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = previewSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "contato inválido" }, 400);
    const contact = await loadRenderContact(c.env.DB, body.data.contactId);
    if (!contact) return c.json({ error: "contato não encontrado" }, 404);
    const template = (await templatesDb(c.env.DB).get(
      campaign.template_name,
      campaign.template_language,
    )) as TemplateRow | null;
    if (!template) return c.json({ error: "template não encontrado" }, 409);
    const mapping = campaign.variable_mapping_json
      ? JSON.parse(campaign.variable_mapping_json)
      : {};
    try {
      const rendered = renderTemplateParameters(
        template.components,
        mapping,
        contact,
      );
      return c.json({
        template: {
          name: campaign.template_name,
          language: campaign.template_language,
          components: previewComponents(template.components, rendered.resolved),
        },
        resolved: rendered.resolved,
      });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "não foi possível renderizar preview",
        },
        409,
      );
    }
  })
  .post("/:id/estimate", async (c) => {
    const campaign = await campaignsDb(c.env.DB).get(c.req.param("id"));
    if (!campaign) return c.json({ error: "campanha não encontrada" }, 404);
    const raw = await readJsonBody(c, 65_536);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = audienceSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "audiência inválida" }, 400);
    let audience: Awaited<ReturnType<typeof resolveAudience>>;
    try {
      audience = await resolveAudience(c.env.DB, body.data);
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "audiência inválida",
        },
        400,
      );
    }
    const { eligible, skipped } = audience;
    const template = (await templatesDb(c.env.DB).get(
      campaign.template_name,
      campaign.template_language,
    )) as TemplateRow | null;
    const pricingCurrency = await settingsDb(c.env.DB).get("pricing_currency");
    const rateCards = await pricingDb(c.env.DB).activeRateCards(
      new Date().toISOString().slice(0, 10),
      pricingCurrency ?? undefined,
    );
    const now = new Date();
    const monthlyVolumeByMarket = await pricingDb(c.env.DB).monthlyVolumeByMarket(
      Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000),
      Math.floor(now.getTime() / 1000),
    );
    const cost = estimateCampaignCost({
      category: template?.category,
      phones: eligible.map((recipient) => recipient.phone),
      rateCards,
      monthlyVolumeByMarket,
      currency: pricingCurrency ?? undefined,
    });
    await pricingDb(c.env.DB).saveCampaignEstimate(campaign.id, cost);
    return c.json({ recipients: eligible.length, skipped, ...cost });
  })
  .post("/:id/precheck", async (c) => {
    const campaign = await campaignsDb(c.env.DB).get(c.req.param("id"));
    if (!campaign) return c.json({ error: "campanha não encontrada" }, 404);
    const raw = await readJsonBody(c, 65_536);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = audienceSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "audiência inválida" }, 400);
    let audience: Awaited<ReturnType<typeof resolveAudience>>;
    try {
      audience = await resolveAudience(c.env.DB, body.data);
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "audiência inválida",
        },
        400,
      );
    }
    const template = (await templatesDb(c.env.DB).get(
      campaign.template_name,
      campaign.template_language,
    )) as TemplateRow | null;
    if (!template) return c.json({ error: "template não encontrado" }, 409);
    const mapping = campaign.variable_mapping_json
      ? JSON.parse(campaign.variable_mapping_json)
      : {};
    const valid: Array<{ id: string; phone: string }> = [];
    const invalid: Array<{
      id: string;
      phone: string;
      name: string | null;
      reason: string;
      detail?: string;
      missingFieldIds?: string[];
    }> = [];
    for (const item of audience.eligible) {
      const contact = await loadRenderContact(c.env.DB, item.id);
      if (!contact) {
        invalid.push({ ...item, name: null, reason: "contact_not_found" });
        continue;
      }
      try {
        renderTemplateParameters(template.components, mapping, contact);
        valid.push(item);
      } catch (error) {
        const missingFieldIds = Object.values(
          mapping as Record<
            string,
            { source?: string; fieldId?: string; fallback?: string }
          >,
        )
          .filter(
            (source) =>
              source.source === "custom_field" &&
              source.fieldId &&
              !source.fallback &&
              (contact.customValues[source.fieldId] === null ||
                contact.customValues[source.fieldId] === undefined ||
                contact.customValues[source.fieldId] === ""),
          )
          .map((source) => source.fieldId!);
        invalid.push({
          ...item,
          name: contact.name,
          reason: "missing_template_data",
          detail: error instanceof Error ? error.message : undefined,
          missingFieldIds,
        });
      }
    }
    const skippedItems = [...audience.skippedItems, ...invalid];
    await campaignsDb(c.env.DB).setAudienceDefinition(campaign.id, body.data);
    return c.json({
      totals: {
        valid: valid.length,
        skipped: skippedItems.length,
        candidates: valid.length + skippedItems.length,
      },
      validIds: valid.map((item) => item.id),
      skippedItems,
    });
  })
  .post("/:id/duplicate", async (c) => {
    const denied = assertSameOrigin(c);
    if (denied) return denied;
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "campanha inválida" }, 400);
    const cdb = campaignsDb(c.env.DB);
    const copy = await cdb.duplicate(id.data);
    if (!copy) return c.json({ error: "campanha não encontrada" }, 404);

    // Um rascunho não recebe campaign_contacts: essas linhas representam uma
    // tentativa de envio e nunca devem ser clonadas. A definição de audiência
    // é preservada e resolvida novamente para exibir o público atual no clone.
    // No disparo ela é resolvida mais uma vez, portanto opt-out/supressão feitos
    // após a cópia continuam sendo respeitados.
    let audienceTotal = copy.total;
    if (copy.audience_definition_json) {
      try {
        const audience = audienceSchema.safeParse(
          JSON.parse(copy.audience_definition_json),
        );
        if (audience.success) {
          audienceTotal = (await resolveAudience(c.env.DB, audience.data)).eligible.length;
          await cdb.setTotal(copy.id, audienceTotal);
        }
      } catch {
        // Um rascunho legado com audiência inválida continua clonável; a tela
        // de validação solicitará uma audiência válida antes do disparo.
      }
    }
    return c.json({ ...copy, total: audienceTotal }, 201);
  })
  .delete("/bulk", async (c) => {
    const denied = assertSameOrigin(c);
    if (denied) return denied;
    const raw = await readJsonBody(c, 65_536);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = CampaignBulkDeleteSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "campanhas inválidas" }, 400);
    const result = await campaignsDb(c.env.DB).removeMany(body.data.ids);
    if (result.active)
      return c.json(
        { error: "pause ou cancele as campanhas ativas antes de excluir", ...result },
        409,
      );
    return c.json({ ok: true, ...result });
  })
  .delete("/:id", async (c) => {
    const denied = assertSameOrigin(c);
    if (denied) return denied;
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "campanha inválida" }, 400);
    const result = await campaignsDb(c.env.DB).remove(id.data);
    return result === "removed"
      ? c.json({ ok: true })
      : result === "active"
        ? c.json({ error: "pause ou cancele a campanha antes de excluir" }, 409)
        : c.json({ error: "campanha não encontrada" }, 404);
  })
  .post("/:id/resend-skipped", async (c) => {
    const denied = assertSameOrigin(c);
    if (denied) return denied;
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "campanha inválida" }, 400);
    try {
      const result = await resendSkippedContacts(c.env, id.data);
      return c.json(result, result.status === "nothing" ? 200 : 202);
    } catch (error) {
      if (error instanceof PilotSafetyError)
        return c.json(
          {
            error: "reenvio bloqueado pela trava do piloto",
            detail: error.message,
          },
          error.status,
        );
      const message =
        error instanceof Error ? error.message : "falha ao reenviar ignorados";
      return c.json(
        { error: message },
        /não encontrada/.test(message) ? 404 : 409,
      );
    }
  })
  .post("/:id/dispatch", async (c) => {
    const denied = assertSameOrigin(c); // mutação sensível: Origin cross-site → 403
    if (denied) return denied;
    const id = c.req.param("id");
    const cdb = campaignsDb(c.env.DB);
    const campaign = await cdb.get(id);
    if (!campaign) return c.json({ error: "campanha não encontrada" }, 404);
    if (!["draft", "scheduled"].includes(campaign.status))
      return c.json(
        {
          error: `campanha em status ${campaign.status} não pode ser disparada`,
        },
        409,
      );
    const raw = await readJsonBody(c, 65_536);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const requested = audienceSchema.safeParse(raw.value);
    if (!requested.success) return c.json({ error: "audiência inválida" }, 400);
    const storedAudience = campaign.audience_definition_json
      ? audienceSchema.safeParse(JSON.parse(campaign.audience_definition_json))
      : null;
    const body =
      Object.keys(requested.data).length === 0 && storedAudience?.success
        ? storedAudience
        : requested;
    if (!body.success) return c.json({ error: "audiência inválida" }, 400);
    const creds = await getCredentials(c.env);
    if (!creds?.wabaId)
      return c.json({ error: "credenciais Meta não configuradas" }, 503);
    const meta = await probeMeta(creds);
    if (!meta.ok)
      return c.json(
        {
          error: "preflight Meta falhou",
          detail: meta.error,
          code: meta.code,
          fbtraceId: meta.fbtraceId,
        },
        503,
      );

    // Revalida o status imediatamente antes de criar o Workflow. O webhook reduz
    // a janela de staleness, mas não presumimos que a assinatura esteja perfeita.
    try {
      await templatesDb(c.env.DB).replaceFromMeta(
        await whatsappClient(creds).fetchTemplates(creds.wabaId),
      );
    } catch (error) {
      const detail =
        error instanceof MetaApiRequestError
          ? error.message
          : "falha ao sincronizar templates";
      return c.json(
        { error: "não foi possível validar templates na Meta", detail },
        503,
      );
    }
    const liveTemplate = (await templatesDb(c.env.DB).get(
      campaign.template_name,
      campaign.template_language,
    )) as TemplateRow | null;
    if (!liveTemplate || liveTemplate.status !== "APPROVED")
      return c.json({ error: "template não está aprovado na Meta" }, 409);
    if (!isSimpleTemplateCategory(liveTemplate.category))
      return c.json(unsupportedTemplateCategory, 409);
    if (!isSimpleTemplateSendContract(liveTemplate.components))
      return c.json(unsupportedTemplateContract, 409);
    if (liveTemplate.quality_score === "RED")
      return c.json(
        {
          error:
            "template com qualidade RED — disparo bloqueado para proteger a conta",
        },
        409,
      );
    const variables = extractTemplateVariables(liveTemplate.components);
    if (
      templateRequiresParameters(liveTemplate.components) &&
      !variables.length
    )
      return c.json(
        {
          error:
            "template usa componente dinâmico ainda não suportado neste fluxo",
        },
        400,
      );
    let audience: Awaited<ReturnType<typeof resolveAudience>>;
    try {
      audience = await resolveAudience(c.env.DB, body.data);
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "audiência inválida",
        },
        400,
      );
    }
    const { eligible } = audience;
    if (!eligible.length)
      return c.json(
        { error: "audiência vazia (nenhum contato opt-in elegível)" },
        400,
      );
    let recipients: {
      id: string;
      phone: string;
      renderedPayloadJson?: string;
      renderedPayloadHash?: string;
    }[];
    try {
      recipients = variables.length
        ? await renderRecipients(
            c.env.DB,
            campaign,
            liveTemplate,
            eligible,
            body.data.skipInvalid === true,
          )
        : eligible;
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? `não foi possível renderizar a audiência: ${error.message}`
              : "não foi possível renderizar a audiência",
        },
        409,
      );
    }
    await cdb.setAudienceDefinition(id, body.data);
    if (recipients.length !== eligible.length && body.data.skipInvalid !== true)
      return c.json(
        { error: "audiência mudou durante a composição; refaça o preflight" },
        409,
      );
    if (!recipients.length)
      return c.json(
        { error: "nenhum destinatário válido após a validação" },
        400,
      );
    try {
      assertPilotCampaign(c.env, {
        name: campaign.name,
        templateName: campaign.template_name,
      });
      assertPilotAudience(c.env, recipients);
    } catch (error) {
      if (error instanceof PilotSafetyError)
        return c.json(
          {
            error: "disparo bloqueado pela trava do piloto",
            detail: error.message,
          },
          error.status,
        );
      throw error;
    }

    const result = await startCampaignDispatch(
      c.env.DB,
      c.env.CAMPAIGN_WF,
      id,
      recipients,
      Boolean(campaign.scheduled_at),
    );
    return result.ok
      ? c.json({ workflowId: result.workflowId }, 202)
      : c.json({ error: result.error }, result.status);
  })
  .post("/:id/cancel", async (c) => {
    const denied = assertSameOrigin(c); // mutação sensível: Origin cross-site → 403
    if (denied) return denied;
    const r = await cancelCampaign(
      c.env.DB,
      c.env.CAMPAIGN_WF,
      c.req.param("id"),
    );
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  })
  .post("/:id/pause", async (c) => {
    const denied = assertSameOrigin(c);
    if (denied) return denied;
    const r = await pauseCampaign(
      c.env.DB,
      c.env.CAMPAIGN_WF,
      c.req.param("id"),
    );
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  })
  .post("/:id/resume", async (c) => {
    const denied = assertSameOrigin(c);
    if (denied) return denied;
    const r = await resumeCampaign(
      c.env.DB,
      c.env.CAMPAIGN_WF,
      c.req.param("id"),
    );
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  });
