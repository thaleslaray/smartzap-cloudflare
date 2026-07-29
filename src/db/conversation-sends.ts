export type ConversationSendStatus =
  | 'reserved' | 'accepted' | 'sent' | 'delivered' | 'read'
  | 'failed' | 'rejected' | 'ambiguous'

export type ConversationDraftSend = {
  id: string
  request_key: string
  draft_id: string
  conversation_id: string
  contact_id: string
  phone_number_id: string
  phone_hash: string
  status: ConversationSendStatus
  message_id: string | null
  error_code: string | null
  error_detail: string | null
  accepted_at: string | null
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  failed_at: string | null
  created_at: string
  updated_at: string
}

export type DraftSendCandidate = {
  draft_id: string
  conversation_id: string
  contact_id: string
  draft_status: string
  draft_model: string | null
  text_body: string | null
  source_message_id: string | null
  ai_enabled: number
  phone: string
  user_id: string | null
  parent_user_id: string | null
  latest_inbound_id: string | null
  latest_inbound_at: number | null
  phone_number_id: string | null
}

export type OutboundMaterialization = {
  messageType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'template'
  contentJson?: string
  preview?: string
}

function safeError(value: string | undefined, max: number): string | null {
  return value ? value.slice(0, max) : null
}

export function publicConversationSend(send: ConversationDraftSend) {
  return {
    id: send.id,
    request_key: send.request_key,
    draft_id: send.draft_id,
    conversation_id: send.conversation_id,
    status: send.status,
    message_id: send.message_id,
    error_code: send.error_code,
    accepted_at: send.accepted_at,
    sent_at: send.sent_at,
    delivered_at: send.delivered_at,
    read_at: send.read_at,
    failed_at: send.failed_at,
    created_at: send.created_at,
    updated_at: send.updated_at,
  }
}

export function conversationSendsDb(db: D1Database) {
  const get = (id: string) => db.prepare(
    'SELECT * FROM conversation_draft_sends WHERE id = ?1'
  ).bind(id).first<ConversationDraftSend>()

  async function materializeOutbound(
    sendId: string, messageId: string, timestamp: number,
    materialization: OutboundMaterialization = {},
  ): Promise<void> {
    const messageType = materialization.messageType ?? 'text'
    const content = materialization.contentJson
      ?? JSON.stringify({ source: 'approved_ai_draft', sendId })
    const preview = materialization.preview?.slice(0, 240) ?? null
    await db.batch([
      db.prepare(
        `INSERT OR IGNORE INTO conversation_messages
           (id, conversation_id, contact_id, direction, message_type, text_body,
            content_json, phone_number_id, meta_timestamp)
         SELECT ?2, s.conversation_id, s.contact_id, 'outbound', ?5, d.text_body,
                ?4, s.phone_number_id, ?3
         FROM conversation_draft_sends s JOIN ai_drafts d ON d.id = s.draft_id
         WHERE s.id = ?1 AND d.text_body IS NOT NULL`
      ).bind(sendId, messageId, timestamp, content, messageType),
      db.prepare(
        `UPDATE conversations SET
           last_message_preview = CASE WHEN last_message_at IS NULL OR last_message_at <= ?2
             THEN COALESCE(?3,
                   (SELECT CASE
                      WHEN m.message_type = 'text' THEN substr(m.text_body, 1, 240)
                      WHEN m.text_body IS NOT NULL AND m.text_body <> '' THEN substr(m.text_body, 1, 240)
                      WHEN m.message_type = 'image' THEN '[Imagem]'
                      WHEN m.message_type = 'video' THEN '[Vídeo]'
                      WHEN m.message_type = 'audio' THEN '[Áudio]'
                      ELSE '[Documento]' END
                    FROM conversation_messages m WHERE m.id = ?4),
                   (SELECT substr(d.text_body, 1, 240)
                   FROM conversation_draft_sends s JOIN ai_drafts d ON d.id = s.draft_id
                   WHERE s.id = ?1)) ELSE last_message_preview END,
           last_message_at = CASE WHEN last_message_at IS NULL OR last_message_at <= ?2
             THEN ?2 ELSE last_message_at END,
           updated_at = datetime('now')
         WHERE id = (SELECT conversation_id FROM conversation_draft_sends WHERE id = ?1)`
      ).bind(sendId, timestamp, preview, messageId),
    ])
  }

  return {
    async findForDraft(draftId: string): Promise<ConversationDraftSend | null> {
      return db.prepare(
        'SELECT * FROM conversation_draft_sends WHERE draft_id = ?1'
      ).bind(draftId).first<ConversationDraftSend>()
    },

    async candidate(conversationId: string, draftId: string): Promise<DraftSendCandidate | null> {
      return db.prepare(
        `SELECT d.id AS draft_id, d.conversation_id, v.contact_id,
                d.status AS draft_status, d.model AS draft_model, d.text_body, d.source_message_id,
                v.ai_enabled, c.phone, c.user_id, c.parent_user_id,
                (SELECT m.id FROM conversation_messages m
                 WHERE m.conversation_id = v.id AND m.direction = 'inbound'
                 ORDER BY m.meta_timestamp DESC, m.id DESC LIMIT 1) AS latest_inbound_id,
                (SELECT m.meta_timestamp FROM conversation_messages m
                 WHERE m.conversation_id = v.id AND m.direction = 'inbound'
                 ORDER BY m.meta_timestamp DESC, m.id DESC LIMIT 1) AS latest_inbound_at,
                (SELECT m.phone_number_id FROM conversation_messages m
                 WHERE m.conversation_id = v.id AND m.direction = 'inbound'
                 ORDER BY m.meta_timestamp DESC, m.id DESC LIMIT 1) AS phone_number_id
         FROM ai_drafts d
         JOIN conversations v ON v.id = d.conversation_id
         JOIN contacts c ON c.id = v.contact_id
         WHERE d.id = ?2 AND d.conversation_id = ?1`
      ).bind(conversationId, draftId).first<DraftSendCandidate>()
    },

    async expireStaleReservation(draftId: string): Promise<void> {
      await db.prepare(
        `UPDATE conversation_draft_sends
         SET status = 'ambiguous', error_code = 'reservation_timeout',
             error_detail = 'resultado remoto desconhecido', updated_at = datetime('now')
         WHERE draft_id = ?1 AND status = 'reserved'
           AND updated_at < datetime('now', '-2 minutes')`
      ).bind(draftId).run()
    },

    async reserve(input: {
      id: string
      requestKey: string
      candidate: DraftSendCandidate
      phoneHash: string
      dailyLimit: number
    }): Promise<{ send: ConversationDraftSend; created: boolean } | null> {
      const c = input.candidate
      const result = await db.prepare(
        `INSERT OR IGNORE INTO conversation_draft_sends
           (id, request_key, draft_id, conversation_id, contact_id,
            phone_number_id, phone_hash)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
         WHERE EXISTS (
           SELECT 1 FROM ai_drafts
           WHERE id = ?3 AND conversation_id = ?4 AND status = 'approved'
         ) AND (
           SELECT COUNT(*) FROM conversation_draft_sends
           WHERE created_at >= datetime('now', '-1 day')
         ) < ?8`
      ).bind(input.id, input.requestKey, c.draft_id, c.conversation_id, c.contact_id,
        c.phone_number_id, input.phoneHash, input.dailyLimit).run()

      const byRequest = await db.prepare(
        'SELECT * FROM conversation_draft_sends WHERE request_key = ?1'
      ).bind(input.requestKey).first<ConversationDraftSend>()
      if (byRequest) return { send: byRequest, created: result.meta.changes === 1 }
      const byDraft = await db.prepare(
        'SELECT * FROM conversation_draft_sends WHERE draft_id = ?1'
      ).bind(c.draft_id).first<ConversationDraftSend>()
      if (byDraft) return { send: byDraft, created: false }
      return null
    },

    async accept(
      id: string, messageId: string, timestamp: number,
      materialization: OutboundMaterialization = {},
    ): Promise<ConversationDraftSend | null> {
      await db.prepare(
        `UPDATE conversation_draft_sends
         SET status = 'accepted', message_id = ?2, accepted_at = datetime(?3, 'unixepoch'),
             error_code = NULL, error_detail = NULL, updated_at = datetime('now')
         WHERE id = ?1 AND status = 'reserved' AND (message_id IS NULL OR message_id = ?2)`
      ).bind(id, messageId, timestamp).run()
      await materializeOutbound(id, messageId, timestamp, materialization)
      return get(id)
    },

    async failReservation(id: string, input: {
      status: 'rejected' | 'ambiguous'; errorCode?: string; errorDetail?: string
    }): Promise<ConversationDraftSend | null> {
      await db.prepare(
        `UPDATE conversation_draft_sends
         SET status = ?2, error_code = ?3, error_detail = ?4, updated_at = datetime('now')
         WHERE id = ?1 AND status = 'reserved'`
      ).bind(id, input.status, safeError(input.errorCode, 64),
        safeError(input.errorDetail, 500)).run()
      return get(id)
    },

    async applyStatus(input: {
      messageId: string
      opaqueId?: string
      phoneNumberId: string
      status: 'sent' | 'delivered' | 'read' | 'failed'
      timestamp: number
      errorCode?: string
      errorDetail?: string
    }): Promise<{ conversationId: string; contactId: string; applied: boolean } | null> {
      const opaque = input.opaqueId
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.opaqueId)
        ? input.opaqueId : null
      const target = await db.prepare(
        `SELECT * FROM conversation_draft_sends
         WHERE message_id = ?1 OR (?2 IS NOT NULL AND id = ?2)
         LIMIT 1`
      ).bind(input.messageId, opaque).first<ConversationDraftSend>()
      if (!target || target.phone_number_id !== input.phoneNumberId) return null
      if (target.message_id && target.message_id !== input.messageId) return null

      const eligible = input.status === 'sent'
        ? ['reserved', 'ambiguous', 'accepted']
        : input.status === 'delivered'
          ? ['reserved', 'ambiguous', 'accepted', 'sent']
          : input.status === 'read'
            ? ['reserved', 'ambiguous', 'accepted', 'sent', 'delivered']
            : ['reserved', 'ambiguous', 'accepted', 'sent']
      const placeholders = eligible.map((_, index) => `?${index + 8}`).join(',')
      const result = await db.prepare(
        `UPDATE conversation_draft_sends SET
           message_id = COALESCE(message_id, ?2), status = ?3,
           accepted_at = COALESCE(accepted_at, datetime(?4, 'unixepoch')),
           sent_at = CASE WHEN ?3 IN ('sent','delivered','read')
             THEN COALESCE(sent_at, datetime(?4, 'unixepoch')) ELSE sent_at END,
           delivered_at = CASE WHEN ?3 IN ('delivered','read')
             THEN COALESCE(delivered_at, datetime(?4, 'unixepoch')) ELSE delivered_at END,
           read_at = CASE WHEN ?3 = 'read'
             THEN COALESCE(read_at, datetime(?4, 'unixepoch')) ELSE read_at END,
           failed_at = CASE WHEN ?3 = 'failed'
             THEN COALESCE(failed_at, datetime(?4, 'unixepoch')) ELSE failed_at END,
           error_code = CASE WHEN ?3 = 'failed' THEN ?5 ELSE error_code END,
           error_detail = CASE WHEN ?3 = 'failed' THEN ?6 ELSE error_detail END,
           updated_at = datetime('now')
         WHERE id = ?1 AND phone_number_id = ?7
           AND (message_id IS NULL OR message_id = ?2)
           AND status IN (${placeholders})`
      ).bind(target.id, input.messageId, input.status, input.timestamp,
        safeError(input.errorCode, 64), safeError(input.errorDetail, 500),
        input.phoneNumberId, ...eligible).run()

      // Mesmo em callback duplicado, garanta que uma aceitação recuperada pelo
      // identificador opaco materialize a mensagem outbound.
      await materializeOutbound(target.id, input.messageId, input.timestamp)
      return {
        conversationId: target.conversation_id,
        contactId: target.contact_id,
        applied: (result.meta.changes ?? 0) === 1,
      }
    },

    get,
  }
}
