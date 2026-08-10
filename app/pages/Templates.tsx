import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  ArrowUpRight,
  Check,
  CheckCircle,
  ClipboardList,
  Copy,
  Eye,
  FileText,
  LayoutGrid,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import {
  Button,
  Card,
  Modal,
  PageError,
  PageHeader,
  PageLoading,
  btnDanger,
  btnPrimary,
  btnSecondary,
  focusRing,
  inputClass,
} from "../components/ui";
import { isSimpleTemplateCategory } from "../../shared/template-validation";

type Component = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type?: string; text?: string; url?: string }>;
};
type Template = {
  id?: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components?: Component[] | null;
  synced_at?: string;
  quality_score?: string | null;
  quality_updated_at?: string | null;
  status_reason?: string | null;
  status_detail?: string | null;
  status_recommendation?: string | null;
  pending_category?: string | null;
  category_update_at?: number | null;
  requiresParameters: boolean;
  simpleEditorSupported?: boolean;
  simpleSendSupported?: boolean;
  source?: "meta" | "draft";
};
type Tab = "meta" | "flows" | "forms" | "projects";
type CreatedFlow = { id: string };

const categoryLabel = (value: string) =>
  value === "UTILITY"
    ? "UTILIDADE"
    : value === "AUTHENTICATION"
      ? "AUTENTICACAO"
      : value;
const bodyText = (template: Template) =>
  template.components?.find((item) => item.type === "BODY")?.text ||
  "Sem conteúdo";
const fillPreview = (text: string) =>
  ["Joao", "19:00", "01/12", "R$ 99,90", "#12345"].reduce(
    (value, replacement, index) =>
      value.replaceAll(`{{${index + 1}}}`, replacement),
    text,
  );
const selectionKey = (template: Template) =>
  template.source === "draft" && template.id
    ? `draft:${template.id}`
    : `meta:${template.name}:${template.language}`;
const attentionStatuses = new Set([
  "REJECTED",
  "FLAGGED",
  "PAUSED",
  "DISABLED",
  "LOCKED",
  "LIMIT_EXCEEDED",
  "DELETED",
  "PENDING_DELETION",
]);
const templateDiagnostic = (template: Template) => {
  if (template.status === "APPROVED") return null;
  if (template.status_detail) return template.status_detail;
  if (template.status_reason)
    return `Motivo informado pela Meta: ${template.status_reason}.`;
  const fallback: Record<string, string> = {
    REJECTED: "A Meta rejeitou este template. Revise o conteúdo antes de reenviá-lo para análise.",
    FLAGGED: "A qualidade deste template está em risco. Revise o conteúdo e o público antes de novos envios.",
    PAUSED: "A Meta pausou este template. Novos envios estão bloqueados até a reativação oficial.",
    DISABLED: "A Meta desativou este template. Ele não pode ser enviado.",
    LOCKED: "A Meta bloqueou a edição deste template.",
    LIMIT_EXCEEDED: "O limite de templates da conta foi atingido.",
    DELETED: "Este template foi excluído na Meta.",
    PENDING_DELETION: "A exclusão deste template está em processamento na Meta.",
    ARCHIVED: "Este template foi arquivado por inatividade e não está disponível para envio.",
  };
  return fallback[template.status] ?? null;
};

export default function Templates() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab");
  const [activeTab, setActiveTabState] = useState<Tab>(
    requestedTab === "flows" ||
      requestedTab === "forms" ||
      requestedTab === "projects"
      ? requestedTab
      : "meta",
  );
  const setActiveTab = (tab: Tab) => {
    setActiveTabState(tab);
    setParams(tab === "meta" ? {} : { tab }, { replace: true });
  };
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("APPROVED");
  const [hovered, setHovered] = useState<Template | null>(null);
  const [selected, setSelected] = useState<Template | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const quickCreateFlow = useMutation({
    mutationFn: () => {
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      return api<CreatedFlow>("/api/flows", {
        method: "POST",
        body: JSON.stringify({ name: `flow_${stamp}` }),
      });
    },
    onSuccess: (flow) => {
      qc.invalidateQueries({ queryKey: ["flows"] });
      navigate(`/flows/builder/${flow.id}`);
    },
  });
  const query = useQuery({
    queryKey: ["templates"],
    queryFn: () => api<{ items: Template[] }>("/api/templates"),
  });
  const sync = useMutation({
    mutationFn: () =>
      api<{ synced: number }>("/api/templates/sync", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
  const clone = useMutation({
    mutationFn: (name: string) =>
      api<{ id: string }>(`/api/templates/${encodeURIComponent(name)}/clone`, {
        method: "POST",
      }),
    onSuccess: (draft) => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      navigate(`/templates/drafts/${draft.id}`);
    },
  });
  const remove = useMutation({
    mutationFn: (template: Template) =>
      api<{ ok: true }>(
        template.source === "draft" && template.id
          ? `/api/templates/drafts/${template.id}`
          : `/api/templates/${encodeURIComponent(template.name)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      setDeleteTarget(null);
    },
  });
  const bulkRemove = useMutation({
    mutationFn: async (templates: Template[]) => {
      for (const template of templates) {
        await api<{ ok: true }>(
          template.source === "draft" && template.id
            ? `/api/templates/drafts/${template.id}`
            : `/api/templates/${encodeURIComponent(template.name)}`,
          { method: "DELETE" },
        );
      }
      return templates.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      setSelectedKeys(new Set());
      setShowBulkDelete(false);
    },
  });
  const all = query.data?.items ?? [];
  const counts = useMemo(
    () => ({
      APPROVED: all.filter((t) => t.status === "APPROVED").length,
      PENDING: all.filter((t) => ["PENDING", "IN_APPEAL"].includes(t.status))
        .length,
      REJECTED: all.filter((t) => t.status === "REJECTED").length,
      ATTENTION: all.filter((t) => attentionStatuses.has(t.status)).length,
      DRAFT: all.filter((template) => template.source === "draft").length,
      ALL: all.length,
    }),
    [all],
  );
  const items = useMemo(
    () =>
      all.filter(
        (template) =>
          (category === "ALL" ||
            categoryLabel(template.category) === category) &&
          (status === "ALL" ||
            template.status === status ||
            (status === "PENDING" && template.status === "IN_APPEAL") ||
            (status === "ATTENTION" && attentionStatuses.has(template.status))) &&
          template.name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [all, category, status, search],
  );
  const selectedItems = all.filter((template) =>
    selectedKeys.has(selectionKey(template)),
  );
  const allVisibleSelected =
    items.length > 0 &&
    items.every((template) => selectedKeys.has(selectionKey(template)));
  const toggleTemplate = (template: Template) => {
    const key = selectionKey(template);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleAllVisible = () => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      for (const template of items) {
        const key = selectionKey(template);
        if (allVisibleSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  };
  return (
    <div className="space-y-8 pb-20">
      <PageHeader
        title="Templates"
        subtitle={
          activeTab === "meta"
            ? "Gerencie templates e rascunhos."
            : activeTab === "flows"
              ? "Crie e monitore MiniApps do WhatsApp, e mapeie respostas para campos do SmartZap."
              : activeTab === "forms"
                ? "Crie formulários públicos para captar contatos e tags automaticamente."
                : "Gerencie templates e rascunhos."
        }
        action={
          activeTab === "meta" ? (
            <div className="flex gap-2">
              <button
                className="inline-flex h-9 min-w-40 items-center justify-center rounded-[10px] border border-primary-700 bg-primary-700 px-4 py-2 text-sm font-medium text-white hover:border-primary-600 hover:bg-primary-600"
                onClick={() => navigate("/templates/drafts/new")}
              >
                <Plus size={16} /> Criar template
              </button>
              <button
                className="inline-flex h-9 min-w-40 items-center justify-center rounded-[10px] border border-[#262626] bg-black px-4 py-2 text-sm font-medium"
                disabled={sync.isPending}
                onClick={() => sync.mutate()}
              >
                <RefreshCw
                  size={16}
                  className={sync.isPending ? "animate-spin" : ""}
                />
                {sync.isPending ? "Sincronizando..." : "Sincronizar"}
              </button>
            </div>
          ) : activeTab === "flows" ? (
            <div className="flex gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-primary-700 px-4 py-2 text-sm font-medium text-white hover:bg-primary-800"
                disabled={quickCreateFlow.isPending}
                onClick={() => quickCreateFlow.mutate()}
              >
                <Plus size={16} />
                {quickCreateFlow.isPending ? "Criando..." : "Criar MiniApp"}
              </button>
              <button
                onClick={() => navigate("/submissions")}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm"
              >
                <ClipboardList size={16} /> Ver Submissões
              </button>
            </div>
          ) : activeTab === "forms" ? (
            <div className="flex gap-2">
              <button
                onClick={() => navigate("/submissions")}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm"
              >
                <ClipboardList size={16} /> Ver respostas
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-primary-700 px-4 py-2 text-sm font-medium text-white hover:bg-primary-800"
                onClick={() => setShowForm(true)}
              >
                <Plus size={16} /> Criar formulário
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-primary-700 px-4 py-2 text-sm font-medium text-white hover:bg-primary-800"
                onClick={() => navigate("/templates/new")}
              >
                <Plus size={16} /> Novo Projeto
              </button>
              <button
                disabled={sync.isPending}
                onClick={() => sync.mutate()}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={sync.isPending ? "animate-spin" : ""}
                />{" "}
                {sync.isPending ? "Sincronizando..." : "Sincronizar"}
              </button>
            </div>
          )
        }
      />
      <div className="!mt-8 flex flex-wrap gap-2">
        {(
          [
            ["meta", CheckCircle, "Meta (Templates)", false],
            ["flows", Workflow, "MiniApps", true],
            ["forms", FileText, "Forms", true],
            ["projects", LayoutGrid, "Projetos (Fábrica)", true],
          ] as const
        ).map(([id, Icon, label, beta]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${activeTab === id ? "border-emerald-400/40 bg-emerald-500/10 text-[var(--ds-status-success-text)]" : "border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]"}`}
          >
            <Icon size={16} />
            {label}
            {beta && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/20 px-1 py-px text-[8px] font-semibold uppercase tracking-wider text-[var(--ds-status-success-text)]">
                beta
              </span>
            )}
          </button>
        ))}
      </div>
      {activeTab === "meta" ? (
        <>
          {sync.error && <PageError message={sync.error.message} />}
          {query.error && (
            <PageError
              message={query.error.message}
              onRetry={() => query.refetch()}
            />
          )}
          {query.isLoading && <PageLoading label="Carregando templates…" />}
          {!query.isLoading && !query.error && (
            <>
              <Card className="grid gap-4 p-6 xl:grid-cols-[auto_minmax(0,1fr)_18rem] xl:items-center">
                <div className="flex flex-wrap gap-2">
                  {["ALL", "MARKETING", "UTILIDADE", "AUTENTICACAO"].map(
                    (value) => (
                      <button
                        key={value}
                        onClick={() => setCategory(value)}
                        className={`whitespace-nowrap rounded-full border px-3 py-1 text-[10px] uppercase tracking-widest ${category === value ? "border-emerald-400/40 bg-emerald-500/10 text-[var(--ds-status-success-text)]" : "border-[var(--ds-border-default)] text-zinc-400"}`}
                      >
                        {value === "ALL" ? "TODOS" : value}
                      </button>
                    ),
                  )}
                </div>
                <div className="flex min-w-0 flex-wrap gap-2">
                  {(
                    [
                      ["APPROVED", "Aprovados"],
                      ["PENDING", "Em análise"],
                      ["REJECTED", "Rejeitados"],
                      ["ATTENTION", "Exigem atenção"],
                      ["DRAFT", "Rascunhos"],
                      ["ALL", "Todos"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setStatus(value)}
                      className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${status === value ? "border-emerald-400/40 bg-emerald-500/10 text-[var(--ds-status-success-text)]" : "border-[var(--ds-border-default)] text-zinc-400"}`}
                    >
                      {label} ({counts[value]})
                    </button>
                  ))}
                </div>
                <label className="flex min-w-0 items-center gap-3 rounded-[14px] border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-3 xl:w-72">
                  <Search size={16} className="shrink-0 text-zinc-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar templates..."
                    aria-label="Buscar templates"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--ds-text-muted)]"
                  />
                </label>
              </Card>
              <Card className="hidden overflow-hidden lg:block">
                {selectedItems.length > 0 && (
                  <div className="flex items-center justify-between gap-4 border-b border-[var(--ds-border-default)] bg-emerald-500/5 px-5 py-3">
                    <span className="text-sm text-emerald-200">
                      {selectedItems.length} template
                      {selectedItems.length === 1
                        ? " selecionado"
                        : "s selecionados"}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={btnSecondary}
                        onClick={() => setSelectedKeys(new Set())}
                      >
                        Limpar seleção
                      </button>
                      <button
                        type="button"
                        className={btnDanger}
                        onClick={() => setShowBulkDelete(true)}
                      >
                        <Trash2 size={15} /> Excluir selecionados
                      </button>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                      <tr>
                        <th className="w-10 px-4 py-4">
                          <button
                            type="button"
                            onClick={toggleAllVisible}
                            aria-pressed={allVisibleSelected}
                            aria-label="Selecionar todos os templates"
                            className={`flex h-5 w-5 items-center justify-center rounded border ${allVisibleSelected ? "border-emerald-400 bg-emerald-500 text-zinc-950" : "border-[var(--ds-border-default)]"}`}
                          >
                            {allVisibleSelected && <Check size={14} />}
                          </button>
                        </th>
                        <th className="w-44 px-4 py-4 font-medium">Nome</th>
                        <th className="w-20 px-2 py-4 font-medium">Status</th>
                        <th className="w-24 px-2 py-4 font-medium">
                          Categoria
                        </th>
                        <th className="px-3 py-4 font-medium">Conteúdo</th>
                        <th className="w-24 px-2 py-4 font-medium">
                          Atualizado
                        </th>
                        <th className="w-32 px-2 py-4 text-right font-medium">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--ds-border-default)]">
                      {items.map((template) => (
                        <TemplateRow
                          key={`${template.name}:${template.language}`}
                          template={template}
                          onHover={setHovered}
                          onView={setSelected}
                          onDelete={setDeleteTarget}
                          selected={selectedKeys.has(selectionKey(template))}
                          onToggle={() => toggleTemplate(template)}
                          onClone={() =>
                            template.source === "draft" && template.id
                              ? navigate(`/templates/drafts/${template.id}`)
                              : clone.mutate(template.name)
                          }
                          onCampaign={() =>
                            navigate(
                              `/campaigns/new?templateName=${encodeURIComponent(template.name)}`,
                            )
                          }
                        />
                      ))}
                      {!items.length && (
                        <tr>
                          <td colSpan={7}>
                            <Empty />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
              <div className="space-y-3 lg:hidden">
                {items.map((template) => (
                  <TemplateCard
                    key={`${template.name}:${template.language}`}
                    template={template}
                    onView={setSelected}
                    onDelete={setDeleteTarget}
                    selected={selectedKeys.has(selectionKey(template))}
                    onToggle={() => toggleTemplate(template)}
                    onClone={() =>
                      template.source === "draft" && template.id
                        ? navigate(`/templates/drafts/${template.id}`)
                        : clone.mutate(template.name)
                    }
                    onCampaign={() =>
                      navigate(
                        `/campaigns/new?templateName=${encodeURIComponent(template.name)}`,
                      )
                    }
                  />
                ))}
                {!items.length && <Empty />}
              </div>
            </>
          )}
          {hovered && <HoverPreview template={hovered} />}
          {selected && (
            <DetailsModal
              template={selected}
              onClose={() => setSelected(null)}
              onCampaign={() =>
                navigate(
                  `/campaigns/new?templateName=${encodeURIComponent(selected.name)}`,
                )
              }
            />
          )}
          {deleteTarget && (
            <DeleteModal
              template={deleteTarget}
              onClose={() => setDeleteTarget(null)}
              onConfirm={() => remove.mutate(deleteTarget)}
              pending={remove.isPending}
              error={remove.error?.message}
            />
          )}
          {showBulkDelete && (
            <BulkDeleteModal
              count={selectedItems.length}
              pending={bulkRemove.isPending}
              error={bulkRemove.error?.message}
              onClose={() => setShowBulkDelete(false)}
              onConfirm={() => bulkRemove.mutate(selectedItems)}
            />
          )}
        </>
      ) : activeTab === "flows" ? (
        <FlowsTab />
      ) : activeTab === "forms" ? (
        <FormsTab onCreate={() => setShowForm(true)} />
      ) : (
        <ProjectsTab onCreate={() => navigate("/templates/new")} />
      )}
      {showForm && <FormEditorFull onClose={() => setShowForm(false)} />}
    </div>
  );
}

function TemplateRow({
  template,
  onHover,
  onView,
  onDelete,
  onClone,
  onCampaign,
  selected,
  onToggle,
}: {
  template: Template;
  onHover: (t: Template | null) => void;
  onView: (t: Template) => void;
  onDelete: (t: Template) => void;
  onClone: () => void;
  onCampaign: () => void;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <tr
      onMouseEnter={() => onHover(template)}
      onMouseLeave={() => onHover(null)}
      className="group cursor-pointer transition-colors hover:bg-[var(--ds-bg-hover)]"
    >
      <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={selected}
          aria-label={`Selecionar ${template.name}`}
          className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-emerald-400 bg-emerald-500 text-zinc-950" : "border-[var(--ds-border-default)] hover:border-[var(--ds-border-strong)]"}`}
        >
          {selected && <Check size={14} />}
        </button>
      </td>
      <td className="px-4 py-4" onClick={() => onView(template)}>
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-[var(--ds-bg-elevated)] p-2 text-[var(--ds-text-secondary)] transition-colors group-hover:text-emerald-200">
            <FileText size={16} />
          </span>
          <span className="max-w-50 truncate font-medium text-[var(--ds-text-primary)] transition-colors group-hover:text-emerald-200">
            {template.name}
          </span>
        </div>
      </td>
      <td className="px-2 py-4" onClick={() => onView(template)}>
        <Status status={template.status} diagnostic={templateDiagnostic(template)} />
      </td>
      <td className="px-2 py-4" onClick={() => onView(template)}>
        <Category value={template.category} />
      </td>
      <td className="px-3 py-4" onClick={() => onView(template)}>
        <p className="truncate text-sm text-[var(--ds-text-secondary)]">
          {bodyText(template)}
        </p>
      </td>
      <td
        className="whitespace-nowrap px-2 py-4 font-mono text-xs text-[var(--ds-text-muted)]"
        onClick={() => onView(template)}
      >
        {new Date(template.synced_at || Date.now()).toLocaleDateString("pt-BR")}
      </td>
      <td
        className="px-2 py-4 text-right"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-end gap-1">
          <IconButton label="Ver detalhes" onClick={() => onView(template)}>
            <Eye size={16} />
          </IconButton>
          {isSimpleTemplateCategory(template.category) && (
            <IconButton
              label={template.source === "draft" ? "Editar rascunho" : "Clonar"}
              onClick={onClone}
            >
              <Copy size={16} />
            </IconButton>
          )}
          {template.status === "APPROVED" && template.simpleSendSupported === true && (
            <IconButton label="Criar campanha" onClick={onCampaign}>
              <Megaphone size={16} />
            </IconButton>
          )}
          <IconButton
            label="Excluir"
            destructive
            onClick={() => onDelete(template)}
          >
            <Trash2 size={16} />
          </IconButton>
        </div>
      </td>
    </tr>
  );
}
function TemplateCard({
  template,
  onView,
  onDelete,
  onClone,
  onCampaign,
  selected,
  onToggle,
}: {
  template: Template;
  onView: (t: Template) => void;
  onDelete: (t: Template) => void;
  onClone: () => void;
  onCampaign: () => void;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={selected}
          aria-label={`Selecionar ${template.name}`}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? "border-emerald-400 bg-emerald-500 text-zinc-950" : "border-[var(--ds-border-default)] hover:border-[var(--ds-border-strong)]"}`}
        >
          {selected && <Check size={14} />}
        </button>
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => onView(template)}
        >
          <span className="flex items-center gap-2">
            <FileText
              size={14}
              className="shrink-0 text-[var(--ds-text-secondary)]"
            />
            <span className="block truncate font-medium">{template.name}</span>
          </span>
          <span className="mt-1 flex items-center gap-2 text-xs">
            <Category compact value={template.category} />
            <span className="font-mono text-[var(--ds-text-muted)]">
              {template.language}
            </span>
          </span>
        </button>
        <Status status={template.status} diagnostic={templateDiagnostic(template)} />
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-[var(--ds-text-secondary)]">
        {bodyText(template)}
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--ds-border-subtle)] pt-3">
        <span className="font-mono text-xs text-[var(--ds-text-muted)]">
          {new Date(template.synced_at || Date.now()).toLocaleDateString(
            "pt-BR",
          )}
        </span>
        <div className="flex items-center gap-1">
          <IconButton label="Ver detalhes" onClick={() => onView(template)}>
            <Eye size={16} />
          </IconButton>
          {isSimpleTemplateCategory(template.category) && (
            <IconButton
              label={template.source === "draft" ? "Editar rascunho" : "Clonar"}
              onClick={onClone}
            >
              <Copy size={16} />
            </IconButton>
          )}
          {template.status === "APPROVED" && template.simpleSendSupported === true && (
            <IconButton label="Criar campanha" onClick={onCampaign}>
              <Megaphone size={16} />
            </IconButton>
          )}
          <IconButton
            label="Excluir"
            destructive
            onClick={() => onDelete(template)}
          >
            <Trash2 size={16} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
function Status({
  status,
  diagnostic,
}: {
  status: string;
  diagnostic?: string | null;
}) {
  const ok = status === "APPROVED";
  const rejected = ["REJECTED", "DISABLED", "DELETED", "PENDING_DELETION"].includes(status);
  const labels: Record<string, string> = {
    APPROVED: "Aprovado",
    PENDING: "Em análise",
    IN_APPEAL: "Em recurso",
    REJECTED: "Rejeitado",
    FLAGGED: "Em risco",
    PAUSED: "Pausado",
    DISABLED: "Desativado",
    LOCKED: "Bloqueado",
    LIMIT_EXCEEDED: "Limite atingido",
    ARCHIVED: "Arquivado",
    UNARCHIVED: "Reativado",
    DELETED: "Excluído",
    PENDING_DELETION: "Exclusão pendente",
    DRAFT: "Rascunho",
  };
  return (
    <span
      title={diagnostic ?? undefined}
      className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-px text-[10px] font-medium ${ok ? "bg-emerald-500/10 text-[var(--ds-status-success-text)]" : rejected ? "bg-red-500/10 text-[var(--ds-status-error-text)]" : "bg-amber-500/10 text-[var(--ds-status-warning-text)]"}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : rejected ? "bg-red-400" : "bg-amber-400"}`}
      />
      {labels[status] ?? status}
    </span>
  );
}
function Category({
  value,
  compact = false,
}: {
  value: string;
  compact?: boolean;
}) {
  const label = categoryLabel(value);
  return (
    <span
      className={`inline-flex w-fit items-center border font-medium ${compact ? "rounded px-1.5 py-0.5 text-xs" : "rounded-md px-2 py-1 text-xs"} ${label === "MARKETING" ? "border-amber-500/20 bg-amber-500/10 text-[var(--ds-status-warning-text)]" : label === "UTILIDADE" ? "border-emerald-500/20 bg-emerald-500/10 text-[var(--ds-status-success-text)]" : "border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)]"}`}
    >
      {label}
    </span>
  );
}
function IconButton({
  label,
  onClick,
  children,
  destructive = false,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ${destructive ? "text-zinc-400 hover:bg-red-500/10 hover:text-red-400" : "text-[var(--ds-text-primary)] hover:bg-zinc-800"} ${focusRing}`}
    >
      {children}
    </button>
  );
}
function Empty() {
  return (
    <p className="px-6 py-12 text-center text-sm text-zinc-500">
      Nenhum template corresponde aos filtros.
    </p>
  );
}
function HoverPreview({ template }: { template: Template }) {
  const buttons =
    template.components?.find((item) => item.type === "BUTTONS")?.buttons ?? [];
  return (
    <div className="pointer-events-none fixed right-96 top-52 z-40 hidden w-90 xl:block">
      <div className="overflow-hidden rounded-2xl border border-[var(--ds-border-subtle)] bg-zinc-950 p-6 shadow-2xl shadow-black/50 ring-1 ring-white/10">
        <div className="text-[15px] leading-7 text-[var(--ds-text-secondary)]">
          {fillPreview(bodyText(template))}
        </div>
        {buttons.length > 0 && (
          <div className="mt-6 grid gap-2">
            {buttons.map((button, index) => (
              <div
                key={index}
                className="flex w-full max-w-full items-center justify-between gap-3 overflow-hidden rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[var(--ds-text-primary)]">
                    {button.text}
                  </div>
                  {button.url && (
                    <div className="mt-1 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[var(--ds-text-muted)]">
                      {button.url}
                    </div>
                  )}
                </div>
                <ArrowUpRight
                  size={16}
                  className="shrink-0 text-primary-300 opacity-80"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function DetailsModal({
  template,
  onClose,
  onCampaign,
}: {
  template: Template;
  onClose: () => void;
  onCampaign: () => void;
}) {
  return (
    <Modal
      titleId="template-details-title"
      onClose={onClose}
      panelClassName="max-w-2xl"
    >
      <div className="flex items-start justify-between">
        <div>
          <h2 id="template-details-title" className="text-lg font-semibold">
            {template.name}
          </h2>
          <div className="mt-2 flex gap-2">
            <Status status={template.status} diagnostic={templateDiagnostic(template)} />
            <Category value={template.category} />
            <span className="text-xs text-zinc-500">{template.language}</span>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-zinc-500">
          <X size={18} />
        </button>
      </div>
      {(templateDiagnostic(template) || template.pending_category || template.quality_score) && (
        <div className="mt-5 space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm">
          {templateDiagnostic(template) && (
            <p className="text-amber-100">{templateDiagnostic(template)}</p>
          )}
          {template.status_recommendation && (
            <p className="text-[var(--ds-text-secondary)]">
              <strong className="text-[var(--ds-text-primary)]">Como corrigir:</strong>{" "}
              {template.status_recommendation}
            </p>
          )}
          {template.pending_category && (
            <p className="text-[var(--ds-text-secondary)]">
              A Meta programou a mudança de categoria para{" "}
              <strong className="text-[var(--ds-text-primary)]">
                {categoryLabel(template.pending_category)}
              </strong>
              {template.category_update_at
                ? ` em ${new Date(template.category_update_at * 1000).toLocaleString("pt-BR")}`
                : ""}.
            </p>
          )}
          {template.quality_score && (
            <p className="text-[var(--ds-text-secondary)]">
              Qualidade informada pela Meta:{" "}
              <strong className="text-[var(--ds-text-primary)]">{template.quality_score}</strong>.
            </p>
          )}
        </div>
      )}
      <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
          {fillPreview(bodyText(template))}
        </p>
        {template.components
          ?.find((item) => item.type === "BUTTONS")
          ?.buttons?.map((button, i) => (
            <div
              key={i}
              className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm"
            >
              {button.text}
            </div>
          ))}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        {template.simpleSendSupported !== true && (
          <p className="mr-auto max-w-sm text-xs text-amber-300">
            {!isSimpleTemplateCategory(template.category)
              ? "Somente leitura: Autenticação exige o fluxo especializado de OTP da Meta."
              : "Envio indisponível: este modelo exige mídia, OTP, Flow ou outro componente fora do envio simples."}
          </p>
        )}
        <button className={btnSecondary} onClick={onClose}>
          Fechar
        </button>
        {template.status === "APPROVED" && template.simpleSendSupported === true && (
          <button className={btnPrimary} onClick={onCampaign}>
            <Megaphone size={15} /> Criar campanha
          </button>
        )}
      </div>
    </Modal>
  );
}
function DeleteModal({
  template,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  template: Template;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  error?: string;
}) {
  return (
    <Modal
      titleId="delete-template-title"
      onClose={onClose}
      closeDisabled={pending}
    >
      <h2 id="delete-template-title" className="text-lg font-semibold">
        Excluir template
      </h2>
      <p className="mt-2 text-sm text-zinc-400">
        Confirma a exclusão de{" "}
        <strong className="text-zinc-200">{template.name}</strong> na Meta? Esta
        ação não pode ser desfeita.
      </p>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button className={btnSecondary} onClick={onClose}>
          Cancelar
        </button>
        <button className={btnDanger} disabled={pending} onClick={onConfirm}>
          {pending ? "Excluindo…" : "Excluir template"}
        </button>
      </div>
    </Modal>
  );
}
function BulkDeleteModal({
  count,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  count: number;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  error?: string;
}) {
  return (
    <Modal
      titleId="bulk-delete-template-title"
      onClose={onClose}
      closeDisabled={pending}
    >
      <h2 id="bulk-delete-template-title" className="text-lg font-semibold">
        Excluir templates selecionados
      </h2>
      <p className="mt-2 text-sm text-zinc-400">
        Confirma a exclusão de{" "}
        <strong className="text-zinc-200">{count}</strong>{" "}
        {count === 1 ? "template" : "templates"}? Os itens publicados também
        serão removidos da Meta. Esta ação não pode ser desfeita.
      </p>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button className={btnSecondary} disabled={pending} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={btnDanger}
          disabled={pending || count === 0}
          onClick={onConfirm}
        >
          {pending ? "Excluindo…" : "Excluir selecionados"}
        </button>
      </div>
    </Modal>
  );
}
function ModulePlaceholder({ tab }: { tab: Exclude<Tab, "meta"> }) {
  const labels = {
    flows: "MiniApps",
    forms: "Forms",
    projects: "Projetos (Fábrica)",
  };
  return (
    <Card className="px-6 py-14 text-center">
      <p className="text-lg font-semibold">{labels[tab]}</p>
      <p className="mt-2 text-sm text-zinc-500">
        A composição original deste módulo será migrada nesta mesma etapa.
      </p>
    </Card>
  );
}

type FlowItem = {
  id: string;
  name: string;
  status: string;
  meta_id: string | null;
  updated_at: string;
};
function FlowsTab() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteFlow, setDeleteFlow] = useState<FlowItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const query = useQuery({
    queryKey: ["flows"],
    queryFn: () => api<{ items: FlowItem[] }>("/api/flows"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/flows/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["flows"] });
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setDeleteFlow(null);
    },
  });
  const bulkRemove = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await api(`/api/flows/${id}`, { method: "DELETE" });
      return ids.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flows"] });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    },
  });
  const all = query.data?.items ?? [];
  const items = all.filter(
    (f) =>
      (filter === "ALL" || f.status === filter) &&
      f.name.toLowerCase().includes(search.toLowerCase()),
  );
  const counts = (s: string) =>
    s === "ALL" ? all.length : all.filter((f) => f.status === s).length;
  const allVisibleSelected =
    items.length > 0 && items.every((flow) => selectedIds.has(flow.id));
  const toggleAll = () =>
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const flow of items) {
        if (allVisibleSelected) next.delete(flow.id);
        else next.add(flow.id);
      }
      return next;
    });
  return (
    <>
      {query.error && <PageError message={query.error.message} />}
      <Card className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-2 overflow-x-auto">
          {(
            [
              ["ALL", "Todos"],
              ["DRAFT", "Rascunho"],
              ["PUBLISHED", "Publicado"],
              ["IN_REVIEW", "Em revisão"],
              ["ACTION_REQUIRED", "Requer ação"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${filter === v ? "border-primary-500/40 bg-primary-500/10 text-primary-300" : "border-zinc-700 text-zinc-400"}`}
            >
              {l} ({counts(v)})
            </button>
          ))}
        </div>
        <div className="flex w-full items-center gap-2 md:w-auto">
          <label className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-zinc-700 px-4 py-3 md:w-72">
            <Search size={18} className="text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar MiniApps..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          {selectedIds.size > 0 && (
            <button
              type="button"
              className={btnDanger}
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 size={15} /> Excluir ({selectedIds.size})
            </button>
          )}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-950/40 text-xs uppercase tracking-widest text-zinc-500">
              <tr>
                <th className="w-10 px-4 py-4">
                  <button
                    type="button"
                    aria-label="Selecionar todos os MiniApps"
                    aria-pressed={allVisibleSelected}
                    disabled={items.length === 0}
                    onClick={toggleAll}
                    className={`flex h-5 w-5 items-center justify-center rounded border ${allVisibleSelected ? "border-emerald-400 bg-emerald-500 text-white" : "border-zinc-700"}`}
                  >
                    {allVisibleSelected && <Check size={14} />}
                  </button>
                </th>
                <th className="px-4 py-4 font-medium">Nome</th>
                <th className="px-4 py-4 font-medium">Status</th>
                <th className="px-4 py-4 font-medium">ID Meta</th>
                <th className="px-4 py-4 font-medium">Atualizado</th>
                <th className="px-4 py-4 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {query.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12">
                    <PageLoading />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12">
                    <Empty />
                  </td>
                </tr>
              ) : (
                items.map((flow) => (
                  <tr key={flow.id} className="group hover:bg-white/[.03]">
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        aria-label={`Selecionar ${flow.name}`}
                        aria-pressed={selectedIds.has(flow.id)}
                        onClick={() =>
                          setSelectedIds((current) => {
                            const next = new Set(current);
                            if (next.has(flow.id)) next.delete(flow.id);
                            else next.add(flow.id);
                            return next;
                          })
                        }
                        className={`flex h-5 w-5 items-center justify-center rounded border ${selectedIds.has(flow.id) ? "border-emerald-400 bg-emerald-500 text-white" : "border-zinc-700"}`}
                      >
                        {selectedIds.has(flow.id) && <Check size={14} />}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <span className="flex items-center gap-3">
                        <span className="rounded-lg bg-zinc-950/40 p-2 text-zinc-400">
                          <FileText size={15} />
                        </span>
                        <span className="max-w-50 truncate font-medium">
                          {flow.name}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-full bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400">
                        {flow.status === "DRAFT" ? "Rascunho" : flow.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-zinc-500">
                      {flow.meta_id || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-zinc-500">
                      {new Date(flow.updated_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-4">
                      <span className="flex items-center justify-end gap-1">
                        <IconButton
                          label="Ver"
                          onClick={() => navigate(`/flows/builder/${flow.id}`)}
                        >
                          <Eye size={15} />
                        </IconButton>
                        <IconButton
                          label="Excluir"
                          onClick={() => setDeleteFlow(flow)}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {deleteFlow && (
        <FlowDeleteModal
          title="Excluir MiniApp"
          description={`Confirma a exclusão de ${deleteFlow.name}? Esta ação não pode ser desfeita.`}
          count={1}
          pending={remove.isPending}
          error={remove.error?.message}
          onClose={() => setDeleteFlow(null)}
          onConfirm={() => remove.mutate(deleteFlow.id)}
        />
      )}
      {bulkDeleteOpen && (
        <FlowDeleteModal
          title="Excluir MiniApps selecionados"
          description={`Confirma a exclusão de ${selectedIds.size} MiniApp${selectedIds.size === 1 ? "" : "s"}? Esta ação não pode ser desfeita.`}
          count={selectedIds.size}
          pending={bulkRemove.isPending}
          error={bulkRemove.error?.message}
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={() => bulkRemove.mutate([...selectedIds])}
        />
      )}
    </>
  );
}

function FlowDeleteModal({
  title,
  description,
  count,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  count: number;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      titleId="delete-flow-title"
      onClose={onClose}
      closeDisabled={pending}
    >
      <h2 id="delete-flow-title" className="text-lg font-semibold">
        {title}
      </h2>
      <p className="mt-2 text-sm text-zinc-400">{description}</p>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button className={btnSecondary} disabled={pending} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={btnDanger}
          disabled={pending || count === 0}
          onClick={onConfirm}
        >
          {pending ? "Excluindo…" : "Excluir"}
        </button>
      </div>
    </Modal>
  );
}

type FormField = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select";
  required?: boolean;
  options?: string[];
};
type FormItem = {
  id: string;
  title: string;
  slug: string;
  tag_id?: string | null;
  tag_name?: string | null;
  active: boolean;
  collectEmail?: boolean;
  successMessage?: string;
  fields: FormField[];
  submission_count?: number;
};
export function FormsTab({ onCreate }: { onCreate: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<FormItem | null>(null);
  const query = useQuery({
    queryKey: ["forms"],
    queryFn: () => api<{ items: FormItem[] }>("/api/forms"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/forms/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forms"] }),
  });
  return (
    <>
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Seus formularios</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Copie o link e compartilhe com os alunos.
        </p>
        {query.isLoading ? (
          <PageLoading />
        ) : (
          <div className="mt-6 space-y-3">
            {query.data?.items.map((form) => {
              const link = `${location.origin}/f/${form.slug}`;
              return (
                <div
                  key={form.id}
                  className="flex flex-col gap-4 rounded-xl border border-zinc-900 bg-black/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {form.title}{" "}
                      <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-900">
                        {form.active ? "Ativo" : "Inativo"}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Slug: {form.slug} &nbsp;-&nbsp; Tag:{" "}
                      {form.tag_name || "—"}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">Link: {link}</p>
                    <p className="mt-2 text-xs text-zinc-400">
                      {form.submission_count || 0} resposta(s) recebida(s)
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={btnSecondary}
                      onClick={() =>
                        navigate(`/submissions?formId=${form.id}`)
                      }
                    >
                      <ClipboardList size={15} /> Ver respostas
                    </button>
                    <button
                      className={btnSecondary}
                      onClick={() => navigator.clipboard.writeText(link)}
                    >
                      Copiar link
                    </button>
                    <button
                      className={btnSecondary}
                      onClick={() => setEditing(form)}
                    >
                      <Pencil size={15} /> Editar
                    </button>
                    <button
                      className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white"
                      onClick={() => remove.mutate(form.id)}
                    >
                      Deletar
                    </button>
                  </div>
                </div>
              );
            })}
            {!query.data?.items.length && (
              <p className="text-sm text-zinc-500">Nenhum formulario ainda.</p>
            )}
          </div>
        )}
      </Card>
      {editing && (
        <FormEditorFull initial={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function FormEditor({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api("/api/forms", {
        method: "POST",
        body: JSON.stringify({
          title,
          slug,
          active: true,
          fields: [
            { key: "name", label: "Nome", required: true },
            { key: "phone", label: "WhatsApp", required: true },
          ],
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forms"] });
      onClose();
    },
  });
  return (
    <Modal titleId="form-editor-title" onClose={onClose}>
      <h2 id="form-editor-title" className="text-lg font-semibold">
        Criar formulário
      </h2>
      <p className="mt-1 text-sm text-zinc-400">
        Configure a página pública de captação.
      </p>
      <div className="mt-5 space-y-3">
        <label className="block text-xs text-zinc-400">
          Título
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSlug(
                e.target.value
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/(^-|-$)/g, ""),
              );
            }}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Slug
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        {create.error && (
          <p className="text-sm text-red-400">{create.error.message}</p>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button className={btnSecondary} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={btnPrimary}
          disabled={!title || !slug || create.isPending}
          onClick={() => create.mutate()}
        >
          Criar formulário
        </button>
      </div>
    </Modal>
  );
}

export function FormEditorFull({
  initial,
  onClose,
}: {
  initial?: FormItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const tags = useQuery({
    queryKey: ["contacts", "tags"],
    queryFn: () =>
      api<{ items: Array<{ id: string; name: string }> }>("/api/contacts/tags"),
  });
  const [title, setTitle] = useState(initial?.title || "");
  const [slug, setSlug] = useState(initial?.slug || "");
  const [tagId, setTagId] = useState(initial?.tag_id || "");
  const [newTagName, setNewTagName] = useState("");
  const [active, setActive] = useState(initial?.active ?? true);
  const [collectEmail, setCollectEmail] = useState(
    initial?.collectEmail ?? false,
  );
  const [successMessage, setSuccessMessage] = useState(
    initial?.successMessage || "",
  );
  const [fields, setFields] = useState<FormField[]>(initial?.fields || []);
  const createTag = useMutation({
    mutationFn: () =>
      api<{ id: string; name: string }>("/api/contacts/tags", {
        method: "POST",
        body: JSON.stringify({ name: newTagName.trim() }),
      }),
    onSuccess: (tag) => {
      setTagId(tag.id);
      setNewTagName("");
      qc.invalidateQueries({ queryKey: ["contacts", "tags"] });
    },
  });
  const save = useMutation({
    mutationFn: () =>
      api(initial ? `/api/forms/${initial.id}` : "/api/forms", {
        method: initial ? "PATCH" : "POST",
        body: JSON.stringify({
          title,
          slug,
          tagId: tagId || null,
          active,
          collectEmail,
          successMessage: successMessage || null,
          fields,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forms"] });
      onClose();
    },
  });
  const addField = () =>
    setFields((v) => [
      ...v,
      {
        key: `campo_${v.length + 1}`,
        label: "Novo campo",
        type: "text",
        required: false,
      },
    ]);
  return (
    <Modal
      titleId="full-form-editor-title"
      onClose={onClose}
      panelClassName="max-w-6xl"
    >
      <div className="flex items-start justify-between">
        <div>
          <h2 id="full-form-editor-title" className="text-lg font-semibold">
            {initial ? "Editar formulario" : "Criar formulario"}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Voce pode alterar nome, slug, tag, campos e mensagem de sucesso.
            Atencao: mudar o slug altera o link publico.
          </p>
        </div>
        <button onClick={onClose} className="p-2 text-zinc-500">
          <X size={18} />
        </button>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <label className="block text-xs text-zinc-300">
            Nome
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!initial)
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/(^-|-$)/g, ""),
                  );
              }}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="block text-xs text-zinc-300">
            Slug (URL)
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
            <span className="mt-1 block text-[11px] text-zinc-500">
              Link publico: {location.origin}/f/{slug}
            </span>
          </label>
          <div>
            <p className="text-xs text-zinc-300">Tag aplicada ao contato</p>
            <FormChoiceMenu
              value={tagId}
              allowClear
              placeholder="Selecionar tag existente…"
              options={(tags.data?.items || []).map((tag) => ({
                value: tag.id,
                label: tag.name,
              }))}
              onChange={setTagId}
            />
            <div className="mt-2 flex gap-2">
              <input
                aria-label="Nome da nova tag"
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
                placeholder="Ou crie uma tag agora"
                className={inputClass}
              />
              <button
                type="button"
                className={btnSecondary}
                disabled={!newTagName.trim() || createTag.isPending}
                onClick={() => createTag.mutate()}
              >
                <Plus size={15} /> {createTag.isPending ? "Criando…" : "Criar tag"}
              </button>
            </div>
            {createTag.error && (
              <p className="mt-2 text-xs text-red-400">
                {createTag.error.message}
              </p>
            )}
          </div>
          <Toggle
            label="Ativo"
            hint="Quando desligado, o link publico retorna 404."
            value={active}
            onChange={setActive}
          />
          <Toggle
            label="Coletar email"
            hint="Mostra o campo de email no formulario publico."
            value={collectEmail}
            onChange={setCollectEmail}
          />
          <label className="block text-xs text-zinc-300">
            Mensagem de sucesso (opcional)
            <textarea
              rows={3}
              value={successMessage}
              onChange={(e) => setSuccessMessage(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <div className="rounded-xl border border-zinc-800 p-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Campos do formulario</h3>
                <p className="text-[11px] text-zinc-500">
                  Adicione campos extras como curso, turma ou cidade.
                </p>
              </div>
              <button className={btnSecondary} onClick={addField}>
                Adicionar campo
              </button>
            </div>
            <div className="mt-3 rounded-xl border border-zinc-800 p-3 text-xs text-zinc-400">
              <p className="font-medium text-zinc-300">Campos padrao (fixos)</p>
              <p className="mt-1">Nome - obrigatorio</p>
              <p>Telefone (WhatsApp) - obrigatorio</p>
              {collectEmail && <p>Email - opcional</p>}
            </div>
            <div className="mt-3 space-y-3">
              {fields.map((field, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-zinc-800 p-3"
                >
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px]">
                    <input
                      aria-label={`Label do campo ${index + 1}`}
                      value={field.label}
                      onChange={(e) =>
                        setFields((v) =>
                          v.map((f, i) =>
                            i === index ? { ...f, label: e.target.value } : f,
                          ),
                        )
                      }
                      className={inputClass}
                    />
                    <input
                      aria-label={`Key do campo ${index + 1}`}
                      value={field.key}
                      onChange={(e) =>
                        setFields((v) =>
                          v.map((f, i) =>
                            i === index
                              ? {
                                  ...f,
                                  key: e.target.value.replace(
                                    /[^a-z0-9_]/g,
                                    "",
                                  ),
                                }
                              : f,
                          ),
                        )
                      }
                      className={inputClass}
                    />
                    <FormChoiceMenu
                      value={field.type || "text"}
                      options={[
                        { value: "text", label: "Texto" },
                        { value: "number", label: "Número" },
                        { value: "date", label: "Data" },
                        { value: "select", label: "Lista" },
                      ]}
                      onChange={(nextType) =>
                        setFields((v) =>
                          v.map((f, i) =>
                            i === index
                              ? {
                                  ...f,
                                  type: nextType as FormField["type"],
                                  options:
                                    nextType === "select"
                                      ? f.options?.length
                                        ? f.options
                                        : ["Opção 1", "Opção 2"]
                                      : f.options,
                                }
                              : f,
                          ),
                        )
                      }
                    />
                  </div>
                  {field.type === "select" && (
                    <label className="mt-3 block text-xs uppercase tracking-widest text-zinc-500">
                      Opções, uma por linha
                      <textarea
                        aria-label={`Opções do campo ${index + 1}`}
                        rows={3}
                        value={(field.options ?? []).join("\n")}
                        onChange={(e) =>
                          setFields((v) =>
                            v.map((f, i) =>
                              i === index
                                ? {
                                    ...f,
                                    options: e.target.value
                                      .split("\n")
                                      .map((option) => option.trim())
                                      .filter(Boolean),
                                  }
                                : f,
                            ),
                          )
                        }
                        className={`mt-2 ${inputClass}`}
                      />
                    </label>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={Boolean(field.required)}
                        onChange={(e) =>
                          setFields((v) =>
                            v.map((f, i) =>
                              i === index
                                ? { ...f, required: e.target.checked }
                                : f,
                            ),
                          )
                        }
                      />{" "}
                      Obrigatorio
                    </label>
                    <button
                      className="text-xs text-red-400"
                      onClick={() =>
                        setFields((v) => v.filter((_, i) => i !== index))
                      }
                    >
                      Remover campo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {save.error && (
            <p className="text-sm text-red-400">{save.error.message}</p>
          )}
          <div className="flex justify-end gap-2">
            <button className={btnSecondary} onClick={onClose}>
              Cancelar
            </button>
            <button
              className={btnPrimary}
              disabled={!title || !slug || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
        <FormPreview
          title={title}
          collectEmail={collectEmail}
          fields={fields}
        />
      </div>
    </Modal>
  );
}

function FormChoiceMenu({
  value,
  allowClear = false,
  placeholder = "Selecione…",
  options,
  onChange,
}: {
  value: string;
  allowClear?: boolean;
  placeholder?: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <div className="relative mt-1">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`${inputClass} flex items-center justify-between text-left`}
      >
        <span className={selected ? "text-white" : "text-zinc-500"}>
          {selected?.label || placeholder}
        </span>
        <span className={`text-zinc-500 transition ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-50 mt-2 max-h-56 w-full overflow-auto rounded-xl border border-zinc-700 bg-zinc-950 p-1.5 shadow-2xl"
        >
          {allowClear && value && (
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-800"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Sem tag
            </button>
          )}
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800 ${
                option.value === value
                  ? "bg-primary-500/10 text-primary-300"
                  : "text-zinc-200"
              }`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
              {option.value === value && <Check size={15} />}
            </button>
          ))}
          {!options.length && (
            <p className="px-3 py-2 text-sm text-zinc-500">
              Nenhuma opção disponível.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between rounded-xl border border-zinc-800 p-3 text-left"
    >
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-[11px] text-zinc-500">{hint}</span>
      </span>
      <span
        className={`relative h-5 w-9 rounded-full ${value ? "bg-primary-500" : "bg-zinc-700"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${value ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}
function FormPreview({
  title,
  collectEmail,
  fields,
}: {
  title: string;
  collectEmail: boolean;
  fields: FormField[];
}) {
  return (
    <div className="h-fit rounded-2xl border border-zinc-900 p-4">
      <h3 className="text-sm font-medium">Pre-visualizacao</h3>
      <p className="text-[11px] text-zinc-500">
        Assim vai aparecer para a pessoa que abrir o link publico.
      </p>
      <div className="mt-3 rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
        <h4 className="text-xl font-semibold">
          {title || "Nome do formulário"}
        </h4>
        <p className="mt-1 text-xs text-zinc-400">
          Preencha seus dados para ser adicionado automaticamente na lista.
        </p>
        <PreviewInput label="Nome" />
        <PreviewInput label="Telefone (WhatsApp)" />
        {collectEmail && <PreviewInput label="Email (opcional)" />}
        {fields.map((field, index) => (
          <PreviewInput
            key={index}
            label={`${field.label}${field.required ? " *" : ""}`}
            type={field.type}
            options={field.options}
          />
        ))}
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-zinc-700 p-3 text-xs text-zinc-400">
          <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border border-zinc-500" />
          Aceito receber mensagens deste negócio pelo WhatsApp após enviar este formulário.
        </div>
        <button
          disabled
          className="mt-4 w-full rounded-xl bg-zinc-400 py-2 text-sm text-zinc-900"
        >
          Enviar (preview)
        </button>
      </div>
    </div>
  );
}
function PreviewInput({
  label,
  type = "text",
  options = [],
}: {
  label: string;
  type?: FormField["type"];
  options?: string[];
}) {
  return (
    <label className="mt-4 block text-sm">
      {label}
      {type === "select" ? (
        <select
          disabled
          className="mt-1 block h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950/30 px-3 text-zinc-400"
        >
          <option>Selecione...</option>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <span className="mt-1 block h-10 rounded-xl border border-zinc-700 bg-zinc-950/30" />
      )}
    </label>
  );
}

type ProjectItem = {
  id: string;
  title: string;
  strategy: "marketing" | "utility" | "bypass";
  template_count: number;
  approved_count: number;
  status: string;
  created_at: string;
  updated_at: string;
};
function ProjectsTab({ onCreate }: { onCreate: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<ProjectItem | null>(null);
  const [operationError, setOperationError] = useState("");
  const query = useQuery({
    queryKey: ["template-projects"],
    queryFn: () => api<{ items: ProjectItem[] }>("/api/template-projects"),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/api/template-projects/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["template-projects"] });
      setDeleting(null);
      setOperationError("");
    },
    onError: (error) => setOperationError(error.message),
  });
  const items = (query.data?.items ?? []).filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <label className="flex w-full items-center gap-3 rounded-xl border border-zinc-700 px-4 py-3 sm:max-w-96">
          <Search size={18} className="text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar projetos..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => query.refetch()}
          aria-label="Atualizar projetos"
          className="rounded-lg border border-zinc-700 p-2.5"
        >
          <RefreshCw size={18} />
        </button>
      </Card>
      {query.error && <PageError message={query.error.message} />}
      {operationError && <PageError message={operationError} />}
      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[minmax(220px,1.3fr)_130px_150px_90px_180px_130px_100px] gap-4 border-b border-zinc-800 px-6 py-4 text-xs uppercase tracking-widest text-zinc-500 lg:grid">
          <span>Nome</span>
          <span>Tipo</span>
          <span>Status</span>
          <span>Templates</span>
          <span>Progresso</span>
          <span>Criado em</span>
          <span className="text-right">Ações</span>
        </div>
        {query.isLoading ? (
          <PageLoading />
        ) : (
          <div className="divide-y divide-zinc-800">
            {items.map((p) => {
              const percent = p.template_count
                ? Math.round((p.approved_count / p.template_count) * 100)
                : 0;
              return (
                <div key={p.id}>
                  <div className="hidden min-h-[64px] grid-cols-[minmax(220px,1.3fr)_130px_150px_90px_180px_130px_100px] items-center gap-4 px-6 text-sm lg:grid">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="rounded-lg bg-primary-950 p-2 text-primary-400">
                      <LayoutGrid size={15} />
                    </span>
                    <span className="truncate">{p.title}</span>
                  </span>
                  <span className="w-fit rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
                    {p.strategy === "marketing"
                      ? "Marketing"
                      : p.strategy === "utility"
                        ? "Utilidade"
                        : "Camuflado"}
                  </span>
                  <span className="w-fit rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
                    {p.status === "completed" ? "Concluído" : p.status === "active" ? "Em andamento" : "Rascunho"}
                  </span>
                  <span className="text-center text-zinc-400">
                    {p.template_count}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800">
                      <span
                        className="block h-full bg-primary-500"
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                    <span className="text-xs text-zinc-400">{percent}%</span>
                  </span>
                  <span className="text-xs text-zinc-500">
                    {new Date(p.created_at).toLocaleDateString("pt-BR")}
                  </span>
                  <span className="flex justify-end">
                    <IconButton
                      label="Editar"
                      onClick={() => navigate(`/templates/${p.id}`)}
                    >
                      <Pencil size={15} />
                    </IconButton>
                    <IconButton
                      label="Excluir"
                      onClick={() => setDeleting(p)}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </span>
                  </div>
                  <div className="space-y-4 p-4 lg:hidden">
                    <div className="flex items-start gap-3">
                      <span className="rounded-lg bg-primary-950 p-2 text-primary-400"><LayoutGrid size={16} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold">{p.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">Atualizado em {new Date(p.updated_at || p.created_at).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <IconButton label="Editar" onClick={() => navigate(`/templates/${p.id}`)}><Pencil size={15} /></IconButton>
                      <IconButton label="Excluir" onClick={() => setDeleting(p)}><Trash2 size={15} /></IconButton>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-400">{p.strategy === "marketing" ? "Marketing" : p.strategy === "utility" ? "Utilidade" : "Legado"}</span>
                      <span className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-300">{p.status === "completed" ? "Concluído" : p.status === "active" ? "Em andamento" : "Rascunho"}</span>
                      <span className="text-zinc-400">{p.template_count} template(s)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800"><span className="block h-full bg-primary-500" style={{ width: `${percent}%` }} /></span>
                      <span className="text-xs text-zinc-400">{percent}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {!items.length && (
              <div className="py-12 text-center">
                <p className="text-sm text-zinc-500">Nenhum projeto criado.</p>
                <button className={`mt-3 ${btnPrimary}`} onClick={onCreate}>
                  Criar projeto
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
      {deleting && (
        <Modal titleId="delete-template-project-title" onClose={() => setDeleting(null)}>
          <h2 id="delete-template-project-title" className="text-lg font-semibold">Excluir projeto?</h2>
          <p className="mt-2 text-sm text-zinc-400">
            O projeto <strong className="text-white">{deleting.title}</strong> e seus rascunhos locais serão removidos. Projetos com templates publicados na Meta são protegidos e não podem ser excluídos aqui.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button className={btnSecondary} onClick={() => setDeleting(null)}>Cancelar</button>
            <button className={btnDanger} disabled={remove.isPending} onClick={() => remove.mutate(deleting.id)}>
              <Trash2 size={15} /> {remove.isPending ? "Excluindo…" : "Excluir projeto"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function ProjectEditor({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [strategy, setStrategy] = useState<"marketing" | "utility">("marketing");
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/template-projects", {
        method: "POST",
        body: JSON.stringify({ title, strategy }),
      }),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["template-projects"] });
      onClose();
      navigate(`/templates/${project.id}`);
    },
  });
  return (
    <Modal titleId="project-editor-title" onClose={onClose}>
      <h2 id="project-editor-title" className="text-lg font-semibold">
        Novo Projeto
      </h2>
      <p className="mt-1 text-sm text-zinc-400">
        Crie uma fábrica organizada de templates.
      </p>
      <label className="mt-5 block text-xs text-zinc-400">
        Nome
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <label className="mt-3 block text-xs text-zinc-400">
        Tipo
        <select
          value={strategy}
          onChange={(e) =>
            setStrategy(e.target.value as "marketing" | "utility")
          }
          className={`mt-1 ${inputClass}`}
        >
          <option value="marketing">Marketing</option>
          <option value="utility">Utilidade</option>
        </select>
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <button className={btnSecondary} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={btnPrimary}
          disabled={!title.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          Criar projeto
        </button>
      </div>
    </Modal>
  );
}
