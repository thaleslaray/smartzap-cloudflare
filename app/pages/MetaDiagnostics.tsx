import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { api } from "../lib/api";
import {
  metaConnectionPresentation,
  metaFactPresentation,
  type MetaVerificationStatus,
} from "../lib/meta-health";
import {
  Card,
  PageError,
  PageHeader,
  PageLoading,
  btnSecondary,
} from "../components/ui";
type Health = {
  databaseOk: boolean;
  metaConfigured: boolean;
  metaLive: boolean;
  webhookConfigured: boolean;
  webhookSecretsConfigured: boolean;
  templatesConfigured: boolean;
  approvedTemplates: number;
  readyForPilot: boolean;
  meta: null | {
    verificationStatus: MetaVerificationStatus;
    retryable: boolean;
    code: number | null;
    tokenValid: boolean | null;
    tokenAppMatches: boolean | null;
    tokenRequiredScopesPresent: boolean | null;
    phoneBelongsToWaba: boolean | null;
    effectiveWebhookCallbackMatches: boolean | null;
    appWebhookMessagesSubscribed: boolean | null;
    appWebhookRequiredFieldsPresent: boolean | null;
    appWebhookMissingFields: string[] | null;
    qualityRating: string | null;
    messagingLimit: string | number | null;
    throughputLevel: string;
    throughputMps: number | null;
    phoneStatus: string | null;
    error: string | null;
    fbtraceId: string | null;
  };
};
type Status = "pass" | "warn" | "fail" | "info";
export default function MetaDiagnostics() {
  const query = useQuery({
    queryKey: ["settings-health"],
    queryFn: () => api<Health>("/api/settings/health"),
  });
  const configureWebhook = useMutation({
    mutationFn: () =>
      api<{ ok: true; fields: string[] }>(
        "/api/flows/meta/webhook-subscription",
        { method: "POST", body: "{}" },
      ),
    onSuccess: () => query.refetch(),
  });
  if (query.isLoading)
    return <PageLoading label="Executando diagnóstico Meta…" />;
  if (query.error) return <PageError message={query.error.message} />;
  const h = query.data!;
  const connection = metaConnectionPresentation({
    metaConfigured: h.metaConfigured,
    metaLive: h.metaLive,
    meta: h.meta,
  });
  const providerCheck = (
    value: boolean | null | undefined,
    passMessage: string,
    failMessage: string,
  ): { status: Status; message: string } => {
    if (!h.meta) {
      return {
        status: "info",
        message: "Configure as credenciais obrigatórias para executar esta verificação.",
      };
    }
    return metaFactPresentation(value ?? null, h.meta, passMessage, failMessage);
  };
  const checks: { title: string; message: string; status: Status }[] = [
    {
      title: "Credenciais Meta",
      message: h.metaConfigured
        ? "Phone ID, WABA e token configurados."
        : "Há credenciais obrigatórias ausentes.",
      status: h.metaConfigured ? "pass" : "fail",
    },
    {
      title: "Token de acesso",
      ...providerCheck(
        h.meta?.tokenValid,
        "Token válido na Graph API.",
        h.meta?.error || "A Meta confirmou que o token é inválido.",
      ),
    },
    {
      title: "Aplicativo vinculado",
      ...providerCheck(
        h.meta?.tokenAppMatches,
        "O token pertence ao aplicativo esperado.",
        "O aplicativo do token diverge do configurado.",
      ),
    },
    {
      title: "Escopos WhatsApp",
      ...providerCheck(
        h.meta?.tokenRequiredScopesPresent,
        "Permissões obrigatórias presentes.",
        "Permissões whatsapp_business_* ausentes.",
      ),
    },
    {
      title: "Telefone e WABA",
      ...providerCheck(
        h.meta?.phoneBelongsToWaba,
        "O número pertence à WABA configurada.",
        "Phone ID não confirmado dentro da WABA.",
      ),
    },
    {
      title: "Webhook efetivo",
      ...providerCheck(
        h.meta?.effectiveWebhookCallbackMatches,
        "Callback efetivo corresponde ao Worker.",
        "Callback ausente ou divergente.",
      ),
    },
    {
      title: "Campo messages",
      ...providerCheck(
        h.meta?.appWebhookMessagesSubscribed,
        "Eventos messages assinados.",
        "Assinatura messages ausente.",
      ),
    },
    {
      title: "Eventos operacionais",
      ...providerCheck(
        h.meta?.appWebhookRequiredFieldsPresent,
        "Status, preferências, templates, pricing e throughput assinados.",
        `Campos ausentes: ${h.meta?.appWebhookMissingFields?.join(", ") || "não informados"}.`,
      ),
    },
    {
      title: "Templates",
      message: `${h.approvedTemplates} templates aprovados sincronizados.`,
      status: h.templatesConfigured ? "pass" : "warn",
    },
  ];
  const Icon = ({ status }: { status: Status }) =>
    status === "pass" ? (
      <CheckCircle2 className="text-primary-400" />
    ) : status === "fail" ? (
      <XCircle className="text-red-400" />
    ) : status === "warn" ? (
      <AlertTriangle className="text-amber-400" />
    ) : (
      <Info className="text-blue-400" />
    );
  return (
    <div className="max-w-[1120px] space-y-6 pb-20">
      <PageHeader
        title="Diagnóstico Meta"
        subtitle="Validação ponta a ponta da configuração do WhatsApp Cloud API"
        action={
          <div className="flex flex-wrap gap-2">
            {query.data?.meta?.verificationStatus === "complete" && (
              <button
                className={btnSecondary}
                disabled={configureWebhook.isPending}
                onClick={() => configureWebhook.mutate()}
              >
                <ShieldCheck size={15} />
                {configureWebhook.isPending
                  ? "Atualizando…"
                  : query.data.meta.appWebhookRequiredFieldsPresent
                    ? "Atualizar assinaturas"
                    : "Corrigir assinatura"}
              </button>
            )}
            <button className={btnSecondary} onClick={() => query.refetch()}>
              <RefreshCw size={15} />
              Executar novamente
            </button>
          </div>
        }
      />
      <Card
        className={`flex items-center gap-4 p-5 ${
          connection.tone === "success"
            ? "border-primary-700/50"
            : connection.tone === "warning"
              ? "border-amber-700/50"
              : "border-red-800/50"
        }`}
      >
        {connection.tone === "warning" ? (
          <AlertTriangle size={30} className="text-amber-400" />
        ) : connection.tone === "success" ? (
          <ShieldCheck size={30} className="text-primary-400" />
        ) : (
          <XCircle size={30} className="text-red-400" />
        )}
        <div>
          <h2 className="font-semibold">{connection.title}</h2>
          <p className="mt-1 text-sm text-zinc-400">{connection.message}</p>
          <p className="text-sm text-zinc-500">
            Status do número: {h.meta?.phoneStatus || "não informado"} ·
            Qualidade: {h.meta?.qualityRating || "não informada"} · Limite:{" "}
            {h.meta?.messagingLimit || "não informado"} · Throughput: {h.meta?.throughputLevel || "não informado"}
            {h.meta?.throughputMps ? ` (até ${h.meta.throughputMps} msg/s)` : ""}
          </p>
          {!h.metaLive &&
            h.meta?.error &&
            h.meta.verificationStatus !== "unavailable" && (
            <p className="mt-1 text-sm text-red-400">{h.meta.error}</p>
          )}
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        {checks.map((check) => (
          <Card key={check.title} className="flex gap-4 p-5">
            <Icon status={check.status} />
            <div>
              <h3 className="font-medium">{check.title}</h3>
              <p className="mt-1 text-sm text-zinc-500">{check.message}</p>
            </div>
          </Card>
        ))}
      </div>
      {configureWebhook.error && (
        <p role="alert" className="text-sm text-red-400">
          {configureWebhook.error.message}
        </p>
      )}
      {h.meta?.fbtraceId && (
        <p className="text-xs text-zinc-500">
          Trace Meta: <code>{h.meta.fbtraceId}</code>
        </p>
      )}
      <a
        href="https://developers.facebook.com/apps/"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 text-sm text-primary-400"
      >
        <ExternalLink size={15} />
        Abrir Meta for Developers
      </a>
    </div>
  );
}
