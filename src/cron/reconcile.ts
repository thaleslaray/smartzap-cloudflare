// Contadores denormalizados podem sofrer drift (webhooks perdidos, retries).
// A cada 15min o COUNT real vence.
export async function reconcileCampaignCounter(db: D1Database, id: string): Promise<boolean> {
  const r = await db.prepare(
    `UPDATE campaigns SET
       sent = (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status IN ('sent','delivered','read')),
       delivered = (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status IN ('delivered','read')),
       read = (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status = 'read'),
       failed = (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status = 'failed')
     WHERE id = ?1 AND (
       sent != (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status IN ('sent','delivered','read'))
       OR delivered != (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status IN ('delivered','read'))
       OR read != (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status = 'read')
       OR failed != (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status = 'failed'))`
  ).bind(id).run()
  return (r.meta.changes ?? 0) > 0
}

export async function reconcileCampaignCounters(db: D1Database): Promise<number> {
  const active = (await db.prepare(
    `SELECT id FROM campaigns WHERE status IN ('sending','paused')
     OR completed_at > datetime('now', '-1 day')`
  ).all<{ id: string }>()).results
  let fixed = 0
  for (const { id } of active) {
    if (await reconcileCampaignCounter(db, id)) fixed++
  }
  return fixed
}
