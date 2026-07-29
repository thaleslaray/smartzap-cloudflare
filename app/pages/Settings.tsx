import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  Database,
  ExternalLink,
  HelpCircle,
  Eye,
  EyeOff,
  MessageCircle,
  RefreshCw,
  Send,
  Server,
  Users,
  Zap,
  Activity,
  CalendarDays,
  Download,
  FileUp,
  ShieldCheck,
  Smartphone,
  UserCheck,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import {
  Button,
  Card,
  PageError,
  PageHeader,
  inputClass,
} from "../components/ui";

type SettingsResponse = {
  whatsapp_token: { configured: boolean };
  meta_app_id: string | null;
  meta_app_secret: { configured: boolean };
  whatsapp_phone_id: string | null;
  whatsapp_waba_id: string | null;
  throttle_mps: string | null;
  throttle_mode: "automatic" | "maximum" | "manual";
};
type HealthResponse = {
  databaseOk: boolean;
  metaLive: boolean;
  webhookConfigured: boolean;
  approvedTemplates: number;
  ai: { ready: boolean };
  readyForPilot: boolean;
  meta: {
    phoneStatus: string | null;
    qualityRating: string | null;
    messagingLimit: string | number | null;
    throughputLevel: string;
    throughputMps: number | null;
    effectiveWebhookCallbackUrl: string | null;
    error: string | null;
  } | null;
};
type TestContactResponse = { contact: { name: string; phone: string } | null };
type SettingsSaveResponse = {
  ok: boolean;
  templateSync?: {
    status: "synced" | "pending" | "in_progress" | "failed";
    synced?: number;
    detail?: string;
  };
};
type GoogleCalendarStatus = {
  oauthConfigured: boolean;
  configurationSource: "app" | "worker" | null;
  connected: boolean;
  connection: { calendarId: string; calendarSummary: string | null } | null;
  redirectUri: string;
};
type RateCardImport = {
  source: string;
  checksum: string;
  currency: string;
  effective_from: string;
  status: string;
  imported_at: string;
  row_count: number;
};
type RateCardStatus = { items: RateCardImport[] };
type RateCardImportResult = { ok: boolean; imported: boolean; rows: number; source?: string };
const formatRateCardDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-");
  return year && month && day ? `${day}/${month}/${year}` : isoDate;
};
type InfrastructureUsage = {
  periodStart: string;
  fetchedAt: string;
  workers: { available: boolean; requests: number | null };
  queues: {
    backlog: number;
    backlogBytes: number;
    items: Array<{ name: string; backlog: number }>;
  };
  database: {
    storageBytes: number | null;
    analyticsAvailable: boolean;
    rowsRead: number | null;
    rowsWritten: number | null;
  };
  whatsapp: { sentThisMonth: number; sentLast24h: number };
  analytics: { configured: boolean; available: boolean; reason: string | null };
};

const credentialsInputClass =
  "h-9 w-full min-w-0 rounded-md border border-zinc-800 bg-zinc-800/30 px-3 py-1 font-mono text-base text-zinc-100 shadow-sm outline-none placeholder:text-zinc-600 focus:border-primary-400 md:text-sm";

const INFRASTRUCTURE_LIMITS = {
  workerRequestsMonthly: 100_000,
  queueBacklogAlert: 1_000,
  d1StorageBytes: 5 * 1024 ** 3,
} as const;

function usagePercent(value: number, limit: number) {
  return Math.min(100, Math.max(0, (value / limit) * 100));
}

function usageTone(percent: number) {
  if (percent >= 90) return "bg-red-400";
  if (percent >= 70) return "bg-amber-400";
  return "bg-primary-400";
}

function messagingLimitAsNumber(limit: string | number | null | undefined) {
  const match = String(limit ?? "").match(/(\d+(?:[.,]\d+)?)\s*K/i);
  return match ? Number(match[1].replace(",", ".")) * 1_000 : null;
}

function InfraCard({
  icon: Icon,
  title,
  subtitle,
  value,
  detail,
  color = "text-primary-400",
  progress,
}: {
  icon: typeof Zap;
  title: string;
  subtitle: string;
  value: string;
  detail: string;
  color?: string;
  progress?: { value: number; limit: number; label: string };
}) {
  const percent = progress ? usagePercent(progress.value, progress.limit) : null;
  return (
    <div className="rounded-xl border border-zinc-700/70 p-4">
      <div className="flex items-center gap-3">
        <span className="rounded-lg bg-zinc-800 p-2">
          <Icon size={17} className={color} />
        </span>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
        <CheckCircle2 size={13} className="ml-auto text-primary-400" />
      </div>
      <div className="mt-4 flex justify-between gap-3 text-xs">
        <span>{value}</span>
        <span className="text-right text-zinc-500">{detail}</span>
      </div>
      {progress && percent !== null && (
        <div className="mt-3">
          <div
            className="h-2 overflow-hidden rounded-full bg-zinc-800"
            role="progressbar"
            aria-label={progress.label}
            aria-valuemin={0}
            aria-valuemax={progress.limit}
            aria-valuenow={progress.value}
          >
            <div
              className={`h-full min-w-1 rounded-full transition-[width] duration-300 ${usageTone(percent)}`}
              style={{ width: `${Math.max(percent, 1)}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">{progress.label}</p>
        </div>
      )}
    </div>
  );
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(2)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<SettingsResponse>("/api/settings"),
  });
  const health = useQuery({
    queryKey: ["settings-health"],
    queryFn: () => api<HealthResponse>("/api/settings/health"),
  });
  const infrastructure = useQuery({
    queryKey: ["infrastructure-usage"],
    queryFn: () => api<InfrastructureUsage>("/api/settings/infrastructure-usage"),
    refetchOnWindowFocus: false,
  });
  const testContact = useQuery({
    queryKey: ["settings-test-contact"],
    queryFn: () => api<TestContactResponse>("/api/settings/test-contact"),
  });
  const calendar = useQuery({
    queryKey: ["google-calendar-status"],
    queryFn: () => api<GoogleCalendarStatus>("/api/google-calendar/status"),
  });
  const rateCards = useQuery({
    queryKey: ["pricing-rate-cards"],
    queryFn: () => api<RateCardStatus>("/api/pricing/rate-cards/status"),
  });
  const messagingLimit = messagingLimitAsNumber(health.data?.meta?.messagingLimit);
  const [form, setForm] = useState<Record<string, string>>({});
  const [testName, setTestName] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showGoogleSetup, setShowGoogleSetup] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [rateCardEffectiveFrom, setRateCardEffectiveFrom] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [rateCardNotice, setRateCardNotice] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api<SettingsSaveResponse>("/api/settings", { method: "PUT", body: JSON.stringify(form) }),
    onSuccess: (result) => {
      setForm({});
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["settings-health"] });
      qc.invalidateQueries({ queryKey: ["templates"] });
      setSaveNotice(
        result.templateSync?.status === "synced"
          ? `${result.templateSync.synced ?? 0} templates atualizados automaticamente.`
          : result.templateSync?.status === "in_progress"
            ? "A sincronização de templates já está em andamento."
            : result.templateSync?.status === "pending"
              ? "Configuração salva. Os templates serão sincronizados quando Phone ID e WABA estiverem completos."
              : result.templateSync?.status === "failed"
                ? "Configuração salva. A sincronização automática dos templates falhou; tente novamente em Templates."
              : "Configuração salva.",
      );
    },
  });
  const saveTestContact = useMutation({
    mutationFn: () =>
      api<TestContactResponse>("/api/settings/test-contact", {
        method: "PUT",
        body: JSON.stringify({ name: testName, phone: testPhone }),
      }),
    onSuccess: () => {
      setTestName("");
      setTestPhone("");
      qc.invalidateQueries({ queryKey: ["settings-test-contact"] });
    },
  });
  const removeTestContact = useMutation({
    mutationFn: () => api("/api/settings/test-contact", { method: "DELETE" }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["settings-test-contact"] }),
  });
  const saveGoogleCalendar = useMutation({
    mutationFn: () =>
      api("/api/google-calendar/oauth-configuration", {
        method: "PUT",
        body: JSON.stringify({ clientId: googleClientId, clientSecret: googleClientSecret }),
      }),
    onSuccess: () => {
      setGoogleClientId("");
      setGoogleClientSecret("");
      setShowGoogleSetup(false);
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
      window.location.assign("/api/google-calendar/connect?returnTo=/settings");
    },
  });
  const removeGoogleCalendar = useMutation({
    mutationFn: () => api("/api/google-calendar/oauth-configuration", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google-calendar-status"] }),
  });
  const importRateCard = useMutation({
    mutationFn: (input: { source: string; csv: string }) =>
      api<RateCardImportResult>("/api/pricing/rate-cards/import", {
        method: "POST",
        body: JSON.stringify({
          ...input,
          effectiveFrom: rateCardEffectiveFrom,
          currency: "BRL",
          kind: "rates",
        }),
      }),
    onSuccess: (result) => {
      setRateCardNotice(result.imported ? `${result.rows} tarifas ativadas.` : "Esta tabela já estava ativa.");
      qc.invalidateQueries({ queryKey: ["pricing-rate-cards"] });
    },
  });
  const downloadRateCard = useMutation({
    mutationFn: () =>
      api<RateCardImportResult & { effectiveFrom: string }>("/api/pricing/rate-cards/import-official", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (result) => {
      setRateCardNotice(result.imported
        ? `Tabela atualizada agora: ${result.rows} tarifas BRL oficiais, vigentes desde ${formatRateCardDate(result.effectiveFrom)}.`
        : `Nenhuma atualização necessária: a tabela BRL oficial de ${formatRateCardDate(result.effectiveFrom)} já está ativa.`);
      qc.invalidateQueries({ queryKey: ["pricing-rate-cards"] });
    },
  });
  const latestRateCard = rateCards.data?.items.find((item) => item.status === "active") ?? rateCards.data?.items[0];
  const field = (
    key: string,
    label: string,
    placeholder: string,
    help?: string,
  ) => (
    <div className="min-w-0 space-y-2">
      <label
        htmlFor={key}
        className="flex min-w-0 flex-wrap items-center gap-2 text-sm leading-tight font-medium text-zinc-200"
      >
        <span className="min-w-0 break-words">{label}</span>
        <span className="text-red-400">*</span>
        {key === "whatsapp_phone_id" && (
          <HelpCircle className="h-4 w-4 shrink-0 cursor-help text-zinc-500" />
        )}
      </label>
      <input
        id={key}
        value={
          form[key] ??
          settings.data?.[
            key as "whatsapp_phone_id" | "whatsapp_waba_id"
          ] ??
          ""
        }
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        className={credentialsInputClass}
      />
      {help && <p className="text-xs text-zinc-500">{help}</p>}
    </div>
  );
  return (
    <div className="w-full min-w-0 max-w-[1120px] space-y-8 pb-20">
      <PageHeader
        title="Configurações"
        subtitle="Gerencie sua conexão com a WhatsApp Business API"
      />
      {settings.error && <PageError message={settings.error.message} />}{" "}
      {health.error && <PageError message={health.error.message} />}
      <div className="!mt-8 grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,768px)_320px]">
        <div className="min-w-0 space-y-8">
          <Card
            className={`flex min-w-0 items-start gap-6 rounded-2xl p-6 ${health.data?.metaLive ? "border-primary-800/60" : "border-zinc-800"}`}
          >
            <span
              className={`shrink-0 rounded-2xl border p-4 ${health.data?.metaLive ? "border-primary-800 bg-primary-950/30 text-primary-400" : "border-red-900 bg-red-950/30 text-red-400"}`}
            >
              {health.data?.metaLive ? (
                <CheckCircle2 size={30} />
              ) : (
                <AlertTriangle size={30} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold">
                {health.data?.metaLive ? "Conectado" : "Desconectado"}
              </h2>
              <p
                className={`mt-3 break-words text-sm ${health.data?.metaLive ? "text-primary-400" : "text-red-400"}`}
              >
                {health.data?.metaLive
                  ? "Conexão com Meta API validada."
                  : "Conexão com Meta API perdida. Por favor re-autentique suas credenciais abaixo."}
              </p>
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="flex items-center gap-3 text-xl font-semibold">
              <span className="h-7 w-1 rounded-full bg-primary-400" />
              Configuração da API
            </h2>
            <div className="mt-6 space-y-4">
              {field(
                "whatsapp_phone_id",
                "Identificação do número de telefone (Phone Number ID)",
                settings.data?.whatsapp_phone_id || "Ex: 123456789012345",
                "Encontrado em: App Dashboard → WhatsApp → API Setup",
              )}
              {field(
                "whatsapp_waba_id",
                "Identificação da conta do WhatsApp Business (WABA ID)",
                settings.data?.whatsapp_waba_id || "Ex: 987654321098765",
                "Encontrado em: App Dashboard → WhatsApp → API Setup",
              )}
              <label className="block break-words text-sm text-zinc-200">
                Token de acesso <span className="ml-2 text-red-400">*</span>
                <span className="relative mt-2 block">
                  <input
                    readOnly
                    type={showToken ? "text" : "password"}
                    value={
                      settings.data?.whatsapp_token.configured
                        ? "••••••••••••••••"
                        : ""
                    }
                    placeholder="EAAG..."
                    className={`${credentialsInputClass} pr-11`}
                  />
                  <button
                    type="button"
                    aria-label="Exibir token"
                    className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-zinc-500"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
                <span className="mt-2 block text-xs text-zinc-500">
                  💡 Use um System User Token para não expirar
                </span>
              </label>
              <label className="block break-words text-sm text-zinc-200">
                ID do Aplicativo (Meta App ID)
                <input
                  readOnly
                  value={settings.data?.meta_app_id || ""}
                  placeholder="Ex: 123456789012345"
                  className={`mt-2 ${credentialsInputClass}`}
                />
                <span className="mt-2 block text-xs text-zinc-500">
                  Necessário para templates com imagem/vídeo e validação de
                  permissões
                </span>
              </label>
              <label className="block break-words text-sm text-zinc-200">
                Chave Secreta do Aplicativo (App Secret)
                <span className="relative mt-2 block">
                  <input
                    readOnly
                    type={showSecret ? "text" : "password"}
                    value={
                      settings.data?.meta_app_secret.configured
                        ? "••••••••••••••••"
                        : ""
                    }
                    className={`${credentialsInputClass} pr-11`}
                  />
                  <button
                    type="button"
                    aria-label="Exibir segredo"
                    className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-zinc-500"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
                <span className="mt-2 block text-xs text-zinc-500">
                  Necessário para validação de permissões. Configure como
                  segredo do Worker.
                </span>
              </label>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
                <label htmlFor="throttle_mode" className="block text-sm font-medium text-zinc-200">
                  Velocidade de envio
                </label>
                <select
                  id="throttle_mode"
                  value={form.throttle_mode ?? settings.data?.throttle_mode ?? "automatic"}
                  onChange={(e) => setForm({ ...form, throttle_mode: e.target.value })}
                  className={`mt-2 ${credentialsInputClass}`}
                >
                  <option value="automatic">Automática (recomendada)</option>
                  <option value="maximum">Máxima capacidade disponível</option>
                  <option value="manual">Manual</option>
                </select>
                {(form.throttle_mode ?? settings.data?.throttle_mode) === "manual" && (
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={form.throttle_mps ?? settings.data?.throttle_mps ?? "10"}
                    onChange={(e) => setForm({ ...form, throttle_mps: e.target.value })}
                    className={`mt-2 ${credentialsInputClass}`}
                    aria-label="Mensagens por segundo manual"
                  />
                )}
                <p className="mt-2 text-xs text-zinc-500">
                  Meta: {health.data?.meta?.throughputLevel ?? "não consultado"}
                  {health.data?.meta?.throughputMps ? ` · até ${health.data.meta.throughputMps} msg/s` : ""}.
                  O limite é ajustado automaticamente em caso de saturação.
                </p>
              </div>
              <a
                href="https://developers.facebook.com/apps/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
              >
                <ExternalLink size={15} />
                Abrir Meta for Developers
              </a>
              <div className="flex flex-wrap gap-3 border-t border-zinc-800 pt-5">
                <button
                  className="rounded-full bg-zinc-800 px-5 py-2 text-sm"
                  onClick={() => health.refetch()}
                >
                  Testar Conexão
                </button>
                <Link
                  to="/settings/meta-diagnostics"
                  className="inline-flex items-center rounded-full bg-zinc-800 px-5 py-2 text-sm hover:bg-zinc-700"
                >
                  Validar Permissões
                </Link>
                <Button
                  onClick={() => save.mutate()}
                  disabled={!Object.keys(form).length}
                  loading={save.isPending}
                >
                  Salvar Config
                </Button>
              </div>
              {save.error && (
                <p className="text-sm text-red-400">{save.error.message}</p>
              )}
              {saveNotice && !save.error && (
                <p className="text-sm text-primary-400">{saveNotice}</p>
              )}
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-primary-500/10 p-2.5 text-primary-300">
                <Download size={20} />
              </span>
              <div>
                <h2 className="text-base font-semibold">Tabela de preços Meta</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Atualize automaticamente as tarifas BRL publicadas pela Meta para calcular custos de campanha.
                </p>
              </div>
            </div>
            <div className="mt-5 max-w-44">
              <label className="text-sm font-medium text-zinc-200">
                Vigência
                <input
                  type="date"
                  value={rateCardEffectiveFrom}
                  onChange={(event) => setRateCardEffectiveFrom(event.target.value)}
                  className={`mt-2 ${inputClass}`}
                />
              </label>
            </div>
            {latestRateCard && (
              <p className="mt-3 truncate text-xs text-zinc-500" title={latestRateCard.source}>
                Ativa desde {latestRateCard.effective_from} · {latestRateCard.row_count} tarifas · fonte: {latestRateCard.source}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => downloadRateCard.mutate()}
                loading={downloadRateCard.isPending}
              >
                <Download size={16} /> Atualizar automaticamente
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700">
                <FileUp size={16} /> Importar arquivo CSV
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    const source = `https://local-upload.invalid/${encodeURIComponent(file.name)}`;
                    setRateCardNotice("");
                    importRateCard.mutate({ source, csv: await file.text() });
                  }}
                />
              </label>
              <a
                href="https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/brazil-rates"
                target="_blank"
                rel="noreferrer"
                className="text-sm text-zinc-400 hover:text-zinc-200"
              >
                Consultar tabela oficial
              </a>
            </div>
            {(downloadRateCard.error || importRateCard.error) && (
              <p className="mt-3 text-sm text-red-400">{(downloadRateCard.error ?? importRateCard.error)?.message}</p>
            )}
            {rateCardNotice && !downloadRateCard.error && !importRateCard.error && (
              <p className="mt-3 text-sm text-primary-400">{rateCardNotice}</p>
            )}
            <p className="mt-4 text-xs text-zinc-500">
              A atualização automática consulta a tabela BRL oficial da Meta e, se necessário, a calculadora oficial da WhatsApp Business. Antes de ativar, valida moeda, vigência, categorias e mercado. O arquivo CSV é apenas uma contingência.
            </p>
          </Card>
          <Card className="p-6">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-primary-500/10 p-2.5 text-primary-300">
                <CalendarDays size={20} />
              </span>
              <div className="flex-1">
                <h2 className="text-base font-semibold">Google Calendar</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Disponibiliza horários reais e cria eventos pelo MiniApp de agendamento.
                </p>
                <p className="mt-3 text-sm">
                  {!calendar.data?.oauthConfigured
                    ? "Não configurado. Ative apenas se quiser usar agendamento pelo Google."
                    : calendar.data.connected
                      ? "Conectado" + (calendar.data.connection?.calendarSummary ? ": " + calendar.data.connection.calendarSummary : ".")
                      : "Ainda não conectado."}
                </p>
              </div>
              {calendar.data?.oauthConfigured && !calendar.data.connected ? (
                <a
                  href="/api/google-calendar/connect?returnTo=/settings"
                  className="shrink-0 rounded-full bg-primary-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-primary-400"
                >
                  Conectar
                </a>
              ) : !calendar.data?.oauthConfigured ? (
                <button
                  type="button"
                  onClick={() => setShowGoogleSetup((visible) => !visible)}
                  className="shrink-0 rounded-full bg-zinc-800 px-4 py-2 text-sm font-medium hover:bg-zinc-700"
                >
                  Configurar
                </button>
              ) : null}
            </div>
            {showGoogleSetup && !calendar.data?.oauthConfigured && (
              <div className="mt-6 space-y-4 border-t border-zinc-800 pt-5">
                <div>
                  <h3 className="text-sm font-semibold">Configurar Google Calendar</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    Crie um cliente OAuth do tipo Aplicação Web no Google Cloud, adicione o callback abaixo e cole as credenciais. Elas ficam cifradas e nunca voltam para o navegador.
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Callback autorizado</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="break-all text-xs text-zinc-300">{calendar.data?.redirectUri ?? "Carregando..."}</code>
                    {calendar.data?.redirectUri && (
                      <button
                        type="button"
                        className="rounded-md bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
                        onClick={() => navigator.clipboard?.writeText(calendar.data!.redirectUri)}
                      >
                        Copiar
                      </button>
                    )}
                  </div>
                </div>
                <label className="block text-sm font-medium text-zinc-200">
                  Client ID
                  <input
                    value={googleClientId}
                    onChange={(event) => setGoogleClientId(event.target.value)}
                    placeholder="...apps.googleusercontent.com"
                    autoComplete="off"
                    className={`mt-2 w-full ${inputClass}`}
                  />
                </label>
                <label className="block text-sm font-medium text-zinc-200">
                  Client Secret
                  <input
                    type="password"
                    value={googleClientSecret}
                    onChange={(event) => setGoogleClientSecret(event.target.value)}
                    placeholder="GOCSPX-..."
                    autoComplete="new-password"
                    className={`mt-2 w-full ${inputClass}`}
                  />
                </label>
                {saveGoogleCalendar.error && <p className="text-sm text-red-400">{saveGoogleCalendar.error.message}</p>}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={() => saveGoogleCalendar.mutate()}
                    disabled={!googleClientId.trim() || !googleClientSecret.trim()}
                    loading={saveGoogleCalendar.isPending}
                  >
                    Salvar e conectar
                  </Button>
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
                  >
                    Abrir Google Cloud <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            )}
            {calendar.data?.oauthConfigured && calendar.data.configurationSource === "app" && (
              <div className="mt-5 flex items-center justify-between border-t border-zinc-800 pt-4">
                <p className="text-xs text-zinc-500">Credenciais salvas nesta instalação.</p>
                <button
                  type="button"
                  onClick={() => removeGoogleCalendar.mutate()}
                  disabled={removeGoogleCalendar.isPending}
                  className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  Remover integração
                </button>
              </div>
            )}
          </Card>
          <Card className="p-6">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-amber-500/10 p-2.5 text-amber-300">
                <UserCheck size={20} />
              </span>
              <div>
                <h2 className="text-base font-semibold">Contato de Teste</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Configure um número para testar suas campanhas antes de enviar
                  para todos os contatos.
                </p>
              </div>
            </div>
            {testContact.data?.contact ? (
              <div className="mt-6 flex items-center gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <span className="rounded-xl bg-amber-500/10 p-3 text-amber-300">
                  <UserCheck size={22} />
                </span>
                <div>
                  <p className="font-medium">
                    {testContact.data.contact.name || "Contato de Teste"}
                  </p>
                  <p className="mt-1 font-mono text-sm text-amber-200">
                    {testContact.data.contact.phone}
                  </p>
                </div>
                <button
                  aria-label="Remover contato de teste"
                  onClick={() => removeTestContact.mutate()}
                  className="ml-auto rounded-lg p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                >
                  <X size={17} />
                </button>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  Nome
                  <input
                    value={testName}
                    onChange={(event) => setTestName(event.target.value)}
                    placeholder="Ex: Meu Teste"
                    className={`mt-2 ${inputClass}`}
                  />
                </label>
                <label className="text-sm">
                  Telefone (com código do país)
                  <input
                    value={testPhone}
                    onChange={(event) => setTestPhone(event.target.value)}
                    placeholder="Ex: +5511999999999"
                    className={`mt-2 ${inputClass}`}
                  />
                </label>
                <div className="sm:col-span-2 flex justify-end">
                  <Button
                    onClick={() => saveTestContact.mutate()}
                    disabled={!testPhone.trim()}
                    loading={saveTestContact.isPending}
                  >
                    <Smartphone size={16} /> Salvar Contato de Teste
                  </Button>
                </div>
              </div>
            )}
            {saveTestContact.error && (
              <p className="mt-3 text-sm text-red-400">
                {saveTestContact.error.message}
              </p>
            )}
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              to="/knowledge"
              className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
            >
              <BookOpen className="text-primary-400" />
              <span>
                <strong className="block">Base de conhecimento e IA</strong>
                <small className="text-zinc-500">
                  Gerenciar documentos e RAG
                </small>
              </span>
              <ChevronRight className="ml-auto text-zinc-500" />
            </Link>
            <Link
              to="/settings/attendants"
              className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
            >
              <Users className="text-primary-400" />
              <span>
                <strong className="block">Atendentes</strong>
                <small className="text-zinc-500">
                  Links seguros para a equipe
                </small>
              </span>
              <ChevronRight className="ml-auto text-zinc-500" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              to="/settings/meta-diagnostics"
              className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
            >
              <ShieldCheck className="text-primary-400" />
              <span>
                <strong className="block">Diagnóstico Meta</strong>
                <small className="text-zinc-500">
                  Token, WABA, webhook e permissões
                </small>
              </span>
              <ChevronRight className="ml-auto text-zinc-500" />
            </Link>
            <Link
              to="/settings/performance"
              className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
            >
              <Activity className="text-primary-400" />
              <span>
                <strong className="block">Performance</strong>
                <small className="text-zinc-500">
                  Throughput e baselines de campanha
                </small>
              </span>
              <ChevronRight className="ml-auto text-zinc-500" />
            </Link>
          </div>
        </div>
        <aside className="sticky top-24 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <div className="flex items-center">
            <div>
              <h2 className="text-xl font-semibold">Uso da Infraestrutura</h2>
              <p className="mt-1 text-xs text-zinc-500">Dados reais do ambiente atual</p>
            </div>
            <button
              type="button"
              aria-label="Atualizar uso da infraestrutura"
              onClick={() => infrastructure.refetch()}
              className="ml-auto rounded-md p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
            >
              <RefreshCw size={16} className={infrastructure.isFetching ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="mt-6 space-y-4">
            <InfraCard
              icon={Server}
              title="Workers"
              subtitle="Requisições neste mês"
              value={infrastructure.data?.workers.available
                ? formatCompact(infrastructure.data.workers.requests ?? 0)
                : "Indisponível"}
              detail={infrastructure.data?.workers.available
                ? `Limite mensal: ${formatCompact(INFRASTRUCTURE_LIMITS.workerRequestsMonthly)}`
                : "Configure o token Analytics"}
              color="text-amber-400"
              progress={infrastructure.data?.workers.available
                ? {
                    value: infrastructure.data.workers.requests ?? 0,
                    limit: INFRASTRUCTURE_LIMITS.workerRequestsMonthly,
                    label: `${formatCompact(infrastructure.data.workers.requests ?? 0)} de ${formatCompact(INFRASTRUCTURE_LIMITS.workerRequestsMonthly)} requisições no mês`,
                  }
                : undefined}
            />
            <InfraCard
              icon={Send}
              title="Queues"
              subtitle="Backlog em tempo real"
              value={infrastructure.data ? `${formatCompact(infrastructure.data.queues.backlog)} mensagens` : "Carregando…"}
              detail={infrastructure.data
                ? `${formatBytes(infrastructure.data.queues.backlogBytes)} · alerta em ${formatCompact(INFRASTRUCTURE_LIMITS.queueBacklogAlert)}`
                : ""}
              color="text-violet-400"
              progress={infrastructure.data
                ? {
                    value: infrastructure.data.queues.backlog,
                    limit: INFRASTRUCTURE_LIMITS.queueBacklogAlert,
                    label: `${formatCompact(infrastructure.data.queues.backlog)} de ${formatCompact(INFRASTRUCTURE_LIMITS.queueBacklogAlert)} mensagens no alerta de backlog`,
                  }
                : undefined}
            />
            <InfraCard
              icon={Database}
              title="Database"
              subtitle="Cloudflare D1 · armazenamento atual"
              value={infrastructure.data
                ? infrastructure.data.database.storageBytes === null
                  ? "Indisponível"
                  : formatBytes(infrastructure.data.database.storageBytes)
                : "Carregando…"}
              detail={infrastructure.data?.database.analyticsAvailable
                ? `${formatCompact(infrastructure.data.database.rowsRead ?? 0)} leituras · ${formatCompact(infrastructure.data.database.rowsWritten ?? 0)} escritas no mês`
                : "Leituras mensais exigem Analytics"}
              color="text-cyan-400"
              progress={infrastructure.data?.database.storageBytes !== null && infrastructure.data?.database.storageBytes !== undefined
                ? {
                    value: infrastructure.data.database.storageBytes,
                    limit: INFRASTRUCTURE_LIMITS.d1StorageBytes,
                    label: `${formatBytes(infrastructure.data.database.storageBytes)} de ${formatBytes(INFRASTRUCTURE_LIMITS.d1StorageBytes)} de armazenamento D1`,
                  }
                : undefined}
            />
            <InfraCard
              icon={MessageCircle}
              title="WhatsApp"
              subtitle="Envios confirmados nas últimas 24h"
              value={infrastructure.data ? formatCompact(infrastructure.data.whatsapp.sentLast24h) : "Carregando…"}
              detail={health.data?.meta?.messagingLimit
                ? `${formatCompact(infrastructure.data?.whatsapp.sentThisMonth ?? 0)} no mês · limite ${String(health.data.meta.messagingLimit)}/24h`
                : "Limite não informado pela Meta"}
              progress={infrastructure.data && messagingLimit
                ? {
                    value: infrastructure.data.whatsapp.sentLast24h,
                    limit: messagingLimit,
                    label: `${formatCompact(infrastructure.data.whatsapp.sentLast24h)} de ${formatCompact(messagingLimit)} envios nas últimas 24 horas`,
                  }
                : undefined}
            />
          </div>
          {infrastructure.data && !infrastructure.data.analytics.available && (
            <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
              O backlog das filas, o armazenamento do D1 e os envios são reais. Para invocações mensais do Worker e leituras/escritas do D1, configure o secret <code>CLOUDFLARE_ANALYTICS_TOKEN</code> com permissão de leitura de Analytics.
            </p>
          )}
          {infrastructure.error && (
            <p className="mt-4 text-xs text-red-300">Não foi possível ler as métricas agora. Tente atualizar.</p>
          )}
          <div className="mt-5 rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center gap-2 text-sm">
              <Bot size={16} className="text-primary-400" />
              Workers AI
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Provedor único · {health.data?.ai.ready ? "Ativo" : "Pendente"}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
