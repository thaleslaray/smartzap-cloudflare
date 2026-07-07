import { settingsDb } from '../db/settings'

const CACHE_KEY = 'creds:v1'
const CACHE_TTL = 60 // segundos — mesmo comportamento do produto antigo

export type Credentials = { token: string; phoneId: string; wabaId: string }
type CachedIds = { phoneId: string; wabaId: string }

// O cache KV guarda APENAS {phoneId, wabaId}. O token é lido de D1/env a cada
// chamada: KV replica globalmente e o secret não deve ganhar mais uma cópia em repouso.
export async function getCredentials(env: Env): Promise<Credentials | null> {
  const s = settingsDb(env.DB)
  const token = (await s.get('whatsapp_token')) ?? env.WHATSAPP_TOKEN ?? ''
  if (!token) return null

  const cached = await env.CACHE.get<CachedIds>(CACHE_KEY, 'json')
  if (cached?.phoneId) return { token, ...cached }

  const [phoneId, wabaId] = await Promise.all([
    s.get('whatsapp_phone_id'), s.get('whatsapp_waba_id'),
  ])
  const ids: CachedIds = { phoneId: phoneId ?? '', wabaId: wabaId ?? '' }
  if (!ids.phoneId) return null
  await env.CACHE.put(CACHE_KEY, JSON.stringify(ids), { expirationTtl: CACHE_TTL })
  return { token, ...ids }
}

export async function invalidateCredentials(env: Env) {
  await env.CACHE.delete(CACHE_KEY)
}
