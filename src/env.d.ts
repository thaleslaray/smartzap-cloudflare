// Contrato legível dos bindings obrigatórios e módulos opcionais. `npm run types`
// gera somente os tipos do runtime em `worker-configuration.d.ts`, evitando
// incorporar valores de uma conta Cloudflare ao repositório público.
export {};

declare global {
interface SmartZapEnv {
  HYPERDRIVE?: Hyperdrive;
  DB: D1Database;
  MEDIA: R2Bucket;
  WEBHOOK_QUEUE: Queue<import("./api/webhook").MetaWebhookEvent>;
  AUTOMATION_QUEUE: Queue<import("./ai/automation").AutomationQueueEvent>;
  CAPI_QUEUE: Queue<import("./queue/conversion-consumer").ConversionQueueEvent>;
  CAPI_DLQ: Queue<import("./queue/conversion-consumer").ConversionDeadLetterEvent>;
  WEBHOOK_DLQ: Queue<unknown>;
  AUTOMATION_DLQ: Queue<unknown>;
  CAMPAIGN_WF: Workflow;
  SETUP_WF: Workflow<{ probe: string }>;
  REALTIME: DurableObjectNamespace<import("./do/RealtimeHub").RealtimeHub>;
  THROTTLE: DurableObjectNamespace<import("./do/PhoneThrottle").PhoneThrottle>;
  LOGIN_LIMITER: RateLimit;
  AI: Ai;
  AI_SEARCH: unknown;
  ENVIRONMENT: string;
  META_GRAPH_VERSION: string;
  /** Identidade imutável da release instalada, exibida no diagnóstico e no setup. */
  SMARTZAP_VERSION?: string;
  SMARTZAP_COMMIT?: string;
  SMARTZAP_SCHEMA_VERSION?: string;
  SMARTZAP_RELEASE_CHANNEL?: string;
  META_APP_ID?: string;
  META_EXPECTED_PHONE_ID?: string;
  META_EXPECTED_WABA_ID?: string;
  META_EXPECTED_CALLBACK_URL?: string;
  /** Conta autorizada para leitura agregada de Ads Insights. */
  META_AD_ACCOUNT_ID?: string;
  /** Compatibilidade exclusiva para testes antigos; não faz parte da operação. */
  PILOT_SEND_ENABLED?: string;
  PILOT_RECIPIENT_E164?: string;
  PILOT_RECIPIENT_ALLOWLIST?: string;
  PILOT_MAX_REAL_SENDS?: string;
  PILOT_MAX_RUNS_PER_DAY?: string;
  PILOT_TIME_WINDOW_ENABLED?: string;
  PILOT_SUPERVISED_OUTSIDE_WINDOW?: string;
  PILOT_TEMPLATE_ALLOWLIST?: string;
  INBOX_SEND_ENABLED?: string;
  INBOX_AUTOMATION_ENABLED?: string;
  AUTOMATION_QUEUE_NAME?: string;
  CAPI_QUEUE_NAME?: string;
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
  /** Chave raiz base64url de 256 bits. Existe somente como secret do Worker. */
  SMARTZAP_VAULT_KEY?: string;
  /** Chave temporária usada somente durante a rotação transacional do cofre. */
  SMARTZAP_VAULT_KEY_NEXT?: string;
  SETUP_REQUIRED?: string;
  /** Compatibilidade para instalações antigas; novas instalações usam o cofre. */
  META_APP_SECRET?: string;
  META_VERIFY_TOKEN?: string;
  WHATSAPP_TOKEN?: string;
  FLOW_PRIVATE_KEY?: string;
  FLOW_PUBLIC_KEY?: string;
  FLOW_DATA_API_VERSION?: string;
  GOOGLE_CALENDAR_CLIENT_ID?: string;
  GOOGLE_CALENDAR_CLIENT_SECRET?: string;
  GOOGLE_CALENDAR_ENCRYPTION_KEY?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  SMARTZAP_API_KEY?: string;
  /** Credencial de homologação remota; aceita somente GET/HEAD. */
  QA_READONLY_API_KEY?: string;
  /** Credencial mutável de fixtures; aceita somente em staging/teste. */
  QA_STAGING_MUTATION_API_KEY?: string;
}

interface Env extends SmartZapEnv {}

namespace Cloudflare {
  interface Env extends SmartZapEnv {}
}
}
