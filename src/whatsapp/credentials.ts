import { settingsDb } from '../db/settings'

import { DEFAULT_GRAPH_VERSION } from './client'

export type Credentials = {
  token: string; phoneId: string; wabaId: string; appId: string
  appSecret: string; callbackUrl: string; graphVersion: string
}
export async function getCredentials(env: Env): Promise<Credentials | null> {
  const s = settingsDb(env.DB)
  // Configuração operacional precisa de consistência imediata: trocar Phone ID ou
  // WABA não pode deixar outro POP enviando com os valores antigos do KV.
  const [phoneId, wabaId] = await Promise.all([
    s.get('whatsapp_phone_id'), s.get('whatsapp_waba_id'),
  ])
  // Segredo exclusivamente no binding criptografado do Worker; nunca em D1.
  const token = env.WHATSAPP_TOKEN ?? ''
  const appId = env.META_APP_ID ?? ''
  const appSecret = env.META_APP_SECRET ?? ''
  const callbackUrl = env.META_EXPECTED_CALLBACK_URL ?? ''
  if (!token) return null
  if (!appSecret) return null
  if (!phoneId) return null
  if (!/^\d{5,32}$/.test(appId)) return null
  try {
    if (new URL(callbackUrl).protocol !== 'https:') return null
  } catch { return null }
  if (!['development', 'test'].includes(env.ENVIRONMENT)) {
    if (!/^\d{5,32}$/.test(env.META_EXPECTED_PHONE_ID ?? '')
      || !/^\d{5,32}$/.test(env.META_EXPECTED_WABA_ID ?? '')) return null
    if (phoneId !== env.META_EXPECTED_PHONE_ID || wabaId !== env.META_EXPECTED_WABA_ID)
      return null
  }
  const graphVersion = env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION
  if (!/^v\d+\.\d+$/.test(graphVersion)) return null
  return { token, phoneId, wabaId: wabaId ?? '', appId, appSecret, callbackUrl, graphVersion }
}
