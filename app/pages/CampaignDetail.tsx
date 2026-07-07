import { Link, useParams } from 'react-router'
import { useCampaign, useCampaignContacts, useCampaignAction } from '../hooks/useCampaigns'
import { StatusBadge } from '../components/StatusBadge'
import { ProgressBar } from '../components/ProgressBar'
import { Card, btnSecondary, btnDanger } from '../components/ui'

const GRID_COLS = 'grid-cols-[minmax(160px,1fr)_170px_120px_minmax(220px,1.3fr)]'

export default function CampaignDetail() {
  const { id = '' } = useParams()
  const { data: c } = useCampaign(id)
  const { data: contacts } = useCampaignContacts(id)
  const pause = useCampaignAction(id, 'pause')
  const resume = useCampaignAction(id, 'resume')
  const cancel = useCampaignAction(id, 'cancel')
  if (!c) return <div className="text-zinc-500">Carregando…</div>

  const pct = c.total ? (c.sent / c.total) * 100 : 0
  const pctOf = (v: number) => (c.sent > 0 ? `${((v / c.sent) * 100).toFixed(1).replace('.', ',')}% das enviadas` : '—')
  const num = (v: number) => v.toLocaleString('pt-BR')

  return (
    <div className="space-y-6">
      <Link to="/campaigns" className="text-[13px] text-zinc-500 hover:text-zinc-300">← Campanhas</Link>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-bold tracking-[-0.01em]">{c.name}</h1>
          <StatusBadge status={c.status} />
        </div>
        <div className="flex gap-2">
          {c.status === 'sending' && (
            <button onClick={() => pause.mutate(undefined)} className={btnSecondary}>Pausar</button>
          )}
          {c.status === 'paused' && (
            <button onClick={() => resume.mutate(undefined)} className={btnSecondary}>Retomar</button>
          )}
          {['sending', 'paused', 'scheduled'].includes(c.status) && (
            <button
              onClick={() => confirm('Cancelar a campanha?') && cancel.mutate(undefined)}
              className={btnDanger}
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <Card className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-[13px] text-zinc-400">Progresso ao vivo</p>
            <p className="text-xl font-bold tracking-[-0.02em]">{pct.toFixed(1).replace('.', ',')}%</p>
          </div>
          <ProgressBar value={c.sent} total={c.total} animated={c.status === 'sending'} />
          <div className="mt-5 grid grid-cols-5 gap-3">
            <div>
              <p className="text-xs text-zinc-500">Total</p>
              <p className="mt-1 text-xl font-bold">{num(c.total)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Enviadas</p>
              <p className="mt-1 text-xl font-bold text-status-sent">{num(c.sent)}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">de {num(c.total)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Entregues</p>
              <p className="mt-1 text-xl font-bold text-status-delivered">{num(c.delivered)}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{pctOf(c.delivered)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Lidas</p>
              <p className="mt-1 text-xl font-bold text-status-read">{num(c.read)}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{pctOf(c.read)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Falhas</p>
              <p className="mt-1 text-xl font-bold text-status-failed">{num(c.failed)}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{pctOf(c.failed)}</p>
            </div>
          </div>
        </Card>

        <div className="flex flex-col justify-between rounded-[--radius-app] border border-primary-500/25 bg-primary-500/[0.06] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-400">Custo real acumulado</p>
          <p className="mt-3 text-[30px] font-bold tracking-[-0.02em] text-primary-300">
            {c.cost.real.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            {num(c.delivered)} entregues × R$ {c.cost.unit.toFixed(4).replace('.', ',')} (marketing, BRL)
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-[15px] font-semibold">Destinatários</h2>
        </div>
        <div className={`grid ${GRID_COLS} gap-4 border-t border-b border-[#1f1f23] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500`}>
          <span>Contato</span><span>Telefone</span><span>Status</span><span>Erro</span>
        </div>
        {(contacts?.items ?? []).map((r, i) => (
          <div key={i} className={`grid ${GRID_COLS} items-center gap-4 border-b border-[#1f1f23] px-5 py-3`}>
            <p className="truncate text-sm font-medium">{String(r.name ?? '—')}</p>
            <p className="font-mono text-xs text-zinc-500">{String(r.phone)}</p>
            <span><StatusBadge status={String(r.status)} /></span>
            {r.error_code ? (
              <span title={String(r.error_detail ?? '')} className="inline-flex w-fit cursor-help items-center gap-2">
                <span className="rounded-md border border-status-failed/30 bg-status-failed/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-status-failed">
                  {String(r.error_code)}
                </span>
              </span>
            ) : (
              <span className="text-xs text-zinc-500">—</span>
            )}
          </div>
        ))}
      </Card>
    </div>
  )
}
