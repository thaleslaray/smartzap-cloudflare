import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  assertPilotAudience, assertPilotCampaign, assertPilotRecipient, assertPilotTimeWindow, finishPilotAttempt,
  PilotSafetyError, pilotConfiguration, pilotLimit, pilotThrottleRate, reservePilotAttempt,
} from '../src/domain/pilot'

const ALLOWED = '+5511999999999'
const ALLOWED_2 = '+5521999999999'
const ALLOWED_3 = '+5531999999999'
const ALLOWED_4 = '+5541999999999'

function productionEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...env,
    ENVIRONMENT: 'production',
    PILOT_GUARDS_ENABLED: 'true',
    PILOT_SEND_ENABLED: 'true',
    PILOT_RECIPIENT_E164: ALLOWED,
    PILOT_RECIPIENT_ALLOWLIST: [ALLOWED, ALLOWED_2, ALLOWED_3, ALLOWED_4].join(','),
    PILOT_MAX_REAL_SENDS: '3',
    PILOT_MAX_RUNS_PER_DAY: '2',
    PILOT_TIME_WINDOW_ENABLED: 'false',
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
  it('aceita até três destinatários da allowlist e falha fechado fora dela', () => {
    expect(() => assertPilotAudience(productionEnv({ PILOT_SEND_ENABLED: 'false' }), [
      { phone: ALLOWED },
    ])).toThrow(/Kill switch/)
    expect(() => assertPilotAudience(productionEnv(), [])).toThrow(/entre 1 e 3/)
    expect(() => assertPilotAudience(productionEnv(), [
      { phone: ALLOWED }, { phone: ALLOWED_2 }, { phone: ALLOWED_3 },
    ])).not.toThrow()
    expect(() => assertPilotAudience(productionEnv(), [
      { phone: ALLOWED }, { phone: ALLOWED_2 }, { phone: ALLOWED_3 }, { phone: ALLOWED_4 },
    ])).toThrow(/entre 1 e 3/)
    expect(() => assertPilotAudience(productionEnv(), [
      { phone: ALLOWED }, { phone: ALLOWED },
    ])).toThrow(/duplicados/)
    expect(() => assertPilotRecipient(productionEnv(), '+5551999999999')).toThrow(/allowlist/)
    expect(() => assertPilotRecipient(productionEnv(), ALLOWED_4)).not.toThrow()
  })

  it('mantém compatibilidade com o destinatário único legado', () => {
    const legacy = productionEnv({ PILOT_RECIPIENT_ALLOWLIST: undefined })
    expect(() => assertPilotRecipient(legacy, ALLOWED)).not.toThrow()
    expect(() => assertPilotRecipient(legacy, ALLOWED_2)).toThrow(/allowlist/)
  })

  it('bloqueia configuração de allowlist malformada', () => {
    expect(() => assertPilotRecipient(productionEnv({
      PILOT_RECIPIENT_ALLOWLIST: `${ALLOWED},telefone-invalido`,
    }), ALLOWED)).toThrow(/não está configurada corretamente/)
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

  it('bloqueia o canário fora da janela de 09:00 a 20:00 BRT', () => {
    const guarded = productionEnv({ PILOT_TIME_WINDOW_ENABLED: 'true' })
    expect(() => assertPilotTimeWindow(guarded, new Date('2026-07-29T11:59:00Z')))
      .toThrow(/09:00 e 20:00/)
    expect(() => assertPilotTimeWindow(guarded, new Date('2026-07-29T12:00:00Z')))
      .not.toThrow()
    expect(() => assertPilotTimeWindow(guarded, new Date('2026-07-29T22:59:00Z')))
      .not.toThrow()
    expect(() => assertPilotTimeWindow(guarded, new Date('2026-07-29T23:00:00Z')))
      .toThrow(/09:00 e 20:00/)
    expect(() => assertPilotTimeWindow(productionEnv({
      PILOT_TIME_WINDOW_ENABLED: 'true',
      PILOT_SUPERVISED_OUTSIDE_WINDOW: 'true',
    }), new Date('2026-07-29T23:00:00Z'))).not.toThrow()
  })

  it('bloqueia tentativa quando a rodada ativa excede duas rodadas no dia', async () => {
    await env.DB.prepare(
      "INSERT INTO pilot_runs (id, label, status, max_attempts, created_at) VALUES ('run-old-1', 'Anterior 1', 'closed', 1, datetime('now'))",
    ).run()
    await env.DB.prepare(
      "INSERT INTO pilot_runs (id, label, status, max_attempts, created_at) VALUES ('run-old-2', 'Anterior 2', 'closed', 1, datetime('now'))",
    ).run()
    await expect(reservePilotAttempt(productionEnv(), {
      campaignId: 'daily-limit-campaign',
      contactId: 'daily-limit-contact',
      phone: ALLOWED,
    })).rejects.toThrow(/limite diário/)
  })

  it('aceita o teto diário de dez somente quando configurado explicitamente', async () => {
    await env.DB.prepare(
      "INSERT INTO pilot_runs (id, label, status, max_attempts, created_at) VALUES ('run-old-1', 'Anterior 1', 'closed', 1, datetime('now'))",
    ).run()
    await env.DB.prepare(
      "INSERT INTO pilot_runs (id, label, status, max_attempts, created_at) VALUES ('run-old-2', 'Anterior 2', 'closed', 1, datetime('now'))",
    ).run()
    const authorized = productionEnv({ PILOT_MAX_RUNS_PER_DAY: '10' })
    await expect(reservePilotAttempt(authorized, {
      campaignId: 'authorized-campaign',
      contactId: 'authorized-contact',
      phone: ALLOWED,
    })).resolves.toEqual(expect.any(String))
    expect(pilotConfiguration(authorized)).toMatchObject({
      maxRunsPerDay: 10,
      supervisedOutsideWindow: false,
    })
    await expect(reservePilotAttempt(productionEnv({ PILOT_MAX_RUNS_PER_DAY: '11' }), {
      campaignId: 'invalid-limit-campaign',
      contactId: 'invalid-limit-contact',
      phone: ALLOWED,
    })).rejects.toThrow(/entre 1 e 10/)
    expect(pilotConfiguration(productionEnv({ PILOT_MAX_RUNS_PER_DAY: '11' })).maxRunsPerDay)
      .toBeNull()
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
