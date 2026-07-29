import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Check,
  CheckCircle,
  Clock,
  Eye,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { api } from "../lib/api";
import {
  Card,
  Modal,
  PageError,
  PageLoading,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "../components/ui";

type ProjectItem = {
  id: string;
  name: string;
  content: string;
  language: string;
  category: string;
  status: string;
  meta_id: string | null;
  meta_status: string | null;
  rejected_reason: string | null;
  variables: Record<string, string>;
  buttons: Array<Record<string, unknown>>;
};
type Project = {
  id: string;
  title: string;
  strategy: "marketing" | "utility" | "bypass";
  status: string;
  source: string;
  template_count: number;
  approved_count: number;
  created_at?: string;
  items: ProjectItem[];
};
type Section = "ALL" | "APPROVED" | "REJECTED" | "PENDING" | "DRAFT";

const sectionInfo: Array<{
  id: Section;
  label: string;
  icon: typeof CheckCircle;
}> = [
  { id: "ALL", label: "Todos", icon: Filter },
  { id: "APPROVED", label: "Aprovados", icon: CheckCircle },
  { id: "REJECTED", label: "Rejeitados", icon: XCircle },
  { id: "PENDING", label: "Em Análise", icon: Clock },
  { id: "DRAFT", label: "Rascunhos (Não Enviados)", icon: Filter },
];

export default function TemplateProject() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("ALL");
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<ProjectItem | null>(null);
  const [editing, setEditing] = useState<ProjectItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");
  const [operationMessage, setOperationMessage] = useState("");
  const query = useQuery({
    queryKey: ["template-project", id],
    queryFn: () => api<Project>(`/api/template-projects/${id}`),
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["template-project", id] }),
      qc.invalidateQueries({ queryKey: ["template-projects"] }),
    ]);
  };
  const rename = useMutation({
    mutationFn: () =>
      api(`/api/template-projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          strategy: query.data?.strategy || "marketing",
        }),
      }),
    onSuccess: () => {
      refresh();
      setRenaming(false);
    },
  });
  const remove = useMutation({
    mutationFn: (itemId: string) =>
      api(`/api/template-projects/items/${itemId}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const sync = useMutation({
    mutationFn: () =>
      api<{ updated: number }>(`/api/template-projects/${id}/sync`, {
        method: "POST",
      }),
    onSuccess: async ({ updated }) => {
      await refresh();
      setOperationMessage(`${updated} status atualizado(s) da Meta.`);
    },
    onError: (error) => setOperationMessage(error.message),
  });
  const submit = useMutation({
    mutationFn: (itemIds: string[]) =>
      api<{
        created: Array<{ id: string; name: string }>;
        failed: Array<{ id: string; name: string; error: string }>;
      }>(`/api/template-projects/${id}/submit`, {
        method: "POST",
        body: JSON.stringify({ itemIds }),
      }),
    onSuccess: async ({ created, failed }) => {
      await refresh();
      setSelected([]);
      setOperationMessage(
        failed.length
          ? `${created.length} enviado(s); ${failed.length} falharam: ${failed.map((item) => `${item.name}: ${item.error}`).join(" · ")}`
          : `${created.length} template(s) enviado(s) para a Meta.`,
      );
    },
    onError: (error) => setOperationMessage(error.message),
  });
  const visible = useMemo(() => {
    const items = query.data?.items || [];
    if (section === "ALL") return items;
    if (section === "DRAFT") return items.filter((i) => !i.meta_status);
    if (section === "PENDING")
      return items.filter(
        (i) =>
          i.meta_status && !["APPROVED", "REJECTED"].includes(i.meta_status),
      );
    return items.filter((i) => i.meta_status === section);
  }, [query.data, section]);
  if (query.isLoading) return <PageLoading label="Carregando projeto…" />;
  if (query.error) return <PageError message={query.error.message} />;
  if (!query.data) return null;
  const project = query.data;
  const selectable = visible.filter((i) => !i.meta_id).map((i) => i.id);
  const allSelected =
    selectable.length > 0 && selectable.every((i) => selected.includes(i));
  const count = (kind: Section) =>
    kind === "ALL"
      ? project.items.length
      : kind === "DRAFT"
        ? project.items.filter((i) => !i.meta_status).length
        : kind === "PENDING"
          ? project.items.filter(
              (i) =>
                i.meta_status &&
                !["APPROVED", "REJECTED"].includes(i.meta_status),
            ).length
          : project.items.filter((i) => i.meta_status === kind).length;
  const groups: {
    id: Exclude<Section, "ALL">;
    label: string;
    items: ProjectItem[];
    icon: typeof CheckCircle;
  }[] = [
    {
      id: "APPROVED",
      label: "Aprovados",
      items: project.items.filter((i) => i.meta_status === "APPROVED"),
      icon: CheckCircle,
    },
    {
      id: "PENDING",
      label: "Em Análise",
      items: project.items.filter(
        (i) =>
          i.meta_status && !["APPROVED", "REJECTED"].includes(i.meta_status),
      ),
      icon: Clock,
    },
    {
      id: "REJECTED",
      label: "Rejeitados",
      items: project.items.filter((i) => i.meta_status === "REJECTED"),
      icon: XCircle,
    },
    {
      id: "DRAFT",
      label: "Rascunhos (Não Enviados)",
      items: project.items.filter((i) => !i.meta_status),
      icon: Filter,
    },
  ];
  return (
    <div className="pb-20">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <button
              aria-label="Voltar para projetos"
              onClick={() => navigate("/templates?tab=projects")}
              className="-ml-2 rounded-lg border border-white/10 bg-zinc-950/40 p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              {renaming ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="min-w-0 border-b-2 border-primary-500 bg-transparent text-3xl font-bold outline-none"
                  />
                  <button
                    aria-label="Salvar nome"
                    onClick={() => rename.mutate()}
                    className="p-2 text-primary-400"
                  >
                    <Check size={20} />
                  </button>
                  <button
                    aria-label="Cancelar"
                    onClick={() => setRenaming(false)}
                    className="p-2 text-zinc-400"
                  >
                    <X size={20} />
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-heading-1 truncate text-2xl font-bold sm:text-3xl">
                      {project.title}
                    </h1>
                    <button
                      aria-label="Renomear projeto"
                      onClick={() => {
                        setTitle(project.title);
                        setRenaming(true);
                      }}
                      className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Pencil size={16} />
                    </button>
                    <span className="shrink-0 rounded-full border border-white/10 bg-zinc-950/40 px-2 py-0.5 text-xs text-zinc-400">
                      Em Progresso
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-400">
                    Criado em{" "}
                    {new Date(
                      project.created_at || Date.now(),
                    ).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-3 sm:justify-end">
          <button
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/5 disabled:opacity-50"
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
          >
            <RefreshCw
              size={16}
              className={sync.isPending ? "animate-spin" : ""}
            />{" "}
            {sync.isPending ? "Sincronizando…" : "Sincronizar Meta"}
          </button>
          <button
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/5"
            onClick={() => setSelected(allSelected ? [] : selectable)}
          >
            <span className="h-3.5 w-3.5 rounded-sm border border-current" />{" "}
            Selecionar Tudo
          </button>
        </div>
      </div>
      {operationMessage && (
        <div
          className="mt-4 rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-300"
          role="status"
        >
          {operationMessage}
        </div>
      )}
      {selected.length > 0 && (
        <Card className="mt-4 flex flex-col gap-3 border-primary-500/30 bg-primary-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm">
            {selected.length} template(s) selecionado(s)
          </span>
          <button
            className={btnPrimary}
            disabled={submit.isPending}
            onClick={() => submit.mutate(selected)}
          >
            <Send size={15} />{" "}
            {submit.isPending ? "Enviando…" : "Enviar selecionados para Meta"}
          </button>
        </Card>
      )}
      <div className="mt-8 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_1px_338px]">
        <div className="min-w-0">
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {groups.map(({ id: kind, label, icon: Icon }) => {
              const total = count(kind);
              const pct = project.template_count
                ? Math.round((total / project.template_count) * 100)
                : 0;
              const tone =
                kind === "APPROVED"
                  ? "border-primary-500/30 bg-primary-950/50 text-primary-400"
                  : kind === "DRAFT"
                    ? "border-zinc-800 bg-zinc-900 text-zinc-400"
                    : "border-amber-700/40 bg-amber-950/40 text-amber-400";
              return (
                <button
                  key={kind}
                  onClick={() => setSection(kind)}
                  className={`h-24 min-w-0 overflow-hidden rounded-2xl border p-4 text-left ${tone}`}
                >
                  <span className="flex items-center justify-between">
                    <Icon size={19} />
                    <strong className="text-2xl">{total}</strong>
                  </span>
                  <span className="mt-5 flex justify-between text-xs">
                    <span>{label.replace(" (Não Enviados)", "")}</span>
                    <span>{pct}%</span>
                  </span>
                </button>
              );
            })}
          </div>
          <Card className="mt-6 min-h-[522px] overflow-hidden">
            {groups
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <ProjectGroup
                  key={group.id}
                  group={group}
                  selected={selected}
                  setSelected={setSelected}
                  setPreview={setPreview}
                  setEditing={setEditing}
                  remove={(itemId) => remove.mutate(itemId)}
                />
              ))}
            {project.items.length === 0 && (
              <div className="py-20 text-center">
                <p className="text-sm text-zinc-500">
                  Nenhum template neste projeto.
                </p>
                <button
                  className={`mt-4 ${btnPrimary}`}
                  onClick={() => setCreating(true)}
                >
                  Adicionar template
                </button>
              </div>
            )}
          </Card>
        </div>
        <div className="hidden bg-zinc-800 lg:block" />
        <Card className="hidden min-h-[642px] items-center justify-center border-dashed lg:flex">
          {preview ? (
            <div className="w-full p-5">
              <PhonePreview content={preview.content} />
            </div>
          ) : (
            <div className="text-center text-zinc-500">
              <Eye className="mx-auto" size={48} />
              <p className="mt-5 text-sm">
                Selecione um template para visualizar
              </p>
            </div>
          )}
        </Card>
      </div>
      {(creating || editing) && (
        <ItemEditor
          projectId={id}
          initial={editing || undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={refresh}
        />
      )}{" "}
      {preview && (
        <div className="lg:hidden">
          <Preview item={preview} onClose={() => setPreview(null)} />
        </div>
      )}
    </div>
  );
}

function ProjectGroup({
  group,
  selected,
  setSelected,
  setPreview,
  setEditing,
  remove,
}: {
  group: {
    id: Exclude<Section, "ALL">;
    label: string;
    items: ProjectItem[];
    icon: typeof CheckCircle;
  };
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  setPreview: (item: ProjectItem) => void;
  setEditing: (item: ProjectItem) => void;
  remove: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const selectable = group.items
    .filter((item) => !item.meta_id)
    .map((item) => item.id);
  const all =
    selectable.length > 0 && selectable.every((id) => selected.includes(id));
  const Icon = group.icon;
  return (
    <section className="border-b border-zinc-800 last:border-b-0">
      <button
        className="flex w-full items-center gap-3 px-4 py-4 text-left"
        onClick={() => setOpen(!open)}
      >
        <Icon
          size={19}
          className={
            group.id === "APPROVED"
              ? "text-primary-400"
              : group.id === "DRAFT"
                ? "text-zinc-400"
                : "text-amber-400"
          }
        />
        <span className="font-medium">{group.label}</span>
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
          {group.items.length}
        </span>
        <span className="ml-auto text-zinc-500">⌃</span>
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-4">
          {group.id === "DRAFT" && (
            <button
              onClick={() =>
                setSelected(
                  all
                    ? selected.filter((id) => !selectable.includes(id))
                    : [...new Set([...selected, ...selectable])],
                )
              }
              className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-400"
            >
              <span className="h-4 w-4 rounded border border-zinc-600" />
              Selecionar tudo ({selectable.length})
            </button>
          )}
          {group.items.map((item) => (
            <div
              key={item.id}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button,input"))
                  return;
                setPreview(item);
              }}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-800 bg-black/20 px-3 py-3 hover:border-zinc-700"
            >
              <input
                aria-label={`Selecionar ${item.name}`}
                type="checkbox"
                disabled={Boolean(item.meta_id)}
                checked={selected.includes(item.id)}
                onClick={(event) => event.stopPropagation()}
                onChange={() =>
                  setSelected((value) =>
                    value.includes(item.id)
                      ? value.filter((id) => id !== item.id)
                      : [...value, item.id],
                  )
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {item.name}
                  </span>
                  <span className="ml-auto text-[11px] text-zinc-500">
                    ▣ {item.language}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-zinc-500">
                  {item.content}
                </p>
              </div>
              {!item.meta_id && (
                <IconButton label="Editar" onClick={() => setEditing(item)}>
                  <Pencil size={14} />
                </IconButton>
              )}
              <IconButton label="Excluir" onClick={() => remove(item.id)}>
                <Trash2 size={14} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ItemStatus({ item }: { item: ProjectItem }) {
  const status = item.meta_status || "DRAFT";
  const color =
    status === "APPROVED"
      ? "text-primary-400 bg-primary-950"
      : status === "REJECTED"
        ? "text-red-400 bg-red-950"
        : "text-amber-400 bg-amber-950";
  return (
    <span className={`w-fit rounded-full px-2 py-1 text-[10px] ${color}`}>
      {status === "DRAFT"
        ? "Rascunho"
        : status === "PENDING"
          ? "Em análise"
          : status}
    </span>
  );
}
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
    >
      {children}
    </button>
  );
}
function ItemEditor({
  projectId,
  initial,
  onClose,
  onSaved,
}: {
  projectId: string;
  initial?: ProjectItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [content, setContent] = useState(initial?.content || "");
  const [category, setCategory] = useState(initial?.category || "UTILITY");
  const save = useMutation({
    mutationFn: () =>
      api(
        initial
          ? `/api/template-projects/items/${initial.id}`
          : `/api/template-projects/${projectId}/items`,
        {
          method: initial ? "PATCH" : "POST",
          body: JSON.stringify({
            name,
            content,
            category,
            language: initial?.language || "pt_BR",
            buttons: initial?.buttons || [],
            variables: initial?.variables || {},
          }),
        },
      ),
    onSuccess: async () => {
      await onSaved();
      onClose();
    },
  });
  return (
    <Modal
      titleId="project-item-title"
      onClose={onClose}
      panelClassName="max-w-5xl"
    >
      <div className="flex justify-between">
        <div>
          <h2 id="project-item-title" className="text-xl font-semibold">
            {initial ? "Editar template" : "Adicionar template"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Edite o rascunho e confira a mensagem no preview.
          </p>
        </div>
        <button onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <label className="block text-xs text-zinc-400">
            Nome técnico
            <input
              value={name}
              onChange={(e) =>
                setName(
                  e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                )
              }
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Categoria
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`mt-1 ${inputClass}`}
            >
              <option>UTILITY</option>
              <option>MARKETING</option>
              <option>AUTHENTICATION</option>
            </select>
          </label>
          <label className="block text-xs text-zinc-400">
            Conteúdo
            <textarea
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          {save.error && (
            <p className="text-sm text-red-400">{save.error.message}</p>
          )}
          <div className="flex justify-end gap-2">
            <button className={btnSecondary} onClick={onClose}>
              Cancelar
            </button>
            <button
              className={btnPrimary}
              disabled={!name || !content || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Salvando…" : "Salvar template"}
            </button>
          </div>
        </div>
        <PhonePreview content={content} />
      </div>
    </Modal>
  );
}
function Preview({
  item,
  onClose,
}: {
  item: ProjectItem;
  onClose: () => void;
}) {
  return (
    <Modal titleId="project-preview-title" onClose={onClose}>
      <div className="flex justify-between">
        <h2 id="project-preview-title" className="text-lg font-semibold">
          Prévia — {item.name}
        </h2>
        <button onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <PhonePreview content={item.content} />
    </Modal>
  );
}
function PhonePreview({ content }: { content: string }) {
  const filled = Object.entries({ 1: "João", 2: "19h", 3: "amanhã" }).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    content,
  );
  return (
    <div className="mx-auto h-[600px] max-w-[330px] rounded-[42px] border-[8px] border-zinc-900 bg-[#d8e2dc] p-4 text-zinc-900 shadow-2xl">
      <div className="-mx-4 -mt-4 rounded-t-[34px] bg-[#075e54] px-4 py-5 text-sm font-semibold text-white">
        SmartZap
      </div>
      <div className="mt-5 rounded-lg bg-white p-3 text-sm leading-relaxed shadow">
        <p className="whitespace-pre-wrap">
          {filled || "Digite o conteúdo para visualizar."}
        </p>
        <p className="mt-2 text-right text-[10px] text-zinc-500">10:32 ✓✓</p>
      </div>
    </div>
  );
}
