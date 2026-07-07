import { Hono } from 'hono'
import { z } from 'zod'
import { verifyMetaSignature } from '../whatsapp/webhook-verify'
import { timingSafeEqualStr } from '../middleware/auth'

// Validação na fronteira: só statuses bem-formados entram na Queue
export const MetaStatusSchema = z.object({
  id: z.string(), status: z.string(), timestamp: z.string(), recipient_id: z.string(),
})
export type MetaStatus = z.infer<typeof MetaStatusSchema>

type MetaWebhook = { entry?: { changes?: { value?: { statuses?: unknown[] } }[] }[] }

export const webhookRoutes = new Hono<{ Bindings: Env }>()
  // Verificação inicial da Meta (GET com hub.challenge). O verify token é um
  // secret DEDICADO de baixo sigilo (digitado no painel da Meta) — nunca o
  // META_APP_SECRET, que é a chave HMAC. Comparação em tempo constante.
  .get('/', async (c) => {
    const mode = c.req.query('hub.mode')
    const token = c.req.query('hub.verify_token')
    const challenge = c.req.query('hub.challenge')
    if (mode === 'subscribe' && token && challenge
      && (await timingSafeEqualStr(token, c.env.META_VERIFY_TOKEN)))
      return c.text(challenge)
    return c.text('forbidden', 403)
  })
  // Eventos: valida HMAC, extrai/valida os statuses e responde 200 rápido;
  // o processamento pesado fica no consumer da Queue
  .post('/', async (c) => {
    const raw = await c.req.text()
    const ok = await verifyMetaSignature(
      c.env.META_APP_SECRET, raw, c.req.header('x-hub-signature-256') ?? null)
    if (!ok) return c.json({ error: 'assinatura inválida' }, 401)

    // Cada mensagem enfileirada é um MetaStatus pequeno e tipado — o payload
    // agregado da Meta (que pode ser grande) nunca encosta no limite de
    // 128 KB/msg da Queue. Statuses inválidos são descartados com log.
    const payload = JSON.parse(raw) as MetaWebhook
    const statuses: MetaStatus[] = []
    for (const entry of payload.entry ?? [])
      for (const change of entry.changes ?? [])
        for (const s of change.value?.statuses ?? []) {
          const parsed = MetaStatusSchema.safeParse(s)
          if (parsed.success) statuses.push(parsed.data)
          else console.warn('[webhook] status inválido descartado', parsed.error.issues)
        }

    // sendBatch aceita no máximo 100 mensagens por chamada → fatias de 100
    for (let i = 0; i < statuses.length; i += 100) {
      await c.env.WEBHOOK_QUEUE.sendBatch(
        statuses.slice(i, i + 100).map((s) => ({ body: s })))
    }
    return c.json({ ok: true })
  })
