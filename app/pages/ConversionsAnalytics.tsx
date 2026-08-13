import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Megaphone,
  MessageCircleMore,
  RefreshCw,
  Target,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import {
  Card,
  PageError,
  PageHeader,
  PageLoading,
  btnPrimary,
  btnSecondary,
} from "../components/ui";
import {
  useConversionDiagnostics,
  useConversionReconciliation,
  useConversionSummary,
  useSyncConversionReconciliation,
} from "../hooks/useConversions";

const periods = [7, 30, 90] as const;

function money(valueMinor: number | null | undefined, currency = "BRL") {
  if (valueMinor === null || valueMinor === undefined) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency })
      .format(valueMinor / 100);
  } catch {
    return `${currency} ${(valueMinor / 100).toFixed(2)}`;
  }
}

function dateTime(value: string | null | undefined) {
  if (!value) return "Nunca sincronizado";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function ConversionsAnalytics() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [tab, setTab] = useState<"overview" | "funnel" | "events" | "diagnostics">("overview");
  const summary = useConversionSummary(days);
  const reconciliation = useConversionReconciliation(days);
  const sync = useSyncConversionReconciliation();
  const diagnostics = useConversionDiagnostics();

  if (summary.isLoading) return <PageLoading label="Carregando conversões…" />;
  if (summary.error)
    return <PageError message={summary.error.message} onRetry={() => summary.refetch()} />;

  const data = summary.data!;
  const media = reconciliation.data;
  const mediaTotals = media?.totals.find((item) => item.currency === "BRL") ?? media?.totals[0];
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
  const statusTotals = Object.fromEntries(
    data.delivery.map((item) => [item.status, Number(item.total)]),
  );
  const accepted = statusTotals.accepted ?? 0;
  const pending = (statusTotals.pending ?? 0) + (statusTotals.sending ?? 0) +
    (statusTotals.temporary_failed ?? 0) + (statusTotals.unknown ?? 0);
  const failed = (statusTotals.permanent_failed ?? 0) + (statusTotals.dead_letter ?? 0);
  const ctwa = Number(data.attributions.find(
    (item) => item.attribution_kind === "ctwa",
  )?.total ?? 0);
  const unattributed = Number(data.attributions.find(
    (item) => item.attribution_kind === "referral_without_click_id",
  )?.total ?? 0);
  const registered = Number(totals.total ?? 0);

  const headerAction = (
    <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
      <button
        type="button"
        className={btnPrimary}
        disabled={sync.isPending}
        onClick={() => sync.mutate()}
      >
        <RefreshCw size={15} className={sync.isPending ? "animate-spin" : ""} />
        {sync.isPending ? "Sincronizando…" : "Sincronizar Meta"}
      </button>
      <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
        {periods.map((period) => (
          <button
            key={period}
            type="button"
            aria-pressed={days === period}
            onClick={() => setDays(period)}
            className={`rounded-lg px-3 py-2 text-xs ${
              days === period ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {period} dias
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-5 pb-20">
      <PageHeader
        title="Conversões de anúncios"
        subtitle="Do investimento na Meta ao resultado comercial no WhatsApp"
        action={headerAction}
      />

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          reconciliation.isLoading ? "animate-pulse bg-amber-400" :
            media?.state === "healthy" ? "bg-primary-400" : "bg-amber-400"
        }`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {reconciliation.isLoading ? "Consultando o último retrato…" :
              media?.state === "healthy" ? "Mídia e conversões reconciliadas" :
                media?.state === "attention" ? "Sincronização exige atenção" :
                  "Sincronização da Meta pendente"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Última atualização válida: {dateTime(media?.latestSuccessfulRun?.completed_at)}
            {media?.configuration.adAccountSuffix
              ? ` · conta de anúncios …${media.configuration.adAccountSuffix}`
              : ""}
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Clock3 size={14} /> Atualização automática a cada 6 horas
        </span>
      </Card>

      {sync.error && (
        <Notice severity="critical" title="Não foi possível sincronizar agora" detail={sync.error.message} />
      )}
      {reconciliation.error && (
        <Notice
          severity="warning"
          title="O painel de mídia não carregou"
          detail={`${reconciliation.error.message}. Os eventos do SmartZap continuam preservados.`}
        />
      )}
      {media?.alerts.map((alert) => (
        <Notice key={alert.code} {...alert} />
      ))}
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

      <div
        className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50 p-1"
        role="tablist"
        aria-label="Seções das conversões"
      >
        {([
          ["overview", "Visão geral"],
          ["funnel", "Funil CTWA"],
          ["events", "Alertas e eventos"],
          ["diagnostics", "Diagnóstico Meta"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm ${
              tab === value ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <section aria-labelledby="media-heading">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <h2 id="media-heading" className="text-lg font-semibold">Resultado atribuído pela Meta</h2>
                <p className="text-xs text-zinc-500">Dados agregados do Ads Insights no período</p>
              </div>
              <span className="text-xs text-zinc-500">
                {mediaTotals ? `${mediaTotals.impressions.toLocaleString("pt-BR")} impressões` : "Sem retrato válido"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                icon={CircleDollarSign}
                label="Investimento"
                value={money(mediaTotals?.spendMinor, mediaTotals?.currency)}
                detail="Gasto confirmado pela conta de anúncios"
                tone="blue"
              />
              <Metric
                icon={MessageCircleMore}
                label="Conversas atribuídas"
                value={mediaTotals?.conversationsStarted.toLocaleString("pt-BR") ?? "—"}
                detail={money(mediaTotals?.costPerConversationMinor, mediaTotals?.currency) + " por conversa"}
                tone="green"
              />
              <Metric
                icon={UserCheck}
                label="Leads atribuídos"
                value={mediaTotals?.leads.toLocaleString("pt-BR") ?? "—"}
                detail={money(mediaTotals?.costPerLeadMinor, mediaTotals?.currency) + " por lead"}
                tone="purple"
              />
              <Metric
                icon={TrendingUp}
                label="ROAS atribuído"
                value={mediaTotals?.roas === null || mediaTotals?.roas === undefined
                  ? "—"
                  : `${mediaTotals.roas.toLocaleString("pt-BR")}×`}
                detail={mediaTotals?.roas === null || mediaTotals?.roas === undefined
                  ? "Aparece após compra e receita atribuídas"
                  : `${money(mediaTotals.purchaseValueMinor, mediaTotals.currency)} de receita`}
                tone="amber"
              />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <FunnelCard totals={totals} revenues={data.revenues} />
            <DeliveryCard
              accepted={accepted}
              pending={pending}
              failed={failed}
              averageSeconds={data.latency?.average_seconds}
              maximumSeconds={data.latency?.maximum_seconds}
            />
          </div>

          <AdsReconciliation ads={media?.ads ?? []} loading={reconciliation.isLoading} />
        </>
      )}

      {tab === "funnel" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Megaphone} label="Conversas CTWA capturadas" value={ctwa} detail="Origem identificada pelo SmartZap" tone="blue" />
            <Metric icon={Users} label="Leads enviados" value={Number(totals.leads)} detail="Eventos comerciais registrados" tone="green" />
            <Metric icon={UserCheck} label="Leads qualificados" value={Number(totals.qualified)} detail="Qualificação confirmada" tone="purple" />
            <Metric icon={CircleDollarSign} label="Compras" value={Number(totals.purchases)} detail="Compras informadas no WhatsApp" tone="amber" />
          </div>
          <FunnelCard totals={totals} revenues={data.revenues} />
          <AdsReconciliation ads={media?.ads ?? []} loading={reconciliation.isLoading} />
        </>
      )}

      {tab === "events" && (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="border-b border-zinc-800 px-5 py-4">
              <h2 className="text-lg font-semibold">Alertas de reconciliação</h2>
              <p className="mt-1 text-xs text-zinc-500">Diferenças reais entre SmartZap e Meta, sem inferência individual.</p>
            </div>
            {media?.alerts.length ? (
              <div className="divide-y divide-zinc-800">
                {media.alerts.map((alert) => (
                  <div key={alert.code} className="px-5 py-4">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">{alert.detail}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-zinc-500">
                Nenhuma divergência conhecida no retrato atual.
              </p>
            )}
          </Card>

          <Card className="overflow-hidden">
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
              <p className="px-5 py-8 text-center text-sm text-zinc-500">Nenhuma falha de entrega no período.</p>
            )}
          </Card>
        </div>
      )}

      {tab === "diagnostics" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold">O que sabemos de verdade</h2>
            <p className="mt-1 text-xs text-zinc-500">Estados individuais e resultados agregados não são a mesma coisa.</p>
            <div className="mt-5 space-y-3">
              <StatusRow label="Registrado pelo SmartZap" value={registered} detail="Fato comercial preservado no histórico local." />
              <StatusRow label="Aceito pela API da Meta" value={accepted} detail="A API confirmou events_received=1; isso ainda não prova atribuição." />
              <StatusRow label="Matched individualmente" value={Number(totals.matched ?? 0)} detail={`${Number(totals.match_unknown ?? 0)} sem retorno oficial individual. A Meta não expõe esse vínculo no Ads Insights.`} />
              <StatusRow label="Atribuído individualmente" value={Number(totals.attributed ?? 0)} detail="Não é inferido a partir de totais agregados." />
              <StatusRow label="Leads atribuídos no agregado" value={mediaTotals?.leads ?? 0} detail="Resultado por anúncio e período confirmado pelo Ads Insights." />
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Origem e configuração</h2>
            <div className="mt-5 space-y-3 text-sm">
              <KeyValue label="Conversas CTWA capturadas" value={ctwa} />
              <KeyValue label="Referrals sem click ID" value={unattributed} />
              <KeyValue label="Integração de conversões" value={diagnostics.data?.enabled ? "Ativa" : "Desativada"} />
              <KeyValue label="Dataset" value={diagnostics.data?.dataset.status ?? "desconhecido"} />
              <KeyValue label="Canário real" value={diagnostics.data?.canary.accepted ? "Aceito" : diagnostics.data?.canary.status ?? "pendente"} />
              <KeyValue label="Graph API" value={media?.configuration.graphVersion ?? diagnostics.data?.graphVersion ?? "não confirmada"} />
              <KeyValue label="Qualidade do Dataset" value="Não aplicável ao WhatsApp" />
            </div>
            <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/30 p-3 text-xs leading-relaxed text-zinc-500">
              {media?.datasetQuality.detail ?? "A métrica pública de qualidade do Dataset é voltada à Web e não será apresentada como EMQ do WhatsApp."}
            </p>
            <Link to="/settings/meta-diagnostics" className={`${btnSecondary} mt-5 w-full justify-center`}>
              Abrir diagnóstico <ArrowRight size={14} />
            </Link>
          </Card>
        </div>
      )}
    </div>
  );
}

function AdsReconciliation({ ads, loading }: {
  ads: NonNullable<ReturnType<typeof useConversionReconciliation>["data"]>["ads"];
  loading: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-zinc-800 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">SmartZap × Meta por anúncio</h2>
          <p className="mt-1 text-xs text-zinc-500">Captura local comparada ao resultado agregado atribuído pela Meta.</p>
        </div>
        <span className="text-xs text-zinc-500">{ads.length} anúncio(s) com mídia</span>
      </div>
      {loading ? (
        <div className="px-5 py-8"><PageLoading label="Carregando mídia…" /></div>
      ) : ads.length ? (
        <div className="divide-y divide-zinc-800">
          {ads.map((ad) => (
            <div key={ad.adId} className="grid gap-4 px-5 py-5 xl:grid-cols-[minmax(220px,1.5fr)_repeat(4,minmax(110px,1fr))] xl:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" title={ad.adName}>{ad.adName}</p>
                <p className="mt-1 truncate text-xs text-zinc-500" title={ad.campaignName}>{ad.campaignName}</p>
                <p className="mt-1 text-[11px] text-zinc-600">{ad.firstDay} → {ad.lastDay} · anúncio …{ad.adId.slice(-6)}</p>
              </div>
              <MiniMetric label="Investimento" value={money(ad.spendMinor, ad.currency)} />
              <MiniMetric
                label="Conversas"
                value={`${ad.conversationsStarted} Meta`}
                detail={`${ad.smartZap.conversations} capturadas no SmartZap`}
              />
              <MiniMetric
                label="Leads"
                value={`${ad.leads} atribuídos`}
                detail={`${ad.smartZap.acceptedLeads} aceitos pela API`}
              />
              <MiniMetric
                label="Custo por lead"
                value={money(ad.costPerLeadMinor, ad.currency)}
                detail={ad.purchases > 0 ? `${ad.purchases} compra(s)` : "Sem compra atribuída"}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-10 text-center">
          <Megaphone className="mx-auto text-zinc-700" size={28} />
          <p className="mt-3 text-sm text-zinc-400">Nenhum retrato de mídia disponível.</p>
          <p className="mt-1 text-xs text-zinc-600">Sincronize a Meta para trazer gasto, conversas e resultados.</p>
        </div>
      )}
    </Card>
  );
}

function FunnelCard({ totals, revenues }: {
  totals: { leads: number; qualified: number; purchases: number };
  revenues: Array<{ currency: string; value_minor: number }>;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Funil comercial do WhatsApp</h2>
          <p className="text-xs text-zinc-500">Fatos registrados no SmartZap; não são atribuição presumida.</p>
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
        {revenues.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {revenues.map((item) => (
              <span key={item.currency} className="rounded-lg border border-zinc-800 px-3 py-2 text-sm">
                {money(Number(item.value_minor), item.currency)}
              </span>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-zinc-500">Nenhuma compra registrada.</p>}
      </div>
    </Card>
  );
}

function DeliveryCard({ accepted, pending, failed, averageSeconds, maximumSeconds }: {
  accepted: number;
  pending: number;
  failed: number;
  averageSeconds?: number | null;
  maximumSeconds?: number | null;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Entrega à Meta</h2>
      <div className="mt-4 space-y-3">
        <DeliveryRow icon={CheckCircle2} label="Aceitas" value={accepted} className="text-primary-400" />
        <DeliveryRow icon={Target} label="Em processamento" value={pending} className="text-amber-400" />
        <DeliveryRow icon={AlertTriangle} label="Com falha" value={failed} className="text-red-400" />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-zinc-400">
        “Aceita” confirma o recebimento técnico. O resultado atribuído aparece separadamente após o processamento da Meta.
      </p>
      <div className="mt-4 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
        <p>Backlog operacional: <strong className="text-zinc-300">{pending}</strong></p>
        <p className="mt-1">Tempo médio clique → conversão: <strong className="text-zinc-300">{formatDuration(averageSeconds)}</strong></p>
        <p className="mt-1">Maior tempo observado: <strong className="text-zinc-300">{formatDuration(maximumSeconds)}</strong></p>
      </div>
    </Card>
  );
}

function Notice({ severity, title, detail }: {
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
}) {
  const colors = severity === "critical"
    ? "border-red-800/40 bg-red-950/20 text-red-400"
    : severity === "warning"
      ? "border-amber-700/30 bg-amber-950/10 text-amber-400"
      : "border-blue-700/30 bg-blue-950/10 text-blue-400";
  return (
    <Card className={`flex gap-3 p-4 ${colors}`} role={severity === "critical" ? "alert" : "status"}>
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-zinc-400">{detail}</p>
      </div>
    </Card>
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
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-zinc-300">{label}</span>
        <strong className="text-xl">{value}</strong>
      </div>
      <p className="mt-1 text-xs text-zinc-400">{detail}</p>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return <p className="flex justify-between gap-4"><span className="text-zinc-500">{label}</span><strong className="text-right">{value}</strong></p>;
}

function Metric({ icon: Icon, label, value, detail, tone }: {
  icon: typeof Target;
  label: string;
  value: ReactNode;
  detail: string;
  tone: "blue" | "green" | "purple" | "amber";
}) {
  const colors = {
    blue: "bg-blue-500/10 text-blue-400",
    green: "bg-primary-500/10 text-primary-400",
    purple: "bg-purple-500/10 text-purple-400",
    amber: "bg-amber-500/10 text-amber-400",
  };
  return (
    <Card className="flex min-w-0 items-center gap-4 p-5">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${colors[tone]}`}><Icon size={20} /></span>
      <div className="min-w-0">
        <p className="truncate text-2xl font-semibold">{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</p>
        <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
        <p className="mt-1 truncate text-[11px] text-zinc-400" title={detail}>{detail}</p>
      </div>
    </Card>
  );
}

function MiniMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-zinc-600">{label}</p>
      <p className="mt-1 text-sm font-medium text-zinc-200">{value}</p>
      {detail && <p className="mt-0.5 text-[11px] text-zinc-500">{detail}</p>}
    </div>
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
