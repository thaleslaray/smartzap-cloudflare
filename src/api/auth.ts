import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { timingSafeEqualStr } from '../middleware/auth'

const SESSION_TTL = 60 * 60 * 24 * 7 // 7 dias

async function verifyTurnstile(env: Env, token: string | undefined, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) {
    // Fail-closed: produção sem secret é erro de configuração, nunca bypass silencioso
    if (env.ENVIRONMENT === 'production') {
      console.error(JSON.stringify({ level: 'error', msg: 'TURNSTILE_SECRET ausente em produção — login bloqueado' }))
      return false
    }
    return true // bypass explícito fora de produção (dev/test)
  }
  if (!token) return false
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
  })
  const data = (await res.json()) as { success: boolean }
  return data.success
}

export const authRoutes = new Hono<{ Bindings: Env }>()
  .post('/login', async (c) => {
    const ip = c.req.header('cf-connecting-ip') ?? 'local'
    const { success } = await c.env.LOGIN_LIMITER.limit({ key: ip })
    if (!success) return c.json({ error: 'muitas tentativas, aguarde' }, 429)

    const body = await c.req.json<{ password?: string; turnstileToken?: string }>().catch(() => ({}) as never)
    if (!(await verifyTurnstile(c.env, body.turnstileToken, ip)))
      return c.json({ error: 'verificação anti-bot falhou' }, 403)
    if (!body.password || !(await timingSafeEqualStr(body.password, c.env.MASTER_PASSWORD)))
      return c.json({ error: 'senha incorreta' }, 401)

    const token = crypto.randomUUID()
    await c.env.CACHE.put(`session:${token}`, '1', { expirationTtl: SESSION_TTL })
    setCookie(c, 'smartzap_session', token, {
      httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: SESSION_TTL,
    })
    return c.json({ ok: true })
  })
  .post('/logout', async (c) => {
    const token = getCookie(c, 'smartzap_session')
    if (token) await c.env.CACHE.delete(`session:${token}`)
    deleteCookie(c, 'smartzap_session', { path: '/' })
    return c.json({ ok: true })
  })
  .get('/status', async (c) => {
    // requireAuth já passou: se chegou aqui autenticado por cookie ou API key
    return c.json({ authenticated: true })
  })
