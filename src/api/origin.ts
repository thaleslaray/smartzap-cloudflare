import type { Context } from 'hono'

// Defesa CSRF em profundidade (além do cookie SameSite=Lax): se o navegador
// enviou Origin e o host difere do host da própria request, recusa com 403.
// Requests sem Origin (curl, integrações com API key) passam normalmente.
export function assertSameOrigin(c: Context): Response | null {
  const origin = c.req.header('origin')
  if (!origin) return null
  try {
    if (new URL(origin).host === new URL(c.req.url).host) return null
  } catch { /* Origin malformado → recusa */ }
  return c.json({ error: 'origin não permitida' }, 403)
}
