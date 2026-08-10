import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Circle, Cloud, LockKeyhole, MessageCircle, RefreshCw, Send, Webhook } from "lucide-react";
import { api } from "../lib/api";
import { Button, Card, PageError, PageHeader, inputClass } from "../components/ui";

type SetupStatus = {
  infrastructure: Record<string, boolean>;
  vault: { configured: boolean; rotationReady: boolean; rotationStatus: "idle" | "rotating" | "awaiting_promotion"; rotationUpdatedAt: string | null; metaStored: boolean };
  meta: { configured: boolean; appId: string | null; phoneId: string | null; wabaId: string | null; callbackUrl: string | null; graphVersion: string };
  templates: { approved: number };
  checks: Record<string, { status: "pending" | "passed" | "failed"; detail: string | null; checked_at: string }>;
  installation: { status: "configuring" | "ready" | "failed"; last_step: string; last_error: string | null; revision: number } | null;
  required: boolean;
  complete: boolean;
};

const emptyMeta = { token: "", appId: "", appSecret: "", verifyToken: "", phoneId: "", wabaId: "", graphVersion: "v25.0" };

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
  const messageStatus = useMutation({ mutationFn: () => api("/api/setup/test-message/status"), onSuccess: refresh });
  const complete = useMutation({ mutationFn: () => api("/api/setup/complete", { method: "POST" }), onSuccess: refresh });
  const error = status.error ?? probeInfrastructure.error ?? saveMeta.error ?? validateMeta.error ?? rotateVault.error ?? finalizeVault.error ?? recoverVault.error ?? sync.error ?? send.error ?? messageStatus.error ?? complete.error;

  if (status.isLoading) return <p className="text-sm text-zinc-500">Verificando a instalação…</p>;
  if (!status.data) return <PageError message={error?.message} onRetry={() => status.refetch()} />;
  const data = status.data;
  const infraReady = Object.entries(data.infrastructure).filter(([key]) => !["workersAi", "aiSearch"].includes(key)).every(([, ready]) => ready);
  const coreReady = infraReady
    && data.vault.configured
    && data.vault.rotationStatus === "idle"
    && data.checks.meta_credentials?.status === "passed"
    && data.checks.templates?.status === "passed"
    && data.checks.real_message?.status === "passed";
  const StepIcon = ({ ready }: { ready: boolean }) => ready ? <CheckCircle2 size={20} className="text-[#96f6bc]" /> : <Circle size={20} className="text-zinc-600" />;

  return (
    <div className="mx-auto max-w-[1040px] space-y-6 pb-20">
      <PageHeader title="Configuração inicial" subtitle="Conecte a Meta e valide o caminho real antes de liberar o SmartZap." />
      {error && <PageError message={error.message} />}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5"><Cloud className="text-[#96f6bc]" /><p className="mt-4 font-semibold">Infraestrutura</p><p className="mt-1 text-sm text-zinc-500">{infraReady ? "Recursos obrigatórios prontos" : "Há recursos obrigatórios ausentes"}</p><Button className="mt-4" type="button" variant="secondary" loading={probeInfrastructure.isPending} onClick={() => probeInfrastructure.mutate()}>Testar recursos</Button></Card>
        <Card className="p-5"><LockKeyhole className="text-[#96f6bc]" /><p className="mt-4 font-semibold">Cofre</p><p className="mt-1 text-sm text-zinc-500">{data.vault.configured ? "Chave AES-256 disponível" : "SMARTZAP_VAULT_KEY ausente"}</p></Card>
        <Card className="p-5"><MessageCircle className="text-[#96f6bc]" /><p className="mt-4 font-semibold">Núcleo</p><p className="mt-1 text-sm text-zinc-500">{data.complete ? "SmartZap liberado" : "Homologação pendente"}</p></Card>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3"><StepIcon ready={data.checks.meta_credentials?.status === "passed"} /><div><h2 className="font-semibold">1. Conectar Meta e WhatsApp</h2><p className="mt-1 text-sm text-zinc-500">Os segredos serão cifrados antes de entrar no D1.</p></div></div>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); saveMeta.mutate(); }}>
          {([
            ["token", "Token permanente", "password"], ["appId", "App ID", "text"],
            ["appSecret", "App Secret", "password"], ["verifyToken", "Verify Token", "password"],
            ["phoneId", "Phone Number ID", "text"], ["wabaId", "WABA ID", "text"],
          ] as const).map(([key, label, type]) => <label key={key} className="text-sm text-zinc-400">{label}<input className={`${inputClass} mt-2`} type={type} value={meta[key]} autoComplete="off" required onChange={(e) => setMeta((current) => ({ ...current, [key]: e.target.value }))} /></label>)}
          <label className="text-sm text-zinc-400">Versão Graph<input className={`${inputClass} mt-2`} value={meta.graphVersion} onChange={(e) => setMeta((current) => ({ ...current, graphVersion: e.target.value }))} /></label>
          <div className="flex items-end gap-3"><Button loading={saveMeta.isPending} type="submit">Salvar no cofre</Button><Button loading={validateMeta.isPending} disabled={!data.vault.metaStored} type="button" variant="secondary" onClick={() => validateMeta.mutate()}>Validar na Meta</Button></div>
        </form>
        {data.meta.callbackUrl && <div className="mt-5 rounded-xl border border-white/10 p-4 text-sm"><Webhook className="mr-2 inline text-[#96f6bc]" size={17} />Webhook: <code className="break-all text-zinc-300">{data.meta.callbackUrl}</code></div>}
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

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><StepIcon ready={data.checks.templates?.status === "passed"} /><div><h2 className="font-semibold">2. Sincronizar templates</h2><p className="mt-1 text-sm text-zinc-500">{data.templates.approved} aprovado(s) disponíveis.</p></div></div><Button type="button" variant="secondary" loading={sync.isPending} disabled={data.checks.meta_credentials?.status !== "passed"} onClick={() => sync.mutate()}><RefreshCw size={16} /> Sincronizar</Button></div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3"><StepIcon ready={data.checks.real_message?.status === "passed"} /><div><h2 className="font-semibold">3. Enviar e confirmar uma mensagem real</h2><p className="mt-1 text-sm text-zinc-500">Use somente um número que autorizou este teste. Abra a mensagem para confirmar leitura.</p></div></div>
        <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm text-zinc-400">Telefone autorizado<input className={`${inputClass} mt-2`} placeholder="+55…" value={test.phone} onChange={(e) => setTest((current) => ({ ...current, phone: e.target.value }))} /></label><label className="text-sm text-zinc-400">Template<input className={`${inputClass} mt-2`} value={test.templateName} onChange={(e) => setTest((current) => ({ ...current, templateName: e.target.value }))} /></label><label className="text-sm text-zinc-400">Idioma<input className={`${inputClass} mt-2`} value={test.language} onChange={(e) => setTest((current) => ({ ...current, language: e.target.value }))} /></label></div>
        <label className="mt-4 flex gap-3 text-sm text-zinc-300"><input type="checkbox" checked={test.authorized} onChange={(e) => setTest((current) => ({ ...current, authorized: e.target.checked }))} /> Confirmo que este número autorizou a mensagem de teste.</label>
        <div className="mt-5 flex flex-wrap gap-3"><Button type="button" disabled={!test.authorized || data.checks.templates?.status !== "passed"} loading={send.isPending} onClick={() => send.mutate()}><Send size={16} /> Enviar teste</Button><Button type="button" variant="secondary" loading={messageStatus.isPending} onClick={() => messageStatus.mutate()}>Verificar delivered/read</Button></div>
      </Card>

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><h2 className="font-semibold">Liberar o SmartZap</h2><p className="mt-1 text-sm text-zinc-500">Só libera quando infraestrutura, Meta, templates e mensagem real estiverem verdes.</p></div><Button type="button" loading={complete.isPending} disabled={data.complete || !coreReady} onClick={() => complete.mutate()}>{data.complete ? "SmartZap liberado" : "Concluir configuração"}</Button></Card>
    </div>
  );
}
