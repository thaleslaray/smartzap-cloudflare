import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { authRoutes } from './auth'
import { contactsRoutes } from './contacts'

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
  app.route('/api/contacts', contactsRoutes)
  return app
}
