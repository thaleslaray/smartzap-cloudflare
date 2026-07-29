import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import {
  Bot,
  Check,
  ChevronDown,
  Cpu,
  Eye,
  FileImage,
  FormInput,
  Info,
  Megaphone,
  Sparkles,
  Target,
  Wand2,
  Wrench,
} from "lucide-react";
import { api } from "../lib/api";
import { Card, PageError } from "../components/ui";

type Health = {
  ai: { enabled: boolean; configured: boolean; ready: boolean; model: string };
};
type Config = {
  strategyMarketing: string;
  strategyUtility: string;
  utilityJudgeTemplate: string;
  flowFormTemplate: string;
  generateFlowForm: boolean;
};
const strategyMeta = [
  ["strategyMarketing", "Marketing", "Vendas", "MARKETING", Megaphone, "amber"],
  ["strategyUtility", "Utilidade", "Padrão", "UTILITY", Wrench, "emerald"],
] as const;

export default function AICenter() {
  const qc = useQueryClient();
  const [strategiesOpen, setStrategiesOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [draft, setDraft] = useState<Config | null>(null);
  const health = useQuery({
    queryKey: ["settings-health"],
    queryFn: () => api<Health>("/api/settings/health"),
  });
  const config = useQuery({
    queryKey: ["ai-center-config"],
    queryFn: () => api<Config>("/api/settings/ai-center"),
  });
  const value = draft ?? config.data;
  const save = useMutation({
    mutationFn: () =>
      api<Config>("/api/settings/ai-center", {
        method: "PUT",
        body: JSON.stringify(value),
      }),
    onSuccess: (data) => {
      setDraft(data);
      qc.setQueryData(["ai-center-config"], data);
    },
  });
  const update = <K extends keyof Config>(key: K, next: Config[K]) =>
    setDraft({ ...config.data!, ...value!, [key]: next });
  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-emerald-300">
            <Sparkles size={16} />
            Central de IA
          </div>
          <h1 className="text-heading-1">Central de IA</h1>
          <p className="text-body-sm">
            Escolha o modelo, publique as rotas. O resto fica invisível.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="h-10 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:opacity-60"
            onClick={() => save.mutate()}
            disabled={!value || save.isPending}
          >
            {save.isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
      {(health.error || config.error) && (
        <PageError message={(health.error || config.error)!.message} />
      )}
      <Link
        to="/settings/ai/agents"
        className="group !mb-6 flex items-center justify-between rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 hover:border-emerald-500/30 hover:bg-emerald-500/5"
      >
        <span className="flex items-center gap-3">
          <span className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] p-2 text-emerald-300">
            <Bot size={20} />
          </span>
          <span>
            <strong className="block text-sm">Agentes de Atendimento</strong>
            <small className="block text-xs text-[var(--ds-text-secondary)]">
              Configure os agentes IA para o Inbox
            </small>
          </span>
        </span>
        <ChevronDown
          className="-rotate-90 text-[var(--ds-text-muted)]"
          size={16}
        />
      </Link>
      <Card className="space-y-6 p-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Cpu size={16} className="text-emerald-300" />
            Cloudflare Workers AI
          </div>
          <p className="text-sm text-[var(--ds-text-secondary)]">
            Provedor único para geração, OCR e atendimento fundamentado.
          </p>
        </div>
        <div className="rounded-xl border border-blue-500 bg-blue-500/20 p-4">
          <div className="flex items-center gap-2">
            <span className="text-base">☁️</span>
            <strong className="text-sm font-medium">Workers AI</strong>
          </div>
          <div className="mt-3 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                readOnly
                value={
                  health.data?.ai.model || "@cf/meta/llama-3.2-3b-instruct"
                }
                className="h-[30px] w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 pr-9 font-mono text-xs text-[var(--ds-text-secondary)] outline-none"
              />
              <Eye
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[var(--ds-text-muted)]"
                size={12}
              />
            </div>
            <span className="flex h-[30px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white">
              <Check size={12} />{" "}
              {health.data?.ai.ready ? "Em uso" : "Pendente"}
            </span>
          </div>
        </div>
      </Card>
      <Card className="p-6">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileImage size={17} className="text-emerald-300" />
          OCR (Extração de Documentos)
        </div>
        <p className="mt-1 text-sm text-[var(--ds-text-secondary)]">
          Converta PDFs e documentos antes da indexação.
        </p>
        <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-3">
            <span className="text-lg">✨</span>
            <span>
              <strong className="block text-sm">
                Workers AI + parser local
              </strong>
              <small className="text-[var(--ds-text-secondary)]">
                Mesmo provedor, sem chave externa
              </small>
            </span>
            <span className="ml-auto rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-300">
              Em uso
            </span>
          </div>
        </div>
        <div className="mt-4 flex gap-2 rounded-lg border border-[var(--ds-border-subtle)] p-3 text-xs text-[var(--ds-text-secondary)]">
          <Info size={15} className="shrink-0 text-emerald-400" />O texto
          extraído é indexado na base privada e recuperado pelo RAG dos agentes.
        </div>
      </Card>
      <section className="rounded-2xl border border-[var(--ds-border-default)] bg-gradient-to-br from-[var(--ds-bg-elevated)] to-[var(--ds-bg-surface)] p-6">
        <button
          className="flex w-full items-center justify-between text-left"
          onClick={() => setStrategiesOpen(!strategiesOpen)}
        >
          <span>
            <span className="flex items-center gap-2">
              <span className="rounded-lg bg-gradient-to-br from-amber-500/20 via-emerald-500/20 to-violet-500/20 p-2">
                <Target size={16} />
              </span>
              <strong>Estratégias de Template</strong>
            </span>
            <small className="mt-1 block text-[var(--ds-text-secondary)]">
              Configure os prompts de cada personalidade para geração de
              templates Meta.
            </small>
          </span>
          <span className="flex items-center gap-2">
            <i className="rounded-full border border-amber-500/30 px-2 text-[10px] not-italic text-amber-300">
              MARKETING
            </i>
            <i className="rounded-full border border-emerald-500/30 px-2 text-[10px] not-italic text-emerald-300">
              UTILITY
            </i>
            <ChevronDown
              size={16}
              className={strategiesOpen ? "rotate-180" : ""}
            />
          </span>
        </button>
        {strategiesOpen && value && (
          <div className="mt-6 space-y-4">
            {strategyMeta.map(([key, title, subtitle, category, Icon]) => (
              <div
                key={key}
                className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-5"
              >
                <div className="flex items-center gap-3">
                  <Icon size={19} />
                  <strong>{title}</strong>
                  <span className="text-xs text-[var(--ds-text-muted)]">
                    {subtitle} · {category}
                  </span>
                </div>
                <textarea
                  value={value[key]}
                  onChange={(e) => update(key, e.target.value)}
                  rows={5}
                  className="mt-4 w-full rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-3 text-sm outline-none"
                />
              </div>
            ))}
          </div>
        )}
      </section>
      <Card className="p-6">
        <button
          className="flex w-full items-center justify-between text-left"
          onClick={() => setPromptOpen(!promptOpen)}
        >
          <span>
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Wand2 size={16} className="text-emerald-300" />
              Prompts do sistema
            </span>
            <small className="mt-1 block text-[var(--ds-text-secondary)]">
              Edite os prompts sem sair daqui.
            </small>
          </span>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            1 prompts configuráveis
          </span>
        </button>
        {promptOpen && value && (
          <div className="mt-5 rounded-xl border border-[var(--ds-border-default)] p-4">
            <div className="flex items-center gap-3">
              <FormInput size={18} />
              <span>
                <strong className="block text-sm">MiniApp Form (JSON)</strong>
                <small className="text-[var(--ds-text-secondary)]">
                  Gera o formulário para MiniApps em JSON estrito.
                </small>
              </span>
              <label className="ml-auto flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={value.generateFlowForm}
                  onChange={(e) => update("generateFlowForm", e.target.checked)}
                />
                Ativa
              </label>
            </div>
            <textarea
              rows={8}
              value={value.flowFormTemplate}
              onChange={(e) => update("flowFormTemplate", e.target.value)}
              className="mt-4 w-full rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-3 text-sm outline-none"
            />
          </div>
        )}
      </Card>
      {save.error && <PageError message={save.error.message} />}
    </div>
  );
}
