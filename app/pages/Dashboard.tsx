import { Link } from "react-router";
import { useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  MoreHorizontal,
  Send,
  TrendingUp,
} from "lucide-react";
import { useDashboard } from "../hooks/useDashboard";
import { PageError, PageLoading } from "../components/ui";

const tones = {
  blue: "border-blue-500/20 bg-blue-500/15 text-blue-400",
  green: "border-primary-500/20 bg-primary-500/15 text-primary-400",
  purple: "border-purple-500/20 bg-purple-500/15 text-purple-400",
  red: "border-red-500/20 bg-red-500/15 text-red-400",
};

export default function Dashboard() {
  const [range, setRange] = useState<7 | 15 | 30>(7);
  const query = useDashboard();
  if (query.isLoading) return <PageLoading label="Carregando dashboard…" />;
  if (query.error)
    return (
      <PageError
        message={query.error.message}
        onRetry={() => query.refetch()}
      />
    );
  const d = query.data!;
  const points = Array.from({ length: range }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (range - 1 - index));
    const key = date.toLocaleDateString("sv-SE");
    const existing = d.volume.find((point) => point.day.startsWith(key));
    return existing ?? { day: key, sent: 0, delivered: 0 };
  });
  const max = Math.max(1, ...points.map((x) => Number(x.sent)));
  const recentCampaigns = d.recentCampaigns.slice(0, 3);
  const deliveryPercent = Math.round(d.deliveryRate * 100);
  const hasActivity = d.sent30d > 0;
  const needsAttention = d.failed30d > 0;
  const failure = d.latestFailure;
  const failureTitle = failure
    ? "Falha no envio."
    : `${d.failed30d} ${d.failed30d === 1 ? "falha requer" : "falhas requerem"} revisão.`;
  const failureDetail = failure?.error_detail ?? failure?.error_code;
  const failureSummary = failure
    ? `Campanha: ${failure.campaign_name}. ${failureDetail ? `Motivo informado: ${failureDetail}` : "O provedor não informou o motivo detalhado. Abra a campanha para revisar os eventos."}`
    : "O provedor não informou o motivo detalhado. Abra a campanha para revisar os eventos.";
  const failureHref = failure
    ? `/campaigns/${failure.campaign_id}`
    : "/settings/performance";
  const peakPoint = points.reduce(
    (peak, point) => (Number(point.sent) > Number(peak.sent) ? point : peak),
    points[0],
  );
  const peakSummary = Number(peakPoint.sent)
    ? `Pico: ${Number(peakPoint.sent).toLocaleString("pt-BR")} envios em ${new Date(`${peakPoint.day}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
    : "Sem envios no período selecionado";
  const path = points
    .map(
      (point, index) =>
        `${index ? "L" : "M"} ${points.length === 1 ? 0 : (index / (points.length - 1)) * 100} ${100 - (Number(point.sent) / max) * 80}`,
    )
    .join(" ");
  return (
    <div className="legacy-dashboard space-y-6 pb-8">
      <div className="premium-dashboard-hero flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-heading-1">Dashboard</h1>
          <p className="text-body-sm">
            Visão geral da performance de mensagens
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/campaigns/new"
            aria-label="Criar nova campanha rápida"
            className="legacy-primary-action inline-flex h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold"
          >
            Campanha Rápida
          </Link>
        </div>
      </div>
      <div className="dashboard-command-grid">
        <section className={`dashboard-hero-card ${needsAttention ? "dashboard-hero-card--attention" : ""}`} aria-labelledby="dashboard-signal-title">
          <div className="dashboard-hero-card__top">
            <div className="min-w-0">
              <p className="dashboard-eyebrow">Resumo operacional <span>•</span> últimos 30 dias</p>
              <h2 id="dashboard-signal-title">
                {needsAttention
                  ? failureTitle
                  : hasActivity
                    ? "Operação estável."
                    : "Aguardando atividade."}
              </h2>
              <p className="dashboard-hero-card__copy">
                {needsAttention
                  ? failureSummary
                  : hasActivity
                    ? "Acompanhe a evolução das mensagens e mantenha a operação sob controle."
                    : "Quando a primeira campanha for enviada, o resumo aparecerá aqui."}
              </p>
            </div>
            <div className={`dashboard-status-mark ${needsAttention ? "dashboard-status-mark--attention" : ""}`} aria-label={needsAttention ? `${d.failed30d} ${d.failed30d === 1 ? "falha" : "falhas"} no envio` : "Operação monitorada"}>
              {needsAttention ? <AlertCircle size={22} aria-hidden="true" /> : <CheckCircle2 size={22} aria-hidden="true" />}
            </div>
          </div>
          <dl className="dashboard-hero-card__summary">
            <div>
              <dt>Enviadas</dt>
              <dd>{d.sent30d.toLocaleString("pt-BR")}</dd>
            </div>
            <div>
              <dt>Entrega</dt>
              <dd>{hasActivity ? `${deliveryPercent}%` : "—"}</dd>
            </div>
            <div>
              <dt>Leitura</dt>
              <dd>{hasActivity ? `${Math.round(d.readRate * 100)}%` : "—"}</dd>
            </div>
          </dl>
          <div className="dashboard-hero-card__footer">
            <span><i /> dados consolidados nos últimos 30 dias</span>
            <Link to={needsAttention ? failureHref : "/settings/performance"}>{needsAttention ? failure ? "Abrir campanha" : "Revisar desempenho" : "Ver desempenho"} <ArrowUpRight size={14} /></Link>
          </div>
        </section>
        <div className="dashboard-signal-stack">
          <Metric compact icon={CheckCircle2} tone="green" value={d.sent30d ? Math.round(d.readRate * d.sent30d).toLocaleString("pt-BR") : "—"} label="Mensagens Lidas" />
          <Metric compact icon={TrendingUp} tone="purple" value={String(d.activeCampaigns)} label="Campanhas Ativas" />
          <Metric compact icon={AlertCircle} tone="red" value={String(d.failed30d)} label="Falhas no Envio" />
        </div>
      </div>
      <div className="dashboard-detail-grid grid gap-4 lg:grid-cols-[minmax(0,1fr)_356px]">
        <section className="dashboard-chart-panel premium-panel min-h-[284px] rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-start gap-3">
            <div>
              <h3 id="chart-title" className="text-xl font-semibold">
                Volume de Mensagens
              </h3>
              <p className="dashboard-chart-summary">{peakSummary}</p>
            </div>
            <div
              role="group"
              aria-label="Período do gráfico"
              className="ml-auto flex gap-1 text-xs"
            >
              {([7, 15, 30] as const).map((value) => (
                <button
                  key={value}
                  aria-label={`Últimos ${value} dias`}
                  aria-pressed={range === value}
                  onClick={() => setRange(value)}
                  className={`rounded-lg px-3 py-1.5 ${range === value ? "premium-segment-active" : "premium-segment"}`}
                >
                  {value}D
                </button>
              ))}
            </div>
          </div>
          <figure
            role="figure"
            aria-labelledby="chart-title"
            aria-describedby="chart-description"
            className="mt-4"
          >
            <div className="h-[200px] overflow-hidden">
              <svg
                viewBox="0 0 720 300"
                className="h-full w-full"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#96f6bc" stopOpacity=".22" />
                    <stop offset="1" stopColor="#96f6bc" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0, 1, 2, 3, 4].map((index) => (
                  <g key={index}>
                    <line
                      x1="48"
                      x2="710"
                      y1={250 - index * 55}
                      y2={250 - index * 55}
                      stroke="rgba(255,255,255,.1)"
                      strokeDasharray="3 3"
                    />
                    <text
                      x="38"
                      y={254 - index * 55}
                      textAnchor="end"
                      fill="#9aa59e"
                      fontSize="12"
                    >
                      {Math.round((max / 4) * index)}
                    </text>
                  </g>
                ))}
                {points.length > 1 && (
                  <>
                    <path
                      d={`${points.map((point, index) => `${index ? "L" : "M"} ${48 + (index / (points.length - 1)) * 662} ${250 - (Number(point.sent) / max) * 220}`).join(" ")} L 710 250 L 48 250 Z`}
                      fill="url(#volumeFill)"
                    />
                    <path
                      d={points
                        .map(
                          (point, index) =>
                            `${index ? "L" : "M"} ${48 + (index / (points.length - 1)) * 662} ${250 - (Number(point.sent) / max) * 220}`,
                        )
                        .join(" ")}
                      fill="none"
                      stroke="#96f6bc"
                      strokeWidth="1.7"
                      vectorEffect="non-scaling-stroke"
                    />
                  </>
                )}
                {points.map((point, index) => {
                  const show =
                    range === 7 ||
                    index % (range === 15 ? 2 : 5) === 0 ||
                    index === points.length - 1;
                  return show ? (
                    <text
                      key={point.day}
                      x={48 + (index / (points.length - 1)) * 662}
                      y="278"
                      textAnchor="middle"
                      fill="#9aa59e"
                      fontSize="12"
                    >
                      {new Date(`${point.day}T12:00:00`).toLocaleDateString(
                        "pt-BR",
                        { day: "2-digit", month: "2-digit" },
                      )}
                    </text>
                  ) : null;
                })}
              </svg>
            </div>
            <p id="chart-description" className="sr-only">
              Gráfico de área mostrando o volume de mensagens enviadas ao longo
              do tempo. Os dados são atualizados automaticamente.
            </p>
          </figure>
        </section>
        <section className="dashboard-recent-panel premium-panel min-h-[284px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center border-b border-zinc-800 px-5 py-3.5">
            <h2 className="text-lg font-semibold">Campanhas Recentes</h2>
            <MoreHorizontal className="ml-auto text-zinc-500" size={18} />
          </div>
          {!!recentCampaigns.length && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sr-only">
                  <tr>
                    <th>Campanha</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {recentCampaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-zinc-800/30">
                      <td className="px-5 py-3.5">
                        <Link to={`/campaigns/${c.id}`} className="block">
                          <p className="truncate text-sm font-medium">{c.name}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {new Date(c.created_at).toLocaleDateString("pt-BR")}
                          </p>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {c.status === "draft" && (
                          <span className="rounded-full bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400">
                            Rascunho
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!recentCampaigns.length && (
            <p className="px-5 py-12 text-center text-sm text-zinc-500">
              Nenhuma campanha ainda
            </p>
          )}
          <Link
            to="/campaigns"
            className="flex items-center justify-center gap-2 px-5 py-3 text-xs text-zinc-400"
          >
            Ver Todas <ArrowUpRight size={13} />
          </Link>
        </section>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  tone,
  value,
  label,
  compact = false,
}: {
  icon: typeof Send;
  tone: keyof typeof tones;
  value: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <div className={`premium-card premium-metric-card rounded-2xl border border-zinc-800 bg-zinc-900/60 ${compact ? "dashboard-compact-metric p-5" : "p-6"}`}>
      <div className={`w-fit rounded-xl border p-3 ${tones[tone]}`}>
        <Icon size={compact ? 17 : 20} />
      </div>
      <h3 className={`${compact ? "mt-4 text-3xl" : "mt-6 text-stat"} font-semibold tracking-[-0.04em]`}>{value}</h3>
      <p className="mt-1 text-stat-label">{label}</p>
    </div>
  );
}
