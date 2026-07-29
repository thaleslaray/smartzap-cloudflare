import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { campaignsDb } from '../db/campaigns'
import { campaignContactsDb } from '../db/campaign-contacts'
import { whatsappClient } from '../whatsapp/client'
import { mapWhatsAppError } from '../whatsapp/errors'
import { getCredentials, type Credentials } from '../whatsapp/credentials'
import { broadcastToHub } from '../api/realtime'
import { settingsDb } from '../db/settings'
import { templatesDb } from '../db/templates'
import { contactsDb } from '../db/contacts'
import { probeMeta } from '../whatsapp/health'
import {
  assertPilotCampaign, finishPilotAttempt, PilotSafetyError, pilotThrottleRate,
  reservePilotAttempt,
} from '../domain/pilot'
import { reconcileCampaignCounter } from '../cron/reconcile'
import { campaignBatchesDb } from '../db/campaign-batches'
import { safeRateForMode } from '../domain/meta-throughput'

export type CampaignWorkflowParams = { campaignId: string }
const BATCH_SIZE = 50

export function nextBatchPlan(counters: { pending: number }, batchSize: number): number {
  return Math.ceil(counters.pending / batchSize)
}

/**
 * Carrega a config de envio. Retorna null se a campanha foi cancelada
 * (ex.: durante o agendamento). Exportada para ser testável sem o runtime de Workflows.
 */
export async function loadSendConfig(
  env: Env, campaignId: string,
): Promise<{ rate: number; total: number } | null> {
  const cdb = campaignsDb(env.DB)
  const campaign = await cdb.get(campaignId)
  if (!campaign) throw new NonRetryableError('campanha não existe')
  if (campaign.status === 'cancelled') return null
  const creds = await getCredentials(env)
  if (!creds) throw new NonRetryableError('credenciais Meta ausentes')
  if (!creds.wabaId) throw new NonRetryableError('WABA ID ausente')
  const meta = await probeMeta(creds)
  if (!meta.ok) throw new NonRetryableError(`preflight Meta falhou: ${meta.error ?? 'estado inválido'}`)
  // Defensivo: valor inválido em settings (string livre, NaN, 0) não pode
  // desligar o throttle — cai no default seguro de 10 msg/s.
  const settings = settingsDb(env.DB)
  const raw = Number(await settings.get('throttle_mps'))
  const modeRaw = await settings.get('throttle_mode')
  const mode = modeRaw === 'maximum' || modeRaw === 'manual' ? modeRaw : 'automatic'
  const rate = pilotThrottleRate(
    env,
    safeRateForMode(meta.health?.throughputMps ?? null, mode, Number.isFinite(raw) ? raw : null),
  )
  // A API pode pausar a campanha imediatamente após o dispatch, antes de o
  // Workflow executar esta etapa. Não sobrescreva essa pausa concorrente.
  if (campaign.status !== 'paused') await cdb.setStatus(campaignId, 'sending')
  // Nunca retorne credenciais daqui: o resultado de step.do fica persistido no
  // histórico do Workflow e pode ser consultado pelas ferramentas da Cloudflare.
  return { rate, total: campaign.total }
}

export async function finalizeWorkflowFailure(
  env: Env, campaignId: string, detail: string,
): Promise<number> {
  const cdb = campaignsDb(env.DB)
  const campaign = await cdb.get(campaignId)
  if (!campaign || ['cancelled', 'completed', 'failed'].includes(campaign.status)) return 0
  const failed = await campaignContactsDb(env.DB).failUnfinished(
    campaignId, 'WORKFLOW_FAILED', detail.slice(0, 500),
  )
  if (failed) await cdb.updateCounters(campaignId, { failed })
  await campaignBatchesDb(env.DB).finalizeOpen(campaignId, 'failed')
  await cdb.markFailedUnlessTerminal(campaignId)
  return failed
}

/**
 * Envia um batch. Retorna true quando não há mais pendentes (ou cancelada).
 * Exportada para ser testável com D1/DO reais e fetch stubado.
 */
export async function sendCampaignBatch(
  env: Env, campaignId: string, creds: Credentials, rate: number,
): Promise<boolean> {
  const cdb = campaignsDb(env.DB)
  const ccdb = campaignContactsDb(env.DB)
  const batches = campaignBatchesDb(env.DB)
  if (await cdb.isCancelled(campaignId)) return true

  // Se o ledger do piloto já consolidou o aceite, recupera o message_id que não
  // chegou ao contato por uma interrupção entre as duas persistências.
  await env.DB.prepare(
    `UPDATE campaign_contacts SET message_id = (
       SELECT l.message_id FROM pilot_send_ledger l
       WHERE l.campaign_id = campaign_contacts.campaign_id
         AND l.contact_id = campaign_contacts.contact_id
         AND l.status = 'accepted' AND l.message_id IS NOT NULL LIMIT 1
     )
     WHERE campaign_id = ?1 AND status = 'sending' AND message_id IS NULL
       AND EXISTS (
         SELECT 1 FROM pilot_send_ledger l
         WHERE l.campaign_id = campaign_contacts.campaign_id
           AND l.contact_id = campaign_contacts.contact_id
           AND l.status = 'accepted' AND l.message_id IS NOT NULL
       )`
  ).bind(campaignId).run()
  // Recuperação fail-closed: COM message_id, a Meta confirmou o aceite. SEM
  // message_id, o resultado é desconhecido e jamais volta para pending, pois um
  // crash pode ter ocorrido entre o aceite remoto e a persistência local.
  const accepted = await env.DB.prepare(
    `UPDATE campaign_contacts SET status = 'sent', updated_at = datetime('now')
     WHERE campaign_id = ?1 AND status = 'sending' AND message_id IS NOT NULL`
  ).bind(campaignId).run()
  if ((accepted.meta.changes ?? 0) > 0)
    await cdb.updateCounters(campaignId, { sent: accepted.meta.changes ?? 0 })
  const uncertain = await env.DB.prepare(
    `UPDATE campaign_contacts SET status = 'failed', error_code = 'SEND_OUTCOME_UNKNOWN',
       error_detail = 'Resultado desconhecido após interrupção; reenvio automático bloqueado.',
       updated_at = datetime('now')
     WHERE campaign_id = ?1 AND status = 'sending' AND message_id IS NULL`
  ).bind(campaignId).run()
  if ((uncertain.meta.changes ?? 0) > 0) {
    const remaining = await ccdb.failUnfinished(
      campaignId, 'CAMPAIGN_BLOCKED_AFTER_UNKNOWN_SEND',
      'Campanha interrompida para impedir mensagens duplicadas.')
    await cdb.updateCounters(campaignId, { failed: (uncertain.meta.changes ?? 0) + remaining })
    await cdb.setStatus(campaignId, 'failed')
    throw new NonRetryableError('resultado anterior desconhecido; campanha bloqueada contra duplicação')
  }

  const batchRecord = await batches.begin(campaignId)
  const batch = await ccdb.claimPending(campaignId, BATCH_SIZE, batchRecord.id)
  if (!batch.length) {
    await batches.complete(batchRecord.id, { recipients: 0, accepted: 0, failed: 0 })
    return true
  }
  await batches.trace(campaignId, batchRecord.id, 'batch_claimed', 'info', { recipients: batch.length })

  const campaign = (await cdb.get(campaignId))!
  try {
    assertPilotCampaign(env, { name: campaign.name, templateName: campaign.template_name })
  } catch (error) {
    if (!(error instanceof PilotSafetyError)) throw error
    const count = await ccdb.failUnfinished(campaignId, 'PILOT_SAFETY_BLOCK', error.message)
    if (count) await cdb.updateCounters(campaignId, { failed: count })
    await cdb.setStatus(campaignId, 'failed')
    throw new NonRetryableError(error.message)
  }
  const client = whatsappClient(creds)
  // Idioma REAL e explícito da variante escolhida. Componentes/variáveis do
  // template NÃO são enviados: o MVP não modela parâmetros por destinatário, então só
  // templates sem variáveis são suportados (templates com {{1}} retornam 132000).
  // templatesDb.get devolve a linha com tipagem frouxa — castamos para ler o idioma.
  const template = (await templatesDb(env.DB).get(
    campaign.template_name, campaign.template_language,
  )) as {
    language: string; status: string; quality_score?: string | null
  } | null
  if (!template || template.status !== 'APPROVED' || template.quality_score === 'RED') {
    const count = await ccdb.failUnfinished(
      campaignId, 'TEMPLATE_NOT_APPROVED', 'Template não está aprovado na sincronização mais recente da Meta.')
    if (count) await cdb.updateCounters(campaignId, { failed: count })
    await cdb.setStatus(campaignId, 'failed')
    throw new NonRetryableError('template não aprovado, pausado ou desativado')
  }
  const language = template.language
  // Env tipado com DurableObjectNamespace<PhoneThrottle> — RPC direto, sem casts
  const throttle = env.THROTTLE.getByName(creds.phoneId)
  await throttle.configure(rate)

  let sent = 0, failed = 0, batchAccepted = 0, batchFailed = 0
  const flushCounters = async () => {
    if (!sent && !failed) return
    await cdb.updateCounters(campaignId, { sent, failed })
    sent = 0
    failed = 0
  }
  for (const row of batch) {
    let components: unknown[] | undefined
    try {
      components = row.rendered_payload_json ? JSON.parse(row.rendered_payload_json) : undefined
      if (components !== undefined && !Array.isArray(components)) throw new Error('payload inválido')
    } catch {
      // Validação local acontece antes do throttle e, principalmente, antes de
      // reservar uma tentativa real no ledger do piloto.
      await ccdb.markResult(campaignId, row.contact_id, {
        status: 'failed', error_code: 'RENDERED_PAYLOAD_INVALID', error_detail: 'Payload renderizado inválido; envio bloqueado.',
      })
      failed++
      batchFailed++
      continue
    }
    const waitMs = await throttle.acquire() // produção: sem argumento (now = Date.now() no DO)
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs)) // wall-time, não CPU
    let reservationId: string | null
    try {
      // Revalidação imediatamente antes do POST: o kill switch pode ter sido
      // desligado enquanto o Workflow aguardava agendamento ou throttle.
      reservationId = await reservePilotAttempt(env, {
        campaignId, contactId: row.contact_id, phone: row.phone,
      })
    } catch (error) {
      if (!(error instanceof PilotSafetyError)) throw error
      await flushCounters()
      const unfinished = await ccdb.failUnfinished(
        campaignId, 'PILOT_SAFETY_BLOCK', error.message)
      if (unfinished) await cdb.updateCounters(campaignId, { failed: unfinished })
      await cdb.setStatus(campaignId, 'failed')
      throw new NonRetryableError(error.message)
    }
    let result
    try {
      result = await client.sendTemplate(row.phone, {
        name: campaign.template_name, language, components,
      })
    } catch (error) {
      // Defesa final: o cliente converte falhas de transporte em resultado
      // ambíguo. Qualquer exceção inesperada aqui também não pode causar reenvio.
      await finishPilotAttempt(env, reservationId, {
        status: 'ambiguous', errorCode: 'SEND_OUTCOME_UNKNOWN',
      })
      await flushCounters()
      const unfinished = await ccdb.failUnfinished(
        campaignId, 'SEND_OUTCOME_UNKNOWN', 'Resultado do envio desconhecido; reenvio automático bloqueado.')
      if (unfinished) await cdb.updateCounters(campaignId, { failed: unfinished })
      await cdb.setStatus(campaignId, 'failed')
      throw new NonRetryableError(error instanceof Error ? error.message : 'resultado do envio desconhecido')
    }
      if (result.ok) {
      await finishPilotAttempt(env, reservationId, {
        status: 'accepted', messageId: result.messageId,
      })
      await ccdb.markResult(campaignId, row.contact_id, {
        status: 'sent', message_id: result.messageId, acceptance_status: result.messageStatus,
      })
      if (result.waId) await contactsDb(env.DB).setWaId(row.contact_id, result.waId)
      if (result.userId) await contactsDb(env.DB).setUserId(row.contact_id, result.userId)
      sent++
      batchAccepted++
    } else {
      if (result.ambiguous) {
        await finishPilotAttempt(env, reservationId, {
          status: 'ambiguous', errorCode: String(result.code),
        })
        await flushCounters()
        const unfinished = await ccdb.failUnfinished(
          campaignId, 'SEND_OUTCOME_UNKNOWN', result.detail)
        if (unfinished) await cdb.updateCounters(campaignId, { failed: unfinished })
        await cdb.setStatus(campaignId, 'failed')
        throw new NonRetryableError('resultado de envio ambíguo; reenvio automático bloqueado')
      }
      await finishPilotAttempt(env, reservationId, {
        status: 'rejected', errorCode: String(result.code),
      })
      const info = mapWhatsAppError(result.code, result.httpStatus)
      const technical = result.fbtraceId ? ` Meta trace: ${result.fbtraceId}.` : ''
      const detail = `${info.message} ${result.detail}${technical}`.trim().slice(0, 500)
      if (info.retryable) {
        await flushCounters()
        if (result.code === 130429) {
          await throttle.backoff(rate, Math.max(60, result.retryAfterSeconds ?? 0))
        }
        // No piloto cada tentativa real é única no ledger. Mesmo com rejeição
        // estruturada da Meta, não contornamos essa trava fazendo um segundo POST
        // automático para o mesmo contato. Fora do piloto (reservationId nulo),
        // o retry durável continua permitido porque a rejeição prova não aceite.
        if (reservationId) {
          await ccdb.markResult(campaignId, row.contact_id, {
            status: 'failed', error_code: String(result.code), error_detail: detail,
          })
          const unfinished = await ccdb.failUnfinished(
            campaignId, 'PILOT_RETRY_REQUIRES_REVIEW',
            'Erro transitório no piloto; reenvio automático bloqueado para revisão humana.')
          await cdb.updateCounters(campaignId, { failed: 1 + unfinished })
          await cdb.setStatus(campaignId, 'failed')
          throw new NonRetryableError(
            `erro transitório Meta ${result.code} no piloto; retry automático bloqueado`)
        }
        if ((result.retryAfterSeconds ?? 0) > 300) {
          const unfinished = await ccdb.failUnfinished(
            campaignId, 'RETRY_AFTER_TOO_LONG',
            `Meta solicitou espera de ${result.retryAfterSeconds}s; campanha bloqueada para intervenção.`)
          if (unfinished) await cdb.updateCounters(campaignId, { failed: unfinished })
          await cdb.setStatus(campaignId, 'failed')
          throw new NonRetryableError('Retry-After da Meta excede a janela automática segura')
        }
        // A Meta respondeu com erro Graph estruturado: este envio foi rejeitado,
        // portanto é seguro liberar o item e os ainda não processados para retry.
        await env.DB.prepare(
          `UPDATE campaign_contacts SET status = 'pending', updated_at = datetime('now')
           WHERE campaign_id = ?1 AND status = 'sending' AND message_id IS NULL`
        ).bind(campaignId).run()
        const retryAfter = result.retryAfterSeconds ? ` Retry-After=${result.retryAfterSeconds}s.` : ''
        throw new Error(`erro transitório Meta ${result.code}: ${detail}${retryAfter}`)
      }
      if (info.critical) {
        if (result.code === 132015 || result.code === 132016) {
          await templatesDb(env.DB).setStatusFromWebhook({
            name: campaign.template_name,
            language: campaign.template_language,
            status: result.code === 132015 ? 'PAUSED' : 'DISABLED',
          })
        }
        const unfinishedFailed = await ccdb.failUnfinished(campaignId, String(result.code), detail)
        failed += unfinishedFailed
        await flushCounters()
        await cdb.setStatus(campaignId, 'failed')
        throw new NonRetryableError(`erro crítico Meta ${result.code}: ${info.message}`)
      }
      if (info.optOut) {
        await contactsDb(env.DB).setStatus([row.contact_id], 'opt_out')
      }
      await ccdb.markResult(campaignId, row.contact_id, {
        status: 'failed', error_code: String(result.code), error_detail: detail,
      })
      failed++
      batchFailed++
    }
  }
  await flushCounters()
  await batches.complete(batchRecord.id, { recipients: batch.length, accepted: batchAccepted, failed: batchFailed })
  await batches.trace(campaignId, batchRecord.id, 'batch_completed', batchFailed ? 'warn' : 'info', { accepted: batchAccepted, failed: batchFailed })
  const updated = (await cdb.get(campaignId))!
  await broadcastToHub(env, {
    type: 'progress', campaignId,
    counters: { sent: updated.sent, delivered: updated.delivered, read: updated.read, failed: updated.failed, total: updated.total },
  })
  return batch.length < BATCH_SIZE
}

export class CampaignSendWorkflow extends WorkflowEntrypoint<Env, CampaignWorkflowParams> {
  // Coordenador fino: toda a lógica mora nas funções exportadas acima
  async run(event: WorkflowEvent<CampaignWorkflowParams>, step: WorkflowStep) {
    const { campaignId } = event.payload
    const cdb = campaignsDb(this.env.DB)
    const ccdb = campaignContactsDb(this.env.DB)

    try {
      // 1. Agendamento: sleepUntil é determinístico entre replays (nenhum
      //    cálculo de delta com Date.now() fora de step)
      const scheduledAt = await step.do('load-schedule', async () => {
        const c = await cdb.get(campaignId)
        if (!c) throw new NonRetryableError('campanha não existe')
        return c.scheduled_at
      })
      if (scheduledAt) await step.sleepUntil('wait-schedule', new Date(scheduledAt))

      // 2. Config: cancelamento + credenciais + throttle
      const config = await step.do('load-config', async () => loadSendConfig(this.env, campaignId))
      if (!config) return // cancelada durante o agendamento

      // 3. Batches — cada um é um step durável independente (retry só re-envia o batch).
      const maxBatches = nextBatchPlan({ pending: config.total }, BATCH_SIZE) + 5
      let done = false
      for (let i = 0; i < maxBatches; i++) {
        // Cinco minutos respeitam qualquer Retry-After automático aceito acima;
        // valores maiores bloqueiam a campanha em vez de pressionar a API.
        done = await step.do(`send-batch-${i}`, { retries: { limit: 3, delay: '5 minutes', backoff: 'exponential' } },
          async () => {
            // Carregadas dentro da execução da etapa, usadas apenas em memória e
            // nunca incluídas no valor serializado pelo Workflow.
            const creds = await getCredentials(this.env)
            if (!creds?.wabaId) throw new NonRetryableError('credenciais Meta ausentes')
            return sendCampaignBatch(this.env, campaignId, creds, config.rate)
          })
        if (done) break
      }
      if (!done) throw new NonRetryableError(
        `campanha ${campaignId} excedeu o teto de ${maxBatches} batches — abortada para não estourar o limite de steps`)

      // 4. Fechamento
      await step.do('complete', async () => {
        // Um step pode ter persistido o contato e caído antes de incrementar o
        // contador denormalizado. O COUNT real vence antes do estado terminal.
        await reconcileCampaignCounter(this.env.DB, campaignId)
        const counts = await ccdb.countByStatus(campaignId)
        const stillCancelled = await cdb.isCancelled(campaignId)
        if (!stillCancelled) await cdb.setStatus(campaignId, 'completed')
        const c = (await cdb.get(campaignId))!
        await broadcastToHub(this.env, {
          type: 'progress', campaignId,
          counters: { sent: c.sent, delivered: c.delivered, read: c.read, failed: c.failed, total: c.total },
        })
        await broadcastToHub(this.env, { type: 'invalidate', keys: [['campaigns'], ['dashboard']] })
        console.log(`[campaign ${campaignId}] concluída`, counts)
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'erro desconhecido no workflow'
      await step.do('finalize-error', { retries: { limit: 5, delay: '5 seconds', backoff: 'exponential' } },
        async () => finalizeWorkflowFailure(this.env, campaignId, detail))
      throw error
    }
  }
}
