import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Calendar,
  Check,
  ChevronDown,
  Copy,
  Folder,
  FolderInput,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  Tags,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  useCampaignFolders,
  useCampaignSelectionIds,
  useCampaignTags,
  useBulkDeleteCampaigns,
  useCampaigns,
  useDeleteCampaign,
  useDuplicateCampaign,
  useMoveCampaignToFolder,
  useSetCampaignTags,
} from "../hooks/useCampaigns";
import type { CampaignRow } from "../hooks/useDashboard";
import { ProgressBar } from "../components/ProgressBar";
import {
  Card,
  Modal,
  PageError,
  btnPrimary,
  btnSecondary,
  focusRing,
} from "../components/ui";
import { CampaignOrganizationModal } from "../components/CampaignOrganizationModal";
import { getCampaignDisplayStatus } from "../lib/campaign-status";

const statusOptions = [
  ["", "Todos os Status"],
  ["draft", "Rascunho"],
  ["sending", "Enviando"],
  ["completed", "Concluído"],
  ["paused", "Pausado"],
  ["scheduled", "Agendado"],
  ["failed", "Falhou"],
  ["cancelled", "Cancelado"],
];

const iconButton = `inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] disabled:opacity-40 ${focusRing}`;

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function delivery(campaign: CampaignRow) {
  const delivered = Math.max(campaign.delivered, campaign.read);
  return campaign.total ? Math.round((delivered / campaign.total) * 100) : 0;
}

function dispatchProgress(campaign: CampaignRow) {
  const processed = campaign.sent + campaign.failed;
  return campaign.total ? Math.round((processed / campaign.total) * 100) : 0;
}

function CampaignListStatus({ status, failed }: { status: string; failed: number }) {
  const display = getCampaignDisplayStatus(status, failed);
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${status === "sending" ? "gap-1.5 animate-pulse" : ""} ${display.className}`}
    >
      {status === "sending" && (
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
      )}
      {display.label}
    </span>
  );
}

function StatusFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = statusOptions.find(([status]) => status === value) ?? statusOptions[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className={`flex h-9 min-w-44 items-center justify-between gap-3 rounded-[10px] border bg-[var(--ds-bg-elevated)] px-3 text-sm font-medium ${value ? "border-primary-500/50 text-[var(--ds-text-primary)]" : "border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]"} ${focusRing}`}
      >
        <span>{selected[1]}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-[var(--ds-text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Filtrar por status"
          className="absolute right-0 top-full z-[220] mt-2 w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-1 shadow-2xl"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          <p className="px-3 pb-2 pt-2 text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
            Status da campanha
          </p>
          {statusOptions.map(([status, label]) => {
            const active = status === value;
            return (
              <button
                key={status}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(status);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${active ? "bg-primary-500/10 text-primary-400" : "text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"}`}
              >
                <span>{label}</span>
                {active && <Check size={16} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CampaignActions({
  campaign,
  folders,
  tags,
  onManageTags,
  mobile = false,
}: {
  campaign: CampaignRow;
  folders: Array<{ id: string; name: string; color?: string | null }>;
  tags: Array<{ id: string; name: string; color: string | null }>;
  onManageTags: () => void;
  mobile?: boolean;
}) {
  const duplicate = useDuplicateCampaign();
  const remove = useDeleteCampaign();
  const move = useMoveCampaignToFolder(campaign.id);
  const setTags = useSetCampaignTags(campaign.id);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const busy = duplicate.isPending || remove.isPending || move.isPending || setTags.isPending;
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  const selectedTagIds = campaign.tags?.map((tag) => tag.id) ?? [];

  useEffect(() => {
    if (!foldersOpen) return;
    const close = (event: MouseEvent) => {
      if (!folderMenuRef.current?.contains(event.target as Node)) setFoldersOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [foldersOpen]);

  const chooseFolder = (folderId: string | null) => {
    setFoldersOpen(false);
    move.mutate(folderId);
  };

  return (
    <div className="flex items-center justify-end gap-2" onClick={stop}>
      <div ref={folderMenuRef} className="relative">
        <button
          type="button"
          className={`${iconButton} ${mobile ? "shrink-0" : ""}`}
          title="Mover para pasta"
          aria-label={`Mover ${campaign.name} para pasta`}
          aria-haspopup="menu"
          aria-expanded={foldersOpen}
          disabled={busy}
          onClick={() => setFoldersOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setFoldersOpen(false);
          }}
        >
          <FolderInput size={16} />
        </button>
        {foldersOpen && (
          <div
            role="menu"
            aria-label={`Mover ${campaign.name} para pasta`}
            className="absolute right-0 top-full z-[220] mt-1 w-56 overflow-hidden rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-1 text-left shadow-xl"
            onKeyDown={(event) => {
              if (event.key === "Escape") setFoldersOpen(false);
            }}
          >
            <p className="px-2 pb-2 pt-1 text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
              Mover para pasta
            </p>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!campaign.folder_id}
              disabled={move.isPending}
              onClick={() => chooseFolder(null)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm ${!campaign.folder_id ? "bg-primary-500/10 text-primary-400" : "text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"}`}
            >
              <FolderOpen size={16} />
              <span className="min-w-0 flex-1 text-left">Sem pasta</span>
              {!campaign.folder_id && <Check size={15} />}
            </button>
            {folders.map((folder) => {
              const active = campaign.folder_id === folder.id;
              return (
                <button
                  key={folder.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  disabled={move.isPending}
                  onClick={() => chooseFolder(folder.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm ${active ? "bg-primary-500/10 text-primary-400" : "text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"}`}
                >
                  <Folder size={16} style={{ color: folder.color ?? "#a1a1aa" }} />
                  <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>
                  {active && <Check size={15} />}
                </button>
              );
            })}
            {!folders.length && (
              <p className="px-2 py-3 text-xs text-[var(--ds-text-muted)]">
                Crie uma pasta em Organizar Campanhas.
              </p>
            )}
          </div>
        )}
      </div>
      <div className="relative">
        <button
          type="button"
          className={iconButton}
          title="Editar tags"
          aria-label={`Editar tags de ${campaign.name}`}
          aria-expanded={tagsOpen}
          disabled={busy}
          onClick={() => setTagsOpen((current) => !current)}
        >
          <Tags size={16} />
        </button>
        {tagsOpen && (
          <div
            role="menu"
            aria-label={`Tags de ${campaign.name}`}
            className="absolute right-0 top-full z-[220] mt-1 w-60 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-2 text-left shadow-xl"
          >
            <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
              Tags da campanha
            </p>
            {tags.map((tag) => {
              const active = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={active}
                  disabled={setTags.isPending}
                  onClick={() =>
                    setTags.mutate(
                      active
                        ? selectedTagIds.filter((id) => id !== tag.id)
                        : [...selectedTagIds, tag.id],
                    )
                  }
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-[var(--ds-bg-hover)]"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: tag.color ?? "#71717a" }}
                  />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                  {active && <Check size={15} className="text-primary-400" />}
                </button>
              );
            })}
            {!tags.length && (
              <button
                type="button"
                onClick={() => {
                  setTagsOpen(false);
                  onManageTags();
                }}
                className="w-full rounded-lg px-2 py-3 text-left text-xs text-primary-400 hover:bg-[var(--ds-bg-hover)]"
              >
                Criar tag agora
              </button>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className={iconButton}
        title="Clonar"
        aria-label={`Clonar ${campaign.name}`}
        disabled={busy}
        onClick={() => duplicate.mutate(campaign.id)}
      >
        {duplicate.isPending ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Copy size={16} />
        )}
      </button>
      <button
        type="button"
        className={`${iconButton} hover:bg-red-950/60 hover:text-red-400`}
        title="Excluir"
        aria-label={`Excluir ${campaign.name}`}
        disabled={busy}
        onClick={() => setDeleteOpen(true)}
      >
        {remove.isPending ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Trash2 size={16} />
        )}
      </button>
      {deleteOpen && (
        <Modal
          titleId={`delete-campaign-${campaign.id}`}
          onClose={() => setDeleteOpen(false)}
          closeDisabled={remove.isPending}
          panelClassName="max-w-md !bg-zinc-950"
        >
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-red-400">
              <Trash2 size={30} />
            </div>
            <h2 id={`delete-campaign-${campaign.id}`} className="text-xl font-bold text-white">
              Excluir campanha?
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              A campanha “{campaign.name}” e seus registros de envio serão removidos. Esta ação não pode ser desfeita.
            </p>
            {remove.error && (
              <p role="alert" className="mt-3 text-sm text-red-300">
                {remove.error.message}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => setDeleteOpen(false)}
                className="flex-1 rounded-xl bg-zinc-800 py-3 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(campaign.id, { onSuccess: () => setDeleteOpen(false) })}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 py-3 font-bold text-white transition-colors hover:bg-red-400 disabled:opacity-50"
              >
                {remove.isPending ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
                {remove.isPending ? "Excluindo…" : "Excluir"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FolderFilter({
  value,
  onChange,
  onManage,
  folders,
  total,
}: {
  value: string;
  onChange: (value: string) => void;
  onManage: () => void;
  folders: Array<{
    id: string;
    name: string;
    campaign_count: number;
    color?: string | null;
  }>;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const selected = folders.find((folder) => folder.id === value);
  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-9 items-center gap-2 rounded-[10px] border bg-[var(--ds-bg-elevated)] px-3 text-sm ${value ? "border-primary-500/50 text-[var(--ds-text-primary)]" : "border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]"} ${focusRing}`}
      >
        <Folder
          size={16}
          style={selected?.color ? { color: selected.color } : undefined}
        />
        <span>{selected?.name ?? "Pasta"}</span>
        <ChevronDown
          size={16}
          className={`text-[var(--ds-text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
        {value && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Limpar filtro de pasta"
            onClick={(event) => {
              event.stopPropagation();
              onChange("");
            }}
            className="ml-1 rounded p-0.5 hover:bg-[var(--ds-bg-surface)]"
          >
            <X size={12} />
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[220] mt-2 w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-1 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[var(--ds-border-default)] px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--ds-text-secondary)]">
            <span>Filtrar por pasta</span>
            <button
              type="button"
              aria-label="Gerenciar pastas"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className="rounded p-1 hover:bg-[var(--ds-bg-surface)]"
            >
              <Settings size={14} />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!value}
              onClick={() => choose("")}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm ${!value ? "bg-primary-500/10 text-primary-400" : "text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"}`}
            >
              <FolderOpen size={16} />
              <span className="flex-1 text-left">Todas</span>
              <span className="text-xs text-[var(--ds-text-muted)]">
                ({total})
              </span>
              {!value && <Check size={16} />}
            </button>
            {folders.map((folder) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={value === folder.id}
                key={folder.id}
                onClick={() => choose(folder.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm ${value === folder.id ? "bg-primary-500/10 text-primary-400" : "text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"}`}
              >
                <Folder
                  size={16}
                  style={{ color: folder.color ?? "#a1a1aa" }}
                />
                <span className="flex-1 truncate text-left">{folder.name}</span>
                <span className="text-xs text-[var(--ds-text-muted)]">
                  ({folder.campaign_count})
                </span>
                {value === folder.id && <Check size={16} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TagFilter({
  values,
  onChange,
  onManage,
  tags,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  onManage: () => void;
  tags: Array<{ id: string; name: string; color: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const toggle = (id: string) =>
    onChange(
      values.includes(id)
        ? values.filter((value) => value !== id)
        : [...values, id],
    );
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-9 items-center gap-2 rounded-[10px] border bg-[var(--ds-bg-elevated)] px-3 text-sm ${values.length ? "border-primary-500/50 text-[var(--ds-text-primary)]" : "border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]"} ${focusRing}`}
      >
        <Tags size={16} />
        <span>Tags</span>
        {values.length > 0 && (
          <span className="rounded-full bg-primary-500/20 px-1.5 py-0.5 text-xs font-medium text-primary-400">
            {values.length}
          </span>
        )}
        <ChevronDown
          size={16}
          className={`text-[var(--ds-text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
        {values.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Limpar filtro de tags"
            onClick={(event) => {
              event.stopPropagation();
              onChange([]);
              setOpen(false);
            }}
            className="ml-1 rounded p-0.5 hover:bg-[var(--ds-bg-surface)]"
          >
            <X size={12} />
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[220] mt-2 w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-1 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[var(--ds-border-default)] px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--ds-text-secondary)]">
            <span>Filtrar por tags</span>
            <button
              type="button"
              aria-label="Gerenciar tags"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className="rounded p-1 hover:bg-[var(--ds-bg-surface)]"
            >
              <Settings size={14} />
            </button>
          </div>
            <div className="max-h-64 overflow-y-auto p-1">
            {tags.length ? (
              tags.map((tag) => {
                const selected = values.includes(tag.id);
                return (
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={selected}
                    key={tag.id}
                    onClick={() => toggle(tag.id)}
                    className={`flex w-full items-center rounded-lg px-3 py-2 text-sm ${selected ? "bg-primary-500/10" : "hover:bg-[var(--ds-bg-hover)]"}`}
                  >
                    <span
                      className="mr-2 h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color ?? "#71717a" }}
                    />
                    <span className="flex-1 truncate text-left text-[var(--ds-text-primary)]">
                      {tag.name}
                    </span>
                    {selected && (
                      <Check size={16} className="ml-2 text-primary-400" />
                    )}
                  </button>
                );
              })
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onManage();
                }}
                className="w-full rounded-lg px-3 py-4 text-left text-sm text-primary-400 hover:bg-[var(--ds-bg-hover)]"
              >
                Criar primeira tag para organizar campanhas
              </button>
            )}
          </div>
          {values.length > 0 && (
            <div className="flex flex-wrap gap-1 border-t border-[var(--ds-border-default)] p-2">
              {tags
                .filter((tag) => values.includes(tag.id))
                .map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                    style={{
                      color: tag.color ?? "#a1a1aa",
                      backgroundColor: `${tag.color ?? "#71717a"}1a`,
                    }}
                  >
                    {tag.name}
                    <button
                      type="button"
                      aria-label={`Remover tag ${tag.name}`}
                      onClick={() => toggle(tag.id)}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Campaigns() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [folderId, setFolderId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [organizationTab, setOrganizationTab] = useState<"folders" | "tags">("folders");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState("");
  const query = useCampaigns(search.trim(), page, status, folderId, tagIds);
  const folders = useCampaignFolders();
  const tags = useCampaignTags();
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));
  const resetPage = () => setPage(1);
  const bulkDelete = useBulkDeleteCampaigns();
  const selectionIdsQuery = useCampaignSelectionIds();
  const selectedCount = selectedIds.size;
  const pageIds = items.map((campaign) => campaign.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const togglePageSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const closeBulkDelete = () => {
    if (bulkDelete.isPending) return;
    setBulkDeleteOpen(false);
    setBulkDeleteConfirmation("");
  };
  const selectAllMatching = () => {
    selectionIdsQuery.mutate(
      { q: search.trim(), status, folderId, tagIds },
      { onSuccess: ({ ids }) => setSelectedIds(new Set(ids)) },
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-heading-1">Campanhas</h1>
        <p className="text-body-sm">
          Gerencie e acompanhe seus disparos de mensagens
        </p>
      </div>

      <div className="relative z-20 flex flex-col justify-between gap-4 rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-glass)] p-4 backdrop-blur-xl sm:flex-row sm:items-center">
        <label className="flex w-full items-center gap-3 rounded-[10px] border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] px-4 py-2.5 focus-within:border-primary-500/50 focus-within:ring-1 focus-within:ring-primary-500/50 sm:w-96">
          <Search size={18} className="text-[var(--ds-text-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetPage();
            }}
            placeholder="Buscar campanhas..."
            className="w-full bg-transparent text-sm text-[var(--ds-text-primary)] outline-none placeholder:text-[var(--ds-text-muted)]"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-black text-[var(--ds-text-secondary)] hover:text-white ${focusRing}`}
            title="Atualizar"
            aria-label="Atualizar campanhas"
            onClick={() => query.refetch()}
          >
            <RefreshCw
              size={18}
              className={query.isFetching ? "animate-spin" : ""}
            />
          </button>
          {selectedCount > 0 && (
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-red-500/35 bg-red-500/10 px-3 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 size={16} />
              Excluir selecionadas ({selectedCount})
            </button>
          )}
          {total > pageIds.length && total <= 200 && (
            <button
              type="button"
              disabled={selectionIdsQuery.isPending}
              className="inline-flex h-9 items-center rounded-[10px] border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 text-sm font-medium text-[var(--ds-text-secondary)] transition-colors hover:text-white disabled:opacity-50"
              onClick={selectAllMatching}
            >
              {selectionIdsQuery.isPending ? "Selecionando…" : `Selecionar todas (${total})`}
            </button>
          )}
          <StatusFilter
            value={status}
            onChange={(value) => {
              setStatus(value);
              resetPage();
            }}
          />
          <FolderFilter
            value={folderId}
            onChange={(value) => {
              setFolderId(value);
              resetPage();
            }}
            onManage={() => {
              setOrganizationTab("folders");
              setOrganizationOpen(true);
            }}
            folders={folders.data?.items ?? []}
            total={total}
          />
          <TagFilter
            values={tagIds}
            onChange={(values) => {
              setTagIds(values);
              resetPage();
            }}
            onManage={() => {
              setOrganizationTab("tags");
              setOrganizationOpen(true);
            }}
            tags={tags.data?.items ?? []}
          />
        </div>
      </div>

      {query.error && (
        <PageError
          message={query.error.message}
          onRetry={() => query.refetch()}
        />
      )}
      <Card className="hidden overflow-hidden lg:block">
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] text-xs uppercase tracking-wider text-[var(--ds-text-secondary)]">
              <tr>
                <th className="w-12 px-4 py-4">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todas as campanhas desta página"
                    checked={allPageSelected}
                    onChange={togglePageSelection}
                    disabled={!pageIds.length}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-primary-500 focus:ring-primary-500"
                  />
                </th>
                {[
                  "Nome",
                  "Status",
                  "Destinatarios",
                  "Entrega Meta",
                  "Criado em",
                ].map((label) => (
                  <th key={label} className="px-6 py-4 font-medium">
                    {label}
                  </th>
                ))}
                <th className="px-6 py-4 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ds-border-subtle)]">
              {query.isLoading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-[var(--ds-text-muted)]"
                  >
                    Carregando campanhas...
                  </td>
                </tr>
              )}
              {!query.isLoading && !items.length && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <Search
                      size={24}
                      className="mx-auto mb-3 text-[var(--ds-text-muted)]"
                    />
                    <p className="font-medium text-[var(--ds-text-secondary)]">
                      Nenhuma campanha encontrada
                    </p>
                    <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
                      {search || status || folderId || tagIds.length
                        ? "Tente ajustar os filtros ou buscar por outro termo"
                        : "Crie sua primeira campanha para começar"}
                    </p>
                  </td>
                </tr>
              )}
              {items.map((campaign) => (
                <tr
                  key={campaign.id}
                  onClick={() => navigate(`/campaigns/${campaign.id}`)}
                  className="group cursor-pointer transition-all hover:bg-[var(--ds-bg-hover)] hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                >
                  <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${campaign.name}`}
                      checked={selectedIds.has(campaign.id)}
                      onChange={() => toggleSelected(campaign.id)}
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-primary-500 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-[var(--ds-text-primary)] transition-colors group-hover:text-primary-400">
                      {campaign.name}
                    </p>
                    <p className="mt-1 font-mono text-xs text-[var(--ds-text-muted)]">
                      {campaign.template_name}
                    </p>
                    {campaign.status === "scheduled" &&
                      campaign.scheduled_at && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-purple-400">
                          <Calendar size={10} />
                          {new Date(campaign.scheduled_at).toLocaleString(
                            "pt-BR",
                          )}
                        </p>
                      )}
                  </td>
                  <td className="px-6 py-4">
                    <CampaignListStatus status={campaign.status} failed={campaign.failed} />
                  </td>
                  <td className="px-6 py-4 font-mono text-[var(--ds-text-secondary)]">
                    {campaign.total.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-32">
                      <div className="flex items-center gap-3">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-emerald-500/20">
                          <div
                            className="h-full w-full rounded-full bg-emerald-500"
                            style={{ transform: `translateX(-${100 - delivery(campaign)}%)` }}
                          />
                        </div>
                        <span className="min-w-12 text-right text-xs font-medium text-emerald-400">
                          {delivery(campaign)}%
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-[var(--ds-text-muted)]">
                    {formatDate(campaign.created_at)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <CampaignActions
                      campaign={campaign}
                      folders={folders.data?.items ?? []}
                      tags={tags.data?.items ?? []}
                      onManageTags={() => {
                        setOrganizationTab("tags");
                        setOrganizationOpen(true);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="space-y-3 lg:hidden">
        {!query.isLoading && !items.length && (
          <Card className="p-10 text-center">
            <Search
              size={24}
              className="mx-auto mb-3 text-[var(--ds-text-muted)]"
            />
            <p className="font-medium text-[var(--ds-text-secondary)]">
              Nenhuma campanha encontrada
            </p>
            <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
              {search || status || folderId || tagIds.length
                ? "Tente ajustar os filtros ou buscar por outro termo"
                : "Crie sua primeira campanha para começar"}
            </p>
          </Card>
        )}
        {items.map((campaign) => (
          <article
            key={campaign.id}
            className="cursor-pointer rounded-xl border border-white/10 bg-zinc-900/60 p-4 transition-all hover:bg-white/5 hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]"
            onClick={() => navigate(`/campaigns/${campaign.id}`)}
          >
            <div className="flex items-start justify-between gap-3">
              <input
                type="checkbox"
                aria-label={`Selecionar ${campaign.name}`}
                checked={selectedIds.has(campaign.id)}
                onClick={(event) => event.stopPropagation()}
                onChange={() => toggleSelected(campaign.id)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-950 text-primary-500 focus:ring-primary-500"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">
                  {campaign.name}
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">
                  {campaign.template_name}
                </p>
              </div>
              <CampaignListStatus status={campaign.status} failed={campaign.failed} />
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-3">
                <ProgressBar
                  value={Math.max(campaign.delivered, campaign.read)}
                  total={campaign.total}
                />
                <span className="min-w-20 text-right text-xs font-medium text-primary-400">
                  {dispatchProgress(campaign)}% envio
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <Users size={12} />
                  {campaign.total.toLocaleString("pt-BR")} destinatários
                </span>
                <span>•</span>
                <span>
                  {Math.max(campaign.delivered, campaign.read).toLocaleString(
                    "pt-BR",
                  )}{" "}
                  entregues
                </span>
                <span>•</span>
                <span>{delivery(campaign)}% entrega</span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
              <span className="font-mono text-xs text-zinc-500">
                {formatDate(campaign.created_at)}
              </span>
              <CampaignActions
                campaign={campaign}
                folders={folders.data?.items ?? []}
                tags={tags.data?.items ?? []}
                onManageTags={() => {
                  setOrganizationTab("tags");
                  setOrganizationOpen(true);
                }}
                mobile
              />
            </div>
          </article>
        ))}
      </div>

      {totalPages > 1 && (
        <Card className="flex flex-col items-center justify-between gap-4 p-4 sm:flex-row">
          <span className="text-sm text-[var(--ds-text-muted)]">
            Página {page} de {totalPages} • {total} campanha(s)
          </span>
          <nav className="flex items-center gap-2" aria-label="Paginação">
            <button
              type="button"
              className={btnSecondary}
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              &lt;
            </button>
            {Array.from(
              { length: Math.min(5, totalPages) },
              (_, index) =>
                Math.min(Math.max(1, page - 2), Math.max(1, totalPages - 4)) +
                index,
            )
              .filter((value) => value <= totalPages)
              .map((value) => (
                <button
                  type="button"
                  key={value}
                  className={value === page ? btnPrimary : btnSecondary}
                  onClick={() => setPage(value)}
                >
                  {value}
                </button>
              ))}
            <button
              type="button"
              className={btnSecondary}
              disabled={page === totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              &gt;
            </button>
          </nav>
        </Card>
      )}
      {organizationOpen && (
        <CampaignOrganizationModal
          initialTab={organizationTab}
          onClose={() => setOrganizationOpen(false)}
        />
      )}
      {bulkDeleteOpen && (
        <Modal
          titleId="bulk-delete-campaigns"
          onClose={closeBulkDelete}
          closeDisabled={bulkDelete.isPending}
          panelClassName="max-w-md !bg-zinc-950"
        >
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-red-400">
              <Trash2 size={30} />
            </div>
            <h2 id="bulk-delete-campaigns" className="text-xl font-bold text-white">
              Excluir {selectedCount} campanha{selectedCount === 1 ? "" : "s"}?
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              As campanhas selecionadas e seus registros de envio serão removidos. Campanhas em envio ou pausadas não podem ser excluídas.
            </p>
            <label className="mt-5 block text-left text-sm font-medium text-zinc-300">
              Digite <span className="font-mono text-red-300">EXCLUIR</span> para confirmar
              <input
                value={bulkDeleteConfirmation}
                onChange={(event) => setBulkDeleteConfirmation(event.target.value)}
                autoComplete="off"
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-red-400"
              />
            </label>
            {bulkDelete.error && (
              <p role="alert" className="mt-3 text-sm text-red-300">{bulkDelete.error.message}</p>
            )}
            <div className="mt-6 flex gap-3">
              <button type="button" disabled={bulkDelete.isPending} onClick={closeBulkDelete} className="flex-1 rounded-xl bg-zinc-800 py-3 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50">
                Cancelar
              </button>
              <button
                type="button"
                disabled={bulkDelete.isPending || bulkDeleteConfirmation !== "EXCLUIR"}
                onClick={() => bulkDelete.mutate([...selectedIds], { onSuccess: () => { setSelectedIds(new Set()); closeBulkDelete(); } })}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 py-3 font-bold text-white transition-colors hover:bg-red-400 disabled:opacity-50"
              >
                {bulkDelete.isPending ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
                {bulkDelete.isPending ? "Excluindo…" : "Excluir"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
