import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { PageHeader, Card, btnSecondary } from '../components/ui'

type Template = { name: string; language: string; category: string; status: string }

const badge = (s: string) =>
  s === 'APPROVED' ? 'bg-primary-950 text-primary-400' : s === 'REJECTED' ? 'bg-red-950 text-status-failed' : 'bg-amber-950 text-status-skipped'

const categoryTint = (c: string) =>
  c === 'MARKETING' ? 'border-primary-400/30 bg-primary-400/10 text-primary-400'
    : c === 'UTILITY' ? 'border-status-sent/30 bg-status-sent/10 text-status-sent'
    : 'border-zinc-700 text-zinc-400'

export default function Templates() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['templates'], queryFn: () => api<{ items: Template[] }>('/api/templates') })
  const sync = useMutation({
    mutationFn: () => api<{ synced: number }>('/api/templates/sync', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        subtitle="Sincronizados da conta WhatsApp Business"
        action={
          <button onClick={() => sync.mutate()} disabled={sync.isPending} className={btnSecondary}>
            {sync.isPending ? 'Sincronizando…' : 'Sincronizar com a Meta'}
          </button>
        }
      />
      <div className="flex items-center gap-2 rounded-[--radius-app] border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-xs text-zinc-400">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-sent" />
        Read-only: templates são criados e editados no Gerenciador do WhatsApp da Meta.
      </div>
      {sync.error && <p className="text-sm text-status-failed">{sync.error.message}</p>}
      <div className="grid grid-cols-3 gap-3.5">
        {(data?.items ?? []).map((t) => (
          <Card key={t.name} className="p-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="truncate font-mono text-[13px] font-semibold">{t.name}</span>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-current/20 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide ${badge(t.status)}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {t.status}
              </span>
            </div>
            <div className="flex gap-1.5">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${categoryTint(t.category)}`}>{t.category}</span>
              <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-400">{t.language}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
