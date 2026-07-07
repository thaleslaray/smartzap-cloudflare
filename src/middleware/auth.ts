import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'

const PUBLIC = new Set(['/api/health', '/api/auth/login'])

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

  // 2) Sessão: valor do cookie validado contra o KV (não só presença)
  const token = getCookie(c, 'smartzap_session')
  if (token && (await c.env.CACHE.get(`session:${token}`))) return next()

  return c.json({ error: 'não autenticado' }, 401)
}
