import { Link } from 'react-router'
import { useDashboard } from '../hooks/useDashboard'
import { StatusBadge } from '../components/StatusBadge'
import { ProgressBar } from '../components/ProgressBar'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[--radius-app] bg-zinc-900 p-4">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const { data } = useDashboard()
  if (!data) return <div className="text-zinc-500">Carregando…</div>
  const pct = (n: number) => `${Math.round(n * 100)}%`
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Enviadas (30d)" value={String(data.sent30d)} />
        <Stat label="Taxa de entrega" value={pct(data.deliveryRate)} />
        <Stat label="Taxa de leitura" value={pct(data.readRate)} />
        <Stat label="Falhas (30d)" value={String(data.failed30d)} />
      </div>
      <section>
        <h2 className="mb-3 text-lg font-medium">Campanhas recentes</h2>
        {data.recentCampaigns.length === 0 ? (
          <div className="rounded-[--radius-app] bg-zinc-900 p-8 text-center text-zinc-400">
            Nenhuma campanha ainda. <Link className="text-primary-400" to="/contacts">Importe seus contatos</Link> para começar.
          </div>
        ) : (
          <div className="space-y-2">
            {data.recentCampaigns.map((c) => (
              <Link key={c.id} to={`/campaigns/${c.id}`}
                className="flex items-center gap-4 rounded-[--radius-app] bg-zinc-900 p-4 hover:bg-zinc-800">
                <span className="flex-1 font-medium">{c.name}</span>
                <StatusBadge status={c.status} />
                <div className="w-40"><ProgressBar value={c.sent} total={c.total} /></div>
                <span className="text-sm text-zinc-400">{c.sent}/{c.total}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
