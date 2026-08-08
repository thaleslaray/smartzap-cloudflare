import { useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  MousePointerClick,
  Target,
  UserCheck,
  Users,
} from "lucide-react";
import { Card, PageError, PageHeader, PageLoading, btnSecondary } from "../components/ui";
import { useConversionDiagnostics, useConversionSummary } from "../hooks/useConversions";

const periods = [7, 30, 90] as const;

function money(valueMinor: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(valueMinor / 100);
}

export default function ConversionsAnalytics() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [tab, setTab] = useState<"overview" | "funnel" | "events" | "diagnostics">("overview");
  const summary = useConversionSummary(days);
  const diagnostics = useConversionDiagnostics();
  if (summary.isLoading) return <PageLoading label="Carregando conversões…" />;
  if (summary.error)
    return <PageError message={summary.error.message} onRetry={() => summary.refetch()} />;
  const data = summary.data!;
  const totals = data.totals ?? {
    total: 0,
    leads: 0,
    qualified: 0,
    purchases: 0,
    matched: 0,
    attributed: 0,
    match_unknown: 0,
    attribution_unknown: 0,
  };
  const statusTotals = Object.fromEntries(data.delivery.map((item) => [item.status, Number(item.total)]));
  const accepted = statusTotals.accepted ?? 0;
  const pending = (statusTotals.pending ?? 0) + (statusTotals.sending ?? 0) +
    (statusTotals.temporary_failed ?? 0) + (statusTotals.unknown ?? 0);
  const failed = (statusTotals.permanent_failed ?? 0) + (statusTotals.dead_letter ?? 0);
  const ctwa = data.attributions.find((item) => item.attribution_kind === "ctwa")?.total ?? 0;
  const unattributed = data.attributions.find((item) => item.attribution_kind === "referral_without_click_id")?.total ?? 0;
  const registered = Number(totals.total ?? 0);
  const matched = Number(totals.matched ?? 0);
  const attributed = Number(totals.attributed ?? 0);

  return (
    <div className="max-w-[1240px] space-y-6 pb-20">
      <PageHeader
        title="Conversões de anúncios"
        subtitle="Resultados comerciais atribuídos a conversas Click-to-WhatsApp"
        action={
          <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
            {periods.map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={days === period}
                onClick={() => setDays(period)}
                className={`rounded-lg px-3 py-2 text-xs ${days === period ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                {period} dias
              </button>
            ))}
          </div>
        }
      />

      {!diagnostics.isLoading && diagnostics.data && !diagnostics.data.enabled && (
        <Card className="flex flex-col gap-3 border-amber-700/30 p-4 sm:flex-row sm:items-center">
          <AlertTriangle className="shrink-0 text-amber-400" size={20} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Conversões Meta desativadas</p>
            <p className="text-xs text-zinc-500">{diagnostics.data.message}</p>
          </div>
          <Link to="/settings/meta-diagnostics" className={btnSecondary}>
            Configurar <ArrowRight size={14} />
          </Link>
        </Card>
      )}

      <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50 p-1" role="tablist" aria-label="Seções das conversões">
        {([
          ["overview", "Visão geral"],
          ["funnel", "Funil CTWA"],
          ["events", "Eventos e falhas"],
          ["diagnostics", "Diagnóstico Meta"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm ${tab === value ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={MousePointerClick} label="Conversas de anúncio" value={Number(ctwa)} tone="blue" />
        <Metric icon={Users} label="Leads enviados" value={Number(totals.leads)} tone="green" />
        <Metric icon={UserCheck} label="Leads qualificados" value={Number(totals.qualified)} tone="purple" />
        <Metric icon={CircleDollarSign} label="Compras" value={Number(totals.purchases)} tone="amber" />
      </div>}

      {(tab === "overview" || tab === "funnel") && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Funil informado</h2>
              <p className="text-xs text-zinc-500">Eventos registrados manualmente no período</p>
            </div>
            <Target size={20} className="text-primary-400" />
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ["Lead enviado", Number(totals.leads)],
              ["Lead qualificado", Number(totals.qualified)],
              ["Compra", Number(totals.purchases)],
            ].map(([label, value], index) => (
              <div key={String(label)} className="relative rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="mt-2 text-3xl font-semibold">{value}</p>
                {index < 2 && <ArrowRight className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-zinc-700 sm:block" size={18} />}
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-zinc-800 pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Receita informada</p>
            {data.revenues.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {data.revenues.map((item) => (
                  <span key={item.currency} className="rounded-lg border border-zinc-800 px-3 py-2 text-sm">
                    {money(Number(item.value_minor), item.currency)}
                  </span>
                ))}
              </div>
            ) : <p className="mt-2 text-sm text-zinc-500">Nenhuma compra registrada.</p>}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold">Entrega à Meta</h2>
          <div className="mt-4 space-y-3">
            <DeliveryRow icon={CheckCircle2} label="Aceitas" value={accepted} className="text-primary-400" />
            <DeliveryRow icon={Target} label="Em processamento" value={pending} className="text-amber-400" />
            <DeliveryRow icon={AlertTriangle} label="Com falha" value={failed} className="text-red-400" />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-zinc-400">
            “Aceita” significa que a API confirmou events_received=1. A atribuição final é processada pela Meta e pode aparecer depois no Gerenciador de Eventos.
          </p>
          <div className="mt-4 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
            <p>Backlog operacional: <strong className="text-zinc-300">{pending}</strong></p>
            <p className="mt-1">Tempo médio clique → conversão: <strong className="text-zinc-300">{formatDuration(data.latency?.average_seconds)}</strong></p>
            <p className="mt-1">Maior tempo observado: <strong className="text-zinc-300">{formatDuration(data.latency?.maximum_seconds)}</strong></p>
          </div>
        </Card>
      </div>}

      {tab === "events" && <Card className="overflow-hidden">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="text-lg font-semibold">Eventos que precisam de atenção</h2>
        </div>
        {data.failures.length ? (
          <div className="divide-y divide-zinc-800">
            {data.failures.map((failure) => (
              <div key={failure.id} className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-[180px_150px_minmax(0,1fr)]">
                <span>{failure.event_name}</span>
                <span className="text-zinc-500">{failure.status} · {failure.attempts} tentativa(s)</span>
                <span className="text-zinc-400">{failure.last_error_detail || failure.last_error_code || "Confirmação da Meta pendente"}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-zinc-500">Nenhuma falha no período.</p>
        )}
      </Card>}

      {tab === "diagnostics" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Estados oficiais</h2>
            <p className="mt-1 text-xs text-zinc-500">Cada etapa tem um significado diferente.</p>
            <div className="mt-5 space-y-3">
              <StatusRow label="Registrado pelo SmartZap" value={registered} detail="Fato comercial preservado no histórico local." />
              <StatusRow label="Aceito pela Meta" value={accepted} detail="A API respondeu events_received=1." />
              <StatusRow label="Matched pela Meta" value={matched} detail={`${Number(totals.match_unknown ?? 0)} ainda sem leitura oficial sincronizada.`} />
              <StatusRow label="Atribuído pela Meta" value={attributed} detail={`${Number(totals.attribution_unknown ?? 0)} dependem da conferência no Gerenciador de Eventos.`} />
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Origem e configuração</h2>
            <div className="mt-5 space-y-3 text-sm">
              <p className="flex justify-between gap-4"><span className="text-zinc-500">Conversas CTWA atribuíveis</span><strong>{Number(ctwa)}</strong></p>
              <p className="flex justify-between gap-4"><span className="text-zinc-500">Referrals sem click ID</span><strong>{Number(unattributed)}</strong></p>
              <p className="flex justify-between gap-4"><span className="text-zinc-500">Integração</span><strong>{diagnostics.data?.enabled ? "Ativa" : "Desativada"}</strong></p>
              <p className="flex justify-between gap-4"><span className="text-zinc-500">Dataset</span><strong>{diagnostics.data?.dataset.status ?? "desconhecido"}</strong></p>
              <p className="flex justify-between gap-4"><span className="text-zinc-500">Canário real</span><strong>{diagnostics.data?.canary.accepted ? "Aceito" : diagnostics.data?.canary.status ?? "pendente"}</strong></p>
              <p className="flex justify-between gap-4"><span className="text-zinc-500">Graph API</span><strong>{diagnostics.data?.graphVersion ?? "não confirmada"}</strong></p>
            </div>
            <Link to="/settings/meta-diagnostics" className={`${btnSecondary} mt-5 w-full justify-center`}>Abrir diagnóstico <ArrowRight size={14} /></Link>
          </Card>
        </div>
      )}
    </div>
  );
}

function formatDuration(value: number | null | undefined) {
  if (value === null || value === undefined) return "sem dados";
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.round(value / 60)}min`;
  if (value < 86400) return `${(value / 3600).toFixed(1)}h`;
  return `${(value / 86400).toFixed(1)}d`;
}

function StatusRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 p-4">
      <div className="flex items-center justify-between gap-4"><span className="text-sm text-zinc-300">{label}</span><strong className="text-xl">{value}</strong></div>
      <p className="mt-1 text-xs text-zinc-400">{detail}</p>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: {
  icon: typeof Target;
  label: string;
  value: number;
  tone: "blue" | "green" | "purple" | "amber";
}) {
  const colors = {
    blue: "bg-blue-500/10 text-blue-400",
    green: "bg-primary-500/10 text-primary-400",
    purple: "bg-purple-500/10 text-purple-400",
    amber: "bg-amber-500/10 text-amber-400",
  };
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${colors[tone]}`}><Icon size={20} /></span>
      <div><p className="text-2xl font-semibold">{value.toLocaleString("pt-BR")}</p><p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p></div>
    </Card>
  );
}

function DeliveryRow({ icon: Icon, label, value, className }: {
  icon: typeof Target;
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800 px-3 py-3">
      <Icon size={17} className={className} />
      <span className="text-sm text-zinc-400">{label}</span>
      <strong className="ml-auto">{value.toLocaleString("pt-BR")}</strong>
    </div>
  );
}
