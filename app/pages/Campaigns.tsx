import { useState } from 'react'
import { Link } from 'react-router'
import { useCampaigns } from '../hooks/useCampaigns'
import type { CampaignRow } from '../hooks/useDashboard'
import { StatusBadge } from '../components/StatusBadge'
import { ProgressBar } from '../components/ProgressBar'
import { Card, PageHeader, btnPrimary, inputClass } from '../components/ui'

const GRID_COLS = 'grid-cols-[minmax(190px,1.2fr)_150px_120px_minmax(260px,1.4fr)_110px]'

function formatDate(c: CampaignRow) {
  const raw = (c.status === 'scheduled' && c.scheduled_at) ? c.scheduled_at : c.created_at
  if (!raw) return '—'
  return new Date(raw).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default function Campaigns() {
  const { data } = useCampaigns()
  const [busca, setBusca] = useState('')

  const items = data?.items ?? []
  const q = busca.trim().toLowerCase()
  const linhas = q ? items.filter((c) => c.name.toLowerCase().includes(q)) : items

  return (
    <div className="space-y-4">
      <PageHeader
        title="Campanhas"
        subtitle={`${items.length} campanhas no total`}
        action={
          <Link to="/campaigns/new" className={btnPrimary}>
            Nova campanha
          </Link>
        }
      />

      <input
        placeholder="Buscar por nome…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className={`${inputClass} max-w-[260px]`}
      />

      <Card className="overflow-hidden">
        <div className={`grid ${GRID_COLS} gap-4 border-b border-border-subtle px-5 py-2.5 text-caption font-semibold uppercase tracking-wider text-zinc-500`}>
          <span>Nome</span><span>Template</span><span>Status</span><span>Progresso</span><span className="text-right">Data</span>
        </div>

        {linhas.map((c) => (
          <div key={c.id} className={`grid ${GRID_COLS} items-center gap-4 border-b border-border-subtle px-5 py-3.5 hover:bg-zinc-800/30`}>
            <Link to={`/campaigns/${c.id}`} className="truncate font-medium hover:text-primary-300">
              {c.name}
            </Link>
            <span className="truncate font-mono text-xs text-zinc-500">{c.template_name}</span>
            <span><StatusBadge status={c.status} /></span>
            <div>
              <ProgressBar value={c.sent} total={c.total} animated={c.status === 'sending'} />
              <p className="mt-1.5 text-xs text-zinc-500">
                <span className="text-zinc-400">{c.sent} env</span>
                {' · '}
                <span className="text-status-delivered">{c.delivered} ent</span>
                {' · '}
                <span className="text-status-read">{c.read} lidas</span>
                {' · '}
                <span className={c.failed ? 'text-status-failed' : ''}>{c.failed} falhas</span>
              </p>
            </div>
            <span className="text-right text-xs text-zinc-500">{formatDate(c)}</span>
          </div>
        ))}

        {linhas.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-zinc-400">
            Nenhuma campanha encontrada com esse filtro.
          </div>
        )}
      </Card>
    </div>
  )
}
