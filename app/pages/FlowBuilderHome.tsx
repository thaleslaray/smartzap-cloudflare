import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  LayoutTemplate,
  Plus,
  RefreshCw,
  Trash2,
  Wand2,
} from "lucide-react";
import { api } from "../lib/api";
import { FLOW_TEMPLATES, type FlowTemplate } from "../lib/flow-templates";
import {
  Card,
  Modal,
  PageError,
  PageLoading,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "../components/ui";

type Flow = {
  id: string;
  name: string;
  status: string;
  meta_id: string | null;
  created_at: string;
};

type Screen = {
  id: string;
  title: string;
  final: boolean;
  text: string;
  buttonText: string;
  next: string | null;
  blocks?: unknown[];
};

type Definition = { version: string; screens: Screen[] };

const builderInputClass =
  "h-9 w-full min-w-0 rounded-md border border-zinc-800 bg-zinc-800/30 px-3 py-1 text-base text-zinc-100 shadow-sm outline-none placeholder:text-zinc-600 focus:border-primary-400 md:text-sm";

export default function FlowBuilderHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [dialog, setDialog] = useState<"template" | "ai" | null>(null);
  const closeDialog = () => setDialog(null);
  const query = useQuery({
    queryKey: ["flows"],
    queryFn: () => api<{ items: Flow[] }>("/api/flows"),
  });
  const create = useMutation({
    mutationFn: (input: { name: string; definition?: Definition; mapping?: unknown }) =>
      api<Flow>("/api/flows", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (flow) => {
      qc.invalidateQueries({ queryKey: ["flows"] });
      setName("");
      setDialog(null);
      navigate(`/flows/builder/${flow.id}`);
    },
  });
  const createWithAI = useMutation({
    mutationFn: async (input: { name: string; prompt: string }) => {
      const generated = await api<{ definition: Definition }>(
        "/api/flows/generate",
        { method: "POST", body: JSON.stringify({ prompt: input.prompt }) },
      );
      return api<Flow>("/api/flows", {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          definition: generated.definition,
        }),
      });
    },
    onSuccess: (flow) => {
      qc.invalidateQueries({ queryKey: ["flows"] });
      setDialog(null);
      navigate(`/flows/builder/${flow.id}`);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/flows/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flows"] }),
  });
  const items = (query.data?.items ?? []).filter((flow) =>
    `${flow.name} ${flow.meta_id ?? ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-heading-1">MiniApp Builder</h1>
          <p className="text-body-sm">
            Crie MiniApps a partir de modelos e edite o JSON da Meta.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border border-white/10 bg-zinc-900 px-4 text-sm font-medium hover:bg-white/5"
            onClick={() => navigate("/templates?tab=flows")}
          >
            <ArrowLeft size={16} /> Voltar
          </button>
        </div>
      </div>

      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-widest text-zinc-500">
                Buscar
              </label>
              <input
                aria-label="Nome ou ID da MiniApp (Meta)"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome ou ID da MiniApp (Meta)"
                className={builderInputClass}
              />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-widest text-zinc-500">
                Criar nova MiniApp
              </label>
              <div className="flex gap-2">
                <input
                  aria-label="Nome da nova MiniApp"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex: onboarding_lead"
                  className={builderInputClass}
                />
                <button
                  className="inline-flex h-10 items-center gap-1 rounded-lg bg-zinc-300 px-4 text-sm font-medium text-zinc-950 disabled:opacity-40"
                  disabled={name.trim().length < 3 || create.isPending}
                  onClick={() => create.mutate({ name: name.trim() })}
                >
                  <Plus size={16} /> Criar
                </button>
              </div>
              <div className="text-[11px] text-zinc-500">
                Sugestão: use nomes curtos e consistentes (ex.: snake_case).
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex h-9 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-md border border-white/10 bg-black px-4 text-sm font-medium text-zinc-100 hover:bg-white/5 md:flex-none"
              onClick={() => setDialog("ai")}
            >
              <Wand2 size={16} /> Criar com IA
            </button>
            <button
              className="inline-flex h-9 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-md border border-white/10 bg-black px-4 text-sm font-medium text-zinc-100 hover:bg-white/5 md:flex-none"
              onClick={() => setDialog("template")}
            >
              <LayoutTemplate size={16} /> Criar por template
            </button>
            <button
              className="inline-flex h-9 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-md border border-white/10 bg-black px-4 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-100 disabled:opacity-40 md:flex-none"
              disabled={query.isFetching}
              onClick={() => query.refetch()}
            >
              <RefreshCw
                size={16}
                className={query.isFetching ? "animate-spin" : ""}
              />{" "}
              Atualizar
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          {query.isLoading
            ? "Carregando…"
            : `Mostrando ${items.length} MiniApp(s)`}
        </p>
      </Card>

      {query.error && (
        <PageError
          message={query.error.message}
          onRetry={() => query.refetch()}
        />
      )}
      <Card className="!mt-4 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="bg-zinc-950/40">
            <tr>
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">ID da MiniApp (Meta)</th>
              <th className="px-4 py-3 font-semibold">Criado</th>
              <th className="px-4 py-3 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td colSpan={5}>
                  <PageLoading />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-zinc-500"
                >
                  Nenhum MiniApp ainda. Crie um para abrir o editor visual.
                </td>
              </tr>
            ) : (
              items.map((flow) => (
                <tr
                  key={flow.id}
                  className="border-t border-white/10 hover:bg-white/5"
                >
                  <td className="px-4 py-3 font-medium text-zinc-200">
                    {flow.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-white/10 bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                      {flow.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    {flow.meta_id || "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(flow.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        className={btnSecondary}
                        onClick={() => navigate(`/flows/builder/${flow.id}`)}
                      >
                        Abrir <ArrowRight size={16} />
                      </button>
                      <button
                        aria-label={`Excluir ${flow.name}`}
                        className="rounded-lg p-2 text-red-400 hover:bg-red-950"
                        onClick={() => remove.mutate(flow.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </Card>

      {dialog === "template" && (
        <TemplateDialog
          pending={create.isPending}
          error={create.error?.message}
          onClose={closeDialog}
          onCreate={(flowName, template) =>
            create.mutate({
              name: flowName,
              definition: template.definition,
              mapping: template.mapping,
            })
          }
        />
      )}
      {dialog === "ai" && (
        <AIDialog
          pending={createWithAI.isPending}
          error={createWithAI.error?.message}
          onClose={closeDialog}
          onCreate={(flowName, prompt) =>
            createWithAI.mutate({ name: flowName, prompt })
          }
        />
      )}
    </div>
  );
}

function TemplateDialog({
  pending,
  error,
  onClose,
  onCreate,
}: {
  pending: boolean;
  error?: string;
  onClose: () => void;
  onCreate: (name: string, template: FlowTemplate) => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(FLOW_TEMPLATES[0].key);
  const template =
    FLOW_TEMPLATES.find((item) => item.key === selected) ?? FLOW_TEMPLATES[0];
  return (
    <Modal
      titleId="flow-template-title"
      onClose={onClose}
      showCloseButton
      layout="legacy-dialog"
      panelClassName="max-h-[86dvh] max-w-xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
    >
      <div className="flex flex-col gap-2 text-center sm:text-left">
        <h2 id="flow-template-title" className="text-lg font-semibold leading-none">
          Criar MiniApp por template
        </h2>
        <p className="text-sm text-zinc-400">
          Comece a partir de um modelo pronto (Lead/Cadastro, Agendamento, NPS).
        </p>
      </div>
      <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium leading-none" htmlFor="flow_name">
            Nome
          </label>
          <input
            id="flow_name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex: lead_cadastro_jan2026"
            className="h-9 w-full min-w-0 rounded-md border border-zinc-800 bg-transparent px-3 py-1 text-base text-zinc-100 shadow-sm outline-none placeholder:text-zinc-600 focus:border-primary-400 focus:shadow-[0_0_0_2px_rgba(16,185,129,0.25)] md:text-sm"
          />
          <div className="text-[11px] text-zinc-500">
            Dica: nomes curtos e consistentes (ex.: snake_case).
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <p className="text-sm font-medium leading-none">Template</p>
          <div className="grid min-h-0 grid-cols-1 gap-2 overflow-y-auto overscroll-contain pr-1">
            {FLOW_TEMPLATES.map((item) => (
              <button
                key={item.key}
                className={`rounded-lg border px-3 py-2 text-left transition ${selected === item.key ? "border-primary-500 bg-white/5" : "border-white/10 bg-zinc-900 hover:bg-white/5"} ${item.unavailableReason ? "cursor-not-allowed opacity-55" : ""}`}
                onClick={() => setSelected(item.key)}
                disabled={Boolean(item.unavailableReason)}
              >
                <span className="block text-sm font-medium text-zinc-200">
                  {item.name}
                </span>
                <span className="block text-xs text-zinc-500">
                  {item.description}
                </span>
                <span className="mt-1 block font-mono text-[11px] text-zinc-600">
                  {item.key}
                </span>
              </button>
            ))}
          </div>
          {template && (
            <p className="text-xs text-zinc-500">
              {template.dynamic
                ? "Modelo dinâmico: atualiza dados em tempo real."
                : "Modelo simples: pronto para usar."}
            </p>
          )}
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/5 disabled:pointer-events-none disabled:opacity-50"
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-primary-950 transition-colors hover:bg-primary-600 hover:text-primary-50 disabled:pointer-events-none disabled:opacity-50"
          disabled={pending || name.trim().length < 3 || Boolean(template.unavailableReason)}
          onClick={() => onCreate(name.trim(), template)}
        >
          {pending ? "Criando…" : "Criar"}
        </button>
      </div>
    </Modal>
  );
}

function AIDialog({
  pending,
  error,
  onClose,
  onCreate,
}: {
  pending: boolean;
  error?: string;
  onClose: () => void;
  onCreate: (name: string, prompt: string) => void;
}) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  return (
    <Modal titleId="flow-ai-title" onClose={onClose}>
      <h2 id="flow-ai-title" className="text-lg font-semibold">
        Criar MiniApp com IA
      </h2>
      <p className="mt-1 text-sm text-zinc-400">
        Descreva o que você quer coletar. A IA sugere as perguntas e cria o
        MiniApp no modo formulário.
      </p>
      <label className="mt-5 block text-xs text-zinc-400">
        Nome
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex: onboarding_lead"
          className={`mt-2 ${inputClass}`}
        />
      </label>
      <label className="mt-4 block text-xs text-zinc-400">
        O que você quer no formulário?
        <textarea
          rows={5}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ex: Quero captar nome, telefone, e-mail, cidade e interesse."
          className={`mt-2 ${inputClass}`}
        />
      </label>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button className={btnSecondary} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={btnPrimary}
          disabled={
            pending || name.trim().length < 3 || prompt.trim().length < 10
          }
          onClick={() => onCreate(name.trim(), prompt.trim())}
        >
          {pending ? "Criando…" : "Criar"}
        </button>
      </div>
    </Modal>
  );
}
