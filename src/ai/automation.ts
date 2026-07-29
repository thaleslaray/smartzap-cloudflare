import {
  aiConfiguration,
  AI_PROMPT_VERSION,
  generateGroundedText,
} from "./drafts";
import { aiUsageLimits } from "./limits";
import { conversationsDb } from "../db/conversations";
import { settingsDb } from "../db/settings";
import { conversationSendsDb } from "../db/conversation-sends";
import { getCredentials } from "../whatsapp/credentials";
import { whatsappClient } from "../whatsapp/client";
import { recipientAuditKey, resolveContactRecipient } from "../domain/meta-recipient";
import {
  assertPilotInboxRecipient,
  pilotLimit,
  PilotSafetyError,
} from "../domain/pilot";
import {
  agentKnowledgeDocumentIds,
  extractKnowledgeSources,
  searchKnowledge,
} from "../knowledge/service";
import {
  processKnowledgeIndexEvent,
  type KnowledgeIndexEvent,
} from "../knowledge/indexing";

export type AutomationEvent = {
  kind: "inbound_automation";
  conversationId: string;
  sourceMessageId: string;
};
export type AutomationQueueEvent =
  | AutomationEvent
  | KnowledgeIndexEvent;

export async function automationDebounceSeconds(
  db: D1Database,
  conversationId: string,
): Promise<number> {
  const row = await db.prepare(
    `SELECT COALESCE(a.debounce_ms, 5000) AS debounce_ms
     FROM conversations c LEFT JOIN ai_agents a ON a.id=c.ai_agent_id
     WHERE c.id=?1`,
  ).bind(conversationId).first<{ debounce_ms: number }>();
  const milliseconds = Number(row?.debounce_ms ?? 5000);
  return Math.max(0, Math.min(30, Math.ceil(milliseconds / 1000)));
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

export async function processAutomationEvent(
  env: Env,
  event: AutomationEvent,
): Promise<"sent" | "skipped" | "failed"> {
  if (env.INBOX_AUTOMATION_ENABLED !== "true") return "skipped";
  if ((await settingsDb(env.DB).get("ai_global_enabled")) !== "true")
    return "skipped";
  const db = conversationsDb(env.DB);
  let conversation = (await db.get(event.conversationId)) as {
    id: string;
    mode?: string;
    status?: string;
    ai_enabled?: number;
    automation_paused_until?: number | null;
    human_mode_expires_at?: number | null;
    contact_id?: string;
    ai_agent_id?: string | null;
    ai_agent_active?: number | null;
    ai_agent_instructions?: string | null;
    ai_agent_name?: string | null;
    ai_agent_temperature?: number | null;
    ai_agent_max_tokens?: number | null;
    ai_agent_rag_similarity_threshold?: number | null;
    ai_agent_rag_max_results?: number | null;
    ai_agent_handoff_enabled?: number | null;
    ai_agent_handoff_instructions?: string | null;
  } | null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    conversation?.mode === "human" &&
    conversation.human_mode_expires_at &&
    conversation.human_mode_expires_at <= nowSeconds
  ) {
    await db.setOperation(event.conversationId, {
      mode: "bot",
      humanModeExpiresAt: null,
    });
    conversation = {
      ...conversation,
      mode: "bot",
      human_mode_expires_at: null,
    };
  }
  if (
    !conversation ||
    conversation.mode !== "bot" ||
    conversation.status !== "open" ||
    conversation.ai_enabled !== 1 ||
    (conversation.ai_agent_id && conversation.ai_agent_active !== 1)
  )
    return "skipped";
  if (
    conversation.automation_paused_until &&
    conversation.automation_paused_until > nowSeconds
  )
    return "skipped";
  const config = aiConfiguration(env);
  if (!config.ready) return "skipped";
  const context = await db.aiContext(event.conversationId);
  // Mensagem mais nova sempre vence: debounce/reentrega não pode gerar resposta velha.
  if (
    !context.sourceMessageId ||
    context.sourceMessageId !== event.sourceMessageId
  )
    return "skipped";
  const requestKey = `auto:${event.sourceMessageId}`;
  const pending = await db.beginAiDraft({
    id: crypto.randomUUID(),
    requestKey,
    conversationId: event.conversationId,
    sourceMessageId: event.sourceMessageId,
    model: config.model,
    promptVersion: AI_PROMPT_VERSION,
  });
  if (!pending.created)
    return pending.draft.status === "approved" ? "skipped" : "skipped";
  // A reserva entra na contagem antes da chamada paga. Assim, automação e
  // rascunhos humanos compartilham a mesma cota e rajadas concorrentes não
  // atravessam o limite lendo um contador antigo.
  const limits = aiUsageLimits(env);
  const usage = await db.aiUsageCounts(event.conversationId);
  if (usage.hourly > limits.hourly || usage.daily > limits.daily) {
    await db.failAiDraft(pending.draft.id, "rate_limited");
    return "skipped";
  }
  const started = Date.now();
  try {
    const latestText =
      context.messages
        .filter((message) => message.direction === "inbound")
        .at(-1)?.text ?? "";
    const documentIds = conversation.ai_agent_id
      ? await agentKnowledgeDocumentIds(env.DB, conversation.ai_agent_id)
      : [];
    if (!documentIds.length) {
      await db.failAiDraft(pending.draft.id, "no_agent_knowledge");
      if (conversation.ai_agent_handoff_enabled !== 0)
        await db.setOperation(event.conversationId, {
          mode: "human",
          handoffReason: "Agente sem documentos vinculados na base",
        });
      return "skipped";
    }
    const retrieval = await searchKnowledge(env.AI_SEARCH, latestText, {
      maxResults: conversation.ai_agent_rag_max_results ?? 5,
      scoreThreshold:
        conversation.ai_agent_rag_similarity_threshold ?? 0.5,
      documentIds,
    });
    const sources = extractKnowledgeSources(retrieval).slice(
      0,
      conversation.ai_agent_rag_max_results ?? 5,
    );
    if (!sources.length) {
      await db.failAiDraft(pending.draft.id, "no_relevant_knowledge");
      if (conversation.ai_agent_handoff_enabled !== 0)
        await db.setOperation(event.conversationId, {
          mode: "human",
          handoffReason: "Base de conhecimento sem resposta relevante",
        });
      return "skipped";
    }
    const memory = conversation.contact_id
      ? await env.DB.prepare(
          "SELECT summary FROM contact_memories WHERE contact_id=?1",
        )
          .bind(conversation.contact_id)
          .first<{ summary: string }>()
      : null;
    const instructions = [
      conversation.ai_agent_instructions
        ? `REGRAS DO AGENTE ${conversation.ai_agent_name || ""}: ${conversation.ai_agent_instructions}`
        : "",
      conversation.ai_agent_handoff_enabled !== 0 &&
      conversation.ai_agent_handoff_instructions
        ? `REGRAS DE TRANSFERÊNCIA: ${conversation.ai_agent_handoff_instructions}`
        : "",
      memory?.summary ? `MEMÓRIA REVISADA DO CONTATO: ${memory.summary}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const enriched = instructions
      ? [
          {
            id: "agent-context",
            direction: "inbound" as const,
            text: instructions,
          },
          ...context.messages,
        ]
      : context.messages;
    const generated = await generateGroundedText(
      env.AI,
      config,
      enriched,
      sources,
      {
        temperature: conversation.ai_agent_temperature ?? 0.7,
        maxTokens: conversation.ai_agent_max_tokens ?? 1024,
      },
    );
    const draft = await db.completeAiDraft(pending.draft.id, {
      text: generated.text,
      promptTokens: generated.usage.promptTokens,
      outputTokens: generated.usage.outputTokens,
    });
    if (!draft) return "failed";
    // A aprovação automática é deliberadamente depois da geração e antes da
    // reserva. A revalidação abaixo torna handoff/pausa concorrentes terminais.
    const approved = await db.reviewAiDraft(
      event.conversationId,
      draft.id,
      "approved",
    );
    if (!approved) return "skipped";
    const after = (await db.get(event.conversationId)) as {
      mode?: string;
      status?: string;
      ai_enabled?: number;
      ai_agent_id?: string | null;
      ai_agent_active?: number | null;
      automation_paused_until?: number | null;
    } | null;
    if (
      !after ||
      after.mode !== "bot" ||
      after.status !== "open" ||
      after.ai_enabled !== 1 ||
      (after.ai_agent_id && after.ai_agent_active !== 1) ||
      (after.automation_paused_until &&
        after.automation_paused_until > Math.floor(Date.now() / 1000))
    )
      return "skipped";
    const sends = conversationSendsDb(env.DB);
    const candidate = await sends.candidate(event.conversationId, draft.id);
    if (
      !candidate ||
      candidate.source_message_id !== candidate.latest_inbound_id ||
      !candidate.text_body
    )
      return "skipped";
    const now = Math.floor(Date.now() / 1000);
    if (
      !candidate.latest_inbound_at ||
      candidate.latest_inbound_at < now - 24 * 60 * 60
    )
      return "skipped";
    const creds = await getCredentials(env);
    if (!creds || candidate.phone_number_id !== creds.phoneId) return "failed";
    try {
      assertPilotInboxRecipient(env, candidate.phone);
    } catch (error) {
      if (error instanceof PilotSafetyError) return "skipped";
      throw error;
    }
    const recipient = resolveContactRecipient({
      phone: candidate.phone,
      userId: candidate.user_id,
      parentUserId: candidate.parent_user_id,
    });
    if (!recipient) return "failed";
    const sendId = crypto.randomUUID();
    const reservation = await sends.reserve({
      id: sendId,
      requestKey: `auto-send:${event.sourceMessageId}`,
      candidate,
      phoneHash: await sha256(recipientAuditKey(recipient)),
      dailyLimit: pilotLimit(env),
    });
    if (!reservation || !reservation.created) return "skipped";
    // Última trava imediatamente antes do POST remoto.
    const finalState = (await db.get(event.conversationId)) as {
      mode?: string;
      status?: string;
      ai_enabled?: number;
      ai_agent_id?: string | null;
      ai_agent_active?: number | null;
    } | null;
    const globalEnabledBeforeSend =
      (await settingsDb(env.DB).get("ai_global_enabled")) === "true";
    if (
      !globalEnabledBeforeSend ||
      !finalState ||
      finalState.mode !== "bot" ||
      finalState.status !== "open" ||
      finalState.ai_enabled !== 1 ||
      (finalState.ai_agent_id && finalState.ai_agent_active !== 1)
    ) {
      await sends.failReservation(sendId, {
        status: "rejected",
        errorCode: "handoff_before_send",
        errorDetail: "Handoff ocorreu antes do envio automático.",
      });
      return "skipped";
    }
    const sent = await whatsappClient(creds).sendText(
      recipient,
      candidate.text_body,
      sendId,
    );
    if (!sent.ok) {
      await sends.failReservation(sendId, {
        status: sent.ambiguous ? "ambiguous" : "rejected",
        errorCode: String(sent.code),
        errorDetail: sent.detail,
      });
      return "failed";
    }
    await sends.accept(sendId, sent.messageId, now);
    await env.DB.prepare(
      `INSERT INTO ai_runs (id, conversation_id, contact_id, kind, model, decision, prompt_tokens, output_tokens, latency_ms)
       VALUES (?1, ?2, ?3, 'automation', ?4, 'sent', ?5, ?6, ?7)`,
    )
      .bind(
        crypto.randomUUID(),
        event.conversationId,
        candidate.contact_id,
        config.model,
        generated.usage.promptTokens,
        generated.usage.outputTokens,
        Date.now() - started,
      )
      .run();
    return "sent";
  } catch {
    await db.failAiDraft(pending.draft.id, "automation_failed");
    return "failed";
  }
}

export async function handleAutomationBatch(
  events: AutomationQueueEvent[],
  env: Env,
): Promise<void> {
  for (const event of events) {
    if (event.kind === "knowledge_index")
      await processKnowledgeIndexEvent(env, event);
    else await processAutomationEvent(env, event);
  }
}
