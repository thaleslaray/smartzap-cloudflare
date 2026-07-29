import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../lib/api'
import { Card, Modal, PageError, PageHeader, PageLoading, btnPrimary, btnSecondary, inputClass } from '../components/ui'

type Document = { id: string; name: string; mime_type: string; status: string; error_code: string | null; created_at: string }
type EditableDocument = { id: string; name: string; mimeType: 'text/markdown' | 'text/plain' | 'text/html'; content: string }

export default function Knowledge() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [mimeType, setMimeType] = useState<'text/markdown' | 'text/plain' | 'text/html'>('text/markdown')
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<unknown>(null)
  const [file, setFile] = useState<File | null>(null)
  const [actionError, setActionError] = useState('')
  const [editing, setEditing] = useState<EditableDocument | null>(null)
  const documents = useQuery({ queryKey: ['knowledge', 'documents'], queryFn: () => api<{ items: Document[] }>('/api/knowledge/documents') })
  const upload = useMutation({
    mutationFn: () => api<{ id: string }>('/api/knowledge/documents', { method: 'POST', body: JSON.stringify({ name, mimeType, content }) }),
    onSuccess: () => { setName(''); setContent(''); qc.invalidateQueries({ queryKey: ['knowledge', 'documents'] }) },
    onError: () => qc.invalidateQueries({ queryKey: ['knowledge', 'documents'] }),
  })
  const uploadPdf = useMutation({ mutationFn: async () => { if (!file) throw new Error('Selecione um PDF'); const form = new FormData(); form.set('file', file); const res = await fetch('/api/knowledge/documents/upload', { method: 'POST', body: form }); if (!res.ok) { const body = await res.json().catch(() => ({})) as { error?: string }; throw new Error(body.error ?? 'Falha no upload') } return res.json() }, onSuccess: () => { setFile(null); qc.invalidateQueries({ queryKey: ['knowledge', 'documents'] }) }, onError: () => qc.invalidateQueries({ queryKey: ['knowledge', 'documents'] }) })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/knowledge/documents/${id}`, { method: 'DELETE' }),
    onMutate: () => setActionError(''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge', 'documents'] }),
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Não foi possível excluir o documento'),
  })
  const reindex = useMutation({
    mutationFn: (id: string) => api(`/api/knowledge/documents/${id}/reindex`, { method: 'POST' }),
    onMutate: () => setActionError(''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge', 'documents'] }),
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Não foi possível reindexar o documento'),
  })
  const loadEdit = useMutation({
    mutationFn: (id: string) => api<EditableDocument>(`/api/knowledge/documents/${id}`),
    onMutate: () => setActionError(''),
    onSuccess: setEditing,
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Não foi possível abrir o documento'),
  })
  const saveEdit = useMutation({
    mutationFn: (document: EditableDocument) => api<{ id: string }>(`/api/knowledge/documents/${document.id}`, { method: 'PUT', body: JSON.stringify({ name: document.name, mimeType: document.mimeType, content: document.content }) }),
    onMutate: () => setActionError(''),
    onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: ['knowledge', 'documents'] }) },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Não foi possível salvar o documento'),
  })
  const search = useMutation({
    mutationFn: () => api<{ result: unknown }>('/api/knowledge/search', { method: 'POST', body: JSON.stringify({ query }) }),
    onSuccess: (response) => setResult(response.result),
  })
  return <div className="max-w-5xl space-y-6">
    <PageHeader title="Base de conhecimento" subtitle="Conteúdo privado para fundamentar respostas da IA, sempre com revisão humana." />
    <Card className="space-y-3 p-5">
      <div><h2 className="font-semibold">Adicionar documento</h2><p className="mt-1 text-sm text-zinc-400">Markdown, texto ou HTML limpo. O arquivo é privado e indexado no AI Search.</p></div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Nome do documento" aria-label="Nome do documento" />
        <select value={mimeType} onChange={(event) => setMimeType(event.target.value as typeof mimeType)} className={inputClass} aria-label="Formato do documento">
          <option value="text/markdown">Markdown</option><option value="text/plain">Texto</option><option value="text/html">HTML</option>
        </select>
      </div>
      <textarea value={content} onChange={(event) => setContent(event.target.value)} className={`${inputClass} min-h-40 font-mono text-sm`} placeholder="Conteúdo que o agente poderá consultar…" aria-label="Conteúdo do documento" />
      {upload.error && <p className="text-sm text-status-failed">{upload.error.message}</p>}
      <button disabled={!name.trim() || !content.trim() || upload.isPending} onClick={() => upload.mutate()} className={btnPrimary}>{upload.isPending ? 'Indexando…' : 'Salvar e indexar'}</button>
      <div className="border-t border-zinc-800 pt-4"><p className="mb-2 text-sm font-medium">Ou envie um PDF textual</p><div className="flex flex-col gap-2 sm:flex-row"><input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="text-sm text-zinc-400" /><button type="button" disabled={!file || uploadPdf.isPending} onClick={() => uploadPdf.mutate()} className={btnSecondary}>{uploadPdf.isPending ? 'Extraindo…' : 'Enviar PDF'}</button></div>{uploadPdf.error && <p className="mt-2 text-sm text-status-failed">{uploadPdf.error.message}</p>}</div>
    </Card>
    <Card className="space-y-3 p-5">
      <div><h2 className="font-semibold">Testar recuperação</h2><p className="mt-1 text-sm text-zinc-400">Confira os trechos recuperados antes de ativar qualquer automação.</p></div>
      <div className="flex flex-col gap-3 sm:flex-row"><input value={query} onChange={(event) => setQuery(event.target.value)} className={inputClass} placeholder="Faça uma pergunta" aria-label="Pergunta de teste" /><button disabled={query.trim().length < 2 || search.isPending} onClick={() => search.mutate()} className={btnSecondary}>{search.isPending ? 'Buscando…' : 'Buscar'}</button></div>
      {search.error && <p className="text-sm text-status-failed">{search.error.message}</p>}
      {result !== null && <pre className="max-h-72 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-300">{JSON.stringify(result, null, 2)}</pre>}
    </Card>
    <section><h2 className="mb-3 font-semibold">Documentos</h2>{actionError && <p className="mb-3 text-sm text-status-failed">{actionError}</p>}{documents.isLoading && <PageLoading label="Carregando documentos…" />}{documents.error && <PageError message={documents.error.message} onRetry={() => documents.refetch()} />}{!documents.isLoading && !documents.error && <Card className="divide-y divide-border-subtle">{documents.data?.items.length ? documents.data.items.map((document) => <div key={document.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-medium">{document.name}</p><p className="mt-1 text-xs text-zinc-500">{document.mime_type} · {document.status}{document.error_code ? ` · ${document.error_code}` : ''}</p></div><div className="flex gap-2"><button className={btnSecondary} disabled={loadEdit.isPending || document.mime_type === 'application/pdf'} title={document.mime_type === 'application/pdf' ? 'Envie uma nova versão do PDF' : undefined} onClick={() => loadEdit.mutate(document.id)}>Editar</button><button className={btnSecondary} disabled={reindex.isPending || document.status === 'indexing'} onClick={() => reindex.mutate(document.id)}>{document.status === 'failed' ? 'Tentar novamente' : 'Reindexar'}</button><button className={btnSecondary} disabled={remove.isPending} onClick={() => remove.mutate(document.id)}>Excluir</button></div></div>) : <p className="p-8 text-center text-sm text-zinc-500">Nenhum documento indexado.</p>}</Card>}</section>
    {editing && <Modal titleId="edit-knowledge-title" onClose={() => !saveEdit.isPending && setEditing(null)}><h2 id="edit-knowledge-title" className="text-lg font-semibold">Editar documento</h2><p className="mt-1 text-sm text-zinc-400">O conteúdo será reindexado antes de voltar a fundamentar respostas.</p><input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className={`mt-4 ${inputClass}`} aria-label="Nome do documento editado" /><select value={editing.mimeType} onChange={(event) => setEditing({ ...editing, mimeType: event.target.value as EditableDocument['mimeType'] })} className={`mt-3 ${inputClass}`} aria-label="Formato do documento editado"><option value="text/markdown">Markdown</option><option value="text/plain">Texto</option><option value="text/html">HTML</option></select><textarea value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} className={`mt-3 min-h-48 ${inputClass}`} aria-label="Conteúdo do documento editado" /><div className="mt-5 flex justify-end gap-2"><button className={btnSecondary} disabled={saveEdit.isPending} onClick={() => setEditing(null)}>Cancelar</button><button className={btnPrimary} disabled={!editing.name.trim() || !editing.content.trim() || saveEdit.isPending} onClick={() => saveEdit.mutate(editing)}>{saveEdit.isPending ? 'Reindexando…' : 'Salvar e reindexar'}</button></div></Modal>}
  </div>
}
