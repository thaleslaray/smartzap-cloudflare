import { Hono } from 'hono'
import { z } from 'zod'
import { campaignsDb } from '../db/campaigns'
import { campaignContactsDb } from '../db/campaign-contacts'
import { templatesDb } from '../db/templates'
import { resolveAudience } from '../domain/audience'
import { estimateCampaignCostBRL } from '../domain/pricing'
import { assertSameOrigin } from './origin'

const audienceSchema = z.object({ tags: z.array(z.string()).optional() })

// templatesDb.get() não anota o shape da linha retornada — cast local só para os
// campos que este arquivo lê (category, status), sem alterar o db de templates (Task 7).
type TemplateRow = { category: string; status: string }

// Binding mínimo de Workflows — interface estreita para as funções de controle
// serem testáveis com fake (o binding real `env.CAMPAIGN_WF` a satisfaz por estrutura)
export type WorkflowBinding = {
  get(id: string): Promise<{ pause(): Promise<void>; resume(): Promise<void>; terminate(): Promise<void> }>
}
type ControlResult = { ok: true } | { ok: false; status: 404 | 409; error: string }

export async function cancelCampaign(db: D1Database, wf: WorkflowBinding, id: string): Promise<ControlResult> {
  const cdb = campaignsDb(db)
  const campaign = await cdb.get(id)
  if (!campaign) return { ok: false, status: 404, error: 'campanha não encontrada' }
  await cdb.setStatus(campaign.id, 'cancelled') // Workflow checa a flag a cada batch
  if (campaign.workflow_id) {
    try { await (await wf.get(campaign.workflow_id)).terminate() } catch { /* já finalizado */ }
  }
  return { ok: true }
}

export async function pauseCampaign(db: D1Database, wf: WorkflowBinding, id: string): Promise<ControlResult> {
  const cdb = campaignsDb(db)
  const campaign = await cdb.get(id)
  if (!campaign?.workflow_id) return { ok: false, status: 409, error: 'campanha sem workflow ativo' }
  await (await wf.get(campaign.workflow_id)).pause()
  await cdb.setStatus(campaign.id, 'paused')
  return { ok: true }
}

export async function resumeCampaign(db: D1Database, wf: WorkflowBinding, id: string): Promise<ControlResult> {
  const cdb = campaignsDb(db)
  const campaign = await cdb.get(id)
  if (!campaign?.workflow_id) return { ok: false, status: 409, error: 'campanha sem workflow ativo' }
  await (await wf.get(campaign.workflow_id)).resume()
  await cdb.setStatus(campaign.id, 'sending')
  return { ok: true }
}

export const campaignsRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => c.json({ items: await campaignsDb(c.env.DB).list() }))
  .post('/', async (c) => {
    const body = z.object({
      name: z.string().min(1), template_name: z.string().min(1),
      scheduled_at: z.string().datetime().optional(),
    }).safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'payload inválido' }, 400)
    const template = await templatesDb(c.env.DB).get(body.data.template_name)
    if (!template) return c.json({ error: 'template não encontrado — sincronize com a Meta' }, 400)
    const campaign = await campaignsDb(c.env.DB).create(body.data)
    return c.json(campaign, 201)
  })
  .get('/:id', async (c) => {
    const campaign = await campaignsDb(c.env.DB).get(c.req.param('id'))
    if (!campaign) return c.json({ error: 'campanha não encontrada' }, 404)
    const template = await templatesDb(c.env.DB).get(campaign.template_name) as TemplateRow | null
    const cost = estimateCampaignCostBRL(String(template?.category ?? 'MARKETING'), campaign.total)
    return c.json({ ...campaign, cost: { unit: cost.unit, estimated: cost.total, real: cost.unit * campaign.sent } })
  })
  .get('/:id/contacts', async (c) => {
    const page = Math.max(1, Number(c.req.query('page') ?? 1))
    return c.json({ items: await campaignContactsDb(c.env.DB).listByCampaign(c.req.param('id'), page) })
  })
  .post('/:id/estimate', async (c) => {
    const campaign = await campaignsDb(c.env.DB).get(c.req.param('id'))
    if (!campaign) return c.json({ error: 'campanha não encontrada' }, 404)
    const body = audienceSchema.safeParse(await c.req.json().catch(() => ({})))
    const { eligible, skipped } = await resolveAudience(c.env.DB, body.success ? body.data : {})
    const template = await templatesDb(c.env.DB).get(campaign.template_name) as TemplateRow | null
    const { unit, total } = estimateCampaignCostBRL(String(template?.category ?? 'MARKETING'), eligible.length)
    return c.json({ recipients: eligible.length, skipped, unit, total })
  })
  .post('/:id/dispatch', async (c) => {
    const denied = assertSameOrigin(c) // mutação sensível: Origin cross-site → 403
    if (denied) return denied
    const id = c.req.param('id')
    const cdb = campaignsDb(c.env.DB)
    const campaign = await cdb.get(id)
    if (!campaign) return c.json({ error: 'campanha não encontrada' }, 404)
    if (!['draft', 'scheduled'].includes(campaign.status))
      return c.json({ error: `campanha em status ${campaign.status} não pode ser disparada` }, 409)
    const template = await templatesDb(c.env.DB).get(campaign.template_name) as TemplateRow | null
    if (!template || template.status !== 'APPROVED')
      return c.json({ error: 'template não aprovado pela Meta' }, 400)

    const body = audienceSchema.safeParse(await c.req.json().catch(() => ({})))
    const { eligible } = await resolveAudience(c.env.DB, body.success ? body.data : {})
    if (!eligible.length) return c.json({ error: 'audiência vazia (nenhum contato opt-in elegível)' }, 400)

    await campaignContactsDb(c.env.DB).bulkInsert(id,
      eligible.map((e) => ({ contactId: e.id, phone: e.phone, status: 'pending' as const })))
    await cdb.setTotal(id, eligible.length)
    await cdb.setStatus(id, campaign.scheduled_at ? 'scheduled' : 'sending')

    const instance = await c.env.CAMPAIGN_WF.create({ params: { campaignId: id } })
    await cdb.setWorkflowId(id, instance.id)
    return c.json({ workflowId: instance.id }, 202)
  })
  .post('/:id/cancel', async (c) => {
    const denied = assertSameOrigin(c) // mutação sensível: Origin cross-site → 403
    if (denied) return denied
    const r = await cancelCampaign(c.env.DB, c.env.CAMPAIGN_WF, c.req.param('id'))
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status)
  })
  .post('/:id/pause', async (c) => {
    const r = await pauseCampaign(c.env.DB, c.env.CAMPAIGN_WF, c.req.param('id'))
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status)
  })
  .post('/:id/resume', async (c) => {
    const r = await resumeCampaign(c.env.DB, c.env.CAMPAIGN_WF, c.req.param('id'))
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status)
  })
