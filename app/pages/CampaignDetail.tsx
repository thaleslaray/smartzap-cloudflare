import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  AlertCircle,
  Ban,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Download,
  Eye,
  Filter,
  Loader2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  useCampaign,
  useCampaignContacts,
  useCampaignAction,
  useCampaignBatches,
  useResendSkippedCampaign,
  useSetCampaignSchedule,
} from "../hooks/useCampaigns";
import { useExchangeRate } from "../hooks/useExchangeRate";
import { StatusBadge } from "../components/StatusBadge";
import { ProgressBar } from "../components/ProgressBar";
import { getCampaignDisplayStatus } from "../lib/campaign-status";
import {
  useContactProfile,
  useSetCustomValue,
  useUpdateContact,
} from "../hooks/useContacts";
import {
  Card,
  Modal,
  PageError,
  PageLoading,
  btnPrimary,
  btnSecondary,
  btnDanger,
  inputClass,
} from "../components/ui";
import { TemplatePreviewCard } from "../components/TemplatePreviewCard";
import { formatCampaignMoney } from "../lib/format-money";

const logStatusConfig: Record<
  string,
  { label: string; icon: typeof Clock; className: string }
> = {
  pending: {
    label: "Pendente",
    icon: Loader2,
    className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
  sending: {
    label: "Pendente",
    icon: Loader2,
    className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
  read: {
    label: "Lido",
    icon: Eye,
    className: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  },
  delivered: {
    label: "Entregue",
    icon: CheckCircle2,
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  sent: {
    label: "Enviado",
    icon: Clock,
    className: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
  },
  skipped: {
    label: "Ignorado",
    icon: Ban,
    className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
  failed: {
    label: "Falhou",
    icon: AlertCircle,
    className: "border-red-500/30 bg-red-500/10 text-red-400",
  },
};

function MessageLogStatus({ status }: { status: string }) {
  const item = logStatusConfig[status] ?? logStatusConfig.pending;
  const Icon = item.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${item.className}`}
    >
      <Icon
        size={11}
        className={
          status === "pending" || status === "sending" ? "animate-spin" : ""
        }
      />
      {item.label}
    </span>
  );
}

export default function CampaignDetail() {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [contactsPage, setContactsPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showStatusFilters, setShowStatusFilters] = useState(false);
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);
  const [quickEditContactId, setQuickEditContactId] = useState<string | null>(
    null,
  );
  const { id = "" } = useParams();
  const campaignQuery = useCampaign(id);
  const exchangeRateQuery = useExchangeRate();
  const contactsQuery = useCampaignContacts(id, contactsPage);
  const batchesQuery = useCampaignBatches(id);
  const { data: c } = campaignQuery;
  const { data: contacts } = contactsQuery;
  const pause = useCampaignAction(id, "pause");
  const resume = useCampaignAction(id, "resume");
  const cancel = useCampaignAction(id, "cancel");
  const start = useCampaignAction(id, "dispatch");
  const schedule = useSetCampaignSchedule(id);
  const resendSkipped = useResendSkippedCampaign(id);
  const dialogBackButton = useRef<HTMLButtonElement>(null);
  const filteredContacts = useMemo(
    () =>
      (contacts?.items ?? []).filter((row) => {
        const matchesStatus =
          !statusFilter ||
          String(row.status) === statusFilter ||
          (statusFilter === "delivered" && row.status === "read");
        const needle = search.trim().toLocaleLowerCase("pt-BR");
        const matchesSearch =
          !needle ||
          `${String(row.name ?? "")} ${String(row.phone ?? "")}`
            .toLocaleLowerCase("pt-BR")
            .includes(needle);
        return matchesStatus && matchesSearch;
      }),
    [contacts?.items, search, statusFilter],
  );

  if (campaignQuery.isLoading)
    return <PageLoading label="Carregando campanha…" />;
  if (campaignQuery.error)
    return (
      <PageError
        message={campaignQuery.error.message}
        onRetry={() => campaignQuery.refetch()}
      />
    );
  if (!c) return <PageError message="Campanha não encontrada." />;

  const displayStatus = getCampaignDisplayStatus(c.status, c.failed);
  const usdBrlRate = exchangeRateQuery.data?.rate ?? null;
  const estimatedDisplay = formatCampaignMoney(
    c.cost.state === "estimated" ? c.cost.amount : null,
    c.cost.currency,
    usdBrlRate,
  );
  const confirmedDisplay = formatCampaignMoney(
    c.cost.confirmed?.amount,
    c.cost.confirmed?.currency,
    usdBrlRate,
  );
  const num = (v: number) => v.toLocaleString("pt-BR");
  const skipped =
    c.status_counts?.skipped ??
    (["draft", "scheduled"].includes(c.status)
      ? 0
      : Math.max(0, c.total - c.sent - c.failed));
  const actionPending =
    pause.isPending ||
    resume.isPending ||
    cancel.isPending ||
    start.isPending ||
    schedule.isPending ||
    resendSkipped.isPending;
  const actionError =
    pause.error ??
    resume.error ??
    cancel.error ??
    start.error ??
    schedule.error ??
    resendSkipped.error;
  const completedBatches = (batchesQuery.data?.items ?? []).filter(
    (batch) => batch.started_at && batch.completed_at,
  );
  const firstStartedAt = completedBatches.length
    ? Math.min(
        ...completedBatches.map((batch) =>
          new Date(batch.started_at as string).getTime(),
        ),
      )
    : null;
  const lastCompletedAt = completedBatches.length
    ? Math.max(
        ...completedBatches.map((batch) =>
          new Date(batch.completed_at as string).getTime(),
        ),
      )
    : null;
  const dispatchDurationMs =
    firstStartedAt !== null && lastCompletedAt !== null
      ? Math.max(0, lastCompletedAt - firstStartedAt)
      : 0;
  const acceptedTotal = completedBatches.reduce(
    (sum, batch) => sum + batch.accepted_count,
    0,
  );
  const throughput = dispatchDurationMs
    ? acceptedTotal / (dispatchDurationMs / 1000)
    : 0;
  return (
    <div className="space-y-8 pb-20 font-[var(--ds-font-body)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/campaigns"
            className="mb-2 inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-white"
          >
            <ChevronLeft size={12} /> Voltar para Lista
          </Link>
          <div
            className={`flex min-w-0 flex-wrap items-center gap-2 ${["sending", "paused"].includes(c.status) ? "campaign-detail-title-active" : ""}`}
          >
            <h1 className="text-heading-1 flex items-center gap-3 break-words">
              {c.name}
            </h1>
            <span className={`rounded border px-2 py-1 text-xs ${displayStatus.className}`}>
              {displayStatus.label}
            </span>
          </div>
          <p className="mt-1 break-all text-sm text-zinc-400">
            ID: {c.id} - Criado em{" "}
            {new Date(c.created_at).toLocaleDateString("pt-BR")}{" "}
            <button
              type="button"
              onClick={() => setShowTemplatePreview(true)}
              className="ml-2 text-primary-400 transition-colors hover:text-primary-300"
            >
              - Template:{" "}
              <span className="font-medium underline underline-offset-2">
                {c.template_name}
              </span>
            </button>
            {c.status === "scheduled" && c.scheduled_at && (
              <>
                <Calendar
                  size={12}
                  className="ml-2 mr-1 inline text-purple-400"
                />
                <span className="block text-purple-400 sm:inline">
                  Agendado para{" "}
                  {new Date(c.scheduled_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
          {["draft", "scheduled"].includes(c.status) && (
            <button
              disabled={actionPending}
              onClick={() => start.mutate({})}
              className="inline-flex items-center gap-2 rounded-lg border border-primary-500/20 bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
            >
              <Play size={16} />
              {start.isPending ? "Iniciando..." : "Iniciar Agora"}
            </button>
          )}
          {c.status === "scheduled" && (
            <button
              disabled={actionPending}
              onClick={() => schedule.mutate(null)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              <Ban size={16} />
              Cancelar agendamento
            </button>
          )}
          {["draft", "sending", "paused"].includes(c.status) && (
            <button
              disabled={actionPending}
              onClick={() => setConfirmCancel(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
            >
              <Ban size={16} />
              {cancel.isPending
                ? "Cancelando..."
                : c.status === "draft"
                  ? "Cancelar rascunho"
                  : "Cancelar envio"}
            </button>
          )}
          {c.status === "sending" && (
            <button
              disabled={actionPending}
              onClick={() => pause.mutate(undefined)}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              <Pause size={16} />
              {pause.isPending ? "Pausando…" : "Pausar"}
            </button>
          )}
          {c.status === "paused" && (
            <button
              disabled={actionPending}
              onClick={() => resume.mutate(undefined)}
              className="inline-flex items-center gap-2 rounded-lg border border-primary-500/20 bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
            >
              <Play size={16} />
              {resume.isPending ? "Retomando…" : "Retomar"}
            </button>
          )}
          {["draft", "paused", "failed", "cancelled"].includes(c.status) && (
            <button
              disabled={campaignQuery.isFetching}
              onClick={() => campaignQuery.refetch()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={campaignQuery.isFetching ? "animate-spin" : ""}
              />
              {campaignQuery.isFetching ? "Atualizando..." : "Atualizar"}
            </button>
          )}
          {skipped > 0 && (
            <button
              disabled={actionPending}
              onClick={() => resendSkipped.mutate()}
              title="Revalida contatos ignorados e reenfileira apenas os válidos"
              className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              <Ban size={16} />
              {resendSkipped.isPending
                ? "Reenviando..."
                : `Reenviar ignorados (${skipped})`}
            </button>
          )}
          <a
            href={`/api/campaigns/${encodeURIComponent(c.id)}/report.csv`}
            download
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5 hover:text-white"
          >
            <Download size={16} />
            Relatório CSV
          </a>
        </div>
      </div>

      {actionError && (
        <p
          role="alert"
          className="rounded-[--radius-app] border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-status-failed"
        >
          {actionError.message}
        </p>
      )}
      {resendSkipped.data && (
        <p
          role="status"
          className="rounded-[--radius-app] border border-emerald-800/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300"
        >
          {resendSkipped.data.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            key: "sent",
            label: "Enviadas",
            value: c.sent,
            sub: `${num(c.total)} destinatarios`,
            icon: Clock,
            color: "#a1a1aa",
          },
          {
            key: "delivered",
            label: "Entregues",
            value: Math.max(c.delivered, c.read),
            sub:
              Math.max(c.delivered, c.read) > 0
                ? `${((Math.max(c.delivered, c.read) / Math.max(c.total, 1)) * 100).toFixed(1)}% taxa de entrega${Math.max(c.delivered, c.read) - c.read > 0 ? ` - ${(Math.max(c.delivered, c.read) - c.read).toLocaleString("pt-BR")} nao lidas` : ""}`
                : "Aguardando webhook",
            icon: CheckCircle2,
            color: "#10b981",
          },
          {
            key: "read",
            label: "Lidas",
            value: c.read,
            sub:
              c.read > 0
                ? `${((c.read / Math.max(c.total, 1)) * 100).toFixed(1)}% taxa de abertura`
                : "Aguardando webhook",
            icon: Eye,
            color: "#3b82f6",
          },
          {
            key: "skipped",
            label: "Ignoradas",
            value: skipped,
            sub: "Variaveis/telefones invalidos (pre-check)",
            icon: Ban,
            color: "#f59e0b",
          },
          {
            key: "failed",
            label: "Falhas",
            value: c.failed,
            sub: "Numeros invalidos ou bloqueio",
            icon: AlertCircle,
            color: "#ef4444",
          },
        ].map((stat) => (
          <button
            key={stat.key}
            type="button"
            onClick={() =>
              setStatusFilter((current) =>
                current === stat.key ? "" : stat.key,
              )
            }
            className={`cursor-pointer rounded-2xl border border-[var(--ds-border-subtle)] border-l-4 bg-[var(--ds-bg-glass)] p-6 text-left backdrop-blur-xl transition-all duration-200 hover:border-[var(--ds-border-strong)] hover:shadow-md ${statusFilter === stat.key ? "bg-white/5 ring-2 ring-white/20" : ""}`}
            style={{ borderLeftColor: stat.color }}
          >
            <div className="mb-2 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-400">
                  {stat.label}
                </p>
                <h3 className="mt-1 text-3xl font-bold text-white">
                  {num(stat.value)}
                </h3>
              </div>
              <span className="rounded-lg bg-white/5 p-2">
                <stat.icon size={20} style={{ color: stat.color }} />
              </span>
            </div>
            <p className="text-xs text-zinc-500">{stat.sub}</p>
          </button>
        ))}
      </div>

      <section className="rounded-[--radius-app] border border-white/10 bg-zinc-950/60 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Custo Meta
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Estimativa pela tabela vigente; confirmação após reconciliação.
            </p>
          </div>
            <div className="grid w-full max-w-md gap-2 sm:w-auto sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
              <p className="text-xs text-zinc-500">Estimativa (BRL)</p>
              <p className="mt-0.5 font-semibold text-emerald-300">
                {estimatedDisplay.primary}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {c.cost.effectiveFrom ? `Tabela ${c.cost.effectiveFrom}` : c.cost.unavailableReasons[0] ?? "Sem rate card"}
              </p>
              {estimatedDisplay.secondary && (
                <p className="mt-0.5 text-xs text-zinc-400">
                  {estimatedDisplay.secondary}
                  {exchangeRateQuery.isLoading ? " • atualizando cotação…" : ""}
                  {exchangeRateQuery.data?.source === "last_valid" ? " (última cotação válida)" : ""}
                </p>
              )}
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
              <p className="text-xs text-zinc-500">Confirmado pela Meta (BRL)</p>
              <p className="mt-0.5 font-semibold text-white">
                {confirmedDisplay.primary === "—" ? "Aguardando" : confirmedDisplay.primary}
              </p>
              {confirmedDisplay.secondary && (
                <p className="mt-0.5 text-xs text-zinc-400">{confirmedDisplay.secondary}</p>
              )}
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {c.cost.confirmed?.state === "invoice" ? "Fatura" : "Pricing analytics/webhooks"}
              </p>
            </div>
          </div>
        </div>
        {c.cost.assumptions.length > 0 && (
          <p className="mt-3 text-xs text-amber-300/80">
            Premissas: {c.cost.assumptions.join("; ")}
          </p>
        )}
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-col justify-between gap-4 border-b border-white/5 p-5 sm:flex-row sm:items-center">
          <h3 className="flex items-center gap-2 font-bold">
            Logs de Envio{" "}
            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-normal text-zinc-500">
              {contacts?.total ?? 0}
            </span>
          </h3>
          <div className="relative flex gap-2">
            <label className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-1.5 focus-within:border-primary-500/50 sm:w-64">
              <Search size={14} className="text-zinc-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar destinatario..."
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
              />
            </label>
            <button
              type="button"
              onClick={() => setShowStatusFilters((open) => !open)}
              title="Filtrar"
              aria-label="Filtrar logs"
              aria-expanded={showStatusFilters}
              className={`rounded-lg border p-1.5 hover:bg-white/5 hover:text-white ${statusFilter ? "border-primary-500/40 text-primary-300" : "border-white/10 text-zinc-400"}`}
            >
              <Filter size={16} />
            </button>
            {showStatusFilters && (
              <div className="absolute right-9 top-10 z-20 w-48 rounded-xl border border-white/10 bg-zinc-950 p-2 shadow-2xl">
                {[
                  ["", "Todos os status"],
                  ["sent", "Enviados"],
                  ["delivered", "Entregues"],
                  ["read", "Lidos"],
                  ["skipped", "Ignorados"],
                  ["failed", "Falhas"],
                ].map(([value, label]) => (
                  <button
                    key={value || "all"}
                    type="button"
                    onClick={() => {
                      setStatusFilter(value);
                      setShowStatusFilters(false);
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-white/5 ${statusFilter === value ? "text-primary-300" : "text-zinc-400"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => contactsQuery.refetch()}
              title="Atualizar"
              aria-label="Atualizar logs"
              className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        {contactsQuery.error && (
          <div className="p-4">
            <PageError
              message={contactsQuery.error.message}
              onRetry={() => contactsQuery.refetch()}
            />
          </div>
        )}
        {!contactsQuery.error && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wider text-zinc-400">
                  <tr>
                    {[
                      "Destinatario",
                      "Telefone",
                      "Status",
                      "Horario",
                      "Info",
                      "Acoes",
                    ].map((label) => (
                      <th key={label} className="px-6 py-3 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredContacts.map((r, i) => (
                    <tr key={i} className="transition-colors hover:bg-white/5">
                      <td className="px-6 py-3 font-medium text-zinc-200">
                        {String(r.name ?? "—")}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-zinc-500">
                        {String(r.phone)}
                      </td>
                      <td className="px-6 py-3">
                        <MessageLogStatus status={String(r.status)} />
                      </td>
                      <td className="px-6 py-3 text-xs text-zinc-500">
                        {String(r.status) === "skipped"
                          ? "-"
                          : r.updated_at
                            ? new Date(String(r.updated_at)).toLocaleString(
                                "pt-BR",
                              )
                            : "—"}
                      </td>
                      <td className="px-6 py-3 text-xs text-zinc-500">
                        {r.error_detail ? (
                          <span
                            className={
                              String(r.status) === "skipped"
                                ? "inline-flex items-center gap-1 text-amber-400"
                                : ""
                            }
                          >
                            {String(r.status) === "skipped" && (
                              <Ban size={10} />
                            )}
                            {String(r.error_detail)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-3 text-xs">
                        {String(r.status) === "skipped" && r.contact_id ? (
                          <button
                            type="button"
                            onClick={() =>
                              setQuickEditContactId(String(r.contact_id))
                            }
                            title="Corrigir contato sem sair da campanha"
                            className="inline-flex items-center gap-1 whitespace-nowrap text-primary-400 transition-colors hover:text-primary-300"
                          >
                            <Pencil size={12} /> Corrigir contato
                          </button>
                        ) : (
                          <span className="text-zinc-600">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!filteredContacts.length && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-8 text-center text-zinc-500"
                      >
                        Nenhum registro encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
        {(contacts?.total ?? 0) > filteredContacts.length && (
          <div className="flex flex-col gap-3 border-t border-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-zinc-500">
              Mostrando{" "}
              <span className="font-mono text-zinc-300">
                {filteredContacts.length}
              </span>{" "}
              de{" "}
              <span className="font-mono text-zinc-300">
                {contacts?.total ?? 0}
              </span>
            </div>
            {(contacts?.total ?? 0) > 50 ? (
              <div
                className="flex items-center gap-3"
                aria-label="Paginação de destinatários"
              >
                <button
                  className={btnSecondary}
                  disabled={contactsPage === 1}
                  onClick={() => setContactsPage((p) => p - 1)}
                >
                  Anterior
                </button>
                <span className="text-sm text-zinc-400">
                  Página {contactsPage}
                </span>
                <button
                  className={btnSecondary}
                  disabled={contactsPage * 50 >= (contacts?.total ?? 0)}
                  onClick={() => setContactsPage((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            ) : (
              <div className="text-xs text-zinc-600">
                (Esta tela carrega até 100 por vez)
              </div>
            )}
          </div>
        )}
      </Card>

      {(batchesQuery.isLoading ||
        batchesQuery.error ||
        (batchesQuery.data?.items.length ?? 0) > 0 ||
        (batchesQuery.data?.traces.length ?? 0) > 0) && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-subtitle font-semibold">Lotes de envio</h2>
            <span className="text-xs text-zinc-500">
              Rastreabilidade operacional
            </span>
          </div>
          {batchesQuery.error && (
            <div className="p-4">
              <PageError
                message={batchesQuery.error.message}
                onRetry={() => batchesQuery.refetch()}
              />
            </div>
          )}
          {!batchesQuery.error && (
            <>
              <div className="hidden grid-cols-[70px_1fr_repeat(5,80px)] gap-3 border-t border-b border-border-subtle px-5 py-2.5 text-caption font-semibold uppercase tracking-wider text-zinc-500 md:grid">
                <span>Lote</span>
                <span>Status</span>
                <span>Contatos</span>
                <span>Aceitos</span>
                <span>Entregues</span>
                <span>Lidos</span>
                <span>Falhas</span>
              </div>
              {(batchesQuery.data?.items ?? []).map((batch) => (
                <div
                  key={batch.id}
                  className="grid grid-cols-[70px_1fr_auto] gap-3 border-b border-border-subtle px-5 py-3 text-sm md:grid-cols-[70px_1fr_repeat(5,80px)]"
                >
                  <span className="font-mono text-zinc-500">
                    #{batch.sequence + 1}
                  </span>
                  <span>
                    <StatusBadge status={batch.status} />
                  </span>
                  <span className="text-zinc-300">{batch.recipient_count}</span>
                  <span className="text-status-sent">
                    {batch.accepted_count}
                  </span>
                  <span className="text-status-delivered">
                    {batch.delivered_count}
                  </span>
                  <span className="text-status-read">{batch.read_count}</span>
                  <span
                    className={
                      batch.failed_count
                        ? "text-status-failed"
                        : "text-zinc-500"
                    }
                  >
                    {batch.failed_count}
                  </span>
                </div>
              ))}
              {!batchesQuery.isLoading &&
                !(batchesQuery.data?.items ?? []).length && (
                  <p className="p-8 text-center text-sm text-zinc-500">
                    Os lotes aparecerão quando o envio for iniciado.
                  </p>
                )}
              {(batchesQuery.data?.traces ?? []).length > 0 && (
                <details className="border-t border-border-subtle px-5 py-3">
                  <summary className="cursor-pointer text-xs text-zinc-400">
                    Ver eventos operacionais ({batchesQuery.data?.traces.length}
                    )
                  </summary>
                  <div className="mt-3 grid gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs sm:grid-cols-2">
                    <p className="text-zinc-400">
                      Throughput operacional: {throughput > 0 ? `${throughput.toFixed(2)} msg/s` : "dados insuficientes"}
                    </p>
                    <p className="text-zinc-400">
                      Duração dos lotes: {dispatchDurationMs > 0
                        ? dispatchDurationMs < 60_000
                          ? `${(dispatchDurationMs / 1000).toFixed(1)}s`
                          : `${Math.floor(dispatchDurationMs / 60_000)}m ${Math.round((dispatchDurationMs % 60_000) / 1000)}s`
                        : "dados insuficientes"}
                    </p>
                  </div>
                  <ol className="mt-3 space-y-1 text-xs text-zinc-500">
                    {batchesQuery.data?.traces.map((trace) => (
                      <li key={trace.id}>
                        <span
                          className={
                            trace.severity === "error"
                              ? "text-status-failed"
                              : trace.severity === "warn"
                                ? "text-amber-400"
                                : "text-zinc-400"
                          }
                        >
                          {trace.event_type}
                        </span>{" "}
                        · {new Date(trace.created_at).toLocaleString("pt-BR")}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </>
          )}
        </Card>
      )}

      {confirmCancel && (
        <Modal
          titleId="cancel-campaign-title"
          onClose={() => setConfirmCancel(false)}
          closeDisabled={cancel.isPending}
          initialFocusRef={dialogBackButton}
          panelClassName="max-w-md"
        >
          <h2 id="cancel-campaign-title" className="text-lg font-semibold">
            Cancelar campanha?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Novos envios serão interrompidos. Mensagens já aceitas pela Meta não
            podem ser recuperadas.
          </p>
          {cancel.error && (
            <p role="alert" className="mt-3 text-sm text-status-failed">
              {cancel.error.message}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <button
              ref={dialogBackButton}
              disabled={cancel.isPending}
              onClick={() => setConfirmCancel(false)}
              className={btnSecondary}
            >
              Voltar
            </button>
            <button
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate(undefined, {
                  onSuccess: () => setConfirmCancel(false),
                })
              }
              className={btnDanger}
            >
              {cancel.isPending ? "Cancelando…" : "Confirmar cancelamento"}
            </button>
          </div>
        </Modal>
      )}

      {showTemplatePreview && (
        <Modal
          titleId="campaign-template-preview-title"
          onClose={() => setShowTemplatePreview(false)}
          panelClassName="max-w-xl"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2
                id="campaign-template-preview-title"
                className="text-lg font-semibold"
              >
                {c.template_name}
              </h2>
              <p className="text-xs text-zinc-500">{c.template_language}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowTemplatePreview(false)}
              aria-label="Fechar preview"
              className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
          <div className="mt-5">
            {c.template ? (
              <TemplatePreviewCard
                name={c.template.name}
                components={c.template.components}
              />
            ) : (
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300">
                O template não está mais disponível no catálogo local.
              </p>
            )}
          </div>
        </Modal>
      )}
      {quickEditContactId && (
        <ContactCorrectionModal
          contactId={quickEditContactId}
          onClose={() => setQuickEditContactId(null)}
          onSaved={() => {
            setQuickEditContactId(null);
            contactsQuery.refetch();
          }}
        />
      )}
    </div>
  );
}

function ContactCorrectionModal({
  contactId,
  onClose,
  onSaved,
}: {
  contactId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const profile = useContactProfile(contactId);
  const update = useUpdateContact(contactId);
  const setValue = useSetCustomValue(contactId);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => {
    if (!profile.data) return;
    setName(profile.data.name ?? "");
    setPhone(profile.data.phone);
  }, [profile.data]);
  const pending = update.isPending || setValue.isPending;
  return (
    <Modal
      titleId="campaign-contact-correction-title"
      onClose={onClose}
      closeDisabled={pending}
      panelClassName="max-w-2xl"
    >
      <h2
        id="campaign-contact-correction-title"
        className="text-base font-semibold"
      >
        Corrigir contato
      </h2>
      <p className="mt-1 text-sm text-zinc-400">
        Ajuste os dados que impediram o envio sem sair da campanha.
      </p>
      {profile.isLoading && <PageLoading label="Carregando contato…" />}
      {profile.error && (
        <PageError
          message={profile.error.message}
          onRetry={() => profile.refetch()}
        />
      )}
      {profile.data && (
        <div className="mt-5 space-y-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-400">
              Nome
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-zinc-400">
              Telefone
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </section>
          <section>
            <h3 className="text-sm font-semibold">Campos personalizados</h3>
            <div className="mt-3 space-y-3">
              {profile.data.customValues.map((field) => (
                <CorrectionField
                  key={field.id}
                  field={field}
                  pending={pending}
                  onSave={(value) =>
                    setValue.mutate({ fieldId: field.id, value })
                  }
                />
              ))}
              {!profile.data.customValues.length && (
                <p className="text-xs text-zinc-500">
                  Nenhum campo personalizado configurado.
                </p>
              )}
            </div>
          </section>
          {(update.error || setValue.error) && (
            <p role="alert" className="text-sm text-status-failed">
              {(update.error ?? setValue.error)?.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={btnSecondary}
              disabled={pending}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={pending || !phone.trim()}
              onClick={() =>
                update.mutate(
                  { name: name.trim() || null, phone },
                  { onSuccess: onSaved },
                )
              }
            >
              {update.isPending ? "Salvando…" : "Salvar correção"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CorrectionField({
  field,
  pending,
  onSave,
}: {
  field: {
    id: string;
    label: string;
    type: "text" | "number" | "date" | "boolean";
    value: string | number | boolean | null;
  };
  pending: boolean;
  onSave: (value: string | number | boolean) => void;
}) {
  const [value, setValue] = useState(
    field.value ?? (field.type === "boolean" ? false : ""),
  );
  if (field.type === "boolean")
    return (
      <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
        <span>{field.label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={pending}
          onChange={(event) => {
            setValue(event.target.checked);
            onSave(event.target.checked);
          }}
          className="accent-primary-500"
        />
      </label>
    );
  return (
    <label className="block text-xs text-zinc-400">
      {field.label}
      <div className="mt-1 flex gap-2">
        <input
          type={
            field.type === "date"
              ? "date"
              : field.type === "number"
                ? "number"
                : "text"
          }
          value={String(value)}
          onChange={(event) => setValue(event.target.value)}
          className={`${inputClass} py-2`}
        />
        <button
          type="button"
          className={`${btnSecondary} px-3 py-2 text-xs`}
          disabled={pending || value === ""}
          onClick={() =>
            onSave(field.type === "number" ? Number(value) : String(value))
          }
        >
          Salvar
        </button>
      </div>
    </label>
  );
}
