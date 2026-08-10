import { settingsDb } from '../db/settings'
import { META_VAULT_RECORD, readVaultJson } from '../security/vault'

import { DEFAULT_GRAPH_VERSION } from './client'

export type MetaSecrets = {
  token: string
  appId: string
  appSecret: string
  verifyToken: string
  callbackUrl: string
  graphVersion: string
}

export type Credentials = {
  token: string; phoneId: string; wabaId: string; appId: string
  appSecret: string; verifyToken?: string; callbackUrl: string; graphVersion: string
}

function validMetaSecrets(value: Partial<MetaSecrets> | null): value is MetaSecrets {
  if (!value?.token || !value.appSecret || !value.verifyToken) return false
  if (!/^\d{5,32}$/.test(value.appId ?? '')) return false
  if (!/^v\d+\.\d+$/.test(value.graphVersion ?? '')) return false
  try {
    return new URL(value.callbackUrl ?? '').protocol === 'https:'
  } catch {
    return false
  }
}

export async function getMetaSecrets(env: Env): Promise<MetaSecrets | null> {
  const candidateKeys = [env.SMARTZAP_VAULT_KEY, env.SMARTZAP_VAULT_KEY_NEXT]
    .filter((key): key is string => Boolean(key))
  for (const key of candidateKeys) {
    try {
      const stored = await readVaultJson<Partial<MetaSecrets>>(env.DB, key, META_VAULT_RECORD)
      if (validMetaSecrets(stored)) return stored
    } catch {
      // Durante a janela de rotação, uma das duas chaves necessariamente falhará.
    }
  }
  const legacy: Partial<MetaSecrets> = {
    token: env.WHATSAPP_TOKEN,
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    verifyToken: env.META_VERIFY_TOKEN,
    callbackUrl: env.META_EXPECTED_CALLBACK_URL,
    graphVersion: env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION,
  }
  if (validMetaSecrets(legacy)) return legacy
  return null
}

export async function getCredentials(env: Env): Promise<Credentials | null> {
  const s = settingsDb(env.DB)
  // Configuração operacional precisa de consistência imediata: trocar Phone ID ou
  // WABA não pode deixar outro POP enviando com os valores antigos do KV.
  const [phoneId, wabaId] = await Promise.all([
    s.get('whatsapp_phone_id'), s.get('whatsapp_waba_id'),
  ])
  const meta = await getMetaSecrets(env)
  if (!meta) return null
  if (!phoneId) return null
  if (!['development', 'test'].includes(env.ENVIRONMENT)) {
    const expectedPhone = env.META_EXPECTED_PHONE_ID?.trim()
    const expectedWaba = env.META_EXPECTED_WABA_ID?.trim()
    if (expectedPhone && phoneId !== expectedPhone) return null
    if (expectedWaba && wabaId !== expectedWaba)
      return null
  }
  return {
    token: meta.token,
    phoneId,
    wabaId: wabaId ?? '',
    appId: meta.appId,
    appSecret: meta.appSecret,
    verifyToken: meta.verifyToken,
    callbackUrl: meta.callbackUrl,
    graphVersion: meta.graphVersion,
  }
}
