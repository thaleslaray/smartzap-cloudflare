import { env, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { RealtimeHub } from '../src/do/RealtimeHub'

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
})
