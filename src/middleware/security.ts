import type { Context, Next } from 'hono'

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self' ws: wss:",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "frame-src https://challenges.cloudflare.com",
].join('; ')

export async function securityHeaders(c: Context, next: Next) {
  await next()
  c.header('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Cross-Origin-Opener-Policy', 'same-origin')
  c.header('Cross-Origin-Resource-Policy', 'same-origin')
  if (new URL(c.req.url).protocol === 'https:')
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  if (new URL(c.req.url).pathname.startsWith('/api/') || new URL(c.req.url).pathname === '/webhook')
    c.header('Cache-Control', 'no-store')
}
