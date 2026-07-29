import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/api/router'

describe('tratamento global de erros', () => {
  it('responde genericamente, correlaciona e redige detalhes operacionais', async () => {
    const secret = `EA${'Z'.repeat(40)}`
    const phone = '+55 21 99999-9999'
    const app = createApp()
    app.get('/boom', () => { throw new Error(`falhou ${secret} para ${phone}`) })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const res = await app.request('https://example.com/boom')
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'erro interno' })
      expect(res.headers.get('x-request-id')).toBeTruthy()
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      const output = log.mock.calls.flat().join(' ')
      expect(output).toContain('[REDACTED_SECRET]')
      expect(output).toContain('[REDACTED_ID]')
      expect(output).not.toContain(secret)
      expect(output).not.toContain(phone)
    } finally {
      log.mockRestore()
    }
  })
})
