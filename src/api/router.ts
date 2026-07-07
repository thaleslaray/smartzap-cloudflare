import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { authRoutes } from './auth'

export function createApp() {
  const app = new Hono<{ Bindings: Env }>()
  // Handler global de erro: log JSON estruturado + resposta genérica (sem vazar stack)
  app.onError((err, c) => {
    console.error(JSON.stringify({
      level: 'error',
      path: new URL(c.req.url).pathname,
      method: c.req.method,
      message: err.message,
      stack: err.stack,
    }))
    return c.json({ error: 'erro interno' }, 500)
  })
  app.use('/api/*', requireAuth)
  app.get('/api/health', (c) => c.json({ ok: true }))
  app.route('/api/auth', authRoutes)
  // Rota provisória usada pelo teste de 401 — substituída na Task 5
  app.get('/api/contacts', (c) => c.json({ items: [] }))
  return app
}
