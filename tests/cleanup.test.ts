import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { cleanupExpiredData } from "../src/cron/cleanup";

describe("retenção de dados", () => {
  it("expira uma pergunta de workflow e falha o step e a execução", async () => {
    const workflowId = crypto.randomUUID();
    const executionId = crypto.randomUUID();
    const contactId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO contacts(id,phone,status,wa_id)VALUES(?1,?2,'opt_in',?3)",
      ).bind(
        contactId,
        `+5531${Date.now().toString().slice(-8)}`,
        `wait-${contactId}`,
      ),
      env.DB.prepare(
        "INSERT INTO conversations(id,contact_id,wa_id)VALUES(?1,?2,?3)",
      ).bind(conversationId, contactId, `wait-${contactId}`),
      env.DB.prepare(
        "INSERT INTO workflows(id,name,nodes_json,edges_json)VALUES(?1,'Espera expirada','[]','[]')",
      ).bind(workflowId),
      env.DB.prepare(
        "INSERT INTO workflow_executions(id,workflow_id,status)VALUES(?1,?2,'running')",
      ).bind(executionId, workflowId),
      env.DB.prepare(
        "INSERT INTO workflow_step_runs(execution_id,node_id,status)VALUES(?1,'question-1','running')",
      ).bind(executionId),
      env.DB.prepare(
        `INSERT INTO workflow_waits
         (execution_id,node_id,workflow_id,conversation_id,variable_key,status,expires_at)
         VALUES(?1,'question-1',?2,?3,'answer','waiting',unixepoch()-1)`,
      ).bind(executionId, workflowId, conversationId),
    ]);

    const removed = await cleanupExpiredData(env.DB);
    expect(removed.expiredWorkflowWaits).toBeGreaterThanOrEqual(1);
    expect(
      await env.DB.prepare(
        "SELECT status,error FROM workflow_step_runs WHERE execution_id=?1",
      )
        .bind(executionId)
        .first(),
    ).toEqual({ status: "failed", error: "response_timeout" });
    expect(
      await env.DB.prepare(
        "SELECT status,error FROM workflow_executions WHERE id=?1",
      )
        .bind(executionId)
        .first(),
    ).toEqual({ status: "failed", error: "response_timeout" });
  });

  it("remove sessões expiradas e eventos com mais de 90 dias, preservando os atuais", async () => {
    const suffix = crypto.randomUUID();
    const oldContact = crypto.randomUUID();
    const freshContact = crypto.randomUUID();
    const oldConversation = crypto.randomUUID();
    const freshConversation = crypto.randomUUID();
    const oldDraft = crypto.randomUUID();
    const freshDraft = crypto.randomUUID();
    const staleDraft = crypto.randomUUID();
    const oldMediaMessage = `old-media-${suffix}`;
    const oldMediaKey = `inbox-media/${oldConversation}/${oldMediaMessage}`;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO sessions (token_hash, expires_at) VALUES (?1, unixepoch() - 1)",
      ).bind(`expired-${suffix}`),
      env.DB.prepare(
        "INSERT INTO sessions (token_hash, expires_at) VALUES (?1, unixepoch() + 3600)",
      ).bind(`active-${suffix}`),
      env.DB.prepare(
        "INSERT INTO status_events (message_id, status, received_at) VALUES (?1, 'read', datetime('now', '-91 days'))",
      ).bind(`old-${suffix}`),
      env.DB.prepare(
        "INSERT INTO status_events (message_id, status) VALUES (?1, 'read')",
      ).bind(`fresh-${suffix}`),
      env.DB.prepare(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('whatsapp_token', 'legacy-plaintext')",
      ),
      env.DB.prepare(
        "INSERT INTO contacts (id, phone, status, wa_id) VALUES (?1, ?2, 'unknown', ?3)",
      ).bind(
        oldContact,
        `+5511${Date.now().toString().slice(-8)}`,
        `old-${suffix}`,
      ),
      env.DB.prepare(
        "INSERT INTO contacts (id, phone, status, wa_id) VALUES (?1, ?2, 'unknown', ?3)",
      ).bind(
        freshContact,
        `+5521${Date.now().toString().slice(-8)}`,
        `fresh-${suffix}`,
      ),
      env.DB.prepare(
        "INSERT INTO conversations (id, contact_id, wa_id) VALUES (?1, ?2, ?3)",
      ).bind(oldConversation, oldContact, `old-${suffix}`),
      env.DB.prepare(
        "INSERT INTO conversations (id, contact_id, wa_id) VALUES (?1, ?2, ?3)",
      ).bind(freshConversation, freshContact, `fresh-${suffix}`),
      env.DB.prepare(
        `INSERT INTO conversation_messages
           (id, conversation_id, contact_id, direction, message_type, phone_number_id,
            meta_timestamp, received_at)
         VALUES (?1, ?2, ?3, 'inbound', 'text', 'phone', 1, datetime('now', '-91 days'))`,
      ).bind(`old-message-${suffix}`, oldConversation, oldContact),
      env.DB.prepare(
        `INSERT INTO conversation_messages
           (id, conversation_id, contact_id, direction, message_type, phone_number_id,
            meta_timestamp, received_at)
         VALUES (?1, ?2, ?3, 'inbound', 'image', 'phone', 1, datetime('now', '-91 days'))`,
      ).bind(oldMediaMessage, oldConversation, oldContact),
      env.DB.prepare(
        `INSERT INTO conversation_media
           (message_id,conversation_id,r2_key,mime_type,byte_size,checksum,created_at)
         VALUES (?1,?2,?3,'image/png',4,?4,datetime('now','-91 days'))`,
      ).bind(oldMediaMessage, oldConversation, oldMediaKey, "a".repeat(64)),
      env.DB.prepare(
        `INSERT INTO conversation_messages
           (id, conversation_id, contact_id, direction, message_type, phone_number_id, meta_timestamp)
         VALUES (?1, ?2, ?3, 'inbound', 'text', 'phone', 2)`,
      ).bind(`fresh-message-${suffix}`, freshConversation, freshContact),
      env.DB.prepare(
        `INSERT INTO conversation_messages
           (id, conversation_id, contact_id, direction, message_type, phone_number_id,
            meta_timestamp, received_at)
         VALUES (?1, ?2, ?3, 'inbound', 'text', 'phone', 1, datetime('now', '-91 days'))`,
      ).bind(`stale-unread-${suffix}`, freshConversation, freshContact),
      env.DB.prepare(
        "UPDATE conversations SET unread_count = 2 WHERE id = ?1",
      ).bind(freshConversation),
      env.DB.prepare(
        `INSERT INTO ai_drafts
           (id, request_key, conversation_id, status, model, prompt_version, created_at)
         VALUES (?1, ?2, ?3, 'discarded', 'google/gemini-3.5-flash', 'draft-v1', datetime('now', '-91 days'))`,
      ).bind(oldDraft, `old-draft-${suffix}`, freshConversation),
      env.DB.prepare(
        `INSERT INTO ai_drafts
           (id, request_key, conversation_id, status, model, prompt_version)
         VALUES (?1, ?2, ?3, 'pending_review', 'google/gemini-3.5-flash', 'draft-v1')`,
      ).bind(freshDraft, `fresh-draft-${suffix}`, freshConversation),
      env.DB.prepare(
        `INSERT INTO ai_drafts
           (id, request_key, conversation_id, status, model, prompt_version, updated_at)
         VALUES (?1, ?2, ?3, 'generating', 'google/gemini-3.5-flash', 'draft-v1',
                 datetime('now', '-11 minutes'))`,
      ).bind(staleDraft, `stale-draft-${suffix}`, freshConversation),
    ]);

    await env.MEDIA.put(oldMediaKey, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    const removed = await cleanupExpiredData(env.DB, true, env.MEDIA);
    expect(removed.sessions).toBeGreaterThanOrEqual(1);
    expect(removed.statusEvents).toBeGreaterThanOrEqual(1);
    expect(removed.conversationMessages).toBeGreaterThanOrEqual(1);
    expect(removed.conversationMedia).toBeGreaterThanOrEqual(1);
    expect(removed.aiDrafts).toBeGreaterThanOrEqual(1);
    expect(removed.staleAiDrafts).toBeGreaterThanOrEqual(1);
    expect(removed.reconciledConversations).toBeGreaterThanOrEqual(1);
    expect(removed.emptyConversations).toBeGreaterThanOrEqual(1);
    expect(removed.legacySecrets).toBe(1);
    expect(await env.MEDIA.get(oldMediaKey)).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 FROM sessions WHERE token_hash = ?1")
        .bind(`expired-${suffix}`)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 FROM sessions WHERE token_hash = ?1")
        .bind(`active-${suffix}`)
        .first(),
    ).not.toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 FROM status_events WHERE message_id = ?1")
        .bind(`old-${suffix}`)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 FROM status_events WHERE message_id = ?1")
        .bind(`fresh-${suffix}`)
        .first(),
    ).not.toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT 1 FROM settings WHERE key = 'whatsapp_token'",
      ).first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 FROM conversations WHERE id = ?1")
        .bind(oldConversation)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 FROM conversation_messages WHERE id = ?1")
        .bind(`fresh-message-${suffix}`)
        .first(),
    ).not.toBeNull();
    expect(
      (
        await env.DB.prepare(
          "SELECT unread_count FROM conversations WHERE id = ?1",
        )
          .bind(freshConversation)
          .first<{ unread_count: number }>()
      )?.unread_count,
    ).toBe(1);
    expect(
      await env.DB.prepare("SELECT 1 FROM ai_drafts WHERE id = ?1")
        .bind(oldDraft)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 FROM ai_drafts WHERE id = ?1")
        .bind(freshDraft)
        .first(),
    ).not.toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT status, error_code FROM ai_drafts WHERE id = ?1",
      )
        .bind(staleDraft)
        .first(),
    ).toEqual({
      status: "failed",
      error_code: "generation_timeout",
    });
  });
});
