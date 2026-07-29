import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { conversationsDb } from "../db/conversations";
import { parsePage } from "../domain/pagination";
import {
  AI_PROMPT_VERSION,
  AiDraftError,
  aiConfiguration,
  generateDraftText,
  generateGroundedText,
} from "../ai/drafts";
import { aiUsageLimits } from "../ai/limits";
import {
  agentKnowledgeDocumentIds,
  extractKnowledgeSources,
  searchKnowledge,
} from "../knowledge/service";
import { readJsonBody } from "./body";
import {
  conversationSendsDb,
  publicConversationSend,
} from "../db/conversation-sends";
import {
  assertPilotInboxRecipient,
  pilotLimit,
  PilotSafetyError,
} from "../domain/pilot";
import { getCredentials } from "../whatsapp/credentials";
import { MetaApiRequestError, whatsappClient } from "../whatsapp/client";
import { settingsDb } from "../db/settings";
import { recipientAuditKey, resolveContactRecipient } from "../domain/meta-recipient";
import { templatesDb } from "../db/templates";
import {
  renderTemplateParameters,
  variableMappingSchema,
} from "../domain/template-render";

const PAGE_SIZE = 50;
const IdSchema = z.string().uuid();
const ListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["open", "closed"]).optional(),
  mode: z.enum(["human", "bot"]).optional(),
  labelId: z.string().uuid().optional(),
});
const AiToggleSchema = z.object({ enabled: z.boolean() }).strict();
const AiGenerateSchema = z.object({ requestKey: z.string().uuid() }).strict();
const AiReviewSchema = z
  .object({ status: z.enum(["approved", "discarded"]) })
  .strict();
const AiSendSchema = z
  .object({
    requestKey: z.string().uuid(),
    confirm: z.literal(true),
    media: z.object({
      id: z.string().regex(/^\d{1,512}$/),
      type: z.enum(["image", "video", "audio", "document"]),
      filename: z.string().trim().min(1).max(240).optional(),
      caption: z.string().trim().max(1024).optional(),
      mimeType: z.string().trim().max(120).optional(),
      size: z.number().int().positive().max(25 * 1024 * 1024).optional(),
    }).strict().optional(),
  })
  .strict();
const ManualDraftSchema = z
  .object({
    text: z.string().trim().min(1).max(4096),
    requestKey: z.string().uuid(),
  })
  .strict();
const TemplateSendSchema = z
  .object({
    requestKey: z.string().uuid(),
    confirm: z.literal(true),
    name: z.string().trim().min(1).max(512),
    language: z.string().trim().min(2).max(32),
    mapping: variableMappingSchema,
  })
  .strict();
const OperationSchema = z
  .object({
    status: z.enum(["open", "closed"]).optional(),
    mode: z.enum(["human", "bot"]).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    pausedUntil: z.number().int().positive().nullable().optional(),
    handoffReason: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "operação vazia");
const LabelSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
  })
  .strict();
const QuickReplySchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    shortcut: z.string().trim().min(1).max(64),
    body: z.string().trim().min(1).max(4096),
  })
  .strict();
const NoteSchema = z
  .object({ body: z.string().trim().min(1).max(4096) })
  .strict();
const AgentSchema = z
  // O agente padrão legado usa `agent_commercial`; agentes criados pela UI
  // usam UUID. Ambos são IDs internos, validados novamente pela camada DB.
  .object({ agentId: z.string().trim().min(1).max(128).nullable() })
  .strict();

const MAX_OUTBOUND_MEDIA_BYTES = 25 * 1024 * 1024;
const OUTBOUND_DOCUMENT_TYPES = new Set([
  "application/pdf", "text/plain", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function outboundMediaType(mime: string): "image" | "video" | "audio" | "document" | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return OUTBOUND_DOCUMENT_TYPES.has(mime) ? "document" : null;
}

function matchesMediaSignature(mime: string, bytes: Uint8Array): boolean {
  if (mime === "application/pdf")
    return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (mime === "image/png")
    return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value);
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/gif") return bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(String.fromCharCode(...bytes.slice(0, 6)));
  return true;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function loadTemplateContact(db: D1Database, contactId: string) {
  const contact = await db.prepare(
    "SELECT id, name, phone, email FROM contacts WHERE id = ?1",
  ).bind(contactId).first<{
    id: string;
    name: string | null;
    phone: string;
    email: string | null;
  }>();
  if (!contact) return null;
  const rows = (await db.prepare(
    `SELECT field_id, value_text, value_number, value_date, value_boolean
     FROM contact_custom_values WHERE contact_id = ?1`,
  ).bind(contactId).all<Record<string, unknown>>()).results;
  const customValues: Record<string, string | number | boolean | null> = {};
  for (const row of rows) {
    const raw = row.value_text ?? row.value_number ?? row.value_date;
    customValues[String(row.field_id)] =
      typeof raw === "string" || typeof raw === "number"
        ? raw
        : row.value_boolean == null
          ? null
          : Boolean(row.value_boolean);
  }
  return { ...contact, customValues };
}

function templateMessagePreview(
  name: string,
  components: unknown,
  resolved: Record<string, string>,
): string {
  const parts: string[] = [];
  if (Array.isArray(components)) {
    for (const raw of components) {
      if (!raw || typeof raw !== "object") continue;
      const component = raw as { type?: unknown; text?: unknown };
      const type = String(component.type ?? "").toLowerCase();
      if (!["header", "body", "footer"].includes(type)) continue;
      let text = String(component.text ?? "");
      text = text.replace(/{{\s*(\d+)\s*}}/g, (_match, index: string) =>
        resolved[`${type}.${index}`] ?? `{{${index}}}`,
      );
      if (text.trim()) parts.push(text.trim());
    }
  }
  return (parts.join("\n\n") || `[Template: ${name}]`).slice(0, 4096);
}

export const conversationsRoutes = new Hono<{ Bindings: Env }>()
  .get("/labels", async (c) =>
    c.json({ items: await conversationsDb(c.env.DB).listLabels() }),
  )
  .post("/labels", async (c) => {
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = LabelSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "label inválida" }, 400);
    try {
      return c.json(
        await conversationsDb(c.env.DB).createLabel(
          body.data.name,
          body.data.color,
        ),
        201,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        /UNIQUE constraint failed/.test(error.message)
      )
        return c.json({ error: "label já existe" }, 409);
      throw error;
    }
  })
  .get("/quick-replies", async (c) =>
    c.json({ items: await conversationsDb(c.env.DB).listQuickReplies() }),
  )
  .post("/quick-replies", async (c) => {
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = QuickReplySchema.safeParse(raw.value);
    if (!body.success)
      return c.json({ error: "resposta rápida inválida" }, 400);
    try {
      return c.json(
        await conversationsDb(c.env.DB).createQuickReply(body.data),
        201,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        /UNIQUE constraint failed/.test(error.message)
      )
        return c.json({ error: "atalho já existe" }, 409);
      throw error;
    }
  })
  .get("/", async (c) => {
    const page = parsePage(c.req.query("page"));
    if (page === null) return c.json({ error: "página inválida" }, 400);
    const query = ListQuerySchema.safeParse({
      q: c.req.query("q") || undefined,
      status: c.req.query("status") || undefined,
      mode: c.req.query("mode") || undefined,
      labelId: c.req.query("labelId") || undefined,
    });
    if (!query.success) return c.json({ error: "filtros inválidos" }, 400);
    return c.json(
      await conversationsDb(c.env.DB).list({
        ...query.data,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    );
  })
  .get("/:id", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const conversation = await conversationsDb(c.env.DB).get(id.data) as {
      status: string; phone: string;
    } | null;
    return conversation
      ? c.json(conversation)
      : c.json({ error: "conversa não encontrada" }, 404);
  })
  .get("/:id/messages", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const page = parsePage(c.req.query("page"));
    if (page === null) return c.json({ error: "página inválida" }, 400);
    if (!(await conversationsDb(c.env.DB).get(id.data)))
      return c.json({ error: "conversa não encontrada" }, 404);
    return c.json(
      await conversationsDb(c.env.DB).listMessages(id.data, {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    );
  })
  .get("/:id/messages/:messageId/media", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const messageId = c.req.param("messageId");
    if (!messageId || messageId.length > 512)
      return c.json({ error: "mensagem inválida" }, 400);
    const row = await c.env.DB.prepare(
      `SELECT m.content_json, stored.r2_key, stored.mime_type, stored.byte_size
       FROM conversation_messages m LEFT JOIN conversation_media stored ON stored.message_id = m.id
       WHERE m.id = ?1 AND m.conversation_id = ?2
       AND m.message_type IN ('image','video','audio','document','sticker')`,
    )
      .bind(messageId, id.data)
      .first<{
        content_json: string | null;
        r2_key: string | null;
        mime_type: string | null;
        byte_size: number | null;
      }>();
    if (!row?.content_json)
      return c.json({ error: "mídia não encontrada" }, 404);
    if (row.r2_key) {
      const stored = await c.env.MEDIA.get(row.r2_key);
      if (!stored)
        return c.json({ error: "mídia expirada ou indisponível" }, 404);
      c.header(
        "content-type",
        row.mime_type ??
          stored.httpMetadata?.contentType ??
          "application/octet-stream",
      );
      c.header("cache-control", "private, no-store");
      c.header("x-content-type-options", "nosniff");
      c.header("content-length", String(row.byte_size ?? stored.size));
      return c.body(stored.body);
    }
    let mediaId: string | null = null;
    try {
      const content = JSON.parse(row.content_json) as { mediaId?: unknown };
      mediaId = typeof content.mediaId === "string" ? content.mediaId : null;
    } catch {
      /* conteúdo inválido é mídia indisponível */
    }
    if (!mediaId) return c.json({ error: "mídia indisponível" }, 404);
    const credentials = await getCredentials(c.env);
    if (!credentials)
      return c.json({ error: "WhatsApp não configurado para mídia" }, 503);
    try {
      const media = await whatsappClient(credentials).downloadMedia(mediaId);
      c.header("content-type", media.contentType);
      c.header("cache-control", "private, no-store");
      c.header("x-content-type-options", "nosniff");
      c.header("content-length", String(media.contentLength));
      return c.body(media.bytes);
    } catch (error) {
      if (error instanceof MetaApiRequestError)
        return c.json(
          { error: error.message },
          error.httpStatus >= 400 && error.httpStatus < 600
            ? error.httpStatus as ContentfulStatusCode
            : 502,
        );
      throw error;
    }
  })
  .get("/:id/labels", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    if (!(await conversationsDb(c.env.DB).get(id.data)))
      return c.json({ error: "conversa não encontrada" }, 404);
    return c.json({
      items: await conversationsDb(c.env.DB).listConversationLabels(id.data),
    });
  })
  .get("/:id/notes", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    if (!(await conversationsDb(c.env.DB).get(id.data)))
      return c.json({ error: "conversa não encontrada" }, 404);
    return c.json({
      items: await conversationsDb(c.env.DB).listNotes(id.data),
    });
  })
  .post("/:id/notes", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = NoteSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "nota inválida" }, 400);
    if (!(await conversationsDb(c.env.DB).get(id.data)))
      return c.json({ error: "conversa não encontrada" }, 404);
    return c.json(
      await conversationsDb(c.env.DB).addNote(id.data, body.data.body),
      201,
    );
  })
  .put("/:id/operation", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = OperationSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "operação inválida" }, 400);
    const operation = {
      ...body.data,
      humanModeExpiresAt: undefined as number | null | undefined,
    };
    if (body.data.mode === "human") {
      const hours = Number(
        (await settingsDb(c.env.DB).get("inbox_human_mode_timeout_hours")) ?? 0,
      );
      operation.humanModeExpiresAt =
        Number.isInteger(hours) && hours > 0
          ? Math.floor(Date.now() / 1000) + hours * 3600
          : null;
    } else if (body.data.mode === "bot") operation.humanModeExpiresAt = null;
    const changed = await conversationsDb(c.env.DB).setOperation(
      id.data,
      operation,
    );
    return changed
      ? c.json({ ok: true })
      : c.json({ error: "conversa não encontrada" }, 404);
  })
  .put("/:id/agent", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const raw = await readJsonBody(c, 4096);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = AgentSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "agente inválido" }, 400);
    const changed = await conversationsDb(c.env.DB).setAgent(
      id.data,
      body.data.agentId,
    );
    return changed
      ? c.json({ ok: true })
      : c.json({ error: "agente ativo não encontrado" }, 404);
  })
  .put("/:id/labels", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({ labelIds: z.array(z.string().uuid()).max(100) })
      .strict()
      .safeParse(raw.value);
    if (!body.success) return c.json({ error: "labels inválidas" }, 400);
    if (!(await conversationsDb(c.env.DB).get(id.data)))
      return c.json({ error: "conversa não encontrada" }, 404);
    try {
      await conversationsDb(c.env.DB).setLabels(id.data, body.data.labelIds);
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === "label não encontrada")
        return c.json({ error: error.message }, 400);
      throw error;
    }
  })
  .post("/:id/read", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    if (!(await conversationsDb(c.env.DB).get(id.data)))
      return c.json({ error: "conversa não encontrada" }, 404);
    const changed = await conversationsDb(c.env.DB).markRead(id.data);
    return c.json({ ok: true, changed });
  })
  // Resposta humana reutiliza o mesmo trilho de segurança do rascunho de IA:
  // reserva idempotente, janela de 24h, piloto e callback de status. O modelo
  // "human" apenas identifica a autoria; não chama IA nem consome créditos.
  .post("/:id/manual-drafts", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = ManualDraftSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "mensagem inválida" }, 400);
    const db = conversationsDb(c.env.DB);
    if (!(await db.get(id.data)))
      return c.json({ error: "conversa não encontrada" }, 404);
    const window = await db.serviceWindowState(id.data);
    if (!window.open || !window.latestInboundAt)
      return c.json(
        { error: "janela de atendimento de 24 horas encerrada" },
        409,
      );
    const existing = await db.getAiDraftByRequest(
      id.data,
      body.data.requestKey,
    );
    if (existing) return c.json(existing);
    const context = await db.aiContext(id.data);
    if (!context.sourceMessageId)
      return c.json({ error: "nenhuma mensagem inbound para responder" }, 409);
    const created = await db.beginAiDraft({
      id: crypto.randomUUID(),
      requestKey: body.data.requestKey,
      conversationId: id.data,
      sourceMessageId: context.sourceMessageId,
      model: "human",
      promptVersion: "manual-v1",
    });
    if (!created.created) return c.json(created.draft);
    const result = await c.env.DB.prepare(
      `UPDATE ai_drafts SET status = 'approved', text_body = ?2, reviewed_at = datetime('now'),
         updated_at = datetime('now') WHERE id = ?1 AND status = 'generating'`,
    )
      .bind(created.draft.id, body.data.text)
      .run();
    if (result.meta.changes !== 1)
      return c.json({ error: "não foi possível preparar a resposta" }, 409);
    const draft = await c.env.DB.prepare(
      "SELECT * FROM ai_drafts WHERE id = ?1",
    )
      .bind(created.draft.id)
      .first();
    return c.json(draft, 201);
  })
  .post("/:id/templates/send", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const raw = await readJsonBody(c, 32_768);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = TemplateSendSchema.safeParse(raw.value);
    if (!body.success)
      return c.json({ error: "template ou variáveis inválidos" }, 400);

    const conversation = await c.env.DB.prepare(
      `SELECT v.id, v.contact_id, v.status, v.ai_enabled,
              c.phone, c.user_id, c.parent_user_id
       FROM conversations v JOIN contacts c ON c.id = v.contact_id
       WHERE v.id = ?1`,
    ).bind(id.data).first<{
      id: string;
      contact_id: string;
      status: string;
      ai_enabled: number;
      phone: string;
      user_id: string | null;
      parent_user_id: string | null;
    }>();
    if (!conversation) return c.json({ error: "conversa não encontrada" }, 404);
    if (conversation.status !== "open")
      return c.json({ error: "conversa fechada" }, 409);

    const template = await templatesDb(c.env.DB).get(
      body.data.name,
      body.data.language,
    );
    if (!template || template.status.toUpperCase() !== "APPROVED")
      return c.json({ error: "template aprovado não encontrado" }, 409);
    const contact = await loadTemplateContact(c.env.DB, conversation.contact_id);
    if (!contact) return c.json({ error: "contato não encontrado" }, 404);
    let rendered: ReturnType<typeof renderTemplateParameters>;
    try {
      rendered = renderTemplateParameters(
        template.components,
        body.data.mapping,
        contact,
      );
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "variáveis inválidas" },
        409,
      );
    }

    const credentials = await getCredentials(c.env);
    if (!credentials)
      return c.json({ error: "WhatsApp não configurado para envio" }, 503);
    const latestInbound = await c.env.DB.prepare(
      `SELECT id, phone_number_id FROM conversation_messages
       WHERE conversation_id = ?1 AND direction = 'inbound'
       ORDER BY meta_timestamp DESC, id DESC LIMIT 1`,
    ).bind(id.data).first<{ id: string; phone_number_id: string | null }>();
    if (latestInbound?.phone_number_id && latestInbound.phone_number_id !== credentials.phoneId)
      return c.json(
        { error: "número remetente da conversa não corresponde à configuração" },
        409,
      );
    try {
      assertPilotInboxRecipient(c.env, conversation.phone);
    } catch (error) {
      if (error instanceof PilotSafetyError)
        return c.json({ error: error.message }, error.status);
      throw error;
    }
    const recipient = resolveContactRecipient({
      phone: conversation.phone,
      userId: conversation.user_id,
      parentUserId: conversation.parent_user_id,
    });
    if (!recipient)
      return c.json({ error: "contato sem telefone nem BSUID válido" }, 409);

    const preview = templateMessagePreview(
      body.data.name,
      template.components,
      rendered.resolved,
    );
    const draftText = `[Template ${body.data.name}/${body.data.language}]\n${preview}`.slice(0, 4096);
    const draftId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO ai_drafts
         (id, request_key, conversation_id, source_message_id, status, text_body,
          model, prompt_version, reviewed_at)
       VALUES (?1, ?2, ?3, ?4, 'approved', ?5, 'template', 'template-v1', datetime('now'))`,
    ).bind(
      draftId,
      body.data.requestKey,
      id.data,
      latestInbound?.id ?? null,
      draftText,
    ).run();
    const draft = await conversationsDb(c.env.DB).getAiDraftByRequest(
      id.data,
      body.data.requestKey,
    );
    if (!draft || draft.model !== "template" || draft.text_body !== draftText)
      return c.json({ error: "chave de idempotência já utilizada" }, 409);

    const sends = conversationSendsDb(c.env.DB);
    await sends.expireStaleReservation(draft.id);
    const prior = await sends.findForDraft(draft.id);
    if (prior) {
      if (prior.request_key !== body.data.requestKey)
        return c.json({ error: "chave de idempotência já utilizada" }, 409);
      if (prior.status === "reserved")
        return c.json({ error: "envio já está em processamento" }, 409);
      return c.json(publicConversationSend(prior));
    }

    const sendId = crypto.randomUUID();
    const reservation = await sends.reserve({
      id: sendId,
      requestKey: body.data.requestKey,
      candidate: {
        draft_id: draft.id,
        conversation_id: id.data,
        contact_id: conversation.contact_id,
        draft_status: "approved",
        draft_model: "template",
        text_body: draftText,
        source_message_id: latestInbound?.id ?? null,
        ai_enabled: conversation.ai_enabled,
        phone: conversation.phone,
        user_id: conversation.user_id,
        parent_user_id: conversation.parent_user_id,
        latest_inbound_id: latestInbound?.id ?? null,
        latest_inbound_at: null,
        phone_number_id: credentials.phoneId,
      },
      phoneHash: await sha256(recipientAuditKey(recipient)),
      dailyLimit: pilotLimit(c.env),
    });
    if (!reservation)
      return c.json({ error: "limite diário de envios atingido" }, 429);
    if (!reservation.created)
      return reservation.send.status === "reserved"
        ? c.json({ error: "envio já está em processamento" }, 409)
        : c.json(publicConversationSend(reservation.send));

    const result = await whatsappClient(credentials).sendTemplate(
      recipient,
      {
        name: body.data.name,
        language: body.data.language,
        ...(rendered.components.length ? { components: rendered.components } : {}),
      },
      sendId,
    );
    if (!result.ok) {
      const failed = await sends.failReservation(sendId, {
        status: result.ambiguous ? "ambiguous" : "rejected",
        errorCode: String(result.code),
        errorDetail: result.detail,
      });
      return c.json(
        {
          error: result.ambiguous
            ? "resultado do envio desconhecido; aguarde o callback"
            : "Meta rejeitou o template",
          send: failed ? publicConversationSend(failed) : null,
        },
        result.ambiguous ? 503 : 502,
      );
    }
    const accepted = await sends.accept(sendId, result.messageId, Math.floor(Date.now() / 1000), {
      messageType: "template",
      preview,
      contentJson: JSON.stringify({
        source: "human_template",
        sendId,
        templateName: body.data.name,
        language: body.data.language,
        resolved: rendered.resolved,
      }),
    });
    if (!accepted) throw new Error("aceitação do template não foi persistida");
    return c.json(publicConversationSend(accepted), 201);
  })
  .get("/:id/ai", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const conversation = (await conversationsDb(c.env.DB).get(id.data)) as {
      ai_enabled?: number;
    } | null;
    if (!conversation) return c.json({ error: "conversa não encontrada" }, 404);
    const config = aiConfiguration(c.env);
    const sendWindow = await conversationsDb(c.env.DB).serviceWindowState(
      id.data,
    );
    return c.json({
      enabled: conversation.ai_enabled === 1,
      global: {
        enabled: config.enabled,
        configured: config.configured,
        ready: config.ready,
        model: config.model,
      },
      sending: {
        enabled: c.env.INBOX_SEND_ENABLED === "true",
        serviceWindowOpen: sendWindow.open,
      },
      drafts: await conversationsDb(c.env.DB).listAiDrafts(id.data),
    });
  })
  .put("/:id/ai", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = AiToggleSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "payload inválido" }, 400);
    if (!(await conversationsDb(c.env.DB).get(id.data)))
      return c.json({ error: "conversa não encontrada" }, 404);
    if (body.data.enabled && !aiConfiguration(c.env).ready)
      return c.json(
        {
          error:
            "IA indisponível; o kill switch ou a configuração está pendente",
        },
        503,
      );
    await conversationsDb(c.env.DB).setAiEnabled(id.data, body.data.enabled);
    return c.json({ ok: true, enabled: body.data.enabled });
  })
  .post("/:id/ai/drafts", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = AiGenerateSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "payload inválido" }, 400);
    const db = conversationsDb(c.env.DB);
    const conversation = (await db.get(id.data)) as {
      ai_enabled?: number;
      contact_id?: string;
      ai_agent_id?: string | null;
      ai_agent_instructions?: string | null;
      ai_agent_name?: string | null;
      ai_agent_rag_similarity_threshold?: number | null;
      ai_agent_rag_max_results?: number | null;
      ai_agent_handoff_enabled?: number | null;
      ai_agent_handoff_instructions?: string | null;
    } | null;
    if (!conversation) return c.json({ error: "conversa não encontrada" }, 404);
    const config = aiConfiguration(c.env);
    if (!config.ready) return c.json({ error: "IA indisponível" }, 503);
    if (conversation.ai_enabled !== 1)
      return c.json({ error: "IA não ativada para esta conversa" }, 409);

    // Uma interrupção do Worker entre a reserva e a persistência da resposta não
    // pode deixar a conversa bloqueada para sempre. Não repetimos a mesma chamada
    // paga: a reserva antiga vira falha e o operador pode criar uma nova tentativa.
    await db.expireStaleGeneratingAiDrafts(id.data);
    const existing = await db.getAiDraftByRequest(
      id.data,
      body.data.requestKey,
    );
    if (existing) {
      if (existing.status === "generating")
        return c.json({ error: "rascunho já está sendo gerado" }, 409);
      if (existing.status === "failed")
        return c.json({ error: "esta tentativa de geração falhou" }, 409);
      return c.json(existing);
    }

    const context = await db.aiContext(id.data);
    if (!context.sourceMessageId || context.messages.length === 0)
      return c.json(
        { error: "nenhuma mensagem inbound de texto para responder" },
        409,
      );
    const pending = await db.beginAiDraft({
      id: crypto.randomUUID(),
      requestKey: body.data.requestKey,
      conversationId: id.data,
      sourceMessageId: context.sourceMessageId,
      model: config.model,
      promptVersion: AI_PROMPT_VERSION,
    });
    if (pending.draft.conversation_id !== id.data)
      return c.json({ error: "chave de idempotência já utilizada" }, 409);
    if (!pending.created) {
      if (pending.draft.status === "generating")
        return c.json({ error: "rascunho já está sendo gerado" }, 409);
      if (pending.draft.status === "failed")
        return c.json({ error: "esta tentativa de geração falhou" }, 409);
      return c.json(pending.draft);
    }

    // A reserva é persistida antes da contagem. Assim, requisições concorrentes
    // entram na cota antes de qualquer chamada paga e uma rajada não atravessa o
    // limite por ter lido o mesmo contador antigo.
    const limits = aiUsageLimits(c.env);
    const usage = await db.aiUsageCounts(id.data);
    if (usage.hourly > limits.hourly || usage.daily > limits.daily) {
      await db.failAiDraft(pending.draft.id, "rate_limited");
      return c.json({ error: "limite de rascunhos de IA atingido" }, 429);
    }

    try {
      const memory = conversation.contact_id
        ? await c.env.DB.prepare(
            "SELECT summary FROM contact_memories WHERE contact_id=?1",
          )
            .bind(conversation.contact_id)
            .first<{ summary: string }>()
        : null;
      const trustedInstructions = [
        conversation.ai_agent_instructions
          ? `${conversation.ai_agent_name || "Agente"}: ${conversation.ai_agent_instructions}`
          : "",
        conversation.ai_agent_handoff_enabled !== 0 &&
        conversation.ai_agent_handoff_instructions
          ? `Transferência: ${conversation.ai_agent_handoff_instructions}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      const enriched = memory?.summary
        ? [
            {
              id: "contact-memory",
              direction: "inbound" as const,
              text: `MEMÓRIA REVISADA DO CONTATO: ${memory.summary}`,
            },
            ...context.messages,
          ]
        : context.messages;
      const latestText =
        context.messages
          .filter((message) => message.direction === "inbound")
          .at(-1)?.text ?? "";
      const documentIds = conversation.ai_agent_id
        ? await agentKnowledgeDocumentIds(c.env.DB, conversation.ai_agent_id)
        : [];
      const sources = documentIds.length
        ? extractKnowledgeSources(
            await searchKnowledge(c.env.AI_SEARCH, latestText, {
              documentIds,
              maxResults: conversation.ai_agent_rag_max_results ?? 5,
              scoreThreshold:
                conversation.ai_agent_rag_similarity_threshold ?? 0.5,
            }).catch(() => null),
          ).slice(0, conversation.ai_agent_rag_max_results ?? 5)
        : [];
      const generated = sources.length
        ? await generateGroundedText(c.env.AI, config, enriched, sources, {
            trustedInstructions,
          })
        : await generateDraftText(c.env.AI, config, enriched, {
            trustedInstructions,
          });
      const draft = await db.completeAiDraft(pending.draft.id, {
        text: generated.text,
        promptTokens: generated.usage.promptTokens,
        outputTokens: generated.usage.outputTokens,
      });
      if (!draft) throw new Error("rascunho gerado não foi persistido");
      return c.json(draft, 201);
    } catch (error) {
      const code =
        error instanceof AiDraftError ? error.code : "provider_error";
      await db.failAiDraft(pending.draft.id, code);
      console.error(
        JSON.stringify({
          level: "error",
          event: "ai_draft_failed",
          code,
          conversationId: id.data,
          draftId: pending.draft.id,
        }),
      );
      return c.json({ error: "não foi possível gerar o rascunho de IA" }, 503);
    }
  })
  .patch("/:id/ai/drafts/:draftId", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    const draftId = IdSchema.safeParse(c.req.param("draftId"));
    if (!id.success || !draftId.success)
      return c.json({ error: "identificador inválido" }, 400);
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = AiReviewSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "payload inválido" }, 400);
    if (!(await conversationsDb(c.env.DB).get(id.data)))
      return c.json({ error: "conversa não encontrada" }, 404);
    const draft = await conversationsDb(c.env.DB).reviewAiDraft(
      id.data,
      draftId.data,
      body.data.status,
    );
    return draft
      ? c.json(draft)
      : c.json({ error: "rascunho não está aguardando revisão" }, 409);
  })
  .post("/:id/media/uploads", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "identificador inválido" }, 400);
    const conversation = await conversationsDb(c.env.DB).get(id.data) as {
      status: string; phone: string;
    } | null;
    if (!conversation) return c.json({ error: "conversa não encontrada" }, 404);
    if (conversation.status !== "open") return c.json({ error: "conversa fechada" }, 409);
    let form: FormData;
    try { form = await c.req.raw.formData(); }
    catch { return c.json({ error: "upload inválido" }, 400); }
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "arquivo obrigatório" }, 400);
    if (file.size < 1 || file.size > MAX_OUTBOUND_MEDIA_BYTES)
      return c.json({ error: "arquivo vazio ou maior que 25 MB" }, 413);
    const mimeType = file.type.trim().toLowerCase();
    const type = outboundMediaType(mimeType);
    if (!type) return c.json({ error: "tipo de arquivo não permitido" }, 415);
    const bytes = await file.arrayBuffer();
    if (!matchesMediaSignature(mimeType, new Uint8Array(bytes)))
      return c.json({ error: "conteúdo do arquivo não corresponde ao tipo declarado" }, 415);
    const credentials = await getCredentials(c.env);
    if (!credentials) return c.json({ error: "WhatsApp não configurado para envio" }, 503);
    const inbound = await c.env.DB.prepare(
      `SELECT phone_number_id, meta_timestamp FROM conversation_messages
       WHERE conversation_id = ?1 AND direction = 'inbound'
       ORDER BY meta_timestamp DESC, id DESC LIMIT 1`,
    ).bind(id.data).first<{ phone_number_id: string | null; meta_timestamp: number }>();
    const now = Math.floor(Date.now() / 1000);
    if (!inbound || inbound.meta_timestamp > now + 300 || inbound.meta_timestamp < now - 24 * 60 * 60)
      return c.json({ error: "janela de atendimento de 24 horas encerrada" }, 409);
    if (!inbound.phone_number_id || inbound.phone_number_id !== credentials.phoneId)
      return c.json({ error: "número remetente da conversa não corresponde à configuração" }, 409);
    try { assertPilotInboxRecipient(c.env, conversation.phone); }
    catch (error) {
      if (error instanceof PilotSafetyError) return c.json({ error: error.message }, error.status);
      throw error;
    }
    try {
      const uploaded = await whatsappClient(credentials).uploadMedia({
        bytes, contentType: mimeType, filename: file.name,
      });
      return c.json({
        id: uploaded.id, type, filename: file.name.slice(0, 240), mimeType, size: file.size,
      }, 201);
    } catch (error) {
      if (error instanceof MetaApiRequestError)
        return c.json(
          { error: error.message },
          error.httpStatus >= 400 && error.httpStatus < 600
            ? error.httpStatus as ContentfulStatusCode
            : 502,
        );
      throw error;
    }
  })
  .post("/:id/ai/drafts/:draftId/send", async (c) => {
    const id = IdSchema.safeParse(c.req.param("id"));
    const draftId = IdSchema.safeParse(c.req.param("draftId"));
    if (!id.success || !draftId.success)
      return c.json({ error: "identificador inválido" }, 400);
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = AiSendSchema.safeParse(raw.value);
    if (!body.success)
      return c.json({ error: "confirmação de envio inválida" }, 400);

    const sends = conversationSendsDb(c.env.DB);
    await sends.expireStaleReservation(draftId.data);
    const prior = await sends.findForDraft(draftId.data);
    if (prior) {
      if (
        prior.conversation_id !== id.data ||
        prior.request_key !== body.data.requestKey
      )
        return c.json(
          { error: "rascunho ou chave de idempotência já utilizados" },
          409,
        );
      if (prior.status === "reserved")
        return c.json({ error: "envio já está em processamento" }, 409);
      return c.json(publicConversationSend(prior));
    }

    const candidate = await sends.candidate(id.data, draftId.data);
    if (!candidate) return c.json({ error: "rascunho não encontrado" }, 404);
    // Rascunhos humanos usam o mesmo trilho seguro de idempotência e status,
    // mas não dependem de a IA estar ativa na conversa. Exigir IA aqui bloqueia
    // anexos e respostas manuais depois de o operador desativá-la.
    if (candidate.draft_model !== "human" && candidate.ai_enabled !== 1)
      return c.json({ error: "IA não ativada para esta conversa" }, 409);
    if (candidate.draft_status !== "approved" || !candidate.text_body?.trim())
      return c.json({ error: "rascunho precisa estar aprovado" }, 409);
    if (
      !candidate.latest_inbound_id ||
      candidate.source_message_id !== candidate.latest_inbound_id
    )
      return c.json(
        {
          error:
            "rascunho desatualizado; gere outro para a mensagem mais recente",
        },
        409,
      );
    const now = Math.floor(Date.now() / 1000);
    if (
      candidate.latest_inbound_at === null ||
      candidate.latest_inbound_at > now + 300 ||
      candidate.latest_inbound_at < now - 24 * 60 * 60
    )
      return c.json(
        { error: "janela de atendimento de 24 horas encerrada" },
        409,
      );

    const credentials = await getCredentials(c.env);
    if (!credentials)
      return c.json({ error: "WhatsApp não configurado para envio" }, 503);
    if (
      !candidate.phone_number_id ||
      candidate.phone_number_id !== credentials.phoneId
    )
      return c.json(
        {
          error: "número remetente da conversa não corresponde à configuração",
        },
        409,
      );
    try {
      assertPilotInboxRecipient(c.env, candidate.phone);
    } catch (error) {
      if (error instanceof PilotSafetyError)
        return c.json({ error: error.message }, error.status);
      throw error;
    }
    const recipient = resolveContactRecipient({
      phone: candidate.phone,
      userId: candidate.user_id,
      parentUserId: candidate.parent_user_id,
    });
    if (!recipient)
      return c.json({ error: "contato sem telefone nem BSUID válido" }, 409);

    const sendId = crypto.randomUUID();
    const reservation = await sends.reserve({
      id: sendId,
      requestKey: body.data.requestKey,
      candidate,
      phoneHash: await sha256(recipientAuditKey(recipient)),
      dailyLimit: pilotLimit(c.env),
    });
    if (!reservation)
      return c.json({ error: "limite diário de envios atingido" }, 429);
    if (!reservation.created) {
      if (
        reservation.send.conversation_id !== id.data ||
        reservation.send.draft_id !== draftId.data ||
        reservation.send.request_key !== body.data.requestKey
      )
        return c.json(
          { error: "rascunho ou chave de idempotência já utilizados" },
          409,
        );
      return reservation.send.status === "reserved"
        ? c.json({ error: "envio já está em processamento" }, 409)
        : c.json(publicConversationSend(reservation.send));
    }

    const result = body.data.media
      ? await whatsappClient(credentials).sendMedia(recipient, {
          type: body.data.media.type,
          id: body.data.media.id,
          caption: body.data.media.caption,
          filename: body.data.media.filename,
        }, sendId)
      : await whatsappClient(credentials).sendText(recipient, candidate.text_body, sendId);
    if (!result.ok) {
      const failed = await sends.failReservation(sendId, {
        status: result.ambiguous ? "ambiguous" : "rejected",
        errorCode: String(result.code),
        errorDetail: result.detail,
      });
      console.error(
        JSON.stringify({
          level: "error",
          event: "conversation_send_failed",
          sendId,
          conversationId: id.data,
          draftId: draftId.data,
          outcome: result.ambiguous ? "ambiguous" : "rejected",
          code: result.code,
        }),
      );
      return c.json(
        {
          error: result.ambiguous
            ? "resultado do envio desconhecido; aguarde o callback antes de qualquer nova ação"
            : "Meta rejeitou o envio",
          send: failed ? publicConversationSend(failed) : null,
        },
        result.ambiguous ? 503 : 502,
      );
    }

    const media = body.data.media;
    const accepted = await sends.accept(sendId, result.messageId, now, media ? {
      messageType: media.type,
      preview: media.caption || `[${media.type === "image" ? "Imagem" : media.type === "video" ? "Vídeo" : media.type === "audio" ? "Áudio" : "Documento"}]`,
      contentJson: JSON.stringify({
        source: "human_media_upload", sendId, mediaId: media.id,
        filename: media.filename, mimeType: media.mimeType, size: media.size,
      }),
    } : {});
    if (!accepted) throw new Error("aceitação do envio não foi persistida");
    return c.json(publicConversationSend(accepted), 201);
  });
