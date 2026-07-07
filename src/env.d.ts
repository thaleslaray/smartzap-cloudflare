// Espelho legível do Env. A fonte preferida é o `worker-configuration.d.ts` gerado
// por `npm run types` (wrangler types) — manter este arquivo em sincronia com o
// wrangler.jsonc; se os dois divergirem, o gerado vence.
interface Env {
  DB: D1Database
  CACHE: KVNamespace
  MEDIA: R2Bucket
  WEBHOOK_QUEUE: Queue<import('./api/webhook').MetaStatus> // msgs pequenas e tipadas (Task 12)
  CAMPAIGN_WF: Workflow
  REALTIME: DurableObjectNamespace<import('./do/RealtimeHub').RealtimeHub>
  THROTTLE: DurableObjectNamespace<import('./do/PhoneThrottle').PhoneThrottle>
  LOGIN_LIMITER: RateLimit
  ENVIRONMENT: string
  MASTER_PASSWORD: string
  META_APP_SECRET: string
  META_VERIFY_TOKEN: string
  WHATSAPP_TOKEN: string
  TURNSTILE_SECRET: string
  SMARTZAP_API_KEY: string
}
