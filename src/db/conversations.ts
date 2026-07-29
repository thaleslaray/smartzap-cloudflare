import type { Contact } from "./contacts";
import type { AiHistoryMessage } from "../ai/drafts";

export type InboundMessageInput = {
  id: string;
  phoneNumberId: string;
  messageType: string;
  textBody?: string;
  content?: Record<string, unknown>;
  timestamp: number;
};

export type AiDraftStatus =
  "generating" | "pending_review" | "approved" | "discarded" | "failed";

export type AiDraft = {
  id: string;
  request_key: string;
  conversation_id: string;
  source_message_id: string | null;
  status: AiDraftStatus;
  text_body: string | null;
  model: string;
  prompt_version: string;
  prompt_tokens: number | null;
  output_tokens: number | null;
  error_code: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  send_id?: string | null;
  send_status?: string | null;
  send_message_id?: string | null;
  send_error_code?: string | null;
  send_accepted_at?: string | null;
  send_sent_at?: string | null;
  send_delivered_at?: string | null;
  send_read_at?: string | null;
  send_failed_at?: string | null;
};

export function conversationsDb(db: D1Database) {
  return {
    async ingestInbound(
      contact: Contact,
      input: InboundMessageInput,
    ): Promise<{
      conversationId: string;
      inserted: boolean;
    }> {
      if (!contact.wa_id) throw new Error("contato inbound sem wa_id");
      let conversation = await db
        .prepare(
          "SELECT id FROM conversations WHERE contact_id = ?1 OR wa_id = ?2 LIMIT 1",
        )
        .bind(contact.id, contact.wa_id)
        .first<{ id: string }>();
      if (!conversation) {
        const id = crypto.randomUUID();
        await db
          .prepare(
            `INSERT OR IGNORE INTO conversations (id, contact_id, wa_id, ai_agent_id)
           VALUES (?1, ?2, ?3, (SELECT id FROM ai_agents WHERE is_default=1 LIMIT 1))`,
          )
          .bind(id, contact.id, contact.wa_id)
          .run();
        conversation = await db
          .prepare(
            "SELECT id FROM conversations WHERE contact_id = ?1 OR wa_id = ?2 LIMIT 1",
          )
          .bind(contact.id, contact.wa_id)
          .first<{ id: string }>();
      }
      if (!conversation)
        throw new Error("não foi possível materializar a conversa inbound");

      const serialized =
        input.content && Object.keys(input.content).length
          ? JSON.stringify(input.content)
          : null;
      const contentJson =
        serialized && serialized.length <= 8192
          ? serialized
          : serialized
            ? JSON.stringify({ truncated: true })
            : null;
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO conversation_messages
           (id, conversation_id, contact_id, direction, message_type, text_body,
            content_json, phone_number_id, meta_timestamp)
         VALUES (?1, ?2, ?3, 'inbound', ?4, ?5, ?6, ?7, ?8)`,
        )
        .bind(
          input.id,
          conversation.id,
          contact.id,
          input.messageType,
          input.textBody?.slice(0, 4096) ?? null,
          contentJson,
          input.phoneNumberId,
          input.timestamp,
        )
        .run();
      const inserted = result.meta.changes === 1;
      if (inserted) {
        const preview = (
          input.textBody?.trim() || `[${input.messageType}]`
        ).slice(0, 240);
        await db
          .prepare(
            `UPDATE conversations SET
             last_message_preview = CASE
               WHEN last_message_at IS NULL OR last_message_at <= ?2 THEN ?3
               ELSE last_message_preview END,
             last_message_at = CASE
               WHEN last_message_at IS NULL OR last_message_at <= ?2 THEN ?2
               ELSE last_message_at END,
             unread_count = unread_count + 1, updated_at = datetime('now')
           WHERE id = ?1`,
          )
          .bind(conversation.id, input.timestamp, preview)
          .run();
      }
      return { conversationId: conversation.id, inserted };
    },

    async list(opts: {
      q?: string;
      status?: "open" | "closed";
      mode?: "human" | "bot";
      labelId?: string;
      limit: number;
      offset: number;
    }) {
      const binds: unknown[] = [];
      const clauses: string[] = [];
      if (opts.q) {
        const escaped = opts.q.replace(/[\\%_]/g, "\\$&");
        binds.push(`%${escaped}%`);
        clauses.push(
          `(c.name LIKE ?${binds.length} ESCAPE '\\' OR c.phone LIKE ?${binds.length} ESCAPE '\\')`,
        );
      }
      if (opts.status) {
        binds.push(opts.status);
        clauses.push(`v.status = ?${binds.length}`);
      }
      if (opts.mode) {
        binds.push(opts.mode);
        clauses.push(`v.mode = ?${binds.length}`);
      }
      if (opts.labelId) {
        binds.push(opts.labelId);
        clauses.push(
          `EXISTS (SELECT 1 FROM conversation_labels clf WHERE clf.conversation_id = v.id AND clf.label_id = ?${binds.length})`,
        );
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const items = (
        await db
          .prepare(
            `SELECT v.*, c.name, c.phone, c.user_id, c.parent_user_id, c.username,
                c.status AS contact_status,
                a.name AS ai_agent_name,
                COALESCE((SELECT GROUP_CONCAT(cl.label_id) FROM conversation_labels cl WHERE cl.conversation_id = v.id), '') AS label_ids
         FROM conversations v JOIN contacts c ON c.id = v.contact_id
         LEFT JOIN ai_agents a ON a.id = v.ai_agent_id
         ${where}
         ORDER BY v.last_message_at DESC, v.id DESC
         LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`,
          )
          .bind(...binds, opts.limit, opts.offset)
          .all()
      ).results;
      const total =
        (
          await db
            .prepare(
              `SELECT COUNT(*) AS n FROM conversations v JOIN contacts c ON c.id = v.contact_id ${where}`,
            )
            .bind(...binds)
            .first<{ n: number }>()
        )?.n ?? 0;
      return { items, total };
    },

    async get(id: string) {
      return db
        .prepare(
          `SELECT v.*, c.name, c.phone, c.user_id, c.parent_user_id, c.username,
                c.status AS contact_status,
                a.name AS ai_agent_name,a.active AS ai_agent_active,
                a.instructions AS ai_agent_instructions,
                a.temperature AS ai_agent_temperature,
                a.max_tokens AS ai_agent_max_tokens,
                a.debounce_ms AS ai_agent_debounce_ms,
                a.rag_similarity_threshold AS ai_agent_rag_similarity_threshold,
                a.rag_max_results AS ai_agent_rag_max_results,
                a.handoff_enabled AS ai_agent_handoff_enabled,
                a.handoff_instructions AS ai_agent_handoff_instructions
         FROM conversations v JOIN contacts c ON c.id = v.contact_id
         LEFT JOIN ai_agents a ON a.id = v.ai_agent_id
         WHERE v.id = ?1`,
        )
        .bind(id)
        .first();
    },

    async setOperation(
      id: string,
      input: {
        status?: "open" | "closed";
        mode?: "human" | "bot";
        priority?: "low" | "normal" | "high" | "urgent";
        pausedUntil?: number | null;
        humanModeExpiresAt?: number | null;
        handoffReason?: string | null;
      },
    ): Promise<boolean> {
      const fields: string[] = [];
      const binds: unknown[] = [];
      const add = (column: string, value: unknown) => {
        binds.push(value);
        fields.push(`${column} = ?${binds.length}`);
      };
      if (input.status) add("status", input.status);
      if (input.mode) add("mode", input.mode);
      if (input.priority) add("priority", input.priority);
      if (input.pausedUntil !== undefined)
        add("automation_paused_until", input.pausedUntil);
      if (input.humanModeExpiresAt !== undefined)
        add("human_mode_expires_at", input.humanModeExpiresAt);
      if (input.handoffReason !== undefined) {
        add("handoff_reason", input.handoffReason);
        fields.push(
          `handoff_at = CASE WHEN ?${binds.length} IS NULL THEN NULL ELSE datetime('now') END`,
        );
      }
      if (!fields.length) return false;
      binds.push(id);
      const result = await db
        .prepare(
          `UPDATE conversations SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?${binds.length}`,
        )
        .bind(...binds)
        .run();
      return result.meta.changes === 1;
    },
    async setAgent(id: string, agentId: string | null): Promise<boolean> {
      const result = await db
        .prepare(
          "UPDATE conversations SET ai_agent_id=COALESCE(?2,(SELECT id FROM ai_agents WHERE is_default=1 AND active=1 LIMIT 1)),updated_at=datetime('now') WHERE id=?1 AND (?2 IS NULL OR EXISTS(SELECT 1 FROM ai_agents WHERE id=?2 AND active=1))",
        )
        .bind(id, agentId)
        .run();
      return result.meta.changes === 1;
    },
    async listLabels() {
      return (
        await db
          .prepare(
            "SELECT id, name, color FROM inbox_labels ORDER BY name COLLATE NOCASE, id",
          )
          .all()
      ).results;
    },
    async createLabel(name: string, color?: string) {
      const label = { id: crypto.randomUUID(), name, color: color ?? null };
      await db
        .prepare(
          "INSERT INTO inbox_labels (id, name, color) VALUES (?1, ?2, ?3)",
        )
        .bind(label.id, label.name, label.color)
        .run();
      return label;
    },
    async setLabels(conversationId: string, labelIds: string[]): Promise<void> {
      const unique = [...new Set(labelIds)];
      if (unique.length) {
        const found = (
          await db
            .prepare(
              `SELECT id FROM inbox_labels WHERE id IN (${unique.map((_, i) => `?${i + 1}`).join(",")})`,
            )
            .bind(...unique)
            .all()
        ).results;
        if (found.length !== unique.length)
          throw new Error("label não encontrada");
      }
      await db.batch([
        db
          .prepare("DELETE FROM conversation_labels WHERE conversation_id = ?1")
          .bind(conversationId),
        ...unique.map((labelId) =>
          db
            .prepare(
              "INSERT INTO conversation_labels (conversation_id, label_id) VALUES (?1, ?2)",
            )
            .bind(conversationId, labelId),
        ),
      ]);
    },
    async listConversationLabels(conversationId: string) {
      return (
        await db
          .prepare(
            `SELECT l.id, l.name, l.color FROM inbox_labels l
         JOIN conversation_labels cl ON cl.label_id = l.id
         WHERE cl.conversation_id = ?1 ORDER BY l.name COLLATE NOCASE, l.id`,
          )
          .bind(conversationId)
          .all()
      ).results;
    },
    async listQuickReplies() {
      return (
        await db
          .prepare(
            "SELECT id, title, shortcut, body, created_at, updated_at FROM quick_replies ORDER BY title COLLATE NOCASE, id",
          )
          .all()
      ).results;
    },
    async createQuickReply(input: {
      title: string;
      shortcut: string;
      body: string;
    }) {
      const row = { id: crypto.randomUUID(), ...input };
      await db
        .prepare(
          "INSERT INTO quick_replies (id, title, shortcut, body) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(row.id, row.title, row.shortcut, row.body)
        .run();
      return row;
    },
    async addNote(conversationId: string, body: string) {
      const note = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        body,
      };
      await db
        .prepare(
          "INSERT INTO conversation_notes (id, conversation_id, body) VALUES (?1, ?2, ?3)",
        )
        .bind(note.id, note.conversation_id, note.body)
        .run();
      return note;
    },
    async listNotes(conversationId: string) {
      return (
        await db
          .prepare(
            "SELECT id, body, created_at FROM conversation_notes WHERE conversation_id = ?1 ORDER BY created_at DESC, id DESC",
          )
          .bind(conversationId)
          .all()
      ).results;
    },

    async listMessages(
      conversationId: string,
      opts: { limit: number; offset: number },
    ) {
      const items = (
        await db
          .prepare(
            `SELECT m.id, m.direction, m.message_type, m.text_body, m.content_json,
                m.meta_timestamp, m.read_at, m.received_at,
                s.status AS delivery_status
         FROM conversation_messages m
         LEFT JOIN conversation_draft_sends s ON s.message_id = m.id
         WHERE m.conversation_id = ?1
         ORDER BY m.meta_timestamp DESC, m.id DESC LIMIT ?2 OFFSET ?3`,
          )
          .bind(conversationId, opts.limit, opts.offset)
          .all()
      ).results.map((row) => {
        let content: unknown = null;
        try {
          content = row.content_json
            ? JSON.parse(String(row.content_json))
            : null;
        } catch {
          /* legado corrompido */
        }
        const { content_json: _contentJson, ...rest } = row;
        return { ...rest, content };
      });
      const total =
        (
          await db
            .prepare(
              "SELECT COUNT(*) AS n FROM conversation_messages WHERE conversation_id = ?1",
            )
            .bind(conversationId)
            .first<{ n: number }>()
        )?.n ?? 0;
      return { items, total };
    },

    async markRead(conversationId: string): Promise<number> {
      const result = await db
        .prepare(
          `UPDATE conversation_messages SET read_at = datetime('now')
         WHERE conversation_id = ?1 AND direction = 'inbound' AND read_at IS NULL`,
        )
        .bind(conversationId)
        .run();
      await db
        .prepare(
          `UPDATE conversations SET unread_count = (
           SELECT COUNT(*) FROM conversation_messages
           WHERE conversation_id = ?1 AND direction = 'inbound' AND read_at IS NULL
         ), updated_at = datetime('now') WHERE id = ?1`,
        )
        .bind(conversationId)
        .run();
      return result.meta.changes ?? 0;
    },

    async setAiEnabled(
      conversationId: string,
      enabled: boolean,
    ): Promise<boolean> {
      const result = await db
        .prepare(
          `UPDATE conversations SET ai_enabled = ?2, updated_at = datetime('now') WHERE id = ?1`,
        )
        .bind(conversationId, enabled ? 1 : 0)
        .run();
      return result.meta.changes === 1;
    },

    async serviceWindowState(conversationId: string): Promise<{
      latestInboundAt: number | null;
      open: boolean;
    }> {
      const row = await db
        .prepare(
          `SELECT MAX(meta_timestamp) AS latest_inbound_at
         FROM conversation_messages
         WHERE conversation_id = ?1 AND direction = 'inbound'`,
        )
        .bind(conversationId)
        .first<{ latest_inbound_at: number | null }>();
      const latestInboundAt = row?.latest_inbound_at ?? null;
      const now = Math.floor(Date.now() / 1000);
      return {
        latestInboundAt,
        open:
          latestInboundAt !== null &&
          latestInboundAt <= now + 300 &&
          latestInboundAt >= now - 24 * 60 * 60,
      };
    },

    async aiContext(conversationId: string): Promise<{
      messages: AiHistoryMessage[];
      sourceMessageId: string | null;
    }> {
      const [textRows, latestInbound] = await Promise.all([
        db
          .prepare(
            `SELECT id, direction, text_body FROM conversation_messages
         WHERE conversation_id = ?1 AND text_body IS NOT NULL AND trim(text_body) <> ''
         ORDER BY meta_timestamp DESC, id DESC LIMIT 20`,
          )
          .bind(conversationId)
          .all<{
            id: string;
            direction: "inbound" | "outbound";
            text_body: string;
          }>(),
        db
          .prepare(
            `SELECT id FROM conversation_messages
             WHERE conversation_id = ?1 AND direction = 'inbound'
             ORDER BY meta_timestamp DESC, id DESC LIMIT 1`,
          )
          .bind(conversationId)
          .first<{ id: string }>(),
      ]);
      const rows = textRows.results;
      const chronological = [...rows].reverse().map((row) => ({
        id: row.id,
        direction: row.direction,
        text: row.text_body,
      }));
      // A fonte do rascunho precisa ser a última entrada, inclusive mídia sem
      // legenda. O envio compara esse ID com a última entrada para impedir que
      // se responda a uma conversa que mudou entre rascunho e confirmação.
      // Antes, o contexto pulava mídia sem texto e tornava impossível enviar
      // um rascunho manual numa conversa perfeitamente válida.
      return { messages: chronological, sourceMessageId: latestInbound?.id ?? null };
    },

    async beginAiDraft(input: {
      id: string;
      requestKey: string;
      conversationId: string;
      sourceMessageId: string | null;
      model: string;
      promptVersion: string;
    }): Promise<{ draft: AiDraft; created: boolean }> {
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO ai_drafts
           (id, request_key, conversation_id, source_message_id, model, prompt_version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        )
        .bind(
          input.id,
          input.requestKey,
          input.conversationId,
          input.sourceMessageId,
          input.model,
          input.promptVersion,
        )
        .run();
      const draft = await db
        .prepare("SELECT * FROM ai_drafts WHERE request_key = ?1")
        .bind(input.requestKey)
        .first<AiDraft>();
      if (!draft)
        throw new Error("não foi possível materializar o rascunho de IA");
      return { draft, created: result.meta.changes === 1 };
    },

    async getAiDraftByRequest(
      conversationId: string,
      requestKey: string,
    ): Promise<AiDraft | null> {
      return db
        .prepare(
          "SELECT * FROM ai_drafts WHERE conversation_id = ?1 AND request_key = ?2",
        )
        .bind(conversationId, requestKey)
        .first<AiDraft>();
    },

    async expireStaleGeneratingAiDrafts(
      conversationId: string,
    ): Promise<number> {
      const result = await db
        .prepare(
          `UPDATE ai_drafts SET status = 'failed', error_code = 'generation_timeout',
           updated_at = datetime('now')
         WHERE conversation_id = ?1 AND status = 'generating'
           AND updated_at < datetime('now', '-10 minutes')`,
        )
        .bind(conversationId)
        .run();
      return result.meta.changes ?? 0;
    },

    async completeAiDraft(
      id: string,
      input: {
        text: string;
        promptTokens: number | null;
        outputTokens: number | null;
      },
    ): Promise<AiDraft | null> {
      await db
        .prepare(
          `UPDATE ai_drafts SET status = 'pending_review', text_body = ?2,
           prompt_tokens = ?3, output_tokens = ?4, error_code = NULL,
           updated_at = datetime('now')
         WHERE id = ?1 AND status = 'generating'`,
        )
        .bind(id, input.text, input.promptTokens, input.outputTokens)
        .run();
      return db
        .prepare("SELECT * FROM ai_drafts WHERE id = ?1")
        .bind(id)
        .first<AiDraft>();
    },

    async failAiDraft(id: string, errorCode: string): Promise<void> {
      await db
        .prepare(
          `UPDATE ai_drafts SET status = 'failed', error_code = ?2,
           updated_at = datetime('now') WHERE id = ?1 AND status = 'generating'`,
        )
        .bind(id, errorCode.slice(0, 64))
        .run();
    },

    async listAiDrafts(conversationId: string, limit = 20): Promise<AiDraft[]> {
      return (
        await db
          .prepare(
            `SELECT d.*,
                s.id AS send_id, s.status AS send_status,
                s.message_id AS send_message_id, s.error_code AS send_error_code,
                s.accepted_at AS send_accepted_at, s.sent_at AS send_sent_at,
                s.delivered_at AS send_delivered_at, s.read_at AS send_read_at,
                s.failed_at AS send_failed_at
         FROM ai_drafts d
         LEFT JOIN conversation_draft_sends s ON s.draft_id = d.id
         WHERE d.conversation_id = ?1
         ORDER BY d.created_at DESC, d.id DESC LIMIT ?2`,
          )
          .bind(conversationId, Math.min(Math.max(limit, 1), 50))
          .all<AiDraft>()
      ).results;
    },

    async reviewAiDraft(
      conversationId: string,
      draftId: string,
      status: "approved" | "discarded",
    ): Promise<AiDraft | null> {
      const result = await db
        .prepare(
          `UPDATE ai_drafts SET status = ?3, reviewed_at = datetime('now'),
           updated_at = datetime('now')
         WHERE id = ?2 AND conversation_id = ?1 AND status = 'pending_review'`,
        )
        .bind(conversationId, draftId, status)
        .run();
      if (result.meta.changes !== 1) return null;
      return db
        .prepare(
          "SELECT * FROM ai_drafts WHERE id = ?1 AND conversation_id = ?2",
        )
        .bind(draftId, conversationId)
        .first<AiDraft>();
    },

    async aiUsageCounts(
      conversationId: string,
    ): Promise<{ hourly: number; daily: number }> {
      const row = await db
        .prepare(
          `SELECT
           SUM(CASE WHEN conversation_id = ?1 AND created_at >= datetime('now', '-1 hour') THEN 1 ELSE 0 END) AS hourly,
           SUM(CASE WHEN created_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS daily
         FROM ai_drafts WHERE created_at >= datetime('now', '-1 day')`,
        )
        .bind(conversationId)
        .first<{ hourly: number | null; daily: number | null }>();
      return { hourly: row?.hourly ?? 0, daily: row?.daily ?? 0 };
    },
  };
}
