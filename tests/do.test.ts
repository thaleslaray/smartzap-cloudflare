import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('PhoneThrottle', () => {
  it('respeita a taxa: 3 acquires no mesmo instante acumulam espera', async () => {
    const stub = env.THROTTLE.getByName('t1')
    await stub.configure(1) // 1 msg/s
    const t0 = Date.now()
    expect(await stub.acquire(t0)).toBe(0)
    expect(await stub.acquire(t0)).toBe(1000)
    expect(await stub.acquire(t0)).toBe(2000)
  })
  it('tempo real decorrido libera o slot sem espera', async () => {
    const stub = env.THROTTLE.getByName('t2')
    await stub.configure(1)
    const t0 = Date.now()
    expect(await stub.acquire(t0)).toBe(0)
    expect(await stub.acquire(t0 + 5000)).toBe(0) // 5s depois: slot já passou
  })
  it('reduz a taxa e cria resfriamento após saturação', async () => {
    const stub = env.THROTTLE.getByName('t3')
    await stub.configure(80)
    await stub.backoff(80, 60)
    const t0 = Date.now()
    expect(await stub.acquire(t0)).toBeGreaterThanOrEqual(59_000)
  })
})
