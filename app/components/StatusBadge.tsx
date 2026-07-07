// Badge de status — pill com dot colorido, fundo tint (12%) e borda tint (25%),
// espelhando o design system (DS/templates/*.dc.html). 7 estados de campanha +
// 6 de mensagem. "sending" pulsa o dot.
const COLORS: Record<string, string> = {
  draft: '#a1a1aa', scheduled: '#60a5fa', sending: '#34d399', completed: '#10b981',
  paused: '#fbbf24', failed: '#f87171', cancelled: '#71717a',
  pending: '#a1a1aa', skipped: '#fbbf24', sent: '#60a5fa', delivered: '#34d399', read: '#10b981',
}
const LABELS: Record<string, string> = {
  draft: 'Rascunho', scheduled: 'Agendada', sending: 'Enviando', completed: 'Concluída',
  paused: 'Pausada', failed: 'Falhou', cancelled: 'Cancelada', pending: 'Pendente',
  skipped: 'Pulada', sent: 'Enviada', delivered: 'Entregue', read: 'Lida',
}

function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export function StatusBadge({ status }: { status: string }) {
  const color = COLORS[status] ?? COLORS.draft
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{ color, backgroundColor: tint(color, 0.12), borderColor: tint(color, 0.25) }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === 'sending' ? 'animate-[sz-pulse_1.2s_ease-in-out_infinite]' : ''}`}
        style={{ backgroundColor: color }}
      />
      {LABELS[status] ?? status}
    </span>
  )
}
