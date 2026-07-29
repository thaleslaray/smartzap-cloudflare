import { createApp } from "./api/router";
import { handleWebhookBatch } from "./queue/webhook-consumer";
import type { MetaWebhookEvent } from "./api/webhook";
import { reconcileCampaignCounters } from "./cron/reconcile";
import { cleanupExpiredData } from "./cron/cleanup";
import { reconcilePendingStatusEvents } from "./cron/reconcile-status-events";
import { checkUpcomingRateCard, reconcilePricingAnalytics } from "./cron/pricing";
import { broadcastToHub } from "./api/realtime";
import { ensureStatusEventReconciliationSchema } from "./db/status-events";
import { redactOperationalDetail } from "./domain/redaction";
import {
  handleAutomationBatch,
  type AutomationQueueEvent,
} from "./ai/automation";

const app = createApp();

type QueueMessageLike<T> = {
  body: T;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

export async function processWebhookMessages(
  messages: readonly QueueMessageLike<MetaWebhookEvent>[],
  env: Env,
  handler: (
    events: MetaWebhookEvent[],
    env: Env,
  ) => Promise<void> = handleWebhookBatch,
): Promise<void> {
  for (const message of messages) {
    try {
      await handler([message.body], env);
      message.ack();
    } catch (error) {
      const delaySeconds = Math.min(
        300,
        5 * 2 ** Math.max(0, message.attempts - 1),
      );
      console.error(
        JSON.stringify({
          level: "error",
          msg: "Webhook da Queue falhou; retry individual",
          attempts: message.attempts,
          delaySeconds,
          error: redactOperationalDetail(
            error instanceof Error ? error.message : error,
          ),
        }),
      );
      message.retry({ delaySeconds });
    }
  }
}

export async function processAutomationMessages(
  messages: readonly QueueMessageLike<AutomationQueueEvent>[],
  env: Env,
  handler: (
    events: AutomationQueueEvent[],
    env: Env,
  ) => Promise<void> = handleAutomationBatch,
): Promise<void> {
  for (const message of messages) {
    try {
      await handler([message.body], env);
      message.ack();
    } catch (error) {
      const delaySeconds = Math.min(
        300,
        5 * 2 ** Math.max(0, message.attempts - 1),
      );
      console.error(
        JSON.stringify({
          level: "error",
          msg: "Automação da Queue falhou; retry individual",
          attempts: message.attempts,
          delaySeconds,
          error: redactOperationalDetail(
            error instanceof Error ? error.message : error,
          ),
        }),
      );
      message.retry({ delaySeconds });
    }
  }
}

export function isAutomationQueue(
  env: Pick<Env, "AUTOMATION_QUEUE_NAME">,
  queueName: string,
): boolean {
  return queueName === (env.AUTOMATION_QUEUE_NAME?.trim() || "inbox-automation");
}

export default {
  fetch: app.fetch,
  async queue(batch, env) {
    if (isAutomationQueue(env, batch.queue)) {
      await processAutomationMessages(
        batch.messages as unknown as QueueMessageLike<AutomationQueueEvent>[],
        env,
      );
      return;
    }
    await processWebhookMessages(batch.messages, env);
  },
  async scheduled(_event, env) {
    await ensureStatusEventReconciliationSchema(env.DB);
    const statusReconciliation = await reconcilePendingStatusEvents(env.DB);
    const fixed = await reconcileCampaignCounters(env.DB);
    const cleaned = await cleanupExpiredData(
      env.DB,
      Boolean(env.WHATSAPP_TOKEN),
      env.MEDIA,
    );
    try {
      const pricing = await reconcilePricingAnalytics(env);
      if (!pricing.skipped)
        console.log(JSON.stringify({ level: "info", msg: "pricing analytics sincronizado", ...pricing }));
    } catch (error) {
      console.error(JSON.stringify({
        level: "warn",
        msg: "pricing analytics não sincronizado",
        error: redactOperationalDetail(error instanceof Error ? error.message : error),
      }));
    }
    const rateCard = await checkUpcomingRateCard(env);
    if (rateCard.required && !rateCard.covered)
      console.warn(JSON.stringify({
        level: "warn",
        msg: "rate card do próximo trimestre ainda não foi importado",
        effectiveFrom: rateCard.effectiveFrom,
      }));
    if (fixed) console.log(`[cron] contadores reconciliados: ${fixed}`);
    for (const campaignId of statusReconciliation.campaignIds) {
      await broadcastToHub(env, {
        type: "invalidate",
        keys: [["campaigns"], ["campaign", campaignId], ["dashboard"]],
      });
    }
    if (statusReconciliation.scanned) {
      console.log(
        JSON.stringify({
          level: statusReconciliation.errors ? "warn" : "info",
          msg: "status órfãos reconciliados",
          ...statusReconciliation,
        }),
      );
    }
    if (
      cleaned.sessions ||
      cleaned.statusEvents ||
      cleaned.conversationMessages ||
      cleaned.conversationMedia ||
      cleaned.aiDrafts ||
      cleaned.staleAiDrafts ||
      cleaned.reconciledConversations ||
      cleaned.emptyConversations ||
      cleaned.expiredWorkflowWaits ||
      cleaned.legacySecrets
    )
      console.log(
        JSON.stringify({
          level: "info",
          msg: "retenção concluída",
          ...cleaned,
        }),
      );
  },
} satisfies ExportedHandler<Env, MetaWebhookEvent>;

// Placeholders exigidos pelo wrangler.jsonc — implementados nas Tasks 8-11
export { RealtimeHub } from "./do/RealtimeHub";
export { PhoneThrottle } from "./do/PhoneThrottle";
export { CampaignSendWorkflow } from "./workflows/CampaignSendWorkflow";
