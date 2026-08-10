import { whatsappClient, MetaApiRequestError, type MetaOperationalHealth } from './client'
import type { Credentials } from './credentials'

export type MetaProbe = {
  ok: boolean
  health: MetaOperationalHealth | null
  error: string | null
  code: number | null
  httpStatus: number | null
  fbtraceId: string | null
  verificationStatus: 'complete' | 'credential_invalid' | 'unavailable'
  retryable: boolean
}

function completedProbe(
  health: MetaOperationalHealth,
  error: string | null,
): MetaProbe {
  return {
    ok: error === null,
    health,
    error,
    code: null,
    httpStatus: null,
    fbtraceId: null,
    verificationStatus: 'complete',
    retryable: false,
  }
}

function isCredentialError(code: number, httpStatus: number): boolean {
  return code === 102 || code === 190 || (httpStatus === 401 && code !== 4)
}

function isRetryableProbeError(code: number, httpStatus: number): boolean {
  return (
    [4, 17, 32, 613, 130429].includes(code) ||
    httpStatus === 408 ||
    httpStatus === 429 ||
    httpStatus >= 500
  )
}

export async function probeMeta(creds: Credentials): Promise<MetaProbe> {
  try {
    const health = await whatsappClient(creds).checkOperational(creds.wabaId)
    if (!health.tokenValid) {
      return completedProbe(health, 'Token Meta inválido.')
    }
    if (!health.tokenAppMatches) {
      return completedProbe(health, 'Token Meta foi emitido para outro App ID.')
    }
    if (!health.tokenRequiredScopesPresent) {
      return completedProbe(health, 'Token Meta não possui os dois escopos obrigatórios do WhatsApp.')
    }
    if (health.tokenWabaTargeted === false) {
      return completedProbe(health, 'Escopo granular do token não inclui a WABA configurada.')
    }
    if (!health.phoneBelongsToWaba) {
      return completedProbe(health, 'O Phone Number ID não pertence à WABA configurada.')
    }
    if (!health.effectiveWebhookCallbackMatches) {
      return completedProbe(health, 'O callback efetivo do telefone não aponta para o Worker esperado.')
    }
    if (!health.appWebhookActive || !health.appWebhookMessagesSubscribed) {
      return completedProbe(health, 'O app não possui assinatura ativa do campo messages.')
    }
    if (health.phoneStatus !== 'CONNECTED') {
      return completedProbe(health, 'Número Meta não está CONNECTED.')
    }
    if (health.platformType !== 'CLOUD_API') {
      return completedProbe(health, 'Número Meta não usa CLOUD_API.')
    }
    if (health.accountMode !== 'LIVE') {
      return completedProbe(health, 'Número Meta não está em modo LIVE.')
    }
    if (health.qualityRating === 'RED') {
      return completedProbe(health, 'Qualidade do número está RED.')
    }
    // EXPIRED pode aparecer no código temporário de SMS/voz mesmo com o número
    // ainda CONNECTED/LIVE; não é prova suficiente de desconexão. Bloqueamos
    // somente estados que afirmam ausência de verificação.
    if (['UNVERIFIED', 'NOT_VERIFIED'].includes(health.codeVerificationStatus ?? '')) {
      return completedProbe(health, 'Número Meta não está verificado.')
    }
    if (!health.webhookSubscribed) {
      return completedProbe(health, 'O app configurado não está inscrito nos webhooks desta WABA.')
    }
    if (!health.webhookCallbackMatches) {
      return completedProbe(health, 'Override de callback da WABA não aponta para o Worker esperado.')
    }
    return completedProbe(health, null)
  } catch (error) {
    if (error instanceof MetaApiRequestError) {
      const credentialInvalid = isCredentialError(error.code, error.httpStatus)
      return {
        ok: false, health: null, error: error.message,
        code: error.code, httpStatus: error.httpStatus,
        fbtraceId: error.fbtraceId ?? null,
        verificationStatus: credentialInvalid ? 'credential_invalid' : 'unavailable',
        retryable: !credentialInvalid && isRetryableProbeError(error.code, error.httpStatus),
      }
    }
    return {
      ok: false,
      health: null,
      error: 'Falha inesperada ao validar a Meta.',
      code: null,
      httpStatus: null,
      fbtraceId: null,
      verificationStatus: 'unavailable',
      retryable: false,
    }
  }
}
