import { Hono } from 'hono'
import { z } from 'zod'
import { readJsonBody } from './body'

const IdSchema = z.string().uuid()
const PermissionsSchema = z.object({
  canView: z.boolean(), canReply: z.boolean(), canHandoff: z.boolean(),
}).strict()
const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  permissions: PermissionsSchema.optional(),
  expires_at: z.string().datetime().nullable().optional(),
}).strict()
const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  permissions: PermissionsSchema.optional(),
  is_active: z.boolean().optional(),
  expires_at: z.string().datetime().nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'atualização vazia')

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function publicRow(row: Record<string, unknown>) {
  let permissions = { canView: true, canReply: true, canHandoff: false }
  try { permissions = JSON.parse(String(row.permissions_json)) } catch { /* usa padrão seguro */ }
  const { permissions_json: _permissions, ...rest } = row
  return { ...rest, is_active: Boolean(row.is_active), permissions }
}

export const attendantsRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => {
    const rows = (await c.env.DB.prepare(
      'SELECT * FROM attendant_tokens ORDER BY created_at DESC, id DESC',
    ).all()).results
    return c.json(rows.map((row) => publicRow(row)))
  })
  .post('/', async (c) => {
    const raw = await readJsonBody(c, 8_192)
    if (!raw.ok) return c.json({ error: raw.error }, raw.status)
    const body = CreateSchema.safeParse(raw.value)
    if (!body.success) return c.json({ error: 'atendente inválido' }, 400)
    const id = crypto.randomUUID()
    const permissions = body.data.permissions ?? { canView: true, canReply: true, canHandoff: false }
    await c.env.DB.prepare(
      `INSERT INTO attendant_tokens (id, name, token, permissions_json, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(id, body.data.name, token(), JSON.stringify(permissions), body.data.expires_at ?? null).run()
    const row = await c.env.DB.prepare('SELECT * FROM attendant_tokens WHERE id = ?1').bind(id).first<Record<string, unknown>>()
    return c.json(publicRow(row!), 201)
  })
  .patch('/:id', async (c) => {
    const id = IdSchema.safeParse(c.req.param('id'))
    if (!id.success) return c.json({ error: 'atendente inválido' }, 400)
    const raw = await readJsonBody(c, 8_192)
    if (!raw.ok) return c.json({ error: raw.error }, raw.status)
    const body = UpdateSchema.safeParse(raw.value)
    if (!body.success) return c.json({ error: 'atualização inválida' }, 400)
    const fields: string[] = []; const values: unknown[] = []
    const add = (field: string, value: unknown) => { values.push(value); fields.push(`${field} = ?${values.length}`) }
    if (body.data.name !== undefined) add('name', body.data.name)
    if (body.data.permissions !== undefined) add('permissions_json', JSON.stringify(body.data.permissions))
    if (body.data.is_active !== undefined) add('is_active', body.data.is_active ? 1 : 0)
    if (body.data.expires_at !== undefined) add('expires_at', body.data.expires_at)
    fields.push("updated_at = datetime('now')"); values.push(id.data)
    const result = await c.env.DB.prepare(`UPDATE attendant_tokens SET ${fields.join(', ')} WHERE id = ?${values.length}`).bind(...values).run()
    if (result.meta.changes !== 1) return c.json({ error: 'atendente não encontrado' }, 404)
    const row = await c.env.DB.prepare('SELECT * FROM attendant_tokens WHERE id = ?1').bind(id.data).first<Record<string, unknown>>()
    return c.json(publicRow(row!))
  })
  .delete('/:id', async (c) => {
    const id = IdSchema.safeParse(c.req.param('id'))
    if (!id.success) return c.json({ error: 'atendente inválido' }, 400)
    const result = await c.env.DB.prepare('DELETE FROM attendant_tokens WHERE id = ?1').bind(id.data).run()
    return result.meta.changes === 1 ? c.json({ success: true }) : c.json({ error: 'atendente não encontrado' }, 404)
  })
