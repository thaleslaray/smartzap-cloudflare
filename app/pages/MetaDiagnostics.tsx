import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
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
import {
  useConversionDiagnostics,
  useConversionCanaryCandidates,
  useCreateConversionDataset,
  useRunConversionCanary,
  useSetConversionsEnabled,
} from "../hooks/useConversions";
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
  const [accessRequirementsConfirmed, setAccessRequirementsConfirmed] = useState(false);
  const [operatingMode, setOperatingMode] = useState<"direct" | "partner">("direct");
  const [canaryCandidate, setCanaryCandidate] = useState("");
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
  const capi = useConversionDiagnostics();
  const createDataset = useCreateConversionDataset();
  useEffect(() => {
    const storedMode = capi.data?.permissions.operatingMode;
    if (storedMode) setOperatingMode(storedMode);
  }, [capi.data?.permissions.operatingMode]);
  const operatingRequirementConfirmed = operatingMode === "direct"
    ? capi.data?.permissions.operatingMode === "direct" &&
      capi.data.permissions.ownBusinessDataConfirmed
    : capi.data?.permissions.operatingMode === "partner" &&
      capi.data.permissions.manageEventsAdvancedAccessConfirmed;
  const administrativeRequirementsReady = Boolean(
    (capi.data?.permissions.marketingAccessConfirmed || accessRequirementsConfirmed) &&
    (operatingRequirementConfirmed || accessRequirementsConfirmed),
  );
  const canaryPrerequisites = Boolean(
    capi.data?.permissions.whatsappBusinessManagement === true &&
    capi.data?.permissions.whatsappBusinessManageEvents === true &&
    capi.data?.dataset.status === "found" &&
    capi.data?.dataset.verified === true &&
    administrativeRequirementsReady,
  );
  const canaryCandidates = useConversionCanaryCandidates(
    canaryPrerequisites && !Boolean(capi.data?.canary.accepted),
  );
  const runCanary = useRunConversionCanary();
  const setConversionsEnabled = useSetConversionsEnabled();
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
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary-400">
              Click-to-WhatsApp
            </p>
            <h2 className="mt-1 text-xl font-semibold">Conversões de anúncios</h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500">
              Envie Lead enviado, Lead qualificado e Compra para a Meta usando a origem real da conversa. O SmartZap não envia texto, mídia, telefone ou e-mail.
            </p>
          </div>
          {capi.data && (
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${
              capi.data.enabled
                ? "bg-primary-500/15 text-primary-300"
                : "bg-zinc-800 text-zinc-400"
            }`}>
              {capi.data.enabled ? "Ativo" : "Desativado"}
            </span>
          )}
        </div>

        {capi.isLoading ? (
          <p className="mt-5 text-sm text-zinc-500">Verificando permissões e Dataset…</p>
        ) : capi.error ? (
          <p role="alert" className="mt-5 text-sm text-red-400">{capi.error.message}</p>
        ) : capi.data ? (
          <div className="mt-5 space-y-3">
            <ConversionStep
              number="1"
              title="Permissões do aplicativo"
              done={capi.data.permissions.whatsappBusinessManagement === true &&
                capi.data.permissions.whatsappBusinessManageEvents === true}
              detail={capi.data.permissions.whatsappBusinessManagement === true &&
                capi.data.permissions.whatsappBusinessManageEvents === true
                ? "O token contém os dois escopos técnicos necessários."
                : "O token precisa de whatsapp_business_management e whatsapp_business_manage_events."}
            />
            <ConversionStep
              number="2"
              title="Dataset da conta do WhatsApp"
              done={capi.data.dataset.status === "found" && capi.data.dataset.verified === true}
              detail={capi.data.dataset.status === "found"
                ? capi.data.dataset.verified
                  ? "Dataset encontrado e vinculado à WABA configurada."
                  : "Dataset encontrado; confirme a ativação para finalizar a verificação."
                : capi.data.dataset.status === "missing"
                  ? "Nenhum Dataset foi encontrado para esta WABA."
                  : capi.data.dataset.error || "A Meta não confirmou o Dataset agora."}
              action={capi.data.dataset.status === "missing" || !capi.data.dataset.verified ? (
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={createDataset.isPending || capi.data.permissions.whatsappBusinessManageEvents !== true}
                  onClick={() => createDataset.mutate()}
                >
                  {createDataset.isPending
                    ? "Verificando…"
                    : capi.data.dataset.status === "found"
                      ? "Verificar Dataset encontrado"
                      : "Criar Dataset nesta WABA"}
                </button>
              ) : undefined}
            />
            <ConversionStep
              number="3"
              title="Modelo de operação e acesso Meta"
              done={administrativeRequirementsReady}
              detail={operatingMode === "direct"
                ? "Para a própria WABA, a Meta dispensa Advanced Access e App Review. Confirme a propriedade e o Marketing API Access Tier."
                : "Para operar WABAs de clientes, é obrigatório ter Advanced Access para whatsapp_business_manage_events."}
              action={(
                <div className="min-w-0 space-y-3 sm:min-w-[360px]">
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Modelo de operação da integração">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={operatingMode === "direct"}
                      className={`rounded-lg border px-3 py-2 text-left text-xs ${operatingMode === "direct" ? "border-primary-500 bg-primary-500/10 text-primary-200" : "border-zinc-700 text-zinc-400"}`}
                      onClick={() => {
                        setOperatingMode("direct");
                        setAccessRequirementsConfirmed(false);
                      }}
                    >
                      Somente nossa WABA
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={operatingMode === "partner"}
                      className={`rounded-lg border px-3 py-2 text-left text-xs ${operatingMode === "partner" ? "border-primary-500 bg-primary-500/10 text-primary-200" : "border-zinc-700 text-zinc-400"}`}
                      onClick={() => {
                        setOperatingMode("partner");
                        setAccessRequirementsConfirmed(false);
                      }}
                    >
                      WABAs de clientes
                    </button>
                  </div>
                  {!administrativeRequirementsReady && (
                    <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        checked={accessRequirementsConfirmed}
                        onChange={(event) => setAccessRequirementsConfirmed(event.target.checked)}
                        className="mt-0.5 accent-emerald-500"
                      />
                      {operatingMode === "direct"
                        ? "Confirmo que acessamos somente dados da própria empresa e que o Marketing API Access Tier está em Full access."
                        : "Confirmo Full access na Marketing API e Advanced Access para whatsapp_business_manage_events."}
                    </label>
                  )}
                </div>
              )}
            />
            <ConversionStep
              number="4"
              title="Evento controlado real"
              done={capi.data.canary.accepted}
              detail={capi.data.canary.accepted
                ? "A Meta aceitou o evento controlado com events_received=1 para este Dataset e WABA."
                : capi.data.canary.status
                  ? `Situação atual: ${capi.data.canary.status}${capi.data.canary.error ? ` — ${capi.data.canary.error}` : ""}.`
                  : "Selecione uma conversa CTWA autorizada dos últimos sete dias. O teste registrará um LeadSubmitted real; não é simulação."}
              action={!capi.data.canary.accepted && canaryPrerequisites ? (
                <div className="flex min-w-0 flex-col gap-2 sm:min-w-[300px]">
                  <select
                    aria-label="Conversa CTWA para o evento controlado"
                    className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-200"
                    value={canaryCandidate}
                    onChange={(event) => setCanaryCandidate(event.target.value)}
                    disabled={canaryCandidates.isLoading || runCanary.isPending}
                  >
                    <option value="">Selecione uma origem autorizada</option>
                    {(canaryCandidates.data?.items ?? []).map((candidate) => (
                      <option key={candidate.id} value={`${candidate.conversation_id}:${candidate.id}`}>
                        {new Date(candidate.occurred_at * 1000).toLocaleString("pt-BR")} · clique {candidate.click_id_masked}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={btnSecondary}
                    disabled={!canaryCandidate || runCanary.isPending}
                    onClick={() => {
                      const [conversationId, attributionId] = canaryCandidate.split(":");
                      if (conversationId && attributionId)
                        runCanary.mutate({
                          conversationId,
                          attributionId,
                          operatingMode,
                          ...(operatingMode === "direct"
                            ? { ownBusinessDataConfirmed: true as const }
                            : { manageEventsAdvancedAccessConfirmed: true as const }),
                        });
                    }}
                  >
                    {runCanary.isPending ? "Enviando…" : "Enviar evento controlado"}
                  </button>
                  {!canaryCandidates.isLoading && !canaryCandidates.error &&
                    (canaryCandidates.data?.items.length ?? 0) === 0 && (
                    <p className="text-xs text-amber-400">Nenhuma conversa CTWA atribuível foi capturada nos últimos sete dias.</p>
                  )}
                </div>
              ) : undefined}
            />
            <div className="flex flex-col gap-3 border-t border-zinc-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-zinc-500">{capi.data.message}</p>
              <button
                type="button"
                className={capi.data.enabled ? btnSecondary : "legacy-primary-action inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold"}
                disabled={setConversionsEnabled.isPending || (
                  !capi.data.enabled && (
                    capi.data.permissions.whatsappBusinessManagement !== true ||
                    capi.data.permissions.whatsappBusinessManageEvents !== true ||
                    capi.data.dataset.status !== "found" ||
                    capi.data.dataset.verified !== true ||
                    !capi.data.canary.accepted ||
                    !administrativeRequirementsReady
                  )
                )}
                onClick={() => setConversionsEnabled.mutate(capi.data!.enabled
                  ? { enabled: false }
                  : {
                    enabled: true,
                    operatingMode,
                    ...(operatingMode === "direct"
                      ? { ownBusinessDataConfirmed: true as const }
                      : { manageEventsAdvancedAccessConfirmed: true as const }),
                  })}
              >
                {setConversionsEnabled.isPending
                  ? "Salvando…"
                  : capi.data.enabled
                    ? "Desativar conversões"
                    : "Ativar conversões"}
              </button>
            </div>
            {(createDataset.error || canaryCandidates.error || runCanary.error || setConversionsEnabled.error) && (
              <p role="alert" className="text-sm text-red-400">
                {(createDataset.error ?? canaryCandidates.error ?? runCanary.error ?? setConversionsEnabled.error)?.message}
              </p>
            )}
          </div>
        ) : null}
      </Card>
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

function ConversionStep({
  number,
  title,
  detail,
  done,
  action,
}: {
  number: string;
  title: string;
  detail: string;
  done: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/35 p-4 sm:flex-row sm:items-center">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm ${
        done
          ? "border-primary-500/40 bg-primary-500/10 text-primary-300"
          : "border-zinc-700 text-zinc-500"
      }`}>
        {done ? <CheckCircle2 size={16} /> : number}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{detail}</p>
      </div>
      {action && <div className="sm:max-w-sm">{action}</div>}
    </div>
  );
}
