import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { campaignsDb } from '../db/campaigns'
import { campaignContactsDb } from '../db/campaign-contacts'
import { whatsappClient } from '../whatsapp/client'
import { mapWhatsAppError } from '../whatsapp/errors'
import { getCredentials, type Credentials } from '../whatsapp/credentials'
import { broadcastToHub } from '../api/realtime'
import { settingsDb } from '../db/settings'

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
): Promise<{ creds: Credentials; rate: number; total: number } | null> {
  const cdb = campaignsDb(env.DB)
  const campaign = await cdb.get(campaignId)
  if (!campaign) throw new NonRetryableError('campanha não existe')
  if (campaign.status === 'cancelled') return null
  const creds = await getCredentials(env)
  if (!creds) throw new NonRetryableError('credenciais Meta ausentes')
  // Defensivo: valor inválido em settings (string livre, NaN, 0) não pode
  // desligar o throttle — cai no default seguro de 10 msg/s.
  const raw = Number((await settingsDb(env.DB).get('throttle_mps')) ?? 10)
  const rate = Number.isFinite(raw) && raw >= 1 ? raw : 10
  await cdb.setStatus(campaignId, 'sending')
  return { creds, rate, total: campaign.total }
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
  if (await cdb.isCancelled(campaignId)) return true

  // Recuperação de retry do step: rows presas em 'sending' por crash no meio do
  // batch anterior. COM message_id → a Meta já aceitou: marca 'sent'. SEM
  // message_id → volta pra 'pending' e será reenviada. Janela at-least-once
  // documentada: se o crash ocorreu ENTRE o aceite da Meta e a gravação do
  // message_id, o contato pode receber a mensagem 2x (raro; preferível a
  // deixar rows órfãs em 'sending' para sempre).
  await env.DB.prepare(
    `UPDATE campaign_contacts SET status = 'sent', updated_at = datetime('now')
     WHERE campaign_id = ?1 AND status = 'sending' AND message_id IS NOT NULL`
  ).bind(campaignId).run()
  await env.DB.prepare(
    `UPDATE campaign_contacts SET status = 'pending', updated_at = datetime('now')
     WHERE campaign_id = ?1 AND status = 'sending' AND message_id IS NULL`
  ).bind(campaignId).run()

  const batch = await ccdb.claimPending(campaignId, BATCH_SIZE)
  if (!batch.length) return true

  const campaign = (await cdb.get(campaignId))!
  const client = whatsappClient(creds)
  // Env tipado com DurableObjectNamespace<PhoneThrottle> — RPC direto, sem casts
  const throttle = env.THROTTLE.getByName(creds.phoneId)
  await throttle.configure(rate)

  let sent = 0, failed = 0
  for (const row of batch) {
    const waitMs = await throttle.acquire() // produção: sem argumento (now = Date.now() no DO)
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs)) // wall-time, não CPU
    const result = await client.sendTemplate(row.phone, {
      name: campaign.template_name, language: 'pt_BR',
    })
    if (result.ok) {
      await ccdb.markResult(campaignId, row.contact_id, { status: 'sent', message_id: result.messageId })
      sent++
    } else {
      const info = mapWhatsAppError(result.code)
      if (info.critical) {
        await cdb.setStatus(campaignId, 'failed')
        throw new NonRetryableError(`erro crítico Meta ${result.code}: ${info.message}`)
      }
      if (info.optOut) {
        await env.DB.prepare('UPDATE contacts SET status = ?2 WHERE id = ?1')
          .bind(row.contact_id, 'opt_out').run()
      }
      await ccdb.markResult(campaignId, row.contact_id, {
        status: 'failed', error_code: String(result.code), error_detail: info.message,
      })
      failed++
    }
  }
  await cdb.updateCounters(campaignId, { sent, failed })
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
    //    Teto de iterações: batches da campanha inteira + folga para retries que
    //    reivindicam batch vazio — nunca estoura o limite de steps do Workflow.
    const maxBatches = nextBatchPlan({ pending: config.total }, BATCH_SIZE) + 5
    let done = false
    for (let i = 0; i < maxBatches; i++) {
      done = await step.do(`send-batch-${i}`, { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' } },
        async () => sendCampaignBatch(this.env, campaignId, config.creds, config.rate))
      if (done) break
    }
    if (!done) {
      await step.do('fail-max-batches', async () => { await cdb.setStatus(campaignId, 'failed') })
      throw new NonRetryableError(
        `campanha ${campaignId} excedeu o teto de ${maxBatches} batches — abortada para não estourar o limite de steps`)
    }

    // 4. Fechamento
    await step.do('complete', async () => {
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
  }
}
