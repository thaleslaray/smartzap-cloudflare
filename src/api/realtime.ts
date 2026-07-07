import { Hono } from 'hono'
import type { RealtimeEvent } from '../do/RealtimeHub'
import { assertSameOrigin } from './origin'

export function hubStub(env: Env) {
  // Env tipado com DurableObjectNamespace<RealtimeHub> — RPC direto, sem casts
  return env.REALTIME.getByName('hub')
}

export async function broadcastToHub(env: Env, event: RealtimeEvent): Promise<void> {
  // best-effort: realtime nunca pode derrubar o caminho principal
  try { await hubStub(env).broadcast(event) } catch (e) { console.warn('[realtime] broadcast falhou', e) }
}

export const realtimeRoutes = new Hono<{ Bindings: Env }>()
  .get('/', (c) => assertSameOrigin(c) ?? hubStub(c.env).fetch(c.req.raw))
