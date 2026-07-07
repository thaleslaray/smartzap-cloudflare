import { env, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { PhoneThrottle } from '../src/do/PhoneThrottle'

describe('PhoneThrottle', () => {
  it('respeita a taxa: 3 acquires no mesmo instante acumulam espera', async () => {
    const stub = env.THROTTLE.getByName('t1')
    await runInDurableObject(stub, async (instance: PhoneThrottle) => {
      await instance.configure(1) // 1 msg/s
      const t0 = Date.now()
      expect(await instance.acquire(t0)).toBe(0)
      expect(await instance.acquire(t0)).toBe(1000)
      expect(await instance.acquire(t0)).toBe(2000)
    })
  })
  it('tempo real decorrido libera o slot sem espera', async () => {
    const stub = env.THROTTLE.getByName('t2')
    await runInDurableObject(stub, async (instance: PhoneThrottle) => {
      await instance.configure(1)
      const t0 = Date.now()
      expect(await instance.acquire(t0)).toBe(0)
      expect(await instance.acquire(t0 + 5000)).toBe(0) // 5s depois: slot já passou
    })
  })
})
