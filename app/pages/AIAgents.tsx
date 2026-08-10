import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  CircleCheck,
  FileText,
  Plus,
  Power,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useState } from "react";

import {
  Modal,
  PageError,
  PageLoading,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "../components/ui";
import { api } from "../lib/api";

type Agent = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  active: boolean;
  is_default: boolean;
  document_count: number;
  temperature: number;
  max_tokens: number;
  debounce_ms: number;
  rag_similarity_threshold: number;
  rag_max_results: number;
  handoff_enabled: boolean;
  handoff_instructions: string;
};

function agentPayload(agent: Agent, active = agent.active) {
  return {
    name: agent.name,
    description: agent.description,
    instructions: agent.instructions,
    active,
    temperature: agent.temperature,
    max_tokens: agent.max_tokens,
    debounce_ms: agent.debounce_ms,
    rag_similarity_threshold: agent.rag_similarity_threshold,
    rag_max_results: agent.rag_max_results,
    handoff_enabled: agent.handoff_enabled,
    handoff_instructions: agent.handoff_instructions,
  };
}

type Doc = {
  id: string;
  name: string;
  mime_type: string;
  status: string;
  attached: boolean;
  size_bytes: number | null;
};

function formatBytes(bytes: number | null) {
  if (bytes === null || !Number.isFinite(bytes)) return "Tamanho indisponível";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AIAgents() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState("");
  const [editing, setEditing] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"base" | "test">("base");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState("");

  const agents = useQuery({
    queryKey: ["ai-agents"],
    queryFn: () => api<{ enabled: boolean; items: Agent[] }>("/api/agents"),
  });
  const current = agents.data?.items.find(
    (agent) => agent.id === (activeId || agents.data.items[0]?.id),
  );
  const docs = useQuery({
    queryKey: ["ai-agent-documents", current?.id],
    queryFn: () =>
      api<{ items: Doc[] }>(`/api/agents/${current!.id}/documents`),
    enabled: Boolean(current),
  });

  const toggleGlobal = useMutation({
    mutationFn: (enabled: boolean) =>
      api("/api/agents/enabled", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-agents"] }),
  });
  const toggleAgent = useMutation({
    mutationFn: (agent: Agent) =>
      api(`/api/agents/${agent.id}`, {
        method: "PATCH",
        body: JSON.stringify(agentPayload(agent, !agent.active)),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-agents"] }),
  });
  const attach = useMutation({
    mutationFn: (doc: Doc) => {
      const ids = (docs.data?.items || [])
        .filter((item) =>
          item.id === doc.id ? !item.attached : item.attached,
        )
        .map((item) => item.id);
      return api(`/api/agents/${current!.id}/documents`, {
        method: "PUT",
        body: JSON.stringify({ documentIds: ids }),
      });
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["ai-agent-documents", current?.id] }),
  });
  const test = useMutation({
    mutationFn: () =>
      api<{ text: string }>(`/api/agents/${current!.id}/test`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onSuccess: (data) => setResult(data.text),
  });

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary-500/10 p-2">
            <Bot className="h-6 w-6 text-primary-400" />
          </div>
          <div>
            <h1 className="text-[36px] font-semibold leading-[40px] tracking-[-0.02em]">
              Agentes IA
            </h1>
            <p className="mt-1 text-sm leading-5 text-zinc-400">
              Configure os agentes de atendimento automático para o inbox
            </p>
          </div>
        </div>
      </div>

      <div className="!mt-[35px] !mb-6 space-y-6 sm:!mt-[34px]">
        <div className="flex items-center justify-end">
          <button
            role="switch"
            aria-checked={agents.data?.enabled ?? false}
            onClick={() =>
              toggleGlobal.mutate(!(agents.data?.enabled ?? false))
            }
            className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-2"
          >
            <span className="text-sm text-zinc-400">Atendimento IA</span>
            <span
              className={`relative h-5 w-8 rounded-full transition-colors ${
                agents.data?.enabled ? "bg-primary-500" : "bg-zinc-700"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0 h-4 w-4 rounded-full bg-zinc-950 transition-transform ${
                  agents.data?.enabled ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>
        </div>

        {agents.error && <PageError message={agents.error.message} />}
        {agents.isLoading && <PageLoading />}

        <div className="space-y-4">
          {agents.data?.items.map((agent) => (
            <div
              key={agent.id}
              className={`relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 transition-all duration-300 ${
                !agent.active ? "opacity-60" : ""
              }`}
            >
              {agent.active && (
                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-primary-500/80 via-primary-400 to-primary-500/80" />
              )}
              <div className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl border text-base font-semibold ${
                        agent.active
                          ? "border-primary-500/20 bg-primary-500/15 text-primary-400"
                          : "border-transparent bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h2 className="break-words text-base font-medium text-white">
                        {agent.name}
                      </h2>
                      <p className="text-sm text-zinc-500">
                        {agent.active
                          ? "Respondendo automaticamente"
                          : "Desativado"}
                      </p>
                    </div>
                  </div>

                  <div className="ml-0 flex flex-wrap items-center justify-between gap-2 sm:ml-4 sm:flex-none sm:justify-end sm:gap-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          agent.active ? "bg-primary-400" : "bg-zinc-600"
                        }`}
                      />
                      <span
                        className={`text-xs ${agent.active ? "text-primary-400" : "text-zinc-500"}`}
                      >
                        {agent.active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="flex min-w-0 h-8 items-center rounded-md px-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white sm:px-3"
                        onClick={() => setEditing(agent)}
                      >
                        <Settings className="mr-1.5 h-4 w-4" /> Configurar
                      </button>
                      <button
                        className="flex min-w-0 h-8 items-center rounded-md px-2 text-sm text-zinc-400 hover:bg-red-500/10 hover:text-red-400 sm:px-3"
                        onClick={() => toggleAgent.mutate(agent)}
                      >
                        <Power className="mr-1.5 h-4 w-4" />
                        {agent.active ? "Desativar" : "Ativar"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={() => setCreating(true)}
            className="flex h-9 w-full items-center justify-center rounded-md border border-dashed border-zinc-700 bg-transparent text-sm text-zinc-400 hover:bg-zinc-800/50"
          >
            <Plus className="mr-2 h-4 w-4" /> Novo agente
          </button>
        </div>
      </div>

      {current && (
  <div className="!mt-[19px] flex flex-col gap-2 sm:!mt-7">
    <div className="mb-4 flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
            <div
              role="tablist"
              className="flex h-9 w-fit items-center justify-center rounded-lg bg-transparent p-[3px] text-zinc-400"
            >
              <button
                role="tab"
                aria-selected={tab === "base"}
                onClick={() => setTab("base")}
                className={`h-[calc(100%-1px)] rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap ${
                  tab === "base"
                    ? "border-zinc-800 bg-zinc-900/80 text-zinc-100 shadow-sm"
                    : ""
                }`}
              >
                Base de Conhecimento
              </button>
              <button
                role="tab"
                aria-selected={tab === "test"}
                onClick={() => setTab("test")}
                className={`h-[calc(100%-1px)] rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap ${
                  tab === "test"
                    ? "border-zinc-800 bg-zinc-900/80 text-zinc-100 shadow-sm"
                    : ""
                }`}
              >
                Testar Agente
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              Agente:
              <select
                value={current.id}
                onChange={(event) => setActiveId(event.target.value)}
      className="h-9 w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary-500 sm:w-auto sm:min-w-[200px]"
              >
                {agents.data?.items.map((agent) => (
                  <option value={agent.id} key={agent.id}>
                    {agent.name}
                    {agent.is_default ? " (Padrão)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {tab === "base" ? (
            <div className="flex flex-col gap-6 rounded-xl border border-zinc-800 bg-black pt-[33px] pb-6 text-zinc-100 shadow-sm sm:pt-6">
              <div className="px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-500/10 p-2">
                      <FileText className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold">
                        Base de Conhecimento
                      </h3>
                      <p className="text-sm text-zinc-500">
                        {docs.data?.items.filter((doc) => doc.attached)
                          .length || 0}{" "}
                        arquivo
                        {(docs.data?.items.filter((doc) => doc.attached)
                          .length || 0) !== 1
                          ? "s"
                          : ""}
                      </p>
                    </div>
                  </div>
                  <a
                    href="/knowledge"
                    className="inline-flex h-9 items-center rounded-md bg-white px-3 text-sm font-medium text-zinc-950"
                  >
                    <Upload className="mr-2 h-4 w-4" /> Adicionar
                  </a>
                </div>
              </div>
              <div className="px-6">
                <div className="space-y-2">
                  {docs.data?.items.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => attach.mutate(doc)}
                      className="flex w-full items-center gap-3 rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-3 text-left"
                    >
                      <div className="rounded bg-zinc-700/50 p-2">
                        <FileText className="h-4 w-4 text-zinc-400" />
                      </div>
                      <div>
                        <span className="block text-sm font-medium text-zinc-200">
                          {doc.name}
                        </span>
                        <span className="block text-xs text-zinc-500">
                          {formatBytes(doc.size_bytes)}
                        </span>
                      </div>
                      <span className="ml-auto flex items-center gap-4">
                        {doc.attached ? (
                          <CircleCheck className="text-primary-400" size={17} />
                        ) : (
                          <span className="text-xs text-zinc-500">
                            Vincular
                          </span>
                        )}
                        <Trash2 className="h-4 w-4 text-zinc-400" />
                      </span>
                    </button>
                  ))}
                  {!docs.data?.items.length && (
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-800 py-8 text-center">
                      <Upload className="mb-3 h-8 w-8 text-zinc-500" />
                      <p className="text-sm text-zinc-400">
                        Nenhum documento na base.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-black p-6">
              <h3 className="font-semibold">Testar {current.name}</h3>
              <p className="mt-1 text-sm text-zinc-500">
                A resposta usa a base vinculada e não envia mensagem real.
              </p>
              <textarea
                aria-label="Mensagem de teste"
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className={`mt-5 ${inputClass}`}
                placeholder="Faça uma pergunta ao agente…"
              />
              <button
                className={`mt-3 ${btnPrimary}`}
                disabled={message.trim().length < 2 || test.isPending}
                onClick={() => test.mutate()}
              >
                <Bot size={16} />{" "}
                {test.isPending ? "Testando…" : "Enviar teste"}
              </button>
              {test.error && (
                <p className="mt-4 text-sm text-red-400">
                  {test.error.message}
                </p>
              )}
              {result && (
                <div className="mt-5 rounded-xl border border-primary-500/20 bg-primary-500/5 p-4 text-sm">
                  {result}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(editing || creating) && (
        <AgentEditor
          initial={editing || undefined}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function AgentEditor({
  initial,
  onClose,
}: {
  initial?: Agent;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [instructions, setInstructions] = useState(initial?.instructions || "");
  const [temperature, setTemperature] = useState(initial?.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(initial?.max_tokens ?? 1024);
  const [debounceMs, setDebounceMs] = useState(initial?.debounce_ms ?? 5000);
  const [ragThreshold, setRagThreshold] = useState(
    initial?.rag_similarity_threshold ?? 0.5,
  );
  const [ragMaxResults, setRagMaxResults] = useState(
    initial?.rag_max_results ?? 5,
  );
  const [handoffEnabled, setHandoffEnabled] = useState(
    initial?.handoff_enabled ?? true,
  );
  const [handoffInstructions, setHandoffInstructions] = useState(
    initial?.handoff_instructions ||
      "Só transfira para humano quando o cliente pedir explicitamente ou quando a base não contiver uma resposta segura.",
  );
  const done = () => {
    qc.invalidateQueries({ queryKey: ["ai-agents"] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      api(initial ? `/api/agents/${initial.id}` : "/api/agents", {
        method: initial ? "PATCH" : "POST",
        body: JSON.stringify({
          name,
          description,
          instructions,
          active: initial?.active ?? true,
          temperature,
          max_tokens: maxTokens,
          debounce_ms: debounceMs,
          rag_similarity_threshold: ragThreshold,
          rag_max_results: ragMaxResults,
          handoff_enabled: handoffEnabled,
          handoff_instructions: handoffInstructions,
        }),
      }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/agents/${initial!.id}`, { method: "DELETE" }),
    onSuccess: done,
  });

  return (
    <Modal titleId="agent-editor-title" onClose={onClose}>
      <div className="flex justify-between">
        <h2 id="agent-editor-title" className="text-lg font-semibold">
          {initial ? "Configurar agente" : "Novo agente"}
        </h2>
        <button onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="mt-5 space-y-4">
        <label className="block text-xs text-zinc-400">
          Nome
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <details className="group rounded-lg border border-zinc-700 bg-zinc-900/70">
          <summary className="cursor-pointer list-none px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  Parâmetros avançados
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Criatividade {temperature.toFixed(1)} • Resposta {maxTokens} tokens • Espera {debounceMs / 1000}s
                </p>
              </div>
              <Settings className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-90" />
            </div>
          </summary>
          <div className="space-y-5 border-t border-zinc-800 p-4">
            <RangeField
              label="Criatividade"
              value={temperature}
              display={temperature.toFixed(1)}
              min={0}
              max={2}
              step={0.1}
              start="Focado"
              end="Criativo"
              onChange={setTemperature}
            />
            <RangeField
              label="Tamanho da resposta"
              value={maxTokens}
              display={`${maxTokens} tokens`}
              min={256}
              max={4096}
              step={128}
              start="Curta"
              end="Longa"
              onChange={setMaxTokens}
            />
            <RangeField
              label="Tempo de espera"
              value={debounceMs}
              display={`${debounceMs / 1000}s`}
              min={0}
              max={15000}
              step={1000}
              start="Imediato"
              end="15 segundos"
              onChange={setDebounceMs}
            />
            <p className="-mt-3 text-[11px] text-zinc-500">
              Aguarda o cliente terminar de digitar antes de responder.
            </p>
          </div>
        </details>
        <details className="group rounded-lg border border-zinc-700 bg-zinc-900/70">
          <summary className="cursor-pointer list-none px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  Configuração RAG
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Workers AI • similaridade {ragThreshold.toFixed(2)} • {ragMaxResults} fontes
                </p>
              </div>
              <FileText className="h-4 w-4 text-primary-400 transition-transform group-open:rotate-90" />
            </div>
          </summary>
          <div className="space-y-5 border-t border-zinc-800 p-4">
            <RangeField
              label="Threshold de similaridade"
              value={ragThreshold}
              display={ragThreshold.toFixed(2)}
              min={0.1}
              max={0.95}
              step={0.05}
              start="Mais resultados"
              end="Mais preciso"
              onChange={setRagThreshold}
            />
            <RangeField
              label="Máximo de resultados"
              value={ragMaxResults}
              display={String(ragMaxResults)}
              min={1}
              max={20}
              step={1}
              start="1 fonte"
              end="20 fontes"
              onChange={setRagMaxResults}
            />
          </div>
        </details>
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/70 p-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-zinc-200">
                Transferência para humano
              </span>
              <span className="mt-0.5 block text-xs text-zinc-500">
                Encaminha quando não houver resposta segura.
              </span>
            </span>
            <input
              type="checkbox"
              checked={handoffEnabled}
              onChange={(event) => setHandoffEnabled(event.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
          </label>
          {handoffEnabled && (
            <textarea
              aria-label="Instruções de transferência"
              rows={3}
              value={handoffInstructions}
              onChange={(event) => setHandoffInstructions(event.target.value)}
              className={`mt-3 ${inputClass}`}
            />
          )}
        </div>
        <label className="block text-xs text-zinc-400">
          Descrição
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Instruções
          <textarea
            rows={9}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        {(save.error || remove.error) && (
          <p className="text-sm text-red-400">
            {(save.error || remove.error)!.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {initial && !initial.is_default && (
            <button
              className="mr-auto rounded-xl px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
              onClick={() => remove.mutate()}
            >
              Excluir agente
            </button>
          )}
          <button className={btnSecondary} onClick={onClose}>
            Cancelar
          </button>
          <button
            className={btnPrimary}
            disabled={!name || !instructions || save.isPending}
            onClick={() => save.mutate()}
          >
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RangeField({
  label,
  value,
  display,
  min,
  max,
  step,
  start,
  end,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  start: string;
  end: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-sm text-zinc-300">
        {label}
        <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-400">
          {display}
        </span>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-1.5 w-full cursor-pointer accent-emerald-500"
      />
      <span className="mt-1 flex justify-between text-[10px] text-zinc-500">
        <span>{start}</span>
        <span>{end}</span>
      </span>
    </label>
  );
}
