import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Activity, Clock, RefreshCw, Send, TriangleAlert } from "lucide-react";
import { api } from "../lib/api";
import {
  Card,
  PageError,
  PageHeader,
  PageLoading,
  btnSecondary,
  inputClass,
} from "../components/ui";
type Run = {
  campaign_id: string;
  name: string;
  template_name: string;
  sent: number;
  failed: number;
  status: string;
  throughput_mps: number | null;
  dispatch_duration_ms: number | null;
  created_at: string;
};
type Data = {
  rangeDays: number;
  totals: {
    runs: number;
    throughput_mps: {
      median: number | null;
      p90: number | null;
      samples: number;
    };
    sent: number;
    failed: number;
  };
  runs: Run[];
  hint: string;
};
export default function Performance() {
  const [range, setRange] = useState(30);
  const query = useQuery({
    queryKey: ["performance", range],
    queryFn: () => api<Data>(`/api/dashboard/performance?rangeDays=${range}`),
  });
  if (query.isLoading) return <PageLoading label="Calculando performance…" />;
  if (query.error) return <PageError message={query.error.message} />;
  const d = query.data!;
  const fmt = (n: number | null) =>
    n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return (
    <div className="max-w-[1120px] space-y-6 pb-20">
      <PageHeader
        title="Performance"
        subtitle="Baselines reais de execução das campanhas"
        action={
          <div className="flex gap-2">
            <select
              aria-label="Período"
              className={inputClass}
              value={range}
              onChange={(e) => setRange(Number(e.target.value))}
            >
              <option value="7">7 dias</option>
              <option value="30">30 dias</option>
              <option value="90">90 dias</option>
            </select>
            <button className={btnSecondary} onClick={() => query.refetch()}>
              <RefreshCw size={15} />
              Atualizar
            </button>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={Activity}
          label="Execuções"
          value={String(d.totals.runs)}
        />
        <Metric icon={Send} label="Enviadas" value={String(d.totals.sent)} />
        <Metric
          icon={Clock}
          label="Throughput mediano"
          value={`${fmt(d.totals.throughput_mps.median)} msg/s`}
        />
        <Metric
          icon={TriangleAlert}
          label="Falhas"
          value={String(d.totals.failed)}
        />
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="font-semibold">Execuções recentes</h2>
          <p className="mt-1 text-xs text-zinc-500">{d.hint}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="p-4">Campanha</th>
                <th>Template</th>
                <th>Enviadas</th>
                <th>Falhas</th>
                <th>Throughput</th>
                <th>Duração</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {d.runs.map((run) => (
                <tr key={run.campaign_id} className="border-t border-zinc-800">
                  <td className="p-4 font-medium">{run.name}</td>
                  <td className="font-mono text-xs text-zinc-500">
                    {run.template_name}
                  </td>
                  <td>{run.sent}</td>
                  <td>{run.failed}</td>
                  <td>{fmt(run.throughput_mps)}</td>
                  <td>
                    {run.dispatch_duration_ms === null
                      ? "—"
                      : `${fmt(run.dispatch_duration_ms / 1000)}s`}
                  </td>
                  <td>{run.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!d.runs.length && (
            <p className="p-10 text-center text-zinc-500">
              Nenhuma execução no período.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-5">
      <Icon size={18} className="text-primary-400" />
      <p className="mt-4 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </p>
    </Card>
  );
}
