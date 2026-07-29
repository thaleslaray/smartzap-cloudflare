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
    tokenValid: boolean;
    tokenAppMatches: boolean;
    tokenRequiredScopesPresent: boolean;
    phoneBelongsToWaba: boolean;
    effectiveWebhookCallbackMatches: boolean;
    appWebhookMessagesSubscribed: boolean;
    appWebhookRequiredFieldsPresent: boolean;
    appWebhookMissingFields: string[];
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
  const integrationReady =
    h.databaseOk &&
    h.metaConfigured &&
    h.metaLive &&
    h.webhookConfigured &&
    h.webhookSecretsConfigured &&
    h.templatesConfigured;
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
      message: h.meta?.tokenValid
        ? "Token válido na Graph API."
        : h.meta?.error || "Token não validado.",
      status: h.meta?.tokenValid ? "pass" : "fail",
    },
    {
      title: "Aplicativo vinculado",
      message: h.meta?.tokenAppMatches
        ? "O token pertence ao aplicativo esperado."
        : "O aplicativo do token diverge do configurado.",
      status: h.meta?.tokenAppMatches ? "pass" : "fail",
    },
    {
      title: "Escopos WhatsApp",
      message: h.meta?.tokenRequiredScopesPresent
        ? "Permissões obrigatórias presentes."
        : "Permissões whatsapp_business_* ausentes.",
      status: h.meta?.tokenRequiredScopesPresent ? "pass" : "fail",
    },
    {
      title: "Telefone e WABA",
      message: h.meta?.phoneBelongsToWaba
        ? "O número pertence à WABA configurada."
        : "Phone ID não confirmado dentro da WABA.",
      status: h.meta?.phoneBelongsToWaba ? "pass" : "fail",
    },
    {
      title: "Webhook efetivo",
      message: h.meta?.effectiveWebhookCallbackMatches
        ? "Callback efetivo corresponde ao Worker."
        : "Callback ausente ou divergente.",
      status: h.meta?.effectiveWebhookCallbackMatches ? "pass" : "fail",
    },
    {
      title: "Campo messages",
      message: h.meta?.appWebhookMessagesSubscribed
        ? "Eventos messages assinados."
        : "Assinatura messages ausente.",
      status: h.meta?.appWebhookMessagesSubscribed ? "pass" : "fail",
    },
    {
      title: "Eventos operacionais",
      message: h.meta?.appWebhookRequiredFieldsPresent
        ? "Status, preferências, templates, pricing e throughput assinados."
        : `Campos ausentes: ${h.meta?.appWebhookMissingFields.join(", ") || "não foi possível consultar"}.`,
      status: h.meta?.appWebhookRequiredFieldsPresent ? "pass" : "fail",
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
            {query.data?.meta && (
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
        className={`flex items-center gap-4 p-5 ${integrationReady ? "border-primary-700/50" : "border-red-800/50"}`}
      >
        <ShieldCheck
          size={30}
          className={integrationReady ? "text-primary-400" : "text-red-400"}
        />
        <div>
          <h2 className="font-semibold">
            {integrationReady ? "Integração Meta conectada" : "Atenção necessária"}
          </h2>
          <p className="text-sm text-zinc-500">
            Status do número: {h.meta?.phoneStatus || "não informado"} ·
            Qualidade: {h.meta?.qualityRating || "não informada"} · Limite:{" "}
            {h.meta?.messagingLimit || "não informado"} · Throughput: {h.meta?.throughputLevel || "não informado"}
            {h.meta?.throughputMps ? ` (até ${h.meta.throughputMps} msg/s)` : ""}
          </p>
          {!h.metaLive && h.meta?.error && (
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
