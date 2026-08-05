import { Hono } from 'hono'
import { templatesDb } from '../db/templates'
import { whatsappClient } from '../whatsapp/client'
import { getCredentials } from '../whatsapp/credentials'
import { templateRequiresParameters } from '../domain/template'
import { templateDraftsDb } from '../db/template-drafts'
import { readJsonBody } from './body'
import { z } from 'zod'
import {
  SIMPLE_TEMPLATE_CATEGORIES,
  isSimpleTemplateCategory,
  isSimpleTemplateSendSupported,
  validateMetaTemplateComponents,
  validateSimpleTemplateButtons,
} from '../../shared/template-validation'

const componentSchema = z.object({ type: z.string().min(1).max(32), format: z.string().max(32).optional(), text: z.string().max(1024).optional(), buttons: z.array(z.record(z.string(), z.unknown())).max(10).optional() }).passthrough()
const draftSchema = z.object({ name: z.string().trim().regex(/^[a-z0-9_]{1,512}$/), language: z.string().trim().regex(/^[a-z]{2}_[A-Z]{2}$/), category: z.enum(SIMPLE_TEMPLATE_CATEGORIES), components: z.array(componentSchema).min(1).max(20) }).strict()

const unsupportedAuthentication = {
  error: 'templates de autenticação exigem um fluxo OTP próprio e não são suportados pelo editor simples',
  code: 'AUTHENTICATION_TEMPLATE_UNSUPPORTED',
}

function requestedAuthentication(value: unknown) {
  return Boolean(value && typeof value === 'object' && String((value as { category?: unknown }).category ?? '').toUpperCase() === 'AUTHENTICATION')
}

export const templatesRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => {
    const [remote, drafts] = await Promise.all([templatesDb(c.env.DB).list(), templateDraftsDb(c.env.DB).list()])
    return c.json({ items: [
      ...remote.map((template) => ({
      ...template,
      // Necessário para montar e pré-visualizar variáveis no criador de campanha.
      // O payload vem do template já sincronizado da Meta; não contém credenciais.
      components: template.components,
      requiresParameters: templateRequiresParameters(template.components),
      simpleEditorSupported: isSimpleTemplateCategory(template.category),
      simpleSendSupported: isSimpleTemplateSendSupported(template.category, template.components),
      source: 'meta' as const,
      })),
      ...drafts.map((draft) => ({ ...draft, synced_at: draft.updated_at, requiresParameters: templateRequiresParameters(draft.components), simpleEditorSupported: isSimpleTemplateCategory(draft.category), simpleSendSupported: false, source: 'draft' as const })),
    ] })
  })
  .post('/sync', async (c) => {
    const creds = await getCredentials(c.env)
    if (!creds?.wabaId) return c.json({ error: 'credenciais Meta não configuradas (settings)' }, 400)
    const db = templatesDb(c.env.DB)
    const lockId = crypto.randomUUID()
    if (!await db.tryAcquireSyncLock(lockId))
      return c.json({ error: 'sincronização de templates já está em andamento' }, 409)
    try {
      const templates = await whatsappClient(creds).fetchTemplates(creds.wabaId)
      await db.replaceFromMeta(templates)
      return c.json({ synced: templates.length })
    } finally {
      await db.releaseSyncLock(lockId)
    }
  })
  .get('/drafts', async (c) => c.json({ items: await templateDraftsDb(c.env.DB).list() }))
  .post('/drafts', async (c) => { const raw=await readJsonBody(c,64_000); if(!raw.ok)return c.json({error:raw.error},raw.status);if(requestedAuthentication(raw.value))return c.json(unsupportedAuthentication,409); const body=draftSchema.safeParse(raw.value); if(!body.success)return c.json({error:'rascunho inválido'},400); try{return c.json(await templateDraftsDb(c.env.DB).create(body.data),201)}catch(e){if(e instanceof Error&&/UNIQUE/.test(e.message))return c.json({error:'já existe um template com esse nome'},409);throw e} })
  .get('/drafts/:id', async (c) => { const item=await templateDraftsDb(c.env.DB).get(c.req.param('id')); return item?c.json(item):c.json({error:'rascunho não encontrado'},404) })
  .patch('/drafts/:id', async (c) => { const raw=await readJsonBody(c,64_000);if(!raw.ok)return c.json({error:raw.error},raw.status);if(requestedAuthentication(raw.value))return c.json(unsupportedAuthentication,409);const body=draftSchema.safeParse(raw.value);if(!body.success)return c.json({error:'rascunho inválido'},400);const item=await templateDraftsDb(c.env.DB).update(c.req.param('id'),body.data);return item?c.json(item):c.json({error:'rascunho não encontrado'},404) })
  .delete('/drafts/:id', async (c) => (await templateDraftsDb(c.env.DB).delete(c.req.param('id')))?c.json({ok:true}):c.json({error:'rascunho não encontrado'},404))
  .post('/drafts/:id/submit', async (c) => { const db=templateDraftsDb(c.env.DB);const draft=await db.get(c.req.param('id'));if(!draft)return c.json({error:'rascunho não encontrado'},404);if(!isSimpleTemplateCategory(draft.category))return c.json(unsupportedAuthentication,409);const components=Array.isArray(draft.components)?draft.components.filter((item):item is {type?:unknown;text?:unknown;buttons?:unknown}=>Boolean(item)&&typeof item==='object'):[];const issues=validateMetaTemplateComponents(components);const buttonComponents=components.filter((component)=>String(component.type??'').toUpperCase()==='BUTTONS');const buttons=buttonComponents.flatMap((component)=>Array.isArray(component.buttons)?component.buttons:[]);const advanced=buttons.some((button)=>!button||typeof button!=='object'||!['QUICK_REPLY','URL','PHONE_NUMBER'].includes(String((button as {type?:unknown}).type??'').toUpperCase()));const buttonIssues=advanced?[]:validateSimpleTemplateButtons(buttons as Array<Record<string,unknown>>);if(issues.length||buttonIssues.length)return c.json({error:'template fora das regras da Meta',issues:[...issues,...buttonIssues]},400);const creds=await getCredentials(c.env);if(!creds?.wabaId)return c.json({error:'credenciais Meta não configuradas'},400);await db.setState(draft.id,'SUBMITTING');try{const result=await whatsappClient(creds).createTemplate(creds.wabaId,{name:draft.name,language:draft.language,category:draft.category,components:draft.components}) as {id?:unknown;status?:unknown;category?:unknown};await templatesDb(c.env.DB).upsertSubmitted({name:draft.name,language:draft.language,metaId:typeof result.id==='string'?result.id:null,category:typeof result.category==='string'?result.category:draft.category,status:typeof result.status==='string'?result.status:'PENDING',components:Array.isArray(draft.components)?draft.components:[]});await db.delete(draft.id);return c.json({ok:true,result})}catch(error){const detail=error instanceof Error?error.message:'falha ao enviar template';await db.setState(draft.id,'FAILED',detail);return c.json({error:detail},502)} })
  .post('/:name/clone', async (c) => {
    const templateStore = templatesDb(c.env.DB)
    const source = (await templateStore.listByName(c.req.param('name')))[0]
    if (!source) return c.json({ error: 'template não encontrado' }, 404)
    if (!isSimpleTemplateCategory(source.category)) return c.json(unsupportedAuthentication, 409)
    const [remote, drafts] = await Promise.all([
      templateStore.list(),
      templateDraftsDb(c.env.DB).list(),
    ])
    const occupied = new Set([
      ...remote.map((item) => item.name),
      ...drafts.map((item) => item.name),
    ])
    let name = `${source.name}_copia`
    let suffix = 2
    while (occupied.has(name)) name = `${source.name}_copia_${suffix++}`
    return c.json(await templateDraftsDb(c.env.DB).create({
      name,
      language: source.language,
      category: source.category,
      components: Array.isArray(source.components) ? source.components : [],
    }), 201)
  })
  .delete('/:name', async (c) => { const creds=await getCredentials(c.env);if(!creds?.wabaId)return c.json({error:'credenciais Meta não configuradas'},400);await whatsappClient(creds).deleteTemplate(creds.wabaId,c.req.param('name'));await templatesDb(c.env.DB).deleteByName(c.req.param('name'));return c.json({ok:true}) })
