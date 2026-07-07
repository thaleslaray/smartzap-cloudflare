import { createApp } from './api/router'

const app = createApp()

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>

// Placeholders exigidos pelo wrangler.jsonc — implementados nas Tasks 8-11
export { RealtimeHub } from './do/RealtimeHub'
export { PhoneThrottle } from './do/PhoneThrottle'
export { CampaignSendWorkflow } from './workflows/CampaignSendWorkflow'
