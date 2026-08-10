import { broadcastToHub } from "../api/realtime";
import { knowledgeDocumentIndexStatus } from "./service";

export type KnowledgeIndexEvent = {
  kind: "knowledge_index";
  documentId: string;
  checks: number;
};

export async function processKnowledgeIndexEvent(
  env: Env,
  event: KnowledgeIndexEvent,
): Promise<void> {
  const document = await env.DB.prepare(
    `SELECT id,ai_search_item_id,status FROM knowledge_documents
     WHERE id=?1 AND status<>'deleted'`,
  ).bind(event.documentId).first<{
    id: string; ai_search_item_id: string | null; status: string;
  }>();
  if (!document || document.status === "ready" || document.status === "failed")
    return;
  if (!document.ai_search_item_id) {
    await env.DB.prepare(
      `UPDATE knowledge_documents SET status='failed',error_code='index_item_missing',
       updated_at=datetime('now') WHERE id=?1`,
    ).bind(document.id).run();
    return;
  }
  const status = await knowledgeDocumentIndexStatus(
    env.AI_SEARCH,
    document.ai_search_item_id,
  );
  if (status === "ready") {
    await env.DB.prepare(
      `UPDATE knowledge_documents SET status='ready',error_code=NULL,
       updated_at=datetime('now') WHERE id=?1`,
    ).bind(document.id).run();
    await broadcastToHub(env, {
      type: "invalidate",
      keys: [["knowledge-documents"], ["ai-agent-documents"]],
    });
    return;
  }
  if (status === "failed" || event.checks >= 39) {
    await env.DB.prepare(
      `UPDATE knowledge_documents SET status='failed',error_code=?2,
       updated_at=datetime('now') WHERE id=?1`,
    ).bind(
      document.id,
      status === "failed" ? "ai_search_index_failed" : "ai_search_index_timeout",
    ).run();
    return;
  }
  await env.AUTOMATION_QUEUE.send(
    { ...event, checks: event.checks + 1 },
    { delaySeconds: 15 },
  );
}
