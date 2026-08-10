import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

type RealtimeEvent =
  | { type: 'invalidate'; keys: string[][] }
  | { type: 'progress'; campaignId: string; counters: { sent: number; delivered: number; read: number; failed: number; total: number } }

export function useRealtime() {
  const qc = useQueryClient()
  const backoff = useRef(1000)

  useEffect(() => {
    let ws: WebSocket | null = null
    let closed = false
    let timer: ReturnType<typeof setTimeout>
    let pingTimer: ReturnType<typeof setInterval> | undefined

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/api/realtime`)
      ws.onopen = () => {
        if (backoff.current > 1000) qc.invalidateQueries() // reconectou: estado converge
        backoff.current = 1000
        // keepalive: NATs/proxies derrubam WS ocioso; o servidor responde 'pong'
        // via setWebSocketAutoResponse — sem acordar o DO da hibernação
        pingTimer = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), 30_000)
      }
      ws.onmessage = (e) => {
        let event: RealtimeEvent
        try {
          const parsed: unknown = JSON.parse(String(e.data))
          if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) return
          event = parsed as RealtimeEvent
        } catch {
          // Evento corrompido não derruba a interface; a próxima invalidação ou
          // o polling de fallback reconcilia o estado.
          return
        }
        if (event.type === 'invalidate') {
          if (!Array.isArray(event.keys)) return
          for (const key of event.keys) {
            if (Array.isArray(key) && key.every((part) => typeof part === 'string'))
              qc.invalidateQueries({ queryKey: key })
          }
        } else if (event.type === 'progress') {
          if (typeof event.campaignId !== 'string' || !event.counters) return
          qc.setQueryData(['campaign', event.campaignId], (old: object | undefined) =>
            old ? { ...old, ...event.counters } : old)
          qc.invalidateQueries({ queryKey: ['campaigns'] })
        }
      }
      ws.onclose = () => {
        clearInterval(pingTimer)
        if (closed) return
        timer = setTimeout(connect, backoff.current)
        backoff.current = Math.min(backoff.current * 2, 30_000)
      }
    }
    connect()
    return () => { closed = true; clearTimeout(timer); clearInterval(pingTimer); ws?.close() }
  }, [qc])
}
