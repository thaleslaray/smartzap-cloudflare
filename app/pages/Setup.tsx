import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Cloud,
  LockKeyhole,
  MessageCircle,
  RefreshCw,
  Send,
  Webhook,
} from "lucide-react";
import { api } from "../lib/api";
import { Button, Card, PageError, PageHeader, inputClass } from "../components/ui";

type SetupCheck = {
  status: "pending" | "passed" | "failed";
  detail: string | null;
  checked_at: string;
};

type SetupStatus = {
  infrastructure: Record<string, boolean>;
  vault: { configured: boolean; rotationReady: boolean; rotationStatus: "idle" | "rotating" | "awaiting_promotion"; rotationUpdatedAt: string | null; metaStored: boolean };
  meta: { configured: boolean; appId: string | null; phoneId: string | null; wabaId: string | null; callbackUrl: string | null; graphVersion: string };
  templates: { approved: number };
  checks: Record<string, SetupCheck>;
  installation: { status: "configuring" | "ready" | "failed"; last_step: string; last_error: string | null; revision: number } | null;
  release?: {
    version: string;
    commit: string;
    schemaVersion: string;
    channel: string;
    baselineSha256: string | null;
    installedAt: string | null;
    updatedAt: string | null;
  };
  required: boolean;
  complete: boolean;
};

const emptyMeta = { token: "", appId: "", appSecret: "", verifyToken: "", phoneId: "", wabaId: "", graphVersion: "v25.0" };

const requiredInfrastructure = [
  { key: "database", label: "Banco de dados D1", help: "Guarda contatos, campanhas e configurações." },
  { key: "media", label: "Armazenamento de mídias R2", help: "Guarda arquivos usados em templates e conversas." },
  { key: "webhookQueue", label: "Fila de webhooks e recuperação", help: "Recebe as confirmações enviadas pela Meta." },
  { key: "automationQueue", label: "Fila de automações e recuperação", help: "Processa as automações sem travar a Inbox." },
  { key: "conversionQueue", label: "Fila de conversões e recuperação", help: "Processa eventos opcionais de conversão com segurança." },
  { key: "workflow", label: "Workflows de instalação e campanhas", help: "Executa o diagnóstico e os disparos em etapas seguras." },
  { key: "durableObjects", label: "Componentes de tempo real", help: "Mantêm a Inbox atualizada e controlam a vazão." },
  { key: "rateLimit", label: "Proteção contra tentativas de login", help: "Limita tentativas repetidas de acesso." },
  { key: "cron", label: "Agendamento automático", help: "Executa verificações e reconciliações periódicas." },
] as const;

function InlineNotice({
  title,
  children,
  tone = "warning",
}: {
  title: string;
  children: ReactNode;
  tone?: "warning" | "error" | "success" | "neutral";
}) {
  const styles = {
    warning: "border-amber-500/25 bg-amber-500/[0.07] text-amber-100",
    error: "border-red-500/25 bg-red-500/[0.07] text-red-100",
    success: "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-100",
    neutral: "border-white/10 bg-white/[0.03] text-zinc-300",
  }[tone];
  return (
    <div className={`mt-4 rounded-xl border p-4 text-sm ${styles}`} role={tone === "error" ? "alert" : "status"}>
      <p className="font-semibold">{title}</p>
      <div className="mt-1 text-sm leading-relaxed text-zinc-400">{children}</div>
    </div>
  );
}

function StepIcon({ ready }: { ready: boolean }) {
  return ready
    ? <CheckCircle2 size={20} className="shrink-0 text-[#96f6bc]" aria-hidden="true" />
    : <Circle size={20} className="shrink-0 text-zinc-600" aria-hidden="true" />;
}

function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

export default function Setup() {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => api<SetupStatus>("/api/setup/status"),
    // Webhooks e Queues concluem gates sem uma ação do usuário. Enquanto a
    // instalação estiver aberta, a tela acompanha esse estado automaticamente.
    refetchInterval: (query) => query.state.data?.complete ? false : 3_000,
  });
  const [meta, setMeta] = useState(emptyMeta);
  const [test, setTest] = useState({ phone: "", templateName: "hello_world", language: "en_US", authorized: false });
  const refresh = () => client.invalidateQueries({ queryKey: ["setup-status"] });
  const saveMeta = useMutation({
    mutationFn: () => api<{ callbackUrl: string }>("/api/setup/meta", { method: "PUT", body: JSON.stringify(meta) }),
    onSuccess: () => { setMeta(emptyMeta); refresh(); },
  });
  const configureWebhook = useMutation({
    mutationFn: () => api<{ callbackUrl: string }>("/api/setup/meta/webhook/configure", { method: "POST" }),
    onSuccess: refresh,
  });
  const validateMeta = useMutation({ mutationFn: () => api("/api/setup/meta/validate", { method: "POST" }), onSuccess: refresh });
  const probeInfrastructure = useMutation({ mutationFn: () => api("/api/setup/infrastructure/probe", { method: "POST" }), onSuccess: refresh });
  const rotateVault = useMutation({ mutationFn: () => api("/api/setup/vault/rotate", { method: "POST" }), onSuccess: refresh });
  const finalizeVault = useMutation({ mutationFn: () => api("/api/setup/vault/finalize", { method: "POST" }), onSuccess: refresh });
  const recoverVault = useMutation({ mutationFn: () => api("/api/setup/vault/recover", { method: "POST" }), onSuccess: refresh });
  const sync = useMutation({ mutationFn: () => api("/api/setup/templates/sync", { method: "POST" }), onSuccess: refresh });
  const send = useMutation({
    mutationFn: () => api("/api/setup/test-message", { method: "POST", body: JSON.stringify(test) }),
    onSuccess: refresh,
  });
  const complete = useMutation({ mutationFn: () => api("/api/setup/complete", { method: "POST" }), onSuccess: refresh });

  const pageError = status.error ?? rotateVault.error ?? finalizeVault.error ?? recoverVault.error;
  if (status.isLoading) return <p className="text-sm text-zinc-500" role="status">Verificando sua instalação…</p>;
  if (!status.data) return <PageError message={errorMessage(pageError) ?? undefined} onRetry={() => status.refetch()} />;

  const data = status.data;
  const release = data.release ?? {
    version: "não identificada",
    commit: "não identificado",
    schemaVersion: "não identificado",
    channel: "não identificado",
    baselineSha256: null,
    installedAt: null,
    updatedAt: null,
  };
  const missingInfrastructure = requiredInfrastructure.filter(({ key }) => data.infrastructure[key] !== true);
  const infraReady = missingInfrastructure.length === 0;
  const metaCheck = data.checks.meta_credentials;
  const templatesCheck = data.checks.templates;
  const messageCheck = data.checks.real_message;
  const metaProblem = errorMessage(saveMeta.error) ?? errorMessage(configureWebhook.error) ?? errorMessage(validateMeta.error) ?? (metaCheck?.status === "failed" ? metaCheck.detail : null);
  const templateProblem = errorMessage(sync.error) ?? (templatesCheck?.status === "failed" ? templatesCheck.detail : null);
  const messageProblem = errorMessage(send.error) ?? (messageCheck?.status === "failed" ? messageCheck.detail : null);
  const infrastructureProblem = errorMessage(probeInfrastructure.error);
  const completeProblem = errorMessage(complete.error);
  const coreReady = infraReady
    && data.vault.configured
    && data.vault.rotationStatus === "idle"
    && metaCheck?.status === "passed"
    && templatesCheck?.status === "passed"
    && messageCheck?.status === "passed";

  const failedStepTarget = data.installation?.last_step.startsWith("meta")
    ? "setup-meta"
    : data.installation?.last_step === "templates"
      ? "setup-templates"
      : data.installation?.last_step.startsWith("real_message")
        ? "setup-message"
        : "setup-infrastructure";
  const resumeInstallation = () => {
    if (failedStepTarget === "setup-infrastructure") {
      probeInfrastructure.mutate();
      return;
    }
    refresh();
    const target = document.getElementById(failedStepTarget);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    target?.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
  };

  return (
    <div className="mx-auto max-w-[1040px] space-y-6 pb-20">
      <PageHeader
        title="Configuração inicial"
        subtitle="Siga os três passos. Seu progresso é salvo e esta tela verifica as confirmações automaticamente."
      />
      <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-xs text-zinc-500" aria-label="Identidade da versão instalada">
        <span><strong className="text-zinc-300">Versão</strong> {release.version}</span>
        <span><strong className="text-zinc-300">Canal</strong> {release.channel}</span>
        <span><strong className="text-zinc-300">Schema</strong> {release.schemaVersion}</span>
        <span title={release.commit}><strong className="text-zinc-300">Commit</strong> {release.commit.slice(0, 12)}</span>
      </div>
      {pageError && <PageError message={errorMessage(pageError) ?? undefined} onRetry={() => status.refetch()} />}

      {data.installation?.status === "failed" && (
        <Card className="border-red-500/30 bg-red-500/[0.06] p-5 sm:p-6" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-red-400" size={21} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-red-100">A instalação parou nesta etapa</h2>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                {data.installation.last_error || "Não foi possível concluir a última verificação."} Seu progresso foi preservado.
              </p>
              <Button
                className="mt-4"
                type="button"
                variant="secondary"
                loading={probeInfrastructure.isPending && failedStepTarget === "setup-infrastructure"}
                onClick={resumeInstallation}
              >
                {failedStepTarget === "setup-infrastructure" ? "Testar novamente" : "Revisar esta etapa"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3" id="setup-infrastructure">
        <Card className="p-5">
          <Cloud className="text-[#96f6bc]" aria-hidden="true" />
          <p className="mt-4 font-semibold">Infraestrutura</p>
          <p className="mt-1 text-sm text-zinc-500">
            {infraReady ? "Todos os recursos obrigatórios estão prontos." : `${missingInfrastructure.length} recurso(s) precisa(m) de atenção.`}
          </p>
          <Button className="mt-4" type="button" variant="secondary" loading={probeInfrastructure.isPending} onClick={() => probeInfrastructure.mutate()}>
            Verificar recursos
          </Button>
        </Card>
        <Card className="p-5">
          <LockKeyhole className="text-[#96f6bc]" aria-hidden="true" />
          <p className="mt-4 font-semibold">Cofre</p>
          <p className="mt-1 text-sm text-zinc-500">{data.vault.configured ? "Chave de proteção disponível." : "Chave do cofre ausente."}</p>
        </Card>
        <Card className="p-5">
          <MessageCircle className="text-[#96f6bc]" aria-hidden="true" />
          <p className="mt-4 font-semibold">Núcleo</p>
          <p className="mt-1 text-sm text-zinc-500">{data.complete ? "SmartZap liberado" : "Aguardando a homologação"}</p>
        </Card>
      </div>

      {!infraReady && (
        <Card className="p-5 sm:p-6" role="alert" aria-labelledby="missing-resources-title">
          <h2 id="missing-resources-title" className="font-semibold">O que falta na Cloudflare</h2>
          <p className="mt-1 text-sm text-zinc-500">Confira estes itens no Worker antes de continuar:</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {missingInfrastructure.map(({ key, label, help }) => (
              <li key={key} className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
                <p className="text-sm font-semibold text-amber-100">{label}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{help}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-zinc-400">
            Abra <strong>Cloudflare → Workers &amp; Pages → seu SmartZap → Configurações</strong>, corrija o recurso indicado e volte para “Verificar recursos”.
          </p>
          {infrastructureProblem && <InlineNotice title="A verificação não terminou" tone="error">{infrastructureProblem}</InlineNotice>}
        </Card>
      )}

      {!data.vault.configured && (
        <Card className="p-5 sm:p-6" role="alert">
          <h2 className="font-semibold">Adicione a chave do cofre</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Na Cloudflare, adicione um secret chamado <code>SMARTZAP_VAULT_KEY</code> com a chave salva no arquivo de recuperação. Não cole a chave nesta tela.
          </p>
        </Card>
      )}

      <Card className="p-5 sm:p-6" id="setup-meta">
        <div className="mb-5 flex items-start gap-3">
          <StepIcon ready={metaCheck?.status === "passed"} />
          <div><h2 className="font-semibold">1. Conectar Meta e WhatsApp</h2><p className="mt-1 text-sm text-zinc-500">As credenciais são cifradas antes de entrar no banco.</p></div>
        </div>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); saveMeta.mutate(); }}>
          {([
            ["token", "Token permanente", "password"], ["appId", "App ID", "text"],
            ["appSecret", "App Secret", "password"], ["verifyToken", "Verify Token", "password"],
            ["phoneId", "Phone Number ID", "text"], ["wabaId", "WABA ID", "text"],
          ] as const).map(([key, label, type]) => (
            <label key={key} className="text-sm text-zinc-400">
              {label}
              <input className={`${inputClass} mt-2`} type={type} value={meta[key]} autoComplete="off" required onChange={(event) => setMeta((current) => ({ ...current, [key]: event.target.value }))} />
            </label>
          ))}
          <label className="text-sm text-zinc-400">Versão Graph<input className={`${inputClass} mt-2`} value={meta.graphVersion} onChange={(event) => setMeta((current) => ({ ...current, graphVersion: event.target.value }))} /></label>
          <div className="flex flex-wrap items-end gap-3">
            <Button loading={saveMeta.isPending} disabled={!data.vault.configured} type="submit">Salvar com segurança</Button>
            <Button loading={configureWebhook.isPending} disabled={!data.vault.metaStored} type="button" variant="secondary" onClick={() => configureWebhook.mutate()}>Configurar webhook</Button>
            <Button loading={validateMeta.isPending} disabled={!data.vault.metaStored} type="button" variant="secondary" onClick={() => validateMeta.mutate()}>Verificar novamente</Button>
          </div>
        </form>
        {metaProblem && (
          <InlineNotice title="Não foi possível conectar à Meta" tone="error">
            {metaProblem} Confira o token, o App ID, a WABA e o Phone Number ID e tente novamente.
          </InlineNotice>
        )}
        {metaCheck?.status === "pending" && (
          <InlineNotice title="Credenciais salvas" tone="warning">Agora selecione “Configurar webhook”. O SmartZap fará a configuração e a validação na Meta sem mostrar seus segredos.</InlineNotice>
        )}
        {metaCheck?.status === "passed" && (
          <InlineNotice title="Meta e WhatsApp conectados" tone="success">Token, aplicativo, WABA e número foram validados.</InlineNotice>
        )}
        {data.meta.callbackUrl && (
          <div className="mt-5 rounded-xl border border-white/10 p-4 text-sm">
            <p className="font-semibold text-zinc-200"><Webhook className="mr-2 inline text-[#96f6bc]" size={17} aria-hidden="true" />Endereço do webhook</p>
            <code className="mt-2 block break-all text-zinc-300">{data.meta.callbackUrl}</code>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">O SmartZap configura este endereço automaticamente. Use-o apenas para conferir a configuração no painel da Meta.</p>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div><h2 className="font-semibold">Rotacionar a chave do cofre</h2><p className="mt-1 max-w-2xl text-sm text-zinc-500">Gere outra chave, salve-a na Cloudflare como <code>SMARTZAP_VAULT_KEY_NEXT</code> e volte aqui. Durante a troca, novas gravações ficam bloqueadas. Depois, promova a chave temporária para <code>SMARTZAP_VAULT_KEY</code>, remova a temporária e finalize.</p></div>
        {data.vault.rotationStatus === "awaiting_promotion" ? (
          <Button type="button" variant="secondary" loading={finalizeVault.isPending} onClick={() => finalizeVault.mutate()}>Finalizar promoção</Button>
        ) : data.vault.rotationStatus === "rotating" ? (
          <Button type="button" variant="secondary" loading={recoverVault.isPending} onClick={() => recoverVault.mutate()}>Recuperar rotação interrompida</Button>
        ) : (
          <Button type="button" variant="secondary" loading={rotateVault.isPending} disabled={!data.vault.rotationReady || data.vault.rotationStatus !== "idle"} onClick={() => rotateVault.mutate()}>Rotacionar cofre</Button>
        )}
      </Card>

      <Card className="p-5 sm:p-6" id="setup-templates">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><StepIcon ready={templatesCheck?.status === "passed"} /><div><h2 className="font-semibold">2. Sincronizar templates</h2><p className="mt-1 text-sm text-zinc-500">{data.templates.approved} aprovado(s) disponíveis.</p></div></div>
          <Button type="button" variant="secondary" loading={sync.isPending} disabled={metaCheck?.status !== "passed"} onClick={() => sync.mutate()}><RefreshCw size={16} aria-hidden="true" /> Sincronizar templates</Button>
        </div>
        {templateProblem && (
          <InlineNotice title="Nenhum template aprovado foi encontrado" tone="error">
            {templateProblem} Confirme na Meta se existe um template aprovado nesta WABA e sincronize novamente.
          </InlineNotice>
        )}
        {templatesCheck?.status === "passed" && (
          <InlineNotice title="Templates prontos" tone="success">{templatesCheck.detail || "Os templates aprovados já estão disponíveis no SmartZap."}</InlineNotice>
        )}
      </Card>

      <Card className="p-5 sm:p-6" id="setup-message">
        <div className="mb-5 flex items-start gap-3"><StepIcon ready={messageCheck?.status === "passed"} /><div><h2 className="font-semibold">3. Confirmar uma mensagem real</h2><p className="mt-1 text-sm text-zinc-500">Use somente um número que autorizou este teste. Depois, abra a mensagem recebida no WhatsApp.</p></div></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm text-zinc-400">Telefone autorizado<input className={`${inputClass} mt-2`} placeholder="+55…" value={test.phone} onChange={(event) => setTest((current) => ({ ...current, phone: event.target.value }))} /></label>
          <label className="text-sm text-zinc-400">Template<input className={`${inputClass} mt-2`} value={test.templateName} onChange={(event) => setTest((current) => ({ ...current, templateName: event.target.value }))} /></label>
          <label className="text-sm text-zinc-400">Idioma<input className={`${inputClass} mt-2`} value={test.language} onChange={(event) => setTest((current) => ({ ...current, language: event.target.value }))} /></label>
        </div>
        <label className="mt-4 flex gap-3 text-sm text-zinc-300"><input type="checkbox" checked={test.authorized} onChange={(event) => setTest((current) => ({ ...current, authorized: event.target.checked }))} /> Confirmo que este número autorizou a mensagem de teste.</label>
        <div className="mt-5 flex flex-wrap gap-3"><Button type="button" disabled={!test.authorized || templatesCheck?.status !== "passed"} loading={send.isPending} onClick={() => send.mutate()}><Send size={16} aria-hidden="true" /> Enviar mensagem de teste</Button></div>
        {messageProblem && (
          <InlineNotice title="A mensagem de teste falhou" tone="error">{messageProblem} Revise o número, o template e a conexão com a Meta antes de tentar novamente.</InlineNotice>
        )}
        {messageCheck?.status === "pending" && (
          <InlineNotice title="Aguardando a confirmação do WhatsApp" tone="warning">
            Abra a mensagem no telefone autorizado. Esta tela verifica automaticamente, a cada 3 segundos, as confirmações de envio, entrega e leitura.
          </InlineNotice>
        )}
        {messageCheck?.status === "passed" && (
          <InlineNotice title="Mensagem confirmada" tone="success">Envio, entrega e leitura foram confirmados automaticamente pelo webhook e pela fila.</InlineNotice>
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div><h2 className="font-semibold">Liberar o SmartZap</h2><p className="mt-1 text-sm text-zinc-500">A liberação só acontece quando infraestrutura, cofre, Meta, templates e mensagem real estiverem confirmados.</p></div>
        <Button type="button" loading={complete.isPending} disabled={data.complete || !coreReady} onClick={() => complete.mutate()}>{data.complete ? "SmartZap liberado" : "Concluir configuração"}</Button>
        {completeProblem && <PageError message={completeProblem} />}
      </Card>
    </div>
  );
}
