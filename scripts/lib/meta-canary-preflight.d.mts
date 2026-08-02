export type MetaCallbackHealth = {
  meta?: {
    appWebhookCallbackUrl?: string | null;
    webhookCallbackUrl?: string | null;
    phoneWebhookCallbackUrl?: string | null;
    effectiveWebhookCallbackUrl?: string | null;
  } | null;
};

export type MetaCallbackPreflight = {
  expectedCallbackUrl: string;
  callbackUrl: string | null;
  appCallbackUrl: string | null;
  wabaCallbackUrl: string | null;
  phoneCallbackUrl: string | null;
  effectiveCallbackUrl: string | null;
  callbackMatchesStaging: boolean;
};

export function resolveMetaCallbackPreflight(
  health: MetaCallbackHealth,
  baseUrl: string,
): MetaCallbackPreflight;
