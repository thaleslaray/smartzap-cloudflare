import { DurableObject } from 'cloudflare:workers'

export type RealtimeEvent =
  | { type: 'invalidate'; keys: string[][] }
  | { type: 'progress'; campaignId: string; counters: { sent: number; delivered: number; read: number; failed: number; total: number } }

export class RealtimeHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // ping/pong respondido pelo runtime SEM acordar o DO da hibernação —
    // keepalive de NAT sem custo de wall-clock.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return new Response('esperado upgrade websocket', { status: 426 })
    const pair = new WebSocketPair()
    // Hibernation API: o DO dorme sem derrubar os clientes
    this.ctx.acceptWebSocket(pair[1])
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async broadcast(event: RealtimeEvent): Promise<number> {
    const msg = JSON.stringify(event)
    let n = 0
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); n++ } catch { /* socket morto — ignorar */ }
    }
    return n
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean) {
    // Completa o handshake de fechamento ecoando código/razão do cliente
    ws.close(code, reason)
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.warn('[realtime] erro no socket', error)
    try { ws.close(1011, 'erro interno') } catch { /* já fechado */ }
  }
}
