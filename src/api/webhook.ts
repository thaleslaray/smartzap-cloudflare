import { Hono } from 'hono'
import { z } from 'zod'
import { verifyMetaSignature } from '../whatsapp/webhook-verify'
import { timingSafeEqualStr } from '../middleware/auth'
import { readBodyBytes } from './body'
import { minimizeReferralUrl } from '../domain/conversions'
import { getMetaSecrets } from '../whatsapp/credentials'

const MAX_ENVELOPE_ENTRIES = 100
const MAX_CHANGES_PER_ENTRY = 100
// A Meta documenta envelopes de webhook de até 3 MB. O teto de eventos precisa
// comportar lotes maiores sem impedir a proteção de memória e o batch de Queue.
const MAX_WEBHOOK_BYTES = 3 * 1024 * 1024
const MAX_EVENTS_PER_REQUEST = 1000
const MAX_ERRORS_PER_CONTAINER = 20

const MetaErrorSchema = z.object({
  code: z.number().int(),
  title: z.string().max(500).optional(),
  message: z.string().max(1000).optional(),
  error_data: z.object({ details: z.string().max(2000).optional() }).passthrough().optional(),
  fbtrace_id: z.string().max(256).optional(),
}).passthrough()

export const MetaStatusSchema = z.object({
  id: z.string().min(1).max(512),
  status: z.enum(['accepted', 'sent', 'delivered', 'read', 'failed', 'held_for_quality_assessment', 'paused']),
  timestamp: z.string().regex(/^\d{1,16}$/)
    .refine((value) => Number.isSafeInteger(Number(value))),
  recipient_id: z.string().min(1).max(128).optional(),
  recipient_user_id: z.string().min(1).max(128).optional(),
  recipient_parent_user_id: z.string().min(1).max(128).optional(),
  biz_opaque_callback_data: z.string().max(128).optional(),
  errors: z.array(MetaErrorSchema).max(20).optional(),
  pricing: z.object({
    billable: z.boolean().optional(),
    pricing_model: z.string().max(64).optional(),
    type: z.string().max(64).optional(),
    category: z.string().max(64).optional(),
  }).passthrough().optional(),
}).passthrough().refine(
  (value) => Boolean(value.recipient_id || value.recipient_user_id),
  "status sem destinatário Meta",
)
export type MetaStatus = z.infer<typeof MetaStatusSchema>
export type MetaWebhookError = z.infer<typeof MetaErrorSchema>

const UserPreferenceSchema = z.object({
  wa_id: z.string().min(1).max(128).optional(),
  user_id: z.string().min(1).max(128).optional(),
  parent_user_id: z.string().min(1).max(128).optional(),
  detail: z.string().max(500).optional(),
  category: z.literal('marketing_messages'),
  value: z.enum(['stop', 'resume']),
  timestamp: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
}).passthrough().refine(
  (value) => Boolean(value.wa_id || value.user_id),
  "preferência sem identidade Meta",
)

const TemplateStatusSchema = z.object({
  event: z.enum([
    'APPROVED', 'ARCHIVED', 'UNARCHIVED', 'DELETED', 'DISABLED', 'FLAGGED',
    'IN_APPEAL', 'LIMIT_EXCEEDED', 'LOCKED', 'PAUSED', 'PENDING',
    'REINSTATED', 'PENDING_DELETION', 'REJECTED',
  ]),
  message_template_id: z.union([z.string(), z.number()]),
  message_template_name: z.string().min(1).max(512),
  message_template_language: z.string().min(1).max(64),
  message_template_category: z.string().max(64).optional(),
  reason: z.string().max(500).nullable().optional(),
  disable_info: z.object({
    disable_date: z.union([z.string().max(64), z.number().int().nonnegative()]).optional(),
  }).passthrough().optional(),
  other_info: z.object({
    title: z.string().max(256).optional(),
    description: z.string().max(2000).optional(),
  }).passthrough().optional(),
  rejection_info: z.object({
    reason: z.string().max(2000).optional(),
    recommendation: z.string().max(2000).optional(),
  }).passthrough().optional(),
}).passthrough()

const TemplateQualitySchema = z.object({
  previous_quality_score: z.enum(['GREEN', 'YELLOW', 'RED', 'UNKNOWN']),
  new_quality_score: z.enum(['GREEN', 'YELLOW', 'RED', 'UNKNOWN']),
  message_template_id: z.union([z.string(), z.number()]),
  message_template_name: z.string().min(1).max(512),
  message_template_language: z.string().min(1).max(64),
}).passthrough()

const TemplateComponentsSchema = z.object({
  message_template_id: z.union([z.string(), z.number()]),
  message_template_name: z.string().min(1).max(512),
  message_template_language: z.string().min(1).max(64),
  message_template_element: z.string().max(4096),
  message_template_title: z.string().max(1024).optional(),
  message_template_footer: z.string().max(1024).optional(),
  message_template_buttons: z.array(z.record(z.string(), z.unknown())).max(10).optional(),
}).passthrough()

const TemplateCategorySchema = z.object({
  message_template_id: z.union([z.string(), z.number()]),
  message_template_name: z.string().min(1).max(512),
  message_template_language: z.string().min(1).max(64),
  new_category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  correct_category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).optional(),
  previous_category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).optional(),
  category_update_timestamp: z.number().int().nonnegative().optional(),
}).passthrough().refine(
  (value) => Boolean(
    value.previous_category ||
    (value.correct_category && value.category_update_timestamp !== undefined)
  ),
  'mudança de categoria sem estado programado ou anterior',
)

const InboundMessageSchema = z.object({
  from: z.string().regex(/^\d{5,32}$/).optional(),
  from_user_id: z.string().min(1).max(128).optional(),
  from_parent_user_id: z.string().min(1).max(128).optional(),
  id: z.string().min(1).max(512),
  timestamp: z.string().regex(/^\d{1,16}$/)
    .refine((value) => Number.isSafeInteger(Number(value))),
  type: z.string().min(1).max(64),
}).passthrough().refine(
  (value) => Boolean(value.from || value.from_user_id),
  "mensagem sem identidade Meta",
)
const ReferralSchema = z.object({
  ctwa_clid: z.string().min(1).max(2048).optional(),
  source_id: z.string().min(1).max(512).optional(),
  source_type: z.string().min(1).max(64).optional(),
  source_url: z.string().min(1).max(4096).optional(),
}).passthrough().refine(
  (value) => Boolean(
    value.ctwa_clid || value.source_id || value.source_type || value.source_url
  ),
  "origem CTWA vazia",
)
const ContactProfileSchema = z.object({
  wa_id: z.string().regex(/^\d{5,32}$/).optional(),
  user_id: z.string().min(1).max(128).optional(),
  parent_user_id: z.string().min(1).max(128).optional(),
  profile: z.object({
    name: z.string().trim().min(1).max(256).optional(),
    username: z.string().trim().min(1).max(256).optional(),
  }).passthrough().optional(),
}).passthrough().refine(
  (value) => Boolean(value.wa_id || value.user_id),
  "contato sem identidade Meta",
)

export type MetaInboundMessage = {
  id: string
  /** Identidade estável usada internamente: BSUID quando disponível. */
  from: string
  phone?: string
  userId?: string
  parentUserId?: string
  username?: string
  timestamp: string
  type: string
  profileName?: string
  textBody?: string
  content?: Record<string, unknown>
  /** Metadados mínimos de atribuição; nunca inclui texto nem mídia do anúncio. */
  referral?: {
    ctwaClid?: string
    sourceId?: string
    sourceType?: string
    sourceUrl?: string
  }
}

function boundedString(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.length <= max ? value : undefined
}

function extractInboundMessage(
  value: Record<string, unknown>, candidate: unknown,
): MetaInboundMessage | null {
  const parsed = InboundMessageSchema.safeParse(candidate)
  if (!parsed.success) return null
  const item = candidate as Record<string, unknown>
  const type = parsed.data.type.toLowerCase()
  let textBody: string | undefined
  const content: Record<string, unknown> = {}
  let referral: MetaInboundMessage['referral']

  if (item.referral !== undefined) {
    const parsedReferral = ReferralSchema.safeParse(item.referral)
    if (!parsedReferral.success) return null
    const sourceUrl = minimizeReferralUrl(parsedReferral.data.source_url)
    referral = {
      ...(parsedReferral.data.ctwa_clid
        ? { ctwaClid: parsedReferral.data.ctwa_clid }
        : {}),
      ...(parsedReferral.data.source_id
        ? { sourceId: parsedReferral.data.source_id }
        : {}),
      ...(parsedReferral.data.source_type
        ? { sourceType: parsedReferral.data.source_type }
        : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
    }
  }

  if (type === 'text') {
    const text = item.text && typeof item.text === 'object'
      ? item.text as Record<string, unknown> : null
    textBody = boundedString(text?.body, 4096)
    if (!textBody) return null
  } else if (type === 'button') {
    const button = item.button && typeof item.button === 'object'
      ? item.button as Record<string, unknown> : null
    textBody = boundedString(button?.text, 1024)
    const payload = boundedString(button?.payload, 2048)
    if (payload) content.payload = payload
  } else if (type === 'interactive') {
    const interactive = item.interactive && typeof item.interactive === 'object'
      ? item.interactive as Record<string, unknown> : null
    const nfm = interactive?.type === 'nfm_reply'
      && interactive.nfm_reply && typeof interactive.nfm_reply === 'object'
      ? interactive.nfm_reply as Record<string, unknown> : null
    if (nfm) {
      const rawResponse = boundedString(nfm.response_json, 64_000)
      if (!rawResponse) return null
      try {
        const response = JSON.parse(rawResponse)
        if (!response || typeof response !== 'object' || Array.isArray(response)) return null
        content.flowResponse = response
        const name = boundedString(nfm.name, 512)
        if (name) content.flowName = name
      } catch { return null }
    }
    const reply = interactive?.button_reply && typeof interactive.button_reply === 'object'
      ? interactive.button_reply as Record<string, unknown>
      : interactive?.list_reply && typeof interactive.list_reply === 'object'
        ? interactive.list_reply as Record<string, unknown> : null
    if (reply) {
      textBody = boundedString(reply.title, 1024)
      const id = boundedString(reply.id, 512)
      const description = boundedString(reply.description, 2048)
      if (id) content.replyId = id
      if (description) content.description = description
    }
  } else if (['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
    const media = item[type] && typeof item[type] === 'object'
      ? item[type] as Record<string, unknown> : null
    if (!media) return null
    textBody = boundedString(media.caption, 4096)
    const mediaId = boundedString(media.id, 512)
    const mimeType = boundedString(media.mime_type, 256)
    const filename = boundedString(media.filename, 512)
    if (mediaId) content.mediaId = mediaId
    if (mimeType) content.mimeType = mimeType
    if (filename) content.filename = filename
  } else if (type === 'location') {
    const location = item.location && typeof item.location === 'object'
      ? item.location as Record<string, unknown> : null
    if (!location) return null
    const latitude = typeof location.latitude === 'number' ? location.latitude : null
    const longitude = typeof location.longitude === 'number' ? location.longitude : null
    if (latitude !== null && latitude >= -90 && latitude <= 90) content.latitude = latitude
    if (longitude !== null && longitude >= -180 && longitude <= 180) content.longitude = longitude
    const name = boundedString(location.name, 512)
    const address = boundedString(location.address, 1024)
    if (name) content.name = name
    if (address) content.address = address
    textBody = name ?? address
  } else if (type === 'reaction') {
    const reaction = item.reaction && typeof item.reaction === 'object'
      ? item.reaction as Record<string, unknown> : null
    if (!reaction) return null
    const targetId = boundedString(reaction.message_id, 512)
    const emoji = boundedString(reaction.emoji, 32)
    if (targetId) content.targetMessageId = targetId
    if (emoji) { content.emoji = emoji; textBody = emoji }
  }

  const context = item.context && typeof item.context === 'object'
    ? item.context as Record<string, unknown> : null
  const contextMessageId = boundedString(context?.id, 512)
  if (contextMessageId) content.contextMessageId = contextMessageId

  let profileName: string | undefined
  if (Array.isArray(value.contacts)) {
    for (const contact of value.contacts.slice(0, 100)) {
      const parsedContact = ContactProfileSchema.safeParse(contact)
      if (parsedContact.success && (
        (parsed.data.from_user_id && parsedContact.data.user_id === parsed.data.from_user_id) ||
        (parsed.data.from && parsedContact.data.wa_id === parsed.data.from)
      )) {
        profileName = parsedContact.data.profile?.name
        const username = parsedContact.data.profile?.username
        const parentUserId = parsed.data.from_parent_user_id ?? parsedContact.data.parent_user_id
        return {
          id: parsed.data.id,
          from: parsed.data.from_user_id ?? parsed.data.from!,
          timestamp: parsed.data.timestamp,
          type,
          ...(parsed.data.from ? { phone: parsed.data.from } : {}),
          ...(parsed.data.from_user_id ? { userId: parsed.data.from_user_id } : {}),
          ...(parentUserId ? { parentUserId } : {}),
          ...(username ? { username } : {}),
          ...(profileName ? { profileName } : {}),
          ...(textBody ? { textBody } : {}),
          ...(Object.keys(content).length ? { content } : {}),
          ...(referral ? { referral } : {}),
        }
      }
    }
  }

  return {
    id: parsed.data.id,
    from: parsed.data.from_user_id ?? parsed.data.from!,
    ...(parsed.data.from ? { phone: parsed.data.from } : {}),
    ...(parsed.data.from_user_id ? { userId: parsed.data.from_user_id } : {}),
    ...(parsed.data.from_parent_user_id ? { parentUserId: parsed.data.from_parent_user_id } : {}),
    timestamp: parsed.data.timestamp,
    type,
    ...(profileName ? { profileName } : {}),
    ...(textBody ? { textBody } : {}),
    ...(Object.keys(content).length ? { content } : {}),
    ...(referral ? { referral } : {}),
  }
}

export type MetaWebhookEvent =
  | { kind: 'status'; wabaId: string; phoneNumberId: string; status: MetaStatus }
  | { kind: 'inbound_message'; wabaId: string; phoneNumberId: string; message: MetaInboundMessage }
  | { kind: 'user_preference'; wabaId: string; phoneNumberId: string; preference: z.infer<typeof UserPreferenceSchema> }
  | { kind: 'template_status'; wabaId: string; timestamp?: number; template: z.infer<typeof TemplateStatusSchema> }
  | { kind: 'platform_event'; wabaId: string; field: string; summary: Record<string, string | number | boolean | null> }
  | { kind: 'platform_error'; wabaId: string; phoneNumberId: string; scope: string; referenceId?: string; error: MetaWebhookError }

type MetaWebhook = {
  object?: unknown
  entry?: { id?: unknown; time?: unknown; changes?: { field?: unknown; value?: unknown }[] }[]
}

export const webhookRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => {
    const mode = c.req.query('hub.mode')
    const token = c.req.query('hub.verify_token')
    const challenge = c.req.query('hub.challenge')
    const meta = await getMetaSecrets(c.env).catch(() => null)
    if (mode === 'subscribe' && token && challenge && meta
      && (await timingSafeEqualStr(token, meta.verifyToken)))
      return c.text(challenge)
    return c.text('forbidden', 403)
  })
  .post('/', async (c) => {
    const body = await readBodyBytes(c, MAX_WEBHOOK_BYTES)
    if (!body.ok) return c.json({ error: body.error }, body.status)
    const meta = await getMetaSecrets(c.env).catch(() => null)
    if (!meta) return c.json({ error: 'webhook não configurado' }, 503)
    const signatureOk = await verifyMetaSignature(
      meta.appSecret, body.value, c.req.header('x-hub-signature-256') ?? null)
    if (!signatureOk) return c.json({ error: 'assinatura inválida' }, 401)

    let raw: string
    try { raw = new TextDecoder('utf-8', { fatal: true }).decode(body.value) }
    catch { return c.json({ error: 'corpo inválido' }, 400) }
    let payload: MetaWebhook
    try {
      payload = JSON.parse(raw) as MetaWebhook
    } catch {
      return c.json({ error: 'JSON inválido' }, 400)
    }
    if (payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry))
      return c.json({ error: 'envelope Meta inválido' }, 400)
    if (payload.entry.length > MAX_ENVELOPE_ENTRIES)
      return c.json({ error: 'lote Meta excede o limite permitido' }, 400)

    const events: MetaWebhookEvent[] = []
    let invalidRecognizedEvent = false
    for (const entry of payload.entry) {
      const wabaId = typeof entry.id === 'string' ? entry.id : ''
      const entryTimestamp = typeof entry.time === 'number' && Number.isSafeInteger(entry.time)
        && entry.time >= 0 ? entry.time : Math.floor(Date.now() / 1000)
      if (!wabaId || !Array.isArray(entry.changes)
        || entry.changes.length > MAX_CHANGES_PER_ENTRY) {
        invalidRecognizedEvent = true
        continue
      }
      if (c.env.ENVIRONMENT === 'production'
        && c.env.META_EXPECTED_WABA_ID && wabaId !== c.env.META_EXPECTED_WABA_ID) {
        invalidRecognizedEvent = true
        continue
      }
      for (const change of entry.changes) {
        const field = typeof change.field === 'string' ? change.field : ''
        const value = change.value && typeof change.value === 'object'
          ? change.value as Record<string, unknown> : null
        if (!value) {
          if (['messages', 'user_preferences', 'message_template_status_update',
            'message_template_components_update', 'message_template_quality_update',
            'template_category_update'].includes(field))
            invalidRecognizedEvent = true
          continue
        }

        if (field === 'messages') {
          const metadata = value.metadata && typeof value.metadata === 'object'
            ? value.metadata as Record<string, unknown> : null
          const phoneNumberId = typeof metadata?.phone_number_id === 'string'
            ? metadata.phone_number_id : ''
          const statuses = Array.isArray(value.statuses) ? value.statuses : []
          if (!phoneNumberId || (value.statuses !== undefined && !Array.isArray(value.statuses))) {
            invalidRecognizedEvent = true
            continue
          }
          if (statuses.length > MAX_EVENTS_PER_REQUEST) {
            invalidRecognizedEvent = true
            continue
          }
          if (c.env.ENVIRONMENT === 'production' && c.env.META_EXPECTED_PHONE_ID
            && phoneNumberId !== c.env.META_EXPECTED_PHONE_ID) {
            invalidRecognizedEvent = true
            continue
          }
          for (const candidate of statuses) {
            const parsed = MetaStatusSchema.safeParse(candidate)
            if (parsed.success) events.push({ kind: 'status', wabaId, phoneNumberId, status: parsed.data })
            else invalidRecognizedEvent = true
          }
          const topErrors = value.errors === undefined ? []
            : Array.isArray(value.errors) ? value.errors : null
          if (topErrors === null) invalidRecognizedEvent = true
          else if (topErrors.length > MAX_ERRORS_PER_CONTAINER) invalidRecognizedEvent = true
          else for (const candidate of topErrors) {
            const parsed = MetaErrorSchema.safeParse(candidate)
            if (parsed.success) events.push({
              kind: 'platform_error', wabaId, phoneNumberId,
              scope: 'value.errors', error: parsed.data,
            })
            else invalidRecognizedEvent = true
          }
          const messages = value.messages === undefined ? []
            : Array.isArray(value.messages) ? value.messages : null
          if (messages === null) invalidRecognizedEvent = true
          else if (messages.length > 100) invalidRecognizedEvent = true
          else for (const message of messages) {
            if (!message || typeof message !== 'object') { invalidRecognizedEvent = true; continue }
            const item = message as Record<string, unknown>
            if (item.errors !== undefined) {
              if (!Array.isArray(item.errors)
                || item.errors.length > MAX_ERRORS_PER_CONTAINER) {
                invalidRecognizedEvent = true
                continue
              }
              for (const candidate of item.errors) {
                const parsed = MetaErrorSchema.safeParse(candidate)
                if (parsed.success) events.push({
                  kind: 'platform_error', wabaId, phoneNumberId,
                  scope: 'messages.errors',
                  referenceId: typeof item.id === 'string' ? item.id : undefined,
                  error: parsed.data,
                })
                else invalidRecognizedEvent = true
              }
            }
            // Mensagens de erro podem não ter o envelope comum de mensagem recebida.
            if (typeof item.from === 'string' || typeof item.from_user_id === 'string') {
              const inbound = extractInboundMessage(value, item)
              if (inbound) events.push({
                kind: 'inbound_message', wabaId, phoneNumberId, message: inbound,
              })
              else invalidRecognizedEvent = true
            }
          }
        } else if (field === 'user_preferences') {
          const metadata = value.metadata && typeof value.metadata === 'object'
            ? value.metadata as Record<string, unknown> : null
          const phoneNumberId = typeof metadata?.phone_number_id === 'string'
            ? metadata.phone_number_id : ''
          const preferences = Array.isArray(value.user_preferences) ? value.user_preferences : null
          if (!phoneNumberId || !preferences) { invalidRecognizedEvent = true; continue }
          if (preferences.length > MAX_EVENTS_PER_REQUEST) {
            invalidRecognizedEvent = true
            continue
          }
          if (c.env.ENVIRONMENT === 'production' && c.env.META_EXPECTED_PHONE_ID
            && phoneNumberId !== c.env.META_EXPECTED_PHONE_ID) {
            invalidRecognizedEvent = true
            continue
          }
          for (const candidate of preferences) {
            const parsed = UserPreferenceSchema.safeParse(candidate)
            if (parsed.success)
              events.push({ kind: 'user_preference', wabaId, phoneNumberId, preference: parsed.data })
            else invalidRecognizedEvent = true
          }
        } else if (field === 'message_template_status_update') {
          const parsed = TemplateStatusSchema.safeParse(value)
          if (parsed.success) events.push({ kind: 'template_status', wabaId, timestamp: entryTimestamp, template: parsed.data })
          else invalidRecognizedEvent = true
        } else if (field === 'message_template_quality_update') {
          const parsed = TemplateQualitySchema.safeParse(value)
          if (parsed.success) events.push({
            kind: 'platform_event', wabaId, field,
            summary: {
              previous_quality_score: parsed.data.previous_quality_score,
              new_quality_score: parsed.data.new_quality_score,
              message_template_id: String(parsed.data.message_template_id),
              message_template_name: parsed.data.message_template_name,
              message_template_language: parsed.data.message_template_language,
              webhook_timestamp: entryTimestamp,
            },
          })
          else invalidRecognizedEvent = true
        } else if (field === 'message_template_components_update') {
          const parsed = TemplateComponentsSchema.safeParse(value)
          if (parsed.success) events.push({
            kind: 'platform_event', wabaId, field,
            summary: {
              message_template_id: String(parsed.data.message_template_id),
              message_template_name: parsed.data.message_template_name,
              message_template_language: parsed.data.message_template_language,
              webhook_timestamp: entryTimestamp,
              requires_authoritative_sync: true,
            },
          })
          else invalidRecognizedEvent = true
        } else if (field === 'template_category_update') {
          const parsed = TemplateCategorySchema.safeParse(value)
          if (parsed.success) events.push({
            kind: 'platform_event', wabaId, field,
            summary: {
              message_template_id: String(parsed.data.message_template_id),
              message_template_name: parsed.data.message_template_name,
              message_template_language: parsed.data.message_template_language,
              new_category: parsed.data.new_category,
              ...(parsed.data.correct_category
                ? { correct_category: parsed.data.correct_category }
                : {}),
              ...(parsed.data.previous_category
                ? { previous_category: parsed.data.previous_category }
                : {}),
              ...(parsed.data.category_update_timestamp !== undefined
                ? { category_update_timestamp: parsed.data.category_update_timestamp }
                : {}),
              webhook_timestamp: entryTimestamp,
            },
          })
          else invalidRecognizedEvent = true
        } else if ([
          'account_update', 'account_alerts', 'account_review_update',
          'business_capability_update', 'phone_number_quality_update',
          'phone_number_name_update', 'security',
          'business_username_updates',
          'pricing', 'flows',
        ].includes(field)) {
          // Eventos de conta/preço evoluem com o contrato da Meta. Preservamos
          // somente metadados escalares conhecidos, sem rejeitar o webhook por
          // campos novos nem guardar payloads com PII.
          const summary: Record<string, string | number | boolean | null> = {}
          for (const key of [
            'event', 'type', 'category', 'tier', 'status', 'reason', 'timestamp',
            'id', 'flow_id', 'metric', 'message_template_id', 'message_template_name',
            'value', 'threshold', 'client_error_rate', 'endpoint_error_rate',
            'endpoint_latency', 'endpoint_availability',
            'display_phone_number', 'old_limit', 'current_limit',
            'max_daily_conversations_per_business', 'quality_score',
            'username',
          ]) {
            const item = value[key]
            if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null)
              summary[key] = item
          }
          const tierInfo = value.volume_tier_info && typeof value.volume_tier_info === 'object'
            ? value.volume_tier_info as Record<string, unknown> : null
          if (tierInfo) {
            for (const key of ['tier_update_time', 'pricing_category', 'tier', 'effective_month', 'region']) {
              const item = tierInfo[key]
              if (typeof item === 'string' || typeof item === 'number' || item === null)
                summary[key] = item
            }
          }
          events.push({ kind: 'platform_event', wabaId, field, summary })
        }
      }
    }

    // Não confirma silenciosamente evento reconhecido e malformado: a Meta repetirá.
    if (events.length > MAX_EVENTS_PER_REQUEST)
      return c.json({ error: 'lote Meta excede o limite permitido' }, 400)
    if (invalidRecognizedEvent) return c.json({ error: 'evento Meta inválido' }, 400)
    for (let i = 0; i < events.length; i += 100) {
      await c.env.WEBHOOK_QUEUE.sendBatch(
        events.slice(i, i + 100).map((event) => ({ body: event })))
    }
    return c.json({ ok: true })
  })
