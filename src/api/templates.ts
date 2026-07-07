import { Hono } from 'hono'
import { templatesDb } from '../db/templates'
import { whatsappClient } from '../whatsapp/client'
import { getCredentials } from '../whatsapp/credentials'

export const templatesRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => c.json({ items: await templatesDb(c.env.DB).list() }))
  .post('/sync', async (c) => {
    const creds = await getCredentials(c.env)
    if (!creds?.wabaId) return c.json({ error: 'credenciais Meta não configuradas (settings)' }, 400)
    const templates = await whatsappClient(creds).fetchTemplates(creds.wabaId)
    await templatesDb(c.env.DB).upsertMany(templates)
    return c.json({ synced: templates.length })
  })
