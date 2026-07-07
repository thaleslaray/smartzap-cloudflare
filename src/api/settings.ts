import { Hono } from 'hono'
import { z } from 'zod'
import { settingsDb } from '../db/settings'
import { invalidateCredentials } from '../whatsapp/credentials'

// Schema por campo: throttle_mps é numérico com teto (string livre viraria NaN
// e desativaria o throttle no workflow). Os demais seguem como string.
const PutSchema = z.object({
  whatsapp_token: z.string().min(1).optional(),
  whatsapp_phone_id: z.string().optional(),
  whatsapp_waba_id: z.string().optional(),
  throttle_mps: z.coerce.number().int().positive().max(80).optional(),
})

export const settingsRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => {
    const s = settingsDb(c.env.DB)
    return c.json({
      // Token NUNCA sai da API — nem prefixo; só o fato de existir
      whatsapp_token: { configured: Boolean(await s.get('whatsapp_token')) },
      whatsapp_phone_id: await s.get('whatsapp_phone_id'),
      whatsapp_waba_id: await s.get('whatsapp_waba_id'),
      throttle_mps: await s.get('throttle_mps'),
    })
  })
  .put('/', async (c) => {
    const body = PutSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'payload inválido' }, 400)
    const s = settingsDb(c.env.DB)
    for (const [k, v] of Object.entries(body.data)) {
      if (v === undefined) continue
      await s.set(k, String(v))
    }
    await invalidateCredentials(c.env)
    return c.json({ ok: true })
  })
