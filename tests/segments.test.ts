import { describe, expect, it } from 'vitest'
import { compileSavedSegmentRules, compileSegmentRules, segmentRulesSchema } from '../src/domain/segments'

describe('segmentos salvos', () => {
  it('compila somente campos e operadores permitidos com bindings', () => {
    const malicious = "x%' OR 1=1 --"
    const result = compileSegmentRules({
      combinator: 'and',
      conditions: [
        { field: 'name', operator: 'contains', value: malicious },
        { field: 'tag', operator: 'eq', value: 'cliente' },
      ],
    })
    expect(result.sql).not.toContain(malicious)
    expect(result.sql).toContain('?1')
    expect(result.bindings).toEqual([`%x\\%' OR 1=1 --%`, 'cliente'])
  })

  it('rejeita regra vazia, campos extras e custom field sem UUID', () => {
    expect(segmentRulesSchema.safeParse({ combinator: 'and', conditions: [] }).success).toBe(false)
    expect(segmentRulesSchema.safeParse({
      combinator: 'or', conditions: [{ field: 'custom', operator: 'eq', value: 'x', customFieldId: 'DROP TABLE' }],
    }).success).toBe(false)
    expect(segmentRulesSchema.safeParse({
      combinator: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'opt_in', sql: '1=1' }],
    }).success).toBe(false)
  })

  it('nega tag por NOT EXISTS, sem excluir contatos sem tags', () => {
    const result = compileSegmentRules({
      combinator: 'and', conditions: [{ field: 'tag', operator: 'neq', value: 'bloqueado' }],
    })
    expect(result.sql).toContain('NOT EXISTS')
  })

  it('compila um público salvo de campanha sem aceitar SQL do navegador', () => {
    const result = compileSavedSegmentRules({
      kind: 'campaign_audience', combinator: 'and', tags: ['VIP'], phonePrefixes: ['+5511', '+5521'],
    })
    expect(result.sql).toContain('AND')
    expect(result.sql).toContain('LIKE')
    expect(result.bindings).toEqual(['VIP', '+5511%', '+5521%'])
  })
})
