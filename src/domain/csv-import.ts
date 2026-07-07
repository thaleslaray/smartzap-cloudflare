import Papa from 'papaparse'
import { normalizePhone } from './phone'

export function parseContactsCsv(text: string, mapping: { phone: string; name?: string }) {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
  const valid: { phone: string; name?: string }[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  let duplicates = 0
  for (const row of parsed.data) {
    const raw = (row[mapping.phone] ?? '').trim()
    const phone = normalizePhone(raw)
    if (!phone) { if (raw) invalid.push(raw); continue }
    if (seen.has(phone)) { duplicates++; continue }
    seen.add(phone)
    valid.push({ phone, name: mapping.name ? row[mapping.name]?.trim() : undefined })
  }
  return { valid, invalid, duplicates }
}
