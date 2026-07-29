import { normalizePhone } from './phone'

export class PilotSafetyError extends Error {
  constructor(message: string, readonly status: 403 | 409 | 503 = 409) {
    super(message)
    this.name = 'PilotSafetyError'
  }
}

export type PilotAttemptStatus = 'accepted' | 'rejected' | 'ambiguous'

function pilotIsEnforced(env: Env): boolean {
  // Produção não usa mais as travas do piloto. O modo explícito abaixo existe
  // somente para manter a cobertura dos testes de compatibilidade legados.
  return (env as Env & { PILOT_GUARDS_ENABLED?: string }).PILOT_GUARDS_ENABLED === 'true'
}

function assertPilotSendingEnabled(env: Env): void {
  if (pilotIsEnforced(env) && env.PILOT_SEND_ENABLED !== 'true')
    throw new PilotSafetyError('Kill switch do piloto está desligado.', 503)
}

export function assertPilotTimeWindow(env: Env, now = new Date()): void {
  if (!pilotIsEnforced(env) || env.PILOT_TIME_WINDOW_ENABLED !== 'true') return
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now))
  if (!Number.isInteger(hour) || hour < 9 || hour >= 20)
    throw new PilotSafetyError(
      'Canário real permitido somente entre 09:00 e 20:00 no horário de São Paulo.',
      503,
    )
}

function pilotDailyRunLimit(env: Env): number {
  if (!pilotIsEnforced(env)) return Number.MAX_SAFE_INTEGER
  const parsed = Number(env.PILOT_MAX_RUNS_PER_DAY)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 2)
    throw new PilotSafetyError('PILOT_MAX_RUNS_PER_DAY deve estar entre 1 e 2.', 503)
  return parsed
}

export function pilotLimit(env: Env): number {
  // Fora do modo explícito de piloto não existe orçamento artificial de
  // mensagens. O limite legado continua restrito ao ambiente de compatibilidade
  // que ativa PILOT_GUARDS_ENABLED de propósito.
  if (!pilotIsEnforced(env)) return Number.MAX_SAFE_INTEGER
  const parsed = Number(env.PILOT_MAX_REAL_SENDS)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3)
    throw new PilotSafetyError('PILOT_MAX_REAL_SENDS deve estar entre 1 e 3.', 503)
  return parsed
}

function configuredRecipients(env: Env): Set<string> {
  const configured = env.PILOT_RECIPIENT_ALLOWLIST?.trim()
    ? env.PILOT_RECIPIENT_ALLOWLIST.split(',')
    : [env.PILOT_RECIPIENT_E164 ?? '']
  const rawRecipients = configured.map((recipient) => recipient.trim()).filter(Boolean)
  const recipients = rawRecipients.map((recipient) => normalizePhone(recipient))
  if (!rawRecipients.length || recipients.some((recipient) => !recipient))
    throw new PilotSafetyError('Allowlist de destinatários do piloto não está configurada corretamente.', 503)
  return new Set(recipients as string[])
}

function templateAllowlist(env: Env): Set<string> {
  return new Set((env.PILOT_TEMPLATE_ALLOWLIST ?? '')
    .split(',').map((name) => name.trim()).filter(Boolean))
}

export function assertPilotCampaign(env: Env, input: { name: string; templateName: string }): void {
  if (!pilotIsEnforced(env)) return
  assertPilotSendingEnabled(env)
  if (!input.name.startsWith('[PILOT REAL]'))
    throw new PilotSafetyError('Campanha real precisa do prefixo [PILOT REAL].')
  const allowed = templateAllowlist(env)
  if (!allowed.size || !allowed.has(input.templateName))
    throw new PilotSafetyError('Template fora da allowlist do piloto.', 403)
}

export function pilotThrottleRate(env: Env, configuredRate: number): number {
  return pilotIsEnforced(env) ? 1 : configuredRate
}

export function assertPilotAudience(
  env: Env,
  recipients: { phone: string }[],
): void {
  if (!pilotIsEnforced(env)) return
  assertPilotSendingEnabled(env)
  const allowed = configuredRecipients(env)
  const limit = pilotLimit(env)
  if (recipients.length < 1 || recipients.length > limit)
    throw new PilotSafetyError(`Piloto permite entre 1 e ${limit} destinatários por campanha.`)
  const actual = recipients.map((recipient) => normalizePhone(recipient.phone))
  if (actual.some((recipient) => !recipient || !allowed.has(recipient)))
    throw new PilotSafetyError('Destinatário fora da allowlist do piloto.', 403)
  if (new Set(actual).size !== actual.length)
    throw new PilotSafetyError('Piloto não permite destinatários duplicados.')
}

export function assertPilotRecipient(env: Env, phone: string): void {
  if (!pilotIsEnforced(env)) return
  assertPilotSendingEnabled(env)
  const actual = normalizePhone(phone)
  if (!actual || !configuredRecipients(env).has(actual))
    throw new PilotSafetyError('Destinatário fora da allowlist do piloto.', 403)
}

export function assertPilotInboxRecipient(env: Env, phone: string): void {
  if (!pilotIsEnforced(env)) return
  assertPilotSendingEnabled(env)
  if (env.INBOX_SEND_ENABLED !== 'true')
    throw new PilotSafetyError('Envio manual da Inbox está desligado.', 503)
  const actual = normalizePhone(phone)
  if (!actual || !configuredRecipients(env).has(actual))
    throw new PilotSafetyError('Destinatário fora da allowlist do piloto.', 403)
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function pilotRunConfiguration(db: D1Database): Promise<{
  active: boolean; label: string | null; maxAttempts: number | null; attempts: number
}> {
  const row = await db.prepare(
    `SELECT r.label, r.max_attempts,
       (SELECT COUNT(*) FROM pilot_send_ledger l WHERE l.pilot_run_id = r.id) AS attempts
     FROM pilot_runs r WHERE r.status = 'active' LIMIT 1`
  ).first<{ label: string; max_attempts: number; attempts: number }>()
  return row ? {
    active: true,
    label: row.label,
    maxAttempts: row.max_attempts,
    attempts: row.attempts,
  } : { active: false, label: null, maxAttempts: null, attempts: 0 }
}

export async function reservePilotAttempt(
  env: Env,
  input: { campaignId: string; contactId: string; phone: string },
): Promise<string | null> {
  if (!pilotIsEnforced(env)) return null
  assertPilotRecipient(env, input.phone)
  assertPilotTimeWindow(env)
  const normalized = normalizePhone(input.phone)!
  const id = crypto.randomUUID()
  const dailyRunLimit = pilotDailyRunLimit(env)
  const result = await env.DB.prepare(
    `INSERT INTO pilot_send_ledger
       (id, campaign_id, contact_id, phone_hash, status, pilot_run_id)
     SELECT ?1, ?2, ?3, ?4, 'reserved', r.id
     FROM pilot_runs r
     WHERE r.status = 'active'
       AND r.max_attempts <= ?5
       AND (SELECT COUNT(*) FROM pilot_send_ledger l WHERE l.pilot_run_id = r.id)
         < r.max_attempts
       AND (
         SELECT COUNT(*) FROM pilot_runs daily
         WHERE date(daily.created_at, '-3 hours') = date('now', '-3 hours')
       ) <= ?6
       AND NOT EXISTS (
         SELECT 1 FROM pilot_send_ledger WHERE campaign_id = ?2 AND contact_id = ?3
       )`
  ).bind(
    id,
    input.campaignId,
    input.contactId,
    await sha256(normalized),
    pilotLimit(env),
    dailyRunLimit,
  ).run()
  if ((result.meta.changes ?? 0) !== 1)
    throw new PilotSafetyError(
      'Rodada ausente, limite diário/orçamento esgotado ou tentativa já registrada.',
    )
  return id
}

export async function finishPilotAttempt(
  env: Env,
  reservationId: string | null,
  input: { status: PilotAttemptStatus; messageId?: string; errorCode?: string },
): Promise<void> {
  if (!reservationId) return
  const result = await env.DB.prepare(
    `UPDATE pilot_send_ledger
     SET status = ?2, message_id = ?3, error_code = ?4, updated_at = datetime('now')
     WHERE id = ?1 AND status = 'reserved'`
  ).bind(
    reservationId, input.status, input.messageId ?? null, input.errorCode ?? null,
  ).run()
  if ((result.meta.changes ?? 0) !== 1)
    throw new PilotSafetyError('Não foi possível consolidar a tentativa no ledger.', 503)
}

export function pilotConfiguration(env: Env): {
  enforced: boolean; enabled: boolean; recipientConfigured: boolean
  recipientAllowlistSize: number; inboxEnabled: boolean
  templateAllowlistConfigured: boolean; maxAttempts: number | null
  timeWindowEnabled: boolean; maxRunsPerDay: number | null
} {
  const rawLimit = Number(env.PILOT_MAX_REAL_SENDS)
  const rawDailyLimit = Number(env.PILOT_MAX_RUNS_PER_DAY)
  const enforced = pilotIsEnforced(env)
  let recipientAllowlistSize = 0
  try {
    recipientAllowlistSize = configuredRecipients(env).size
  } catch {
    recipientAllowlistSize = 0
  }
  return {
    enforced,
    enabled: env.PILOT_SEND_ENABLED === 'true',
    inboxEnabled: env.INBOX_SEND_ENABLED === 'true',
    recipientConfigured: recipientAllowlistSize > 0,
    recipientAllowlistSize,
    templateAllowlistConfigured: templateAllowlist(env).size > 0,
    maxAttempts: enforced && Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 3 ? rawLimit : null,
    timeWindowEnabled: env.PILOT_TIME_WINDOW_ENABLED === 'true',
    maxRunsPerDay:
      enforced &&
      Number.isInteger(rawDailyLimit) &&
      rawDailyLimit >= 1 &&
      rawDailyLimit <= 2
        ? rawDailyLimit
        : null,
  }
}
