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

function configuredRecipient(env: Env): string {
  const recipient = normalizePhone(env.PILOT_RECIPIENT_E164 ?? '')
  if (!recipient)
    throw new PilotSafetyError('Destinatário do piloto não está configurado.', 503)
  return recipient
}

function templateAllowlist(env: Env): Set<string> {
  return new Set((env.PILOT_TEMPLATE_ALLOWLIST ?? '')
    .split(',').map((name) => name.trim()).filter(Boolean))
}

export function assertPilotCampaign(env: Env, input: { name: string; templateName: string }): void {
  if (!pilotIsEnforced(env)) return
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
  const allowed = configuredRecipient(env)
  if (recipients.length !== 1)
    throw new PilotSafetyError('Piloto permite exatamente um destinatário por campanha.')
  const actual = normalizePhone(recipients[0]?.phone ?? '')
  if (!actual || actual !== allowed)
    throw new PilotSafetyError('Destinatário fora da allowlist do piloto.', 403)
}

export function assertPilotRecipient(env: Env, phone: string): void {
  if (!pilotIsEnforced(env)) return
  const actual = normalizePhone(phone)
  if (!actual || actual !== configuredRecipient(env))
    throw new PilotSafetyError('Destinatário fora da allowlist do piloto.', 403)
}

export function assertPilotInboxRecipient(env: Env, phone: string): void {
  if (!pilotIsEnforced(env)) return
  if (env.INBOX_SEND_ENABLED !== 'true')
    throw new PilotSafetyError('Envio manual da Inbox está desligado.', 503)
  const actual = normalizePhone(phone)
  if (!actual || actual !== configuredRecipient(env))
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
  const normalized = normalizePhone(input.phone)!
  const id = crypto.randomUUID()
  const result = await env.DB.prepare(
    `INSERT INTO pilot_send_ledger
       (id, campaign_id, contact_id, phone_hash, status, pilot_run_id)
     SELECT ?1, ?2, ?3, ?4, 'reserved', r.id
     FROM pilot_runs r
     WHERE r.status = 'active'
       AND r.max_attempts <= ?5
       AND (SELECT COUNT(*) FROM pilot_send_ledger l WHERE l.pilot_run_id = r.id)
         < r.max_attempts
       AND NOT EXISTS (
         SELECT 1 FROM pilot_send_ledger WHERE campaign_id = ?2 AND contact_id = ?3
       )`
  ).bind(id, input.campaignId, input.contactId, await sha256(normalized), pilotLimit(env)).run()
  if ((result.meta.changes ?? 0) !== 1)
    throw new PilotSafetyError('Rodada ausente, orçamento esgotado ou tentativa já registrada.')
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
  inboxEnabled: boolean; templateAllowlistConfigured: boolean; maxAttempts: number | null
} {
  const rawLimit = Number(env.PILOT_MAX_REAL_SENDS)
  const enforced = pilotIsEnforced(env)
  return {
    enforced,
    enabled: env.PILOT_SEND_ENABLED === 'true',
    inboxEnabled: env.INBOX_SEND_ENABLED === 'true',
    recipientConfigured: Boolean(normalizePhone(env.PILOT_RECIPIENT_E164 ?? '')),
    templateAllowlistConfigured: templateAllowlist(env).size > 0,
    maxAttempts: enforced && Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 3 ? rawLimit : null,
  }
}
