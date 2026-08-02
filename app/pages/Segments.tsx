import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { Card, PageError, PageHeader, PageLoading, btnPrimary, btnSecondary, inputClass } from '../components/ui'

type Rule = { combinator: 'and' | 'or'; conditions: Array<{ field: string; operator: string; value?: string }> }
type Segment = { id: string; name: string; description: string | null; rules: Rule }
const INITIAL: Rule = { combinator: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'opt_in' }] }

export default function Segments() {
  const qc = useQueryClient(); const [name, setName] = useState(''); const [rulesText, setRulesText] = useState(JSON.stringify(INITIAL, null, 2)); const [preview, setPreview] = useState<{ total: number; items: Array<{ name: string | null; phone: string }> } | null>(null); const [editing, setEditing] = useState<Segment | null>(null)
  const rules = useMemo(() => { try { return JSON.parse(rulesText) as Rule } catch { return null } }, [rulesText])
  const list = useQuery({ queryKey: ['segments'], queryFn: () => api<{ items: Segment[] }>('/api/segments') })
  const save = useMutation({
    mutationFn: () => api<Segment>(editing ? `/api/segments/${editing.id}` : '/api/segments', {
      method: editing ? 'PUT' : 'POST',
      body: JSON.stringify({ name, rules }),
    }),
    onSuccess: (saved) => {
      // O GET inicial pode terminar depois do POST em um cold start. Atualizar
      // o cache com a resposta confirmada impede que essa corrida esconda o
      // segmento recém-criado enquanto a lista é sincronizada em segundo plano.
      qc.setQueryData<{ items: Segment[] }>(['segments'], (current) => {
        const items = (current?.items ?? []).filter((item) => item.id !== saved.id)
        return { items: [...items, saved].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }
      })
      setName(''); setRulesText(JSON.stringify(INITIAL, null, 2)); setPreview(null); setEditing(null)
      void qc.invalidateQueries({ queryKey: ['segments'] })
    },
  })
  const test = useMutation({ mutationFn: () => api<{ total: number; items: Array<{ name: string | null; phone: string }> }>('/api/segments/preview', { method: 'POST', body: JSON.stringify(rules) }), onSuccess: setPreview })
  const remove = useMutation({ mutationFn: (id: string) => api(`/api/segments/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['segments'] }) })
  const startEditing = (segment: Segment) => {
    setEditing(segment); setName(segment.name); setRulesText(JSON.stringify(segment.rules, null, 2)); setPreview(null)
  }
  const cancelEditing = () => { setEditing(null); setName(''); setRulesText(JSON.stringify(INITIAL, null, 2)); setPreview(null) }
  return <div className="max-w-5xl space-y-6"><PageHeader title="Segmentos" subtitle="Públicos dinâmicos para campanhas, baseados em consentimento, tags e campos." />
    <Card className="space-y-3 p-5"><div><h2 className="font-semibold">{editing ? 'Editar segmento' : 'Novo segmento'}</h2><p className="mt-1 text-sm text-zinc-400">As regras são validadas no servidor e nunca viram SQL fornecido pelo navegador.</p></div>
      <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do segmento" aria-label="Nome do segmento" />
      <textarea className={`${inputClass} min-h-64 font-mono text-xs`} value={rulesText} onChange={(event) => setRulesText(event.target.value)} aria-label="Regras do segmento em JSON" />
      {!rules && <p className="text-sm text-status-failed">JSON inválido.</p>}{save.error && <p className="text-sm text-status-failed">{save.error.message}</p>}{test.error && <p className="text-sm text-status-failed">{test.error.message}</p>}
      <div className="flex flex-wrap gap-3"><button className={btnSecondary} disabled={!rules || test.isPending} onClick={() => test.mutate()}>{test.isPending ? 'Calculando…' : 'Testar audiência'}</button>{editing && <button className={btnSecondary} disabled={save.isPending} onClick={cancelEditing}>Cancelar edição</button>}<button className={btnPrimary} disabled={!name.trim() || !rules || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Salvando…' : editing ? 'Atualizar segmento' : 'Salvar segmento'}</button></div>
      {preview && <p className="rounded-lg bg-zinc-950 p-3 text-sm text-zinc-300">{preview.total} contato(s) elegível(is). Amostra: {preview.items.slice(0, 3).map((item) => item.name ?? item.phone).join(', ') || 'vazia'}.</p>}
    </Card>
    <section><h2 className="mb-3 font-semibold">Segmentos salvos</h2>{list.isLoading && <PageLoading label="Carregando segmentos…" />}{list.error && <PageError message={list.error.message} onRetry={() => list.refetch()} />}{!list.isLoading && !list.error && <Card className="divide-y divide-border-subtle">{list.data?.items.length ? list.data.items.map((segment) => <div key={segment.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="font-medium">{segment.name}</p><p className="mt-1 truncate font-mono text-xs text-zinc-500">{JSON.stringify(segment.rules)}</p></div><div className="flex shrink-0 gap-2"><button className={btnSecondary} disabled={save.isPending} onClick={() => startEditing(segment)}>Editar</button><button className={btnSecondary} disabled={remove.isPending} onClick={() => remove.mutate(segment.id)}>Excluir</button></div></div>) : <p className="p-8 text-center text-sm text-zinc-500">Nenhum segmento salvo.</p>}</Card>}</section>
  </div>
}
