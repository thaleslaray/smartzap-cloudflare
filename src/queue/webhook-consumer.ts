import { campaignsDb, type Counters } from '../db/campaigns'
import { campaignContactsDb } from '../db/campaign-contacts'
import { statusEventsDb } from '../db/status-events'
import { broadcastToHub } from '../api/realtime'
import type { MetaStatus } from '../api/webhook'

export async function handleWebhookBatch(statuses: MetaStatus[], env: Env): Promise<void> {
  if (!statuses.length) return

  // 1. Log bruto (histórico para o futuro inbox). Queues são at-least-once:
  //    duplicatas aqui são TOLERADAS — status_events é log, não fonte de contadores.
  await statusEventsDb(env.DB).insertMany(
    statuses.map((s) => ({ message_id: s.id, status: s.status, raw: JSON.stringify(s) })))

  // 2. Updates individuais. A idempotência mora no UPDATE condicional ATÔMICO de
  //    updateByMessageId: um retry do mesmo evento não progride o status de novo
  //    (applied=false/null) e portanto não incrementa contador duas vezes.
  const ccdb = campaignContactsDb(env.DB)
  const deltas = new Map<string, Partial<Counters>>()
  for (const s of statuses) {
    if (!['delivered', 'read', 'failed'].includes(s.status)) continue
    const updated = await ccdb.updateByMessageId(s.id, s.status)
    if (!updated?.applied) continue
    const d = deltas.get(updated.campaign_id) ?? {}
    if (s.status === 'delivered') d.delivered = (d.delivered ?? 0) + 1
    if (s.status === 'read') d.read = (d.read ?? 0) + 1
    if (s.status === 'failed') d.failed = (d.failed ?? 0) + 1
    deltas.set(updated.campaign_id, d)
  }

  // 3. Um UPDATE de contadores por campanha por batch + broadcast
  const cdb = campaignsDb(env.DB)
  for (const [campaignId, d] of deltas) {
    await cdb.updateCounters(campaignId, d)
    await broadcastToHub(env, { type: 'invalidate', keys: [['campaigns'], ['campaign', campaignId], ['dashboard']] })
  }
}
