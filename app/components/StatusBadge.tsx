const STYLES: Record<string, string> = {
  draft: 'bg-zinc-700 text-zinc-300', scheduled: 'bg-blue-950 text-status-sent',
  sending: 'bg-primary-950 text-primary-400 animate-pulse', completed: 'bg-primary-950 text-primary-400',
  paused: 'bg-amber-950 text-status-skipped', failed: 'bg-red-950 text-status-failed',
  cancelled: 'bg-zinc-800 text-zinc-500',
  pending: 'bg-zinc-700 text-zinc-300', skipped: 'bg-amber-950 text-status-skipped',
  sent: 'bg-blue-950 text-status-sent', delivered: 'bg-primary-950 text-status-delivered',
  read: 'bg-primary-900 text-status-read',
}
const LABELS: Record<string, string> = {
  draft: 'Rascunho', scheduled: 'Agendada', sending: 'Enviando', completed: 'Concluída',
  paused: 'Pausada', failed: 'Falhou', cancelled: 'Cancelada', pending: 'Pendente',
  skipped: 'Pulada', sent: 'Enviada', delivered: 'Entregue', read: 'Lida',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status] ?? STYLES.draft}`}>
      {LABELS[status] ?? status}
    </span>
  )
}
