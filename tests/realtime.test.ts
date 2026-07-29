import { env, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { RealtimeHub } from '../src/do/RealtimeHub'
import { handleWebhookBatch } from '../src/queue/webhook-consumer'
import type { MetaWebhookEvent } from '../src/api/webhook'

describe('RealtimeHub', () => {
  it('aceita WS e broadcast entrega o evento', async () => {
    const stub = env.REALTIME.getByName('hub')
    const res = await stub.fetch('https://do/ws', { headers: { upgrade: 'websocket' } })
    expect(res.status).toBe(101)
    const ws = res.webSocket!
    ws.accept()
    const received = new Promise<string>((resolve) => ws.addEventListener('message', (e) => resolve(e.data as string)))
    const n = await runInDurableObject(stub, (i: RealtimeHub) =>
      i.broadcast({ type: 'invalidate', keys: [['campaigns']] }))
    expect(n).toBe(1)
    expect(JSON.parse(await received)).toEqual({ type: 'invalidate', keys: [['campaigns']] })
  })

  it('entrada inbound invalida lista, detalhe, mensagens e IA da Inbox', async () => {
    const stub = env.REALTIME.getByName('hub')
    const res = await stub.fetch('https://do/ws', { headers: { upgrade: 'websocket' } })
    expect(res.status).toBe(101)
    const ws = res.webSocket!
    ws.accept()
    const received = new Promise<{ type: string; keys: string[][] }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('invalidação da Inbox não recebida')), 2_000)
      ws.addEventListener('message', (event) => {
        const payload = JSON.parse(event.data as string) as { type: string; keys: string[][] }
        if (payload.keys.some((key) => key[0] === 'conversations')) {
          clearTimeout(timeout)
          resolve(payload)
        }
      })
    })
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-10)
    const event: MetaWebhookEvent = {
      kind: 'inbound_message',
      wabaId: 'realtime-test-waba',
      phoneNumberId: 'realtime-test-phone',
      message: {
        id: `wamid.realtime.${crypto.randomUUID()}`,
        from: `55119${suffix.slice(-8)}`,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
        textBody: 'Atualização de tempo real',
      },
    }
    await handleWebhookBatch([event], env)
    const payload = await received
    expect(payload.type).toBe('invalidate')
    expect(payload.keys).toContainEqual(['conversations'])
    expect(payload.keys).toContainEqual(['conversations', 'messages', expect.any(String)])
    expect(payload.keys).toContainEqual(['conversations', 'detail', expect.any(String)])
    expect(payload.keys).toContainEqual(['conversations', 'ai', expect.any(String)])
  })
})
