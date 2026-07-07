import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { reconcileCampaignCounters } from '../src/cron/reconcile'
import { campaignsDb } from '../src/db/campaigns'

// migrations aplicadas automaticamente via setupFiles (tests/apply-migrations.ts)

describe('reconcile', () => {
  it('corrige contador divergente a partir do COUNT real', async () => {
    const cdb = campaignsDb(env.DB)
    const c = await cdb.create({ name: 'R', template_name: 'promo_teste' })
    await cdb.setStatus(c.id, 'sending')
    await env.DB.prepare(
      `INSERT INTO campaign_contacts (campaign_id, contact_id, phone, status, message_id)
       VALUES (?1, 'x1', '+5511999990301', 'delivered', 'wamid.r1')`
    ).bind(c.id).run()
    // contador denormalizado errado de propósito (0)
    const fixed = await reconcileCampaignCounters(env.DB)
    expect(fixed).toBeGreaterThanOrEqual(1)
    expect((await cdb.get(c.id))!.delivered).toBe(1)
  })

  it('é idempotente — segunda chamada não corrige nada', async () => {
    const cdb = campaignsDb(env.DB)
    const c = await cdb.create({ name: 'R2', template_name: 'promo_teste' })
    await cdb.setStatus(c.id, 'sending')
    await env.DB.prepare(
      `INSERT INTO campaign_contacts (campaign_id, contact_id, phone, status, message_id)
       VALUES (?1, 'x2', '+5511999990302', 'delivered', 'wamid.r2')`
    ).bind(c.id).run()
    await reconcileCampaignCounters(env.DB) // primeira passada corrige o drift
    const second = await reconcileCampaignCounters(env.DB)
    expect(second).toBe(0) // nada mais divergente: reconcile é idempotente
  })

  it('não toca campanha concluída há mais de 1 dia', async () => {
    const cdb = campaignsDb(env.DB)
    const c = await cdb.create({ name: 'R3', template_name: 'promo_teste' })
    await env.DB.prepare(
      `INSERT INTO campaign_contacts (campaign_id, contact_id, phone, status, message_id)
       VALUES (?1, 'x3', '+5511999990303', 'delivered', 'wamid.r3')`
    ).bind(c.id).run()
    // concluída há 2 dias, com contador divergente de propósito — fora da janela do cron
    await env.DB.prepare(
      `UPDATE campaigns SET status = 'completed',
         completed_at = datetime('now', '-2 days'), delivered = 99 WHERE id = ?1`
    ).bind(c.id).run()
    await reconcileCampaignCounters(env.DB)
    expect((await cdb.get(c.id))!.delivered).toBe(99) // intocada: fora da janela de 1 dia
  })
})

describe('dashboard', () => {
  it('retorna agregados', async () => {
    const res = await SELF.fetch('https://x.com/api/dashboard', { headers: { 'x-api-key': 'dev-api-key' } })
    expect(res.status).toBe(200)
    const data = (await res.json()) as { sent30d: number; recentCampaigns: unknown[] }
    expect(typeof data.sent30d).toBe('number')
    expect(Array.isArray(data.recentCampaigns)).toBe(true)
  })
})
