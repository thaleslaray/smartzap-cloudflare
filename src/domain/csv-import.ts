import Papa from 'papaparse'
import { normalizePhone } from './phone'

export function parseContactsCsv(
  text: string,
  mapping: {
    phone: string;
    name?: string;
    email?: string;
    tags?: string;
    defaultTags?: string[];
    customFields?: Record<string, string>;
  },
  maxRows = 20_000,
) {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    // Interrompe o parser antes de materializar um arquivo inteiro que ultrapasse
    // o teto, inclusive quando todas as linhas forem inválidas ou duplicadas.
    preview: maxRows + 1,
  })
  const fields = parsed.meta.fields ?? []
  const malformed = parsed.errors.some((error) => error.code !== 'UndetectableDelimiter')
    || !fields.includes(mapping.phone)
    || Boolean(mapping.name && !fields.includes(mapping.name))
    || Boolean(mapping.email && !fields.includes(mapping.email))
    || Boolean(mapping.tags && !fields.includes(mapping.tags))
    || Object.values(mapping.customFields ?? {}).some((column) => column && !fields.includes(column))
  const tooManyRows = parsed.data.length > maxRows
  const valid: Array<{
    phone: string;
    name?: string;
    email?: string;
    tags: string[];
    customFields: Record<string, string>;
  }> = []
  const invalid: string[] = []
  const seen = new Set<string>()
  let duplicates = 0
  if (malformed || tooManyRows)
    return { valid, invalid, duplicates, malformed, tooManyRows }
  for (const row of parsed.data) {
    const raw = (row[mapping.phone] ?? '').trim()
    const phone = normalizePhone(raw)
    if (!phone) { if (raw) invalid.push(raw); continue }
    if (seen.has(phone)) { duplicates++; continue }
    const name = mapping.name ? row[mapping.name]?.trim() : undefined
    if (name && name.length > 200) { invalid.push(raw); continue }
    const email = mapping.email ? row[mapping.email]?.trim().toLowerCase() : undefined
    if (email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      invalid.push(raw); continue
    }
    const tags = [
      ...(mapping.defaultTags ?? []),
      ...(mapping.tags ? (row[mapping.tags] ?? '').split(/[;,]/) : []),
    ].map((tag) => tag.trim()).filter(Boolean).slice(0, 100)
    const customFields = Object.fromEntries(
      Object.entries(mapping.customFields ?? {})
        .map(([fieldId, column]) => [fieldId, (row[column] ?? '').trim()])
        .filter(([, value]) => value !== ''),
    )
    seen.add(phone)
    valid.push({
      phone,
      name: name || undefined,
      email: email || undefined,
      tags: [...new Set(tags)],
      customFields,
    })
  }
  return { valid, invalid, duplicates, malformed, tooManyRows }
}
