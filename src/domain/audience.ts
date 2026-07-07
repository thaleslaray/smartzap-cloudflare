export async function resolveAudience(
  db: D1Database, opts: { tags?: string[] },
): Promise<{ eligible: { id: string; phone: string }[]; skipped: number }> {
  const tagJoin = opts.tags?.length
    ? `JOIN contact_tags ct ON ct.contact_id = c.id
       JOIN tags t ON t.id = ct.tag_id AND t.name IN (${opts.tags.map((_, i) => `?${i + 1}`).join(',')})`
    : ''
  const binds = opts.tags ?? []
  const eligible = (await db.prepare(
    `SELECT DISTINCT c.id, c.phone FROM contacts c ${tagJoin}
     WHERE c.status = 'opt_in'
       AND c.phone NOT IN (
         SELECT phone FROM suppressions
         WHERE expires_at IS NULL OR expires_at > datetime('now'))`
  ).bind(...binds).all<{ id: string; phone: string }>()).results
  const totalCandidates = (await db.prepare(
    `SELECT COUNT(DISTINCT c.id) as n FROM contacts c ${tagJoin}`
  ).bind(...binds).first<{ n: number }>())!.n
  return { eligible, skipped: totalCandidates - eligible.length }
}
