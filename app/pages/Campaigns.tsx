import { Link } from 'react-router'
import { useCampaigns } from '../hooks/useCampaigns'
import { StatusBadge } from '../components/StatusBadge'

export default function Campaigns() {
  const { data } = useCampaigns()
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campanhas</h1>
        <Link to="/campaigns/new"
          className="rounded-[--radius-app] bg-primary-600 px-4 py-2 text-sm font-medium hover:bg-primary-500">
          Nova campanha
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-400">
          <tr className="border-b border-zinc-800">
            <th className="py-2">Nome</th><th>Template</th><th>Status</th>
            <th>Enviadas</th><th>Entregues</th><th>Lidas</th><th>Falhas</th>
          </tr>
        </thead>
        <tbody>
          {(data?.items ?? []).map((c) => (
            <tr key={c.id} className="border-b border-zinc-800/50 hover:bg-zinc-900">
              <td className="py-3"><Link className="font-medium hover:text-primary-400" to={`/campaigns/${c.id}`}>{c.name}</Link></td>
              <td className="text-zinc-400">{c.template_name}</td>
              <td><StatusBadge status={c.status} /></td>
              <td>{c.sent}</td><td>{c.delivered}</td><td>{c.read}</td>
              <td className={c.failed ? 'text-status-failed' : ''}>{c.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
