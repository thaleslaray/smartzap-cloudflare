export const META_STAGING_CALLBACK_URL =
  'https://smartzap-staging.example.workers.dev/webhook'
export const META_PRODUCTION_CALLBACK_URL =
  'https://smartzap.example.workers.dev/webhook'

export type QaMetaCallbackTarget = 'staging' | 'production'

export type QaMetaCallbackResolution =
  | { ok: true; url: string; target: QaMetaCallbackTarget | null }
  | { ok: false; status: 400 | 403; error: string }

/**
 * A troca de callback é um mecanismo operacional exclusivo do canário.
 * Nunca aceitamos uma URL recebida do cliente: somente os dois Workers
 * canônicos e somente quando a chamada está rodando no ambiente staging.
 */
export function resolveQaMetaCallbackUrl(
  environment: string,
  target: unknown,
  configuredUrl: string,
): QaMetaCallbackResolution {
  if (target === undefined) return { ok: true, url: configuredUrl, target: null }
  if (environment !== 'staging') {
    return {
      ok: false,
      status: 403,
      error: 'troca de callback disponível somente no staging',
    }
  }
  if (target === 'staging') {
    return { ok: true, url: META_STAGING_CALLBACK_URL, target }
  }
  if (target === 'production') {
    return { ok: true, url: META_PRODUCTION_CALLBACK_URL, target }
  }
  return {
    ok: false,
    status: 400,
    error: 'destino de callback inválido; use staging ou production',
  }
}
