import { whatsappClient, MetaApiRequestError, type MetaOperationalHealth } from './client'
import type { Credentials } from './credentials'

export type MetaProbe = {
  ok: boolean
  health: MetaOperationalHealth | null
  error: string | null
  code: number | null
  fbtraceId: string | null
}

export async function probeMeta(creds: Credentials): Promise<MetaProbe> {
  try {
    const health = await whatsappClient(creds).checkOperational(creds.wabaId)
    if (!health.tokenValid) {
      return { ok: false, health, error: 'Token Meta inválido.', code: null, fbtraceId: null }
    }
    if (!health.tokenAppMatches) {
      return { ok: false, health, error: 'Token Meta foi emitido para outro App ID.', code: null, fbtraceId: null }
    }
    if (!health.tokenRequiredScopesPresent) {
      return { ok: false, health, error: 'Token Meta não possui os dois escopos obrigatórios do WhatsApp.', code: null, fbtraceId: null }
    }
    if (health.tokenWabaTargeted === false) {
      return { ok: false, health, error: 'Escopo granular do token não inclui a WABA configurada.', code: null, fbtraceId: null }
    }
    if (!health.phoneBelongsToWaba) {
      return { ok: false, health, error: 'O Phone Number ID não pertence à WABA configurada.', code: null, fbtraceId: null }
    }
    if (!health.effectiveWebhookCallbackMatches) {
      return { ok: false, health, error: 'O callback efetivo do telefone não aponta para o Worker esperado.', code: null, fbtraceId: null }
    }
    if (!health.appWebhookActive || !health.appWebhookMessagesSubscribed) {
      return { ok: false, health, error: 'O app não possui assinatura ativa do campo messages.', code: null, fbtraceId: null }
    }
    if (health.phoneStatus !== 'CONNECTED') {
      return { ok: false, health, error: 'Número Meta não está CONNECTED.', code: null, fbtraceId: null }
    }
    if (health.platformType !== 'CLOUD_API') {
      return { ok: false, health, error: 'Número Meta não usa CLOUD_API.', code: null, fbtraceId: null }
    }
    if (health.accountMode !== 'LIVE') {
      return { ok: false, health, error: 'Número Meta não está em modo LIVE.', code: null, fbtraceId: null }
    }
    if (health.qualityRating === 'RED') {
      return { ok: false, health, error: 'Qualidade do número está RED.', code: null, fbtraceId: null }
    }
    // EXPIRED pode aparecer no código temporário de SMS/voz mesmo com o número
    // ainda CONNECTED/LIVE; não é prova suficiente de desconexão. Bloqueamos
    // somente estados que afirmam ausência de verificação.
    if (['UNVERIFIED', 'NOT_VERIFIED'].includes(health.codeVerificationStatus ?? '')) {
      return { ok: false, health, error: 'Número Meta não está verificado.', code: null, fbtraceId: null }
    }
    if (!health.webhookSubscribed) {
      return { ok: false, health, error: 'O app configurado não está inscrito nos webhooks desta WABA.', code: null, fbtraceId: null }
    }
    if (!health.webhookCallbackMatches) {
      return { ok: false, health, error: 'Override de callback da WABA não aponta para o Worker esperado.', code: null, fbtraceId: null }
    }
    return { ok: true, health, error: null, code: null, fbtraceId: null }
  } catch (error) {
    if (error instanceof MetaApiRequestError) {
      return {
        ok: false, health: null, error: error.message,
        code: error.code, fbtraceId: error.fbtraceId ?? null,
      }
    }
    return { ok: false, health: null, error: 'Falha inesperada ao validar a Meta.', code: null, fbtraceId: null }
  }
}
