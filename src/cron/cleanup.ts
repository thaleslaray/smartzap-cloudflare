export async function cleanupExpiredData(
  db: D1Database,
  removeLegacySecrets = false,
  media?: R2Bucket,
): Promise<{
  sessions: number;
  statusEvents: number;
  conversationMessages: number;
  conversationMedia: number;
  aiDrafts: number;
  staleAiDrafts: number;
  staleConversationSends: number;
  expiredWorkflowWaits: number;
  reconciledConversations: number;
  emptyConversations: number;
  legacySecrets: number;
}> {
  const sessions = await db
    .prepare("DELETE FROM sessions WHERE expires_at <= unixepoch()")
    .run();
  const statusEvents = await db
    .prepare(
      "DELETE FROM status_events WHERE received_at < datetime('now', '-90 days')",
    )
    .run();
  let conversationMedia = 0;
  if (media) {
    // O objeto precisa desaparecer antes da referência. Se o R2 falhar, o cron
    // lança e tenta novamente; nunca criamos órfãos apagando primeiro o D1.
    while (true) {
      const expired = (
        await db.prepare(
          `SELECT cm.r2_key FROM conversation_media cm
           LEFT JOIN conversation_messages m ON m.id=cm.message_id
           WHERE cm.created_at < datetime('now', '-90 days')
              OR m.received_at < datetime('now', '-90 days')
           LIMIT 500`,
        ).all<{ r2_key: string }>()
      ).results;
      if (!expired.length) break;
      const keys = expired.map((row) => row.r2_key);
      await media.delete(keys);
      const placeholders = keys.map((_, index) => `?${index + 1}`).join(",");
      const removed = await db.prepare(
        `DELETE FROM conversation_media WHERE r2_key IN (${placeholders})`,
      ).bind(...keys).run();
      conversationMedia += removed.meta.changes ?? 0;
    }
  }
  const conversationMessages = await db
    .prepare(
      "DELETE FROM conversation_messages WHERE received_at < datetime('now', '-90 days')",
    )
    .run();
  const aiDrafts = await db
    .prepare(
      "DELETE FROM ai_drafts WHERE created_at < datetime('now', '-90 days')",
    )
    .run();
  const staleAiDrafts = await db
    .prepare(
      `UPDATE ai_drafts SET status = 'failed', error_code = 'generation_timeout',
       updated_at = datetime('now')
     WHERE status = 'generating' AND updated_at < datetime('now', '-10 minutes')`,
    )
    .run();
  const staleConversationSends = await db
    .prepare(
      `UPDATE conversation_draft_sends
     SET status = 'ambiguous', error_code = 'reservation_timeout',
         error_detail = 'resultado remoto desconhecido', updated_at = datetime('now')
     WHERE status = 'reserved' AND updated_at < datetime('now', '-2 minutes')`,
    )
    .run();
  const expiredWorkflowWaits = await db
    .prepare(
      `UPDATE workflow_waits SET status = 'expired'
     WHERE status IN ('preparing','waiting') AND expires_at <= unixepoch()`,
    )
    .run();
  await db.batch([
    db.prepare(
      `UPDATE workflow_step_runs SET status='failed',error='response_timeout',
       finished_at=datetime('now')
       WHERE status='running' AND EXISTS (
         SELECT 1 FROM workflow_waits w
         WHERE w.execution_id=workflow_step_runs.execution_id
           AND w.node_id=workflow_step_runs.node_id AND w.status='expired'
       )`,
    ),
    db.prepare(
      `UPDATE workflow_executions SET status='failed',error='response_timeout',
       finished_at=datetime('now')
       WHERE status IN('queued','running') AND EXISTS (
         SELECT 1 FROM workflow_waits w
         WHERE w.execution_id=workflow_executions.id AND w.status='expired'
       )`,
    ),
  ]);
  const reconciledConversations = await db
    .prepare(
      `UPDATE conversations SET
       unread_count = (
         SELECT COUNT(*) FROM conversation_messages m
         WHERE m.conversation_id = conversations.id
           AND m.direction = 'inbound' AND m.read_at IS NULL
       ),
       updated_at = datetime('now')
     WHERE unread_count <> (
       SELECT COUNT(*) FROM conversation_messages m
       WHERE m.conversation_id = conversations.id
         AND m.direction = 'inbound' AND m.read_at IS NULL
     )`,
    )
    .run();
  const emptyConversations = await db
    .prepare(
      `DELETE FROM conversations
     WHERE NOT EXISTS (
       SELECT 1 FROM conversation_messages m WHERE m.conversation_id = conversations.id
     )`,
    )
    .run();
  const legacySecrets = removeLegacySecrets
    ? await db
        .prepare("DELETE FROM settings WHERE key = 'whatsapp_token'")
        .run()
    : null;
  return {
    sessions: sessions.meta.changes ?? 0,
    statusEvents: statusEvents.meta.changes ?? 0,
    conversationMessages: conversationMessages.meta.changes ?? 0,
    conversationMedia,
    aiDrafts: aiDrafts.meta.changes ?? 0,
    staleAiDrafts: staleAiDrafts.meta.changes ?? 0,
    staleConversationSends: staleConversationSends.meta.changes ?? 0,
    expiredWorkflowWaits: expiredWorkflowWaits.meta.changes ?? 0,
    reconciledConversations: reconciledConversations.meta.changes ?? 0,
    emptyConversations: emptyConversations.meta.changes ?? 0,
    legacySecrets: legacySecrets?.meta.changes ?? 0,
  };
}
