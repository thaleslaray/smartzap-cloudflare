// Espelho legível do Env. A fonte preferida é o `worker-configuration.d.ts` gerado
// por `npm run types` (wrangler types) — manter este arquivo em sincronia com o
// wrangler.jsonc; se os dois divergirem, o gerado vence.
interface Env {
  HYPERDRIVE?: Hyperdrive;
  DB: D1Database;
  MEDIA: R2Bucket;
  WEBHOOK_QUEUE: Queue<import("./api/webhook").MetaWebhookEvent>;
  AUTOMATION_QUEUE: Queue<import("./ai/automation").AutomationQueueEvent>;
  CAMPAIGN_WF: Workflow;
  REALTIME: DurableObjectNamespace<import("./do/RealtimeHub").RealtimeHub>;
  THROTTLE: DurableObjectNamespace<import("./do/PhoneThrottle").PhoneThrottle>;
  LOGIN_LIMITER: RateLimit;
  AI: Ai;
  AI_SEARCH: unknown;
  ENVIRONMENT: string;
  META_GRAPH_VERSION: string;
  META_APP_ID: string;
  META_EXPECTED_PHONE_ID: string;
  META_EXPECTED_WABA_ID: string;
  META_EXPECTED_CALLBACK_URL: string;
  /** Compatibilidade exclusiva para testes antigos; não faz parte da operação. */
  PILOT_SEND_ENABLED?: string;
  PILOT_RECIPIENT_E164?: string;
  PILOT_RECIPIENT_ALLOWLIST?: string;
  PILOT_MAX_REAL_SENDS?: string;
  PILOT_MAX_RUNS_PER_DAY?: string;
  PILOT_TIME_WINDOW_ENABLED?: string;
  PILOT_TEMPLATE_ALLOWLIST?: string;
  INBOX_SEND_ENABLED?: string;
  INBOX_AUTOMATION_ENABLED?: string;
  AUTOMATION_QUEUE_NAME?: string;
  TURNSTILE_ENABLED: string;
  AI_ENABLED: string;
  AI_MODEL: string;
  AI_GATEWAY_ID: string;
  AI_PROVIDER_TIMEOUT_MS?: string;
  AI_MAX_DRAFTS_PER_CONVERSATION_HOUR: string;
  AI_MAX_DRAFTS_PER_DAY: string;
  /**
   * Token de leitura da Analytics API da Cloudflare. É opcional porque a
   * operação do SmartZap não depende dele; quando ausente, a interface mostra
   * somente as métricas que o próprio Worker consegue medir.
   */
  CLOUDFLARE_ANALYTICS_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_WORKER_NAME?: string;
  CLOUDFLARE_D1_DATABASE_ID?: string;
  MASTER_PASSWORD: string;
  META_APP_SECRET: string;
  META_VERIFY_TOKEN: string;
  WHATSAPP_TOKEN: string;
  FLOW_PRIVATE_KEY?: string;
  FLOW_PUBLIC_KEY?: string;
  FLOW_DATA_API_VERSION?: string;
  GOOGLE_CALENDAR_CLIENT_ID?: string;
  GOOGLE_CALENDAR_CLIENT_SECRET?: string;
  GOOGLE_CALENDAR_ENCRYPTION_KEY?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  SMARTZAP_API_KEY: string;
}

declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
