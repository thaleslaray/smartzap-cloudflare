import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

type Template = { name: string; language: string; category: string; status: string }

export default function Templates() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['templates'], queryFn: () => api<{ items: Template[] }>('/api/templates') })
  const sync = useMutation({
    mutationFn: () => api<{ synced: number }>('/api/templates/sync', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
  const badge = (s: string) =>
    s === 'APPROVED' ? 'bg-primary-950 text-primary-400' : s === 'REJECTED' ? 'bg-red-950 text-status-failed' : 'bg-amber-950 text-status-skipped'
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <button onClick={() => sync.mutate()} disabled={sync.isPending}
          className="rounded-[--radius-app] bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50">
          {sync.isPending ? 'Sincronizando…' : 'Sincronizar com a Meta'}
        </button>
      </div>
      {sync.error && <p className="text-sm text-status-failed">{sync.error.message}</p>}
      <div className="grid grid-cols-3 gap-4">
        {(data?.items ?? []).map((t) => (
          <div key={t.name} className="rounded-[--radius-app] bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{t.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${badge(t.status)}`}>{t.status}</span>
            </div>
            <div className="mt-2 text-xs text-zinc-400">{t.category} · {t.language}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
