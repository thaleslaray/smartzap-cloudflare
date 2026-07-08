import { useState } from 'react'
import { useContacts, useImportContacts } from '../hooks/useContacts'
import { StatusBadge } from '../components/StatusBadge'
import { PageHeader, Card, btnPrimary, inputClass } from '../components/ui'

export default function Contacts() {
  const [q, setQ] = useState('')
  const [showImport, setShowImport] = useState(false)
  const { data } = useContacts(q)
  return (
    <div>
      <PageHeader
        title={`Contatos (${data?.total ?? 0})`}
        action={
          <button onClick={() => setShowImport(true)} className={btnPrimary}>
            Importar CSV
          </button>
        }
      />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nome ou telefone…"
        className={`mb-4 w-72 ${inputClass}`}
      />
      <Card>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-caption font-semibold uppercase tracking-wider text-zinc-500">
              <th className="px-5 py-3">Nome</th>
              <th className="px-5 py-3">Telefone</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((c) => (
              <tr key={c.id} className="border-b border-border-subtle last:border-0 hover:bg-zinc-800/40">
                <td className="px-5 py-3 font-medium">{c.name ?? '—'}</td>
                <td className="px-5 py-3 font-mono text-xs text-zinc-400">{c.phone}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={c.status === 'opt_in' ? 'delivered' : c.status === 'opt_out' ? 'failed' : 'pending'} />
                </td>
              </tr>
            ))}
            {(data?.items ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-zinc-500">
                  Nenhum contato encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[32rem] rounded-[--radius-app] border border-zinc-700 bg-zinc-800 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Importar contatos (CSV)</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-zinc-500 transition-colors hover:text-zinc-200">
            ✕
          </button>
        </div>

        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          placeholder={'telefone,nome\n11999990001,Ana'}
          className={`mb-3 font-mono text-xs ${inputClass}`}
        />

        <div className="mb-3 flex gap-2">
          <input
            value={phoneCol}
            onChange={(e) => setPhoneCol(e.target.value)}
            placeholder="coluna do telefone"
            className={`flex-1 ${inputClass}`}
          />
          <input
            value={nameCol}
            onChange={(e) => setNameCol(e.target.value)}
            placeholder="coluna do nome (opcional)"
            className={`flex-1 ${inputClass}`}
          />
        </div>

        <label className="mb-4 flex items-start gap-2.5 rounded-[--radius-app] border border-status-skipped/35 bg-status-skipped/5 p-3 text-xs leading-relaxed text-zinc-300">
          <input
            type="checkbox"
            checked={optIn}
            onChange={(e) => setOptIn(e.target.checked)}
            className="mt-0.5 accent-primary-500"
          />
          <span>
            <strong className="text-zinc-100">Declaração de opt-in obrigatória:</strong> confirmo que esta lista possui
            consentimento documentado dos titulares (LGPD art. 7º) e atende à política anti-spam da Meta.
          </span>
        </label>

        {importMut.data && (
          <p className="mb-3 rounded-[--radius-app] border border-primary-500/25 bg-primary-500/10 px-3 py-2 text-sm text-primary-300">
            {importMut.data.imported} importados · {importMut.data.duplicates} duplicados · {importMut.data.invalid} inválidos
          </p>
        )}
        {importMut.error && <p className="mb-3 text-sm text-status-failed">{importMut.error.message}</p>}

        <button
          disabled={!optIn || !csv || importMut.isPending}
          onClick={() =>
            importMut.mutate({ csv, mapping: { phone: phoneCol, name: nameCol || undefined }, optInConfirmed: optIn })
          }
          className={`w-full ${btnPrimary}`}
        >
          Importar
        </button>
      </div>
    </div>
  )
}
