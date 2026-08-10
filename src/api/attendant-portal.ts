import { Hono } from "hono";
import { z } from "zod";
import { conversationsDb } from "../db/conversations";
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
import { whatsappClient } from "../whatsapp/client";
import { readJsonBody } from "./body";
import { recipientAuditKey, resolveContactRecipient } from "../domain/meta-recipient";

type Permissions = { canView: boolean; canReply: boolean; canHandoff: boolean };
type Attendant = { id: string; name: string; permissions: Permissions };

function permissions(raw: string): Permissions {
  try {
    const value = JSON.parse(raw) as Partial<Permissions>;
    return {
      canView: value.canView === true,
      canReply: value.canReply === true,
      canHandoff: value.canHandoff === true,
    };
  } catch {
    return { canView: false, canReply: false, canHandoff: false };
  }
}
async function authenticate(c: {
  req: { header(name: string): string | undefined };
  env: Env;
}): Promise<Attendant | null> {
  const token = c.req.header("x-attendant-token");
  if (!token || token.length < 16 || token.length > 256) return null;
  const row = await c.env.DB.prepare(
    "SELECT id,name,permissions_json FROM attendant_tokens WHERE token=?1 AND is_active=1 AND (expires_at IS NULL OR expires_at>datetime('now'))",
  )
    .bind(token)
    .first<{ id: string; name: string; permissions_json: string }>();
  return row
    ? {
        id: row.id,
        name: row.name,
        permissions: permissions(row.permissions_json),
      }
    : null;
}
const status = (row: Record<string, unknown>) =>
  row.status === "closed"
    ? "resolved"
    : row.priority === "urgent" || row.handoff_reason
      ? "handoff_requested"
      : row.mode === "human"
        ? "human_active"
        : "ai_active";
async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const attendantPortalRoutes = new Hono<{ Bindings: Env }>()
  .post("/validate", async (c) => {
    const raw = await readJsonBody(c, 4096);
    if (!raw.ok) return c.json({ valid: false, error: raw.error }, raw.status);
    const body = z
      .object({ token: z.string().min(16).max(256) })
      .strict()
      .safeParse(raw.value);
    if (!body.success)
      return c.json({ valid: false, error: "Token não informado" }, 400);
    const row = await c.env.DB.prepare(
      "SELECT id,name,permissions_json FROM attendant_tokens WHERE token=?1 AND is_active=1 AND (expires_at IS NULL OR expires_at>datetime('now'))",
    )
      .bind(body.data.token)
      .first<{ id: string; name: string; permissions_json: string }>();
    if (!row)
      return c.json(
        { valid: false, error: "Token inválido, desativado ou expirado" },
        401,
      );
    await c.env.DB.prepare(
      "UPDATE attendant_tokens SET last_used_at=datetime('now'),access_count=access_count+1,updated_at=datetime('now') WHERE id=?1",
    )
      .bind(row.id)
      .run();
    return c.json({
      valid: true,
      attendant: {
        id: row.id,
        name: row.name,
        permissions: permissions(row.permissions_json),
      },
    });
  })
  .get("/conversations", async (c) => {
    const attendant = await authenticate(c);
    if (!attendant) return c.json({ error: "acesso inválido" }, 401);
    if (!attendant.permissions.canView)
      return c.json({ error: "sem permissão para visualizar" }, 403);
    const q = (c.req.query("search") || "").slice(0, 200);
    const result = await conversationsDb(c.env.DB).list({
      q: q || undefined,
      limit: 100,
      offset: 0,
    });
    const conversations = (result.items as Record<string, unknown>[]).map(
      (row) => ({
        id: row.id,
        contactName: row.name || row.phone,
        contactPhone: row.phone,
        status: status(row),
        lastMessage: row.last_message_preview || "Sem mensagens",
        lastMessageAt: row.last_message_at
          ? new Date(Number(row.last_message_at) * 1000).toISOString()
          : row.created_at,
        unreadCount: Number(row.unread_count || 0),
      }),
    );
    return c.json({
      conversations,
      counts: {
        total: conversations.length,
        urgent: conversations.filter((x) => x.status === "handoff_requested")
          .length,
        ai: conversations.filter((x) => x.status === "ai_active").length,
        human: conversations.filter((x) => x.status === "human_active").length,
        resolved: conversations.filter((x) => x.status === "resolved").length,
      },
    });
  })
  .get("/conversations/:id", async (c) => {
    const attendant = await authenticate(c);
    if (!attendant) return c.json({ error: "acesso inválido" }, 401);
    if (!attendant.permissions.canView)
      return c.json({ error: "sem permissão para visualizar" }, 403);
    const id = z.string().uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const db = conversationsDb(c.env.DB);
    const conversation = await db.get(id.data);
    if (!conversation) return c.json({ error: "conversa não encontrada" }, 404);
    const messages = await db.listMessages(id.data, { limit: 100, offset: 0 });
    return c.json({
      conversation,
      messages: messages.items.reverse(),
      permissions: attendant.permissions,
    });
  })
  .post("/conversations/:id/reply", async (c) => {
    const attendant = await authenticate(c);
    if (!attendant) return c.json({ error: "acesso inválido" }, 401);
    if (!attendant.permissions.canReply)
      return c.json({ error: "sem permissão para responder" }, 403);
    const id = z.string().uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({
        text: z.string().trim().min(1).max(4096),
        requestKey: z.string().uuid(),
      })
      .strict()
      .safeParse(raw.value);
    if (!body.success) return c.json({ error: "mensagem inválida" }, 400);
    const db = conversationsDb(c.env.DB);
    if (!(await db.get(id.data)))
      return c.json({ error: "conversa não encontrada" }, 404);
    const serviceWindow = await db.serviceWindowState(id.data);
    if (!serviceWindow.open || !serviceWindow.latestInboundAt)
      return c.json(
        { error: "janela de atendimento de 24 horas encerrada" },
        409,
      );
    const context = await db.aiContext(id.data);
    if (!context.sourceMessageId)
      return c.json({ error: "nenhuma mensagem inbound para responder" }, 409);
    const created = await db.beginAiDraft({
      id: crypto.randomUUID(),
      requestKey: body.data.requestKey,
      conversationId: id.data,
      sourceMessageId: context.sourceMessageId,
      model: "human",
      promptVersion: "attendant-v1",
    });
    if (!created.created)
      return c.json({ error: "chave de envio já utilizada" }, 409);
    await c.env.DB.prepare(
      "UPDATE ai_drafts SET status='approved',text_body=?2,reviewed_at=datetime('now'),updated_at=datetime('now') WHERE id=?1",
    )
      .bind(created.draft.id, body.data.text)
      .run();
    const sends = conversationSendsDb(c.env.DB);
    const candidate = await sends.candidate(id.data, created.draft.id);
    if (!candidate?.phone_number_id)
      return c.json({ error: "não foi possível preparar a resposta" }, 409);
    const credentials = await getCredentials(c.env);
    if (!credentials)
      return c.json({ error: "WhatsApp não configurado para envio" }, 503);
    if (candidate.phone_number_id !== credentials.phoneId)
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
    if (!reservation?.created)
      return c.json(
        { error: "envio duplicado ou limite diário atingido" },
        429,
      );
    const result = await whatsappClient(credentials).sendText(
      recipient,
      body.data.text,
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
            : "Meta rejeitou o envio",
          send: failed ? publicConversationSend(failed) : null,
        },
        result.ambiguous ? 503 : 502,
      );
    }
    const accepted = await sends.accept(
      sendId,
      result.messageId,
      Math.floor(Date.now() / 1000),
    );
    if (!accepted) throw new Error("aceitação do envio não foi persistida");
    return c.json(publicConversationSend(accepted), 201);
  })
  .post("/conversations/:id/handoff", async (c) => {
    const attendant = await authenticate(c);
    if (!attendant) return c.json({ error: "acesso inválido" }, 401);
    if (!attendant.permissions.canHandoff)
      return c.json({ error: "sem permissão para transferir" }, 403);
    const id = z.string().uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const changed = await conversationsDb(c.env.DB).setOperation(id.data, {
      mode: "human",
      priority: "high",
      handoffReason: `Assumido por ${attendant.name}`,
    });
    return changed
      ? c.json({ ok: true })
      : c.json({ error: "conversa não encontrada" }, 404);
  })
  .post("/conversations/:id/resolve", async (c) => {
    const attendant = await authenticate(c);
    if (!attendant) return c.json({ error: "acesso inválido" }, 401);
    if (!attendant.permissions.canHandoff)
      return c.json({ error: "sem permissão para concluir" }, 403);
    const id = z.string().uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "conversa inválida" }, 400);
    const changed = await conversationsDb(c.env.DB).setOperation(id.data, {
      status: "closed",
      mode: "bot",
      handoffReason: null,
    });
    return changed
      ? c.json({ ok: true })
      : c.json({ error: "conversa não encontrada" }, 404);
  });
