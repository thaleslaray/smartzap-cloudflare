import { compileSavedSegmentRules } from './segments'

export type AudienceInput = {
  tags?: string[]
  segmentId?: string
  contactIds?: string[]
  phonePrefixes?: string[]
  combinator?: 'and' | 'or'
}
export type AudienceSkippedItem = {
  id: string; phone: string; name: string | null
  reason: 'opt_out' | 'unknown_status' | 'no_consent' | 'suppressed'
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')

export async function resolveAudience(
  db: D1Database, opts: AudienceInput,
): Promise<{ eligible: { id: string; phone: string }[]; skipped: number; skippedItems: AudienceSkippedItem[] }> {
  const binds: unknown[] = []
  const bind = (value: unknown) => { binds.push(value); return `?${binds.length}` }
  const clauses: string[] = []

  if (opts.segmentId) {
    const saved = await db.prepare('SELECT rules_json FROM saved_segments WHERE id = ?1')
      .bind(opts.segmentId).first<{ rules_json: string }>()
    if (!saved) throw new Error('segmento não encontrado')
    const compiled = compileSavedSegmentRules(JSON.parse(saved.rules_json))
    const offset = binds.length
    clauses.push(compiled.sql.replace(/\?(\d+)/g, (_, n: string) => `?${Number(n) + offset}`))
    binds.push(...compiled.bindings)
  }

  if (opts.contactIds?.length) {
    clauses.push(`c.id IN (${opts.contactIds.map((id) => bind(id)).join(',')})`)
  } else {
    const quick: string[] = []
    if (opts.tags?.length) {
      if (opts.combinator === 'and' && opts.tags.length > 1) {
        quick.push(...opts.tags.map((tag) => {
          const name = bind(tag)
          return `EXISTS (SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
            WHERE ct.contact_id = c.id AND t.name = ${name})`
        }))
      } else {
        const names = opts.tags.map((tag) => bind(tag)).join(',')
        quick.push(`EXISTS (SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
          WHERE ct.contact_id = c.id AND t.name IN (${names}))`)
      }
    }
    if (opts.phonePrefixes?.length) {
      quick.push(`(${opts.phonePrefixes.map((prefix) => `c.phone LIKE ${bind(`${escapeLike(prefix)}%`)} ESCAPE '\\'`).join(' OR ')})`)
    }
    if (quick.length) clauses.push(`(${quick.join(opts.combinator === 'and' ? ' AND ' : ' OR ')})`)
  }

  const filter = clauses.length ? ` AND ${clauses.join(' AND ')}` : ''
  const candidates = (await db.prepare(
    `SELECT c.id, c.phone, c.name, c.status,
       EXISTS (SELECT 1 FROM consent_events ce WHERE ce.contact_id = c.id
         AND ce.purpose = 'marketing_messages' AND ce.revoked_at IS NULL) AS has_consent,
       EXISTS (SELECT 1 FROM suppressions s WHERE s.phone = c.phone
         AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))) AS is_suppressed
     FROM contacts c WHERE 1 = 1${filter}`
  ).bind(...binds).all<{
    id: string; phone: string; name: string | null; status: string
    has_consent: number; is_suppressed: number
  }>()).results

  const eligible: { id: string; phone: string }[] = []
  const skippedItems: AudienceSkippedItem[] = []
  for (const contact of candidates) {
    let reason: AudienceSkippedItem['reason'] | null = null
    if (contact.status === 'opt_out') reason = 'opt_out'
    else if (contact.status !== 'opt_in') reason = 'unknown_status'
    else if (!contact.has_consent) reason = 'no_consent'
    else if (contact.is_suppressed) reason = 'suppressed'
    if (reason) skippedItems.push({ id: contact.id, phone: contact.phone, name: contact.name, reason })
    else eligible.push({ id: contact.id, phone: contact.phone })
  }
  return { eligible, skipped: skippedItems.length, skippedItems }
}
