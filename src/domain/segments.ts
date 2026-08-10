import { z } from 'zod'

const scalarSchema = z.union([z.string().max(500), z.number().finite(), z.boolean()])

const conditionSchema = z.object({
  field: z.enum(['name', 'phone', 'status', 'tag', 'last_activity', 'custom']),
  operator: z.enum(['eq', 'neq', 'contains', 'starts_with', 'gt', 'gte', 'lt', 'lte', 'is_set']),
  value: scalarSchema.optional(),
  customFieldId: z.string().uuid().optional(),
}).strict().superRefine((condition, ctx) => {
  if (condition.operator !== 'is_set' && condition.value === undefined)
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'valor obrigatório' })
  if (condition.field === 'custom' && !condition.customFieldId)
    ctx.addIssue({ code: 'custom', path: ['customFieldId'], message: 'campo personalizado obrigatório' })
  if (condition.field !== 'custom' && condition.customFieldId)
    ctx.addIssue({ code: 'custom', path: ['customFieldId'], message: 'campo personalizado não permitido' })
})

export const segmentRulesSchema = z.object({
  combinator: z.enum(['and', 'or']),
  conditions: z.array(conditionSchema).min(1).max(50),
}).strict()

export type SegmentRules = z.infer<typeof segmentRulesSchema>
export type CompiledSegment = { sql: string; bindings: unknown[] }

/** Público salvo a partir do wizard. Mantém o mesmo formato de audiência da campanha. */
export const audienceSegmentRulesSchema = z.object({
  kind: z.literal('campaign_audience'),
  combinator: z.enum(['and', 'or']),
  tags: z.array(z.string().min(1).max(128)).max(100).optional(),
  phonePrefixes: z.array(z.string().regex(/^\+[1-9]\d{0,5}$/)).max(100).optional(),
}).strict().refine((value) => Boolean(value.tags?.length || value.phonePrefixes?.length), {
  message: 'público salvo sem critérios',
})

export const savedSegmentRulesSchema = z.union([segmentRulesSchema, audienceSegmentRulesSchema])
export type SavedSegmentRules = z.infer<typeof savedSegmentRulesSchema>

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

export function compileSegmentRules(input: unknown): CompiledSegment {
  const rules = segmentRulesSchema.parse(input)
  const bindings: unknown[] = []
  const bind = (value: unknown) => {
    bindings.push(value)
    return `?${bindings.length}`
  }

  const clauses = rules.conditions.map((condition) => {
    if (condition.field === 'tag') {
      const value = String(condition.value ?? '')
      const exists = `EXISTS (SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id ` +
        `WHERE ct.contact_id = c.id AND t.name = ${bind(value)})`
      return condition.operator === 'neq' ? `NOT ${exists}` : exists
    }

    if (condition.field === 'custom') {
      const field = bind(condition.customFieldId)
      if (condition.operator === 'is_set')
        return `EXISTS (SELECT 1 FROM contact_custom_values cv WHERE cv.contact_id = c.id AND cv.field_id = ${field})`
      const value = condition.value
      const column = typeof value === 'number' ? 'value_number'
        : typeof value === 'boolean' ? 'value_boolean' : 'value_text'
      const normalized = typeof value === 'boolean' ? (value ? 1 : 0) : value
      const operator = ({ eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' } as const)[condition.operator as 'eq']
      if (operator)
        return `EXISTS (SELECT 1 FROM contact_custom_values cv WHERE cv.contact_id = c.id ` +
          `AND cv.field_id = ${field} AND cv.${column} ${operator} ${bind(normalized)})`
      const pattern = condition.operator === 'starts_with'
        ? `${escapeLike(String(normalized))}%` : `%${escapeLike(String(normalized))}%`
      return `EXISTS (SELECT 1 FROM contact_custom_values cv WHERE cv.contact_id = c.id ` +
        `AND cv.field_id = ${field} AND cv.${column} LIKE ${bind(pattern)} ESCAPE '\\')`
    }

    const column = ({
      name: 'c.name', phone: 'c.phone', status: 'c.status', last_activity: 'c.updated_at',
    } as const)[condition.field]
    if (!column) throw new Error('campo de segmento não suportado')
    if (condition.operator === 'is_set') return `${column} IS NOT NULL`
    const operator = ({ eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' } as const)[condition.operator as 'eq']
    if (operator) return `${column} ${operator} ${bind(condition.value)}`
    const pattern = condition.operator === 'starts_with'
      ? `${escapeLike(String(condition.value))}%` : `%${escapeLike(String(condition.value))}%`
    return `${column} LIKE ${bind(pattern)} ESCAPE '\\'`
  })

  return { sql: `(${clauses.join(rules.combinator === 'and' ? ' AND ' : ' OR ')})`, bindings }
}

export function compileSavedSegmentRules(input: unknown): CompiledSegment {
  const parsed = savedSegmentRulesSchema.parse(input)
  if (!('kind' in parsed)) return compileSegmentRules(parsed)
  const bindings: unknown[] = []
  const bind = (value: unknown) => { bindings.push(value); return `?${bindings.length}` }
  const quick: string[] = []
  if (parsed.tags?.length) {
    if (parsed.combinator === 'and' && parsed.tags.length > 1) {
      quick.push(...parsed.tags.map((tag) => `EXISTS (SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = c.id AND t.name = ${bind(tag)})`))
    } else {
      const names = parsed.tags.map(bind).join(',')
      quick.push(`EXISTS (SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = c.id AND t.name IN (${names}))`)
    }
  }
  if (parsed.phonePrefixes?.length) {
    quick.push(`(${parsed.phonePrefixes.map((prefix) => `c.phone LIKE ${bind(`${escapeLike(prefix)}%`)} ESCAPE '\\'`).join(' OR ')})`)
  }
  return { sql: `(${quick.join(parsed.combinator === 'and' ? ' AND ' : ' OR ')})`, bindings }
}
