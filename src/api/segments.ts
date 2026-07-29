import { Hono } from 'hono'
import { z } from 'zod'
import { segmentsDb } from '../db/segments'
import { audienceSegmentRulesSchema, segmentRulesSchema } from '../domain/segments'
import { readJsonBody } from './body'

const segmentBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  rules: segmentRulesSchema,
}).strict()
const audienceBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  rules: audienceSegmentRulesSchema,
}).strict()

async function parseBody(c: Parameters<typeof readJsonBody>[0]) {
  const raw = await readJsonBody(c, 64_000)
  if (!raw.ok) return raw
  const parsed = segmentBodySchema.safeParse(raw.value)
  return parsed.success
    ? { ok: true as const, value: parsed.data }
    : { ok: false as const, status: 400 as const, error: 'segmento inválido' }
}

export const segmentsRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => c.json({ items: await segmentsDb(c.env.DB).list() }))
  .post('/preview', async (c) => {
    const raw = await readJsonBody(c, 64_000)
    if (!raw.ok) return c.json({ error: raw.error }, raw.status)
    const rules = segmentRulesSchema.safeParse(raw.value)
    if (!rules.success) return c.json({ error: 'regras de segmento inválidas' }, 400)
    return c.json(await segmentsDb(c.env.DB).preview(rules.data))
  })
  .post('/from-audience', async (c) => {
    const raw = await readJsonBody(c, 64_000)
    if (!raw.ok) return c.json({ error: raw.error }, raw.status)
    const body = audienceBodySchema.safeParse(raw.value)
    if (!body.success) return c.json({ error: 'público salvo inválido' }, 400)
    try { return c.json(await segmentsDb(c.env.DB).createAudience(body.data), 201) }
    catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message))
        return c.json({ error: 'já existe um público salvo com esse nome' }, 409)
      throw error
    }
  })
  .post('/', async (c) => {
    const body = await parseBody(c)
    if (!body.ok) return c.json({ error: body.error }, body.status)
    try { return c.json(await segmentsDb(c.env.DB).create(body.value), 201) }
    catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message))
        return c.json({ error: 'já existe um segmento com esse nome' }, 409)
      throw error
    }
  })
  .put('/:id', async (c) => {
    const body = await parseBody(c)
    if (!body.ok) return c.json({ error: body.error }, body.status)
    const updated = await segmentsDb(c.env.DB).update(c.req.param('id'), body.value)
    return updated ? c.json(updated) : c.json({ error: 'segmento não encontrado' }, 404)
  })
  .delete('/:id', async (c) => {
    const removed = await segmentsDb(c.env.DB).remove(c.req.param('id'))
    return removed ? c.json({ ok: true }) : c.json({ error: 'segmento não encontrado' }, 404)
  })
