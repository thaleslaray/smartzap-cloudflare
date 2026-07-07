import { createApp } from './api/router'
import { handleWebhookBatch } from './queue/webhook-consumer'
import type { MetaStatus } from './api/webhook'

const app = createApp()

export default {
  fetch: app.fetch,
  async queue(batch, env) {
    // O body de cada mensagem já é um MetaStatus validado na rota — sem re-extração
    await handleWebhookBatch(batch.messages.map((m) => m.body), env)
    batch.ackAll()
  },
} satisfies ExportedHandler<Env, MetaStatus>

// Placeholders exigidos pelo wrangler.jsonc — implementados nas Tasks 8-11
export { RealtimeHub } from './do/RealtimeHub'
export { PhoneThrottle } from './do/PhoneThrottle'
export { CampaignSendWorkflow } from './workflows/CampaignSendWorkflow'
