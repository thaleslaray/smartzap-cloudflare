import { useState } from 'react'
import { useContacts, useImportContacts } from '../hooks/useContacts'
import { StatusBadge } from '../components/StatusBadge'

export default function Contacts() {
  const [q, setQ] = useState('')
  const [showImport, setShowImport] = useState(false)
  const { data } = useContacts(q)
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contatos <span className="text-base text-zinc-500">({data?.total ?? 0})</span></h1>
        <button onClick={() => setShowImport(true)}
          className="rounded-[--radius-app] bg-primary-600 px-4 py-2 text-sm font-medium">Importar CSV</button>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou telefone…"
        className="w-72 rounded-[--radius-app] border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" />
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-400">
          <tr className="border-b border-zinc-800"><th className="py-2">Nome</th><th>Telefone</th><th>Status</th></tr>
        </thead>
        <tbody>
          {(data?.items ?? []).map((c) => (
            <tr key={c.id} className="border-b border-zinc-800/50">
              <td className="py-2">{c.name ?? '—'}</td>
              <td className="text-zinc-400">{c.phone}</td>
              <td><StatusBadge status={c.status === 'opt_in' ? 'delivered' : c.status === 'opt_out' ? 'failed' : 'pending'} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const [csv, setCsv] = useState('')
  const [phoneCol, setPhoneCol] = useState('telefone')
  const [nameCol, setNameCol] = useState('nome')
  const [optIn, setOptIn] = useState(false)
  const importMut = useImportContacts()
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-[32rem] space-y-4 rounded-[--radius-app] bg-zinc-900 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-medium">Importar contatos</h2>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6}
          placeholder={'telefone,nome\n11999990001,Ana'}
          className="w-full rounded-[--radius-app] border border-zinc-700 bg-zinc-800 p-3 font-mono text-xs" />
        <div className="flex gap-2">
          <input value={phoneCol} onChange={(e) => setPhoneCol(e.target.value)} placeholder="coluna do telefone"
            className="flex-1 rounded-[--radius-app] border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm" />
          <input value={nameCol} onChange={(e) => setNameCol(e.target.value)} placeholder="coluna do nome (opcional)"
            className="flex-1 rounded-[--radius-app] border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm" />
        </div>
        <label className="flex items-start gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-0.5" />
          Confirmo que esta lista possui consentimento documentado dos titulares (LGPD art. 7º) e
          atende à política anti-spam da Meta.
        </label>
        {importMut.data && (
          <p className="text-sm text-primary-400">
            {importMut.data.imported} importados · {importMut.data.duplicates} duplicados · {importMut.data.invalid} inválidos
          </p>
        )}
        {importMut.error && <p className="text-sm text-status-failed">{importMut.error.message}</p>}
        <button disabled={!optIn || !csv || importMut.isPending}
          onClick={() => importMut.mutate({ csv, mapping: { phone: phoneCol, name: nameCol || undefined }, optInConfirmed: optIn })}
          className="w-full rounded-[--radius-app] bg-primary-600 py-2 font-medium disabled:opacity-40">
          Importar
        </button>
      </div>
    </div>
  )
}
