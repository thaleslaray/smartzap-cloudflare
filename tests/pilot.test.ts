import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  assertPilotAudience, assertPilotCampaign, assertPilotRecipient, finishPilotAttempt,
  PilotSafetyError, pilotLimit, pilotThrottleRate, reservePilotAttempt,
} from '../src/domain/pilot'

const ALLOWED = '+5511999999999'

function productionEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...env,
    ENVIRONMENT: 'production',
    PILOT_GUARDS_ENABLED: 'true',
    PILOT_SEND_ENABLED: 'true',
    PILOT_RECIPIENT_E164: ALLOWED,
    PILOT_MAX_REAL_SENDS: '3',
    PILOT_TEMPLATE_ALLOWLIST: 'hello_world,template_static_test',
    ...overrides,
  } as Env
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM pilot_send_ledger').run()
  await env.DB.prepare('DELETE FROM pilot_runs').run()
  await env.DB.prepare(
    "INSERT INTO pilot_runs (id, label, status, max_attempts) VALUES ('run-1', 'Rodada 1', 'active', 3)"
  ).run()
})

describe('travas do piloto real', () => {
  it('cardinalidade e allowlist continuam falhando fechados', () => {
    expect(() => assertPilotAudience(productionEnv({ PILOT_SEND_ENABLED: 'false' }), [
      { phone: ALLOWED },
    ])).not.toThrow()
    expect(() => assertPilotAudience(productionEnv(), [])).toThrow(/exatamente um/)
    expect(() => assertPilotAudience(productionEnv(), [
      { phone: ALLOWED }, { phone: ALLOWED },
    ])).toThrow(/exatamente um/)
    expect(() => assertPilotRecipient(productionEnv(), '+5521999999999')).toThrow(/allowlist/)
  })

  it('exige prefixo, template permitido e força throttle unitário', () => {
    expect(() => assertPilotCampaign(productionEnv(), {
      name: 'Sem prefixo', templateName: 'hello_world',
    })).toThrow(/prefixo/)
    expect(() => assertPilotCampaign(productionEnv(), {
      name: '[PILOT REAL] inválido', templateName: 'fora_da_lista',
    })).toThrow(/Template fora/)
    expect(() => assertPilotCampaign(productionEnv(), {
      name: '[PILOT REAL] válido', templateName: 'hello_world',
    })).not.toThrow()
    expect(pilotThrottleRate(productionEnv(), 80)).toBe(1)
    expect(pilotThrottleRate(env, 80)).toBe(80)
  })

  it('não aplica orçamento legado quando o modo piloto não está explicitamente ativo', () => {
    expect(pilotLimit(env)).toBe(Number.MAX_SAFE_INTEGER)
    expect(pilotLimit(productionEnv())).toBe(3)
  })

  it('reserva no máximo três tentativas de forma atômica', async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) => reservePilotAttempt(productionEnv(), {
        campaignId: `campaign-${index}`,
        contactId: `contact-${index}`,
        phone: ALLOWED,
      })),
    )
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(3)
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1)
    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM pilot_send_ledger',
    ).first<{ n: number }>()
    expect(count?.n).toBe(3)
  })

  it('preserva o histórico e reinicia o orçamento em uma nova rodada', async () => {
    for (let index = 0; index < 3; index++) {
      await reservePilotAttempt(productionEnv(), {
        campaignId: `old-campaign-${index}`,
        contactId: `old-contact-${index}`,
        phone: ALLOWED,
      })
    }
    await env.DB.prepare(
      "UPDATE pilot_runs SET status = 'closed', closed_at = datetime('now') WHERE id = 'run-1'"
    ).run()
    await env.DB.prepare(
      "INSERT INTO pilot_runs (id, label, status, max_attempts) VALUES ('run-2', 'Rodada 2', 'active', 3)"
    ).run()
    await expect(reservePilotAttempt(productionEnv(), {
      campaignId: 'new-campaign', contactId: 'new-contact', phone: ALLOWED,
    })).resolves.toEqual(expect.any(String))
    const counts = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN pilot_run_id = 'run-2' THEN 1 ELSE 0 END) AS current_run
       FROM pilot_send_ledger`
    ).first<{ total: number; current_run: number }>()
    expect(counts).toEqual({ total: 4, current_run: 1 })
  })

  it('bloqueia envio quando nenhuma rodada está ativa', async () => {
    await env.DB.prepare("UPDATE pilot_runs SET status = 'closed' WHERE id = 'run-1'").run()
    await expect(reservePilotAttempt(productionEnv(), {
      campaignId: 'no-run-campaign', contactId: 'no-run-contact', phone: ALLOWED,
    })).rejects.toThrow(/Rodada ausente/)
  })

  it('replay do mesmo contato é bloqueado e o ledger não armazena o telefone', async () => {
    const input = { campaignId: 'campaign-replay', contactId: 'contact-replay', phone: ALLOWED }
    const id = await reservePilotAttempt(productionEnv(), input)
    await finishPilotAttempt(productionEnv(), id, {
      status: 'accepted', messageId: 'wamid.test',
    })
    await expect(reservePilotAttempt(productionEnv(), input)).rejects.toBeInstanceOf(PilotSafetyError)
    const row = await env.DB.prepare(
      'SELECT phone_hash, status, message_id FROM pilot_send_ledger WHERE id = ?1',
    ).bind(id).first<{ phone_hash: string; status: string; message_id: string }>()
    expect(row).toMatchObject({ status: 'accepted', message_id: 'wamid.test' })
    expect(row?.phone_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(row?.phone_hash).not.toContain('5511999999999')
  })

  it('ambiguidade também consome orçamento', async () => {
    const id = await reservePilotAttempt(productionEnv(), {
      campaignId: 'campaign-ambiguous', contactId: 'contact-ambiguous', phone: ALLOWED,
    })
    await finishPilotAttempt(productionEnv(), id, {
      status: 'ambiguous', errorCode: 'SEND_OUTCOME_UNKNOWN',
    })
    const row = await env.DB.prepare(
      'SELECT status, error_code FROM pilot_send_ledger WHERE id = ?1',
    ).bind(id).first<{ status: string; error_code: string }>()
    expect(row).toEqual({ status: 'ambiguous', error_code: 'SEND_OUTCOME_UNKNOWN' })
  })
})
