import { Hono } from 'hono'
import { z } from 'zod'
import { consentEventsDb } from '../db/consent-events'
import { contactsDb } from '../db/contacts'
import { parseContactsCsv } from '../domain/csv-import'
import { normalizePhone } from '../domain/phone'

const PAGE_SIZE = 50
const MAX_IMPORT_ROWS = 20_000 // teto por request — acima disso, dividir o CSV
// Mesmo texto exibido ao lado do checkbox na UI — gravado como evidência do consentimento
const OPT_IN_DECLARATION =
  'Declaro que estes contatos consentiram em receber mensagens deste negócio via WhatsApp.'

export const contactsRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => {
    const q = c.req.query('q') || undefined
    const status = c.req.query('status') || undefined
    const page = Math.max(1, Number(c.req.query('page') ?? 1))
    const { items, total } = await contactsDb(c.env.DB).list({
      q, status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
    })
    return c.json({ items, total })
  })
  .post('/', async (c) => {
    const body = z.object({
      phone: z.string(),
      name: z.string().optional(),
      optInConfirmed: z.boolean().optional(),
    }).safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'payload inválido' }, 400)
    // Mesmo controle LGPD do import: opt_in só nasce de declaração explícita
    if (body.data.optInConfirmed !== true)
      return c.json({ error: 'declaração de opt-in é obrigatória para cadastrar' }, 400)
    const phone = normalizePhone(body.data.phone)
    if (!phone) return c.json({ error: 'telefone inválido (esperado E.164 ou nacional BR)' }, 400)
    const contact = await contactsDb(c.env.DB).create({ phone, name: body.data.name, status: 'opt_in' })
    await consentEventsDb(c.env.DB).record({ source: 'manual', declarationText: OPT_IN_DECLARATION, contactCount: 1 })
    return c.json(contact, 201)
  })
  .post('/import', async (c) => {
    const body = z.object({
      csv: z.string().min(1),
      mapping: z.object({ phone: z.string(), name: z.string().optional() }),
      optInConfirmed: z.boolean(),
    }).safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'payload inválido' }, 400)
    // LGPD art. 7º + política anti-spam da Meta: consentimento é pré-condição, não detalhe
    if (body.data.optInConfirmed !== true)
      return c.json({ error: 'declaração de opt-in é obrigatória para importar' }, 400)
    const parsed = parseContactsCsv(body.data.csv, body.data.mapping)
    if (parsed.valid.length > MAX_IMPORT_ROWS)
      return c.json({ error: `CSV excede o teto de ${MAX_IMPORT_ROWS} linhas válidas por import — divida o arquivo` }, 413)
    const imported = await contactsDb(c.env.DB).bulkInsert(parsed.valid, 'opt_in')
    await consentEventsDb(c.env.DB).record({ source: 'import', declarationText: OPT_IN_DECLARATION, contactCount: imported })
    return c.json({ imported, duplicates: parsed.duplicates, invalid: parsed.invalid.length })
  })
  .post('/bulk-status', async (c) => {
    const body = z.object({ ids: z.array(z.string()).min(1), status: z.enum(['opt_in', 'opt_out', 'unknown']) })
      .safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'payload inválido' }, 400)
    await contactsDb(c.env.DB).setStatus(body.data.ids, body.data.status)
    return c.json({ ok: true })
  })
