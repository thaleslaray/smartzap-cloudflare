import { Link } from 'react-router'
import { useDashboard } from '../hooks/useDashboard'
import { StatusBadge } from '../components/StatusBadge'
import { ProgressBar } from '../components/ProgressBar'
import { PageHeader, StatCard, Card, btnPrimary } from '../components/ui'

export default function Dashboard() {
  const { data } = useDashboard()
  if (!data) return <div className="text-zinc-500">Carregando…</div>
  const pct = (n: number) => `${Math.round(n * 100)}%`

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Últimos 30 dias"
        action={<Link to="/campaigns/new" className={btnPrimary}>Nova campanha</Link>}
      />

      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatCard label="Mensagens enviadas" value={String(data.sent30d)} />
        <StatCard label="Taxa de entrega" value={pct(data.deliveryRate)} />
        <StatCard label="Taxa de leitura" value={pct(data.readRate)} />
        <StatCard
          label="Falhas"
          value={String(data.failed30d)}
          hintTone={data.failed30d > 0 ? 'failed' : 'muted'}
        />
      </div>

      {data.recentCampaigns.length === 0 ? (
        <div className="flex flex-col items-center rounded-[--radius-app] border border-dashed border-zinc-700 bg-zinc-900 px-10 py-[72px] text-center">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary-500">
            <span className="h-3.5 w-3.5 rounded-full bg-primary-500" />
          </div>
          <h2 className="text-lg font-semibold">Nenhum contato ainda</h2>
          <p className="mt-2 mb-6 max-w-[380px] text-sm text-zinc-400">
            Importe seus contatos para criar sua primeira campanha de WhatsApp.
          </p>
          <Link to="/contacts" className={btnPrimary}>Importar contatos</Link>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-subtitle font-semibold">Campanhas recentes</h2>
            <Link to="/campaigns" className="text-body text-primary-400 hover:underline">Ver todas</Link>
          </div>
          {data.recentCampaigns.map((c) => (
            <Link
              key={c.id}
              to={`/campaigns/${c.id}`}
              className="grid grid-cols-[minmax(200px,1.3fr)_130px_1fr_100px] items-center gap-4 border-t border-border-subtle px-5 py-3.5 hover:bg-zinc-800/50"
            >
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="mt-0.5 font-mono text-xs text-zinc-500">{c.template_name}</p>
              </div>
              <div className="justify-self-start"><StatusBadge status={c.status} /></div>
              <ProgressBar value={c.sent} total={c.total} animated={c.status === 'sending'} />
              <span className="text-right text-xs text-zinc-400">{c.sent}/{c.total}</span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}
