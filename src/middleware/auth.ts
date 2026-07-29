import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { hashSessionToken } from '../domain/session'

const PUBLIC = new Set(['/api/health', '/api/auth/login', '/api/auth/config'])

// Comparação timing-safe canônica: digere os dois lados (SHA-256) para igualar os
// comprimentos — sem early-return que vaze o tamanho do secret — e compara com
// crypto.subtle.timingSafeEqual do runtime Workers.
export async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  // Cast local: lib.dom.d.ts (carregada por padrão) sombreia o SubtleCrypto do runtime
  // Workers (worker-configuration.d.ts) e omite timingSafeEqual no tipo resultante —
  // o método existe em runtime (workerd), só falta no tipo.
  const subtle = crypto.subtle as unknown as { timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean }
  return subtle.timingSafeEqual(da, db)
}

export async function requireAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const path = new URL(c.req.url).pathname
  if (PUBLIC.has(path)) return next()

  // 1) API key (Bearer ou X-API-Key), comparação timing-safe
  const key = c.req.header('x-api-key') ?? c.req.header('authorization')?.replace(/^Bearer /, '')
  if (key && c.env.SMARTZAP_API_KEY && (await timingSafeEqualStr(key, c.env.SMARTZAP_API_KEY))) return next()

  // 2) Sessão revogável com consistência forte no D1. O token bruto nunca é persistido.
  const token = getCookie(c, 'smartzap_session')
  if (token) {
    const row = await c.env.DB.prepare(
      'SELECT 1 AS ok FROM sessions WHERE token_hash = ?1 AND expires_at > unixepoch()'
    ).bind(await hashSessionToken(token)).first<{ ok: number }>()
    if (row?.ok === 1) return next()
  }

  return c.json({ error: 'não autenticado' }, 401)
}
