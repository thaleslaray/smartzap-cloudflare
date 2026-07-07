import { useParams } from 'react-router'
import { useCampaign, useCampaignContacts, useCampaignAction } from '../hooks/useCampaigns'
import { StatusBadge } from '../components/StatusBadge'
import { ProgressBar } from '../components/ProgressBar'

export default function CampaignDetail() {
  const { id = '' } = useParams()
  const { data: c } = useCampaign(id)
  const { data: contacts } = useCampaignContacts(id)
  const pause = useCampaignAction(id, 'pause')
  const resume = useCampaignAction(id, 'resume')
  const cancel = useCampaignAction(id, 'cancel')
  if (!c) return <div className="text-zinc-500">Carregando…</div>
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="flex-1 text-2xl font-semibold">{c.name}</h1>
        <StatusBadge status={c.status} />
        {c.status === 'sending' && <button onClick={() => pause.mutate(undefined)} className="rounded-[--radius-app] bg-zinc-800 px-3 py-1.5 text-sm">Pausar</button>}
        {c.status === 'paused' && <button onClick={() => resume.mutate(undefined)} className="rounded-[--radius-app] bg-zinc-800 px-3 py-1.5 text-sm">Retomar</button>}
        {['sending', 'paused', 'scheduled'].includes(c.status) && (
          <button onClick={() => confirm('Cancelar a campanha?') && cancel.mutate(undefined)}
            className="rounded-[--radius-app] bg-red-950 px-3 py-1.5 text-sm text-status-failed">Cancelar</button>
        )}
      </div>
      <div className="rounded-[--radius-app] bg-zinc-900 p-6">
        <ProgressBar value={c.sent} total={c.total} />
        <div className="mt-4 grid grid-cols-5 gap-4 text-center text-sm">
          <div><div className="text-xl font-semibold">{c.total}</div><div className="text-zinc-400">Total</div></div>
          <div><div className="text-xl font-semibold text-status-sent">{c.sent}</div><div className="text-zinc-400">Enviadas</div></div>
          <div><div className="text-xl font-semibold text-status-delivered">{c.delivered}</div><div className="text-zinc-400">Entregues</div></div>
          <div><div className="text-xl font-semibold text-status-read">{c.read}</div><div className="text-zinc-400">Lidas</div></div>
          <div><div className="text-xl font-semibold text-status-failed">{c.failed}</div><div className="text-zinc-400">Falhas</div></div>
        </div>
        <div className="mt-4 text-right text-sm text-zinc-400">
          Custo real: <b className="text-zinc-200">{c.cost.real.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-400">
          <tr className="border-b border-zinc-800"><th className="py-2">Contato</th><th>Telefone</th><th>Status</th><th>Erro</th></tr>
        </thead>
        <tbody>
          {(contacts?.items ?? []).map((r, i) => (
            <tr key={i} className="border-b border-zinc-800/50">
              <td className="py-2">{String(r.name ?? '—')}</td>
              <td className="text-zinc-400">{String(r.phone)}</td>
              <td><StatusBadge status={String(r.status)} /></td>
              <td className="text-xs text-zinc-500" title={String(r.error_detail ?? '')}>{String(r.error_code ?? '')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
