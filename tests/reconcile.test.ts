import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { reconcileCampaignCounter, reconcileCampaignCounters } from '../src/cron/reconcile'
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

  it('reconcilia uma campanha específica antes do fechamento do Workflow', async () => {
    const cdb = campaignsDb(env.DB)
    const c = await cdb.create({ name: 'R específica', template_name: 'promo_teste' })
    await env.DB.prepare(
      `INSERT INTO campaign_contacts (campaign_id, contact_id, phone, status, message_id)
       VALUES (?1, ?2, '+5511999990399', 'sent', ?3)`
    ).bind(c.id, crypto.randomUUID(), `wamid.${crypto.randomUUID()}`).run()
    expect(await reconcileCampaignCounter(env.DB, c.id)).toBe(true)
    expect((await cdb.get(c.id))?.sent).toBe(1)
    expect(await reconcileCampaignCounter(env.DB, c.id)).toBe(false)
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

  it('identifica a campanha e o motivo da falha mais recente', async () => {
    const c = await campaignsDb(env.DB).create({ name: 'Campanha com falha', template_name: 'promo_teste' })
    await env.DB.prepare(
      `INSERT INTO campaign_contacts (campaign_id, contact_id, phone, status, error_code, error_detail)
       VALUES (?1, 'dashboard-failure-contact', '+5511999990000', 'failed', 'META_RECIPIENT_BLOCKED', 'O destinatário bloqueou mensagens desta empresa.')`,
    ).bind(c.id).run()
    await env.DB.prepare('UPDATE campaigns SET failed = 1 WHERE id = ?1').bind(c.id).run()

    const res = await SELF.fetch('https://x.com/api/dashboard', { headers: { 'x-api-key': 'dev-api-key' } })
    expect(res.status).toBe(200)
    const data = (await res.json()) as { latestFailure: { campaign_id: string; campaign_name: string; error_code: string; error_detail: string } | null }
    expect(data.latestFailure).toMatchObject({
      campaign_id: c.id,
      campaign_name: 'Campanha com falha',
      error_code: 'META_RECIPIENT_BLOCKED',
      error_detail: 'O destinatário bloqueou mensagens desta empresa.',
    })
  })

  it('retorna performance mesmo quando a campanha não possui colunas legadas', async () => {
    const res = await SELF.fetch('https://x.com/api/dashboard/performance?rangeDays=30', {
      headers: { 'x-api-key': 'dev-api-key' },
    })
    expect(res.status).toBe(200)
    const data = (await res.json()) as { totals: { runs: number }; runs: unknown[] }
    expect(typeof data.totals.runs).toBe('number')
    expect(Array.isArray(data.runs)).toBe(true)
  })
})
