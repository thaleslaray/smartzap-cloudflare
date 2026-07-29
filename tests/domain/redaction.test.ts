import { describe, expect, it } from 'vitest'
import { redactOperationalDetail } from '../../src/domain/redaction'

describe('redactOperationalDetail', () => {
  it('remove segredo, telefone, email e IP sem perder o diagnóstico', () => {
    const raw = [
      'timeout para', 'pessoa@example.com', '+55 21 99999-9999', '192.168.1.10',
      `EA${'A'.repeat(40)}`,
    ].join(' ')
    const redacted = redactOperationalDetail(raw)
    expect(redacted).toContain('timeout')
    expect(redacted).toContain('[REDACTED_EMAIL]')
    expect(redacted).toContain('[REDACTED_ID]')
    expect(redacted).toContain('[REDACTED_IP]')
    expect(redacted).toContain('[REDACTED_SECRET]')
    expect(redacted).not.toContain('pessoa@example.com')
  })

  it('limita a saída operacional a 500 caracteres', () => {
    expect(redactOperationalDetail(Array(600).fill('x').join(' '))).toHaveLength(500)
  })
})
