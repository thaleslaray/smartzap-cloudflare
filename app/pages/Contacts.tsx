import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Filter,
  Pencil,
  Plus,
  Search,
  ShieldOff,
  SlidersHorizontal,
  Tag,
  Trash2,
  Type,
  UploadCloud,
  UserCheck,
  Users,
  UsersRound,
  UserX,
  X,
} from "lucide-react";
import {
  Contact,
  getContactIds,
  useBulkContactCustomField,
  useBulkDeleteContacts,
  useBulkContactStatus,
  useBulkContactTags,
  useContactHistory,
  useContactMemory,
  useContactProfile,
  useContactTags,
  useContacts,
  useCreateContact,
  useCreateContactTag,
  useCreateCustomField,
  useCustomFields,
  useDeleteContact,
  useDeleteContactMemory,
  useImportContacts,
  useSetContactMemory,
  useSetContactTags,
  useSetCustomValue,
  useUpdateContact,
  useUnsuppressContact,
} from "../hooks/useContacts";
import { api } from "../lib/api";
import {
  PageError,
  PageHeader,
  PageLoading,
  Card,
  Modal,
  btnDanger,
  btnPrimary,
  btnSecondary,
  focusRing,
  inputClass,
} from "../components/ui";

function contactIdentifier(contact: Pick<Contact, "phone" | "username" | "user_id">) {
  if (contact.username) return `@${contact.username}`;
  if (!contact.phone.startsWith("bsuid:")) return contact.phone;
  return contact.user_id ? "Usuário WhatsApp" : "Contato";
}

function contactLabel(contact: Pick<Contact, "name" | "phone" | "username" | "user_id">) {
  return contact.name ?? contactIdentifier(contact);
}

export default function Contacts() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [tagId, setTagId] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulk, setShowBulk] = useState<"status" | "tags" | "field" | null>(
    null,
  );
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [showOrganization, setShowOrganization] = useState(false);
  const importTrigger = useRef<HTMLButtonElement>(null);
  const query = useContacts(q, page, status, tagId);
  const tags = useContactTags();
  const bulkStatus = useBulkContactStatus();
  const bulkTags = useBulkContactTags();
  const bulkField = useBulkContactCustomField();
  const bulkDelete = useBulkDeleteContacts();
  const unsuppress = useUnsuppressContact();
  const { data } = query;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));
  const rawStats = data?.stats ?? { total: 0, optIn: 0, optOut: 0 };
  // Bancos SQL retornam NULL para SUM quando não há registros. A API já
  // normaliza isso, e este fallback protege a tela de dados legados.
  const stats = {
    total: Number(rawStats.total) || 0,
    optIn: Number(rawStats.optIn) || 0,
    optOut: Number(rawStats.optOut) || 0,
  };
  const visible = data?.items ?? [];
  const allVisibleSelected =
    visible.length > 0 && visible.every((contact) => selected.has(contact.id));
  const selectedCount = selected.size;
  const toggleAll = () =>
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected)
        visible.forEach((contact) => next.delete(contact.id));
      else visible.forEach((contact) => next.add(contact.id));
      return next;
    });
  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const result = await getContactIds(q, status, tagId);
      setSelected(new Set(result.ids));
    } finally {
      setSelectingAll(false);
    }
  };
  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (selected.size) params.set("ids", [...selected].join(","));
    else {
      params.set("q", q);
      if (status) params.set("status", status);
    }
    return `/api/contacts/export.csv?${params.toString()}`;
  }, [q, selected, status]);
  return (
    <div className="flex h-full min-h-0 flex-col space-y-8 [&>div:first-child]:mb-0">
      <PageHeader
        title="Contatos"
        subtitle="Gerencie sua audiência e listas"
        action={
          <div className="flex flex-wrap gap-3">
            {selectedCount > 0 && (
              <>
                <a
                  href={exportUrl}
                  className={`inline-flex h-9 items-center justify-center rounded-lg border border-[var(--ds-border-default)] px-4 text-zinc-300 ${focusRing}`}
                  aria-label={`Exportar ${selectedCount} contato(s) selecionado(s)`}
                  title="Exportar selecionados"
                ><Download size={18} /></a>
                <button type="button" onClick={() => setBulkDeleteOpen(true)} className={`inline-flex h-9 items-center justify-center rounded-lg border border-red-500/30 px-4 text-red-300 hover:bg-red-500/10 ${focusRing}`} aria-label={`Excluir ${selectedCount} contato(s) selecionado(s)`} title="Excluir selecionados"><Trash2 size={18} /></button>
                <div className="relative">
                  <button type="button" onClick={() => setShowBulkMenu((open) => !open)} className={`${btnSecondary} !h-9 !px-3`} aria-expanded={showBulkMenu}>Mais ações</button>
                  {showBulkMenu && <div className="absolute right-0 z-20 mt-2 w-40 rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-2xl">
                    <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800" onClick={() => { setShowBulkMenu(false); setShowBulk("tags"); }}>Tags</button>
                    <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800" onClick={() => { setShowBulkMenu(false); setShowBulk("field"); }}>Campo</button>
                    <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800" onClick={() => { setShowBulkMenu(false); setShowBulk("status"); }}>Status</button>
                  </div>}
                </div>
              </>
            )}
            <button
              ref={importTrigger}
              onClick={() => setShowImport(true)}
              className={`inline-flex h-9 items-center justify-center rounded-lg border border-[var(--ds-border-default)] px-4 text-zinc-300 ${focusRing}`}
              aria-label="Importar CSV"
              title="Importar CSV"
            >
              <UploadCloud size={18} />
            </button>
            <button
              onClick={() => setShowOrganization(true)}
              className={`inline-flex h-9 items-center rounded-[10px] border border-[#262626] bg-black px-4 text-sm font-medium text-zinc-100 ${focusRing}`}
            >
              <FileText size={18} /> Campos personalizados
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className={`contact-primary-action inline-flex h-9 items-center rounded-[10px] border px-4 text-sm font-medium ${focusRing}`}
            >
              <Plus size={18} /> Novo Contato
            </button>
          </div>
        }
      />
      <div className="!mt-8 grid gap-6 sm:grid-cols-3">
        <ContactStat
          label="Total de Contatos"
          value={stats.total}
          icon={<Users size={22} />}
          tone="blue"
        />
        <ContactStat
          label="Opt-in Ativos"
          value={stats.optIn}
          icon={<UserCheck size={22} />}
          tone="green"
        />
        <ContactStat
          label="Inativos / Opt-out"
          value={stats.optOut}
          icon={<UserX size={22} />}
          tone="gray"
        />
      </div>
      {allVisibleSelected && selectedCount < total && (
        <div className="border-b border-primary-500/20 bg-primary-500/10 px-6 py-2 text-center text-sm">
          Todos os <strong>{visible.length}</strong> contatos desta página foram selecionados.
          <button type="button" disabled={selectingAll} onClick={selectAllMatching} className="ml-2 font-bold text-primary-400 hover:underline">
            {selectingAll ? "Selecionando…" : `Selecionar todos os ${total} contatos`}
          </button>
        </div>
      )}
      {selectedCount === total && total > visible.length && <div className="border-b border-primary-500/20 bg-primary-500/10 px-6 py-2 text-center text-sm text-primary-300">Todos os <strong>{total}</strong> contatos foram selecionados.<button type="button" onClick={() => setSelected(new Set())} className="ml-2 text-zinc-300 hover:underline">Limpar seleção</button></div>}
      {query.error && (
        <PageError
          message={query.error.message}
          onRetry={() => query.refetch()}
        />
      )}
      {query.isLoading && <PageLoading label="Carregando contatos…" />}
      {!query.isLoading && !query.error && (
        <Card className="flex min-h-[420px] flex-none flex-col overflow-hidden md:min-h-0 md:flex-1">
          <div className="flex flex-col gap-4 border-b border-[var(--ds-border-subtle)] p-5 lg:flex-row">
            <label className="flex max-w-md flex-1 items-center gap-3 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-2.5 focus-within:border-primary-500/50">
              <Search size={18} className="text-[var(--ds-text-muted)]" />
              <input
                aria-label="Buscar contatos por nome ou telefone"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por nome ou telefone..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--ds-text-muted)]"
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                className="rounded-xl border border-[var(--ds-border-default)] p-2.5 text-[var(--ds-text-secondary)]"
                aria-label="Filtros"
                aria-expanded={filtersOpen}
              >
                <Filter size={20} />
              </button>
              {filtersOpen && (
                <>
                  <select
                    aria-label="Filtrar contatos por status"
                    style={{ color: "#f4f4f5", WebkitTextFillColor: "#f4f4f5", backgroundColor: "#18181b" }}
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(1);
                      setSelected(new Set());
                    }}
                    className="w-[149px] rounded-[14px] border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-2.5 text-sm font-medium text-zinc-100"
                  >
                    <option value="">Todos Status</option>
                    <option value="opt_in">Opt-in</option>
                    <option value="opt_out">Opt-out</option>
                    <option value="unknown">Desconhecido</option>
                    <option value="suppressed">Suprimidos</option>
                  </select>
                  <select
                    aria-label="Filtrar contatos por tag"
                    style={{ color: "#f4f4f5", WebkitTextFillColor: "#f4f4f5", backgroundColor: "#18181b" }}
                    value={tagId}
                    onChange={(e) => {
                      setTagId(e.target.value);
                      setPage(1);
                    }}
                    className="w-[136px] rounded-[14px] border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-2.5 text-sm font-medium text-zinc-100"
                  >
                    <option value="">Todas Tags</option>
                    <option value="NONE">Sem tags</option>
                    {tags.data?.items.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between border-b border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-5 py-3 text-sm text-[var(--ds-text-muted)]">
            <span>
              Mostrando{" "}
              <b className="font-medium text-[var(--ds-text-primary)]">
                {visible.length}
              </b>{" "}
              de{" "}
              <b className="font-medium text-[var(--ds-text-primary)]">
                {total}
              </b>{" "}
              contatos
            </span>
            {(q || status || tagId) && (
              <button
                className="text-xs font-medium text-primary-400"
                onClick={() => {
                  setQ("");
                  setStatus("");
                  setTagId("");
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto lg:hidden">
            {visible.length > 0 && (
              <div className="flex items-center justify-between rounded-[14px] border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-3">
                <span className="text-sm text-[var(--ds-text-secondary)]">
                  {selectedCount > 0
                    ? `${selectedCount} selecionado${selectedCount === 1 ? "" : "s"}`
                    : "Seleção"}
                </span>
                <button
                  type="button"
                  onClick={toggleAll}
                  aria-pressed={allVisibleSelected}
                  aria-label="Selecionar todos os contatos desta página"
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${allVisibleSelected ? "border-primary-500/50 bg-primary-500/15 text-primary-300" : "border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${allVisibleSelected ? "border-primary-500 bg-primary-500 text-primary-950" : "border-[var(--ds-border-default)]"}`}
                  >
                    {allVisibleSelected ? "✓" : ""}
                  </span>
                  {allVisibleSelected ? "Desselecionar todos" : "Selecionar todos"}
                </button>
              </div>
            )}
            {visible.map((c) => (
              <div
                key={c.id}
                className={`rounded-[14px] border p-4 transition-colors ${selected.has(c.id) ? "border-primary-500/40 bg-primary-500/5" : "border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-hover)]"}`}
              >
                <div className="flex items-start gap-3">
                  <button
                    aria-label={`Selecionar ${contactLabel(c)}`}
                    onClick={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                        return next;
                      })
                    }
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${selected.has(c.id) ? "border-primary-500 bg-primary-500 text-primary-950" : "border-[var(--ds-border-default)]"}`}
                  >
                    {selected.has(c.id) ? "✓" : ""}
                  </button>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800/60 text-xs font-semibold">
                    {initials(c.name)}
                  </span>
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setEditingContact(c)}
                  >
                    <span className="block truncate text-sm font-medium">
                      {c.name ?? "Sem nome"}
                    </span>
                    <span className="block text-xs font-mono text-zinc-500">
                      {contactIdentifier(c)}
                    </span>
                  </button>
                  <ContactStatusPill status={c.status} />
                </div>
                {Boolean(c.tags?.length) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.tags?.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center rounded-md border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] px-2 py-1 text-[10px] font-medium text-[var(--ds-text-primary)]"
                      >
                        <Tag size={10} className="mr-1 opacity-50" /> {tag.name}
                      </span>
                    ))}
                  </div>
                )}
                {c.status === "suppressed" && (
                  <div className="mt-3 flex items-center justify-between rounded-lg border border-red-500/15 bg-red-500/5 px-3 py-2">
                    <p className="text-[11px] text-red-300">
                      {c.suppression_reason || "Contato suprimido"}
                    </p>
                    <button
                      type="button"
                      disabled={unsuppress.isPending}
                      onClick={() => unsuppress.mutate(c.id)}
                      aria-label={`Remover supressão de ${contactLabel(c)}`}
                      className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10"
                    >
                      <ShieldOff size={14} />
                    </button>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between border-t border-[var(--ds-border-subtle)] pt-3">
                  <p className="text-[11px] text-zinc-500">
                    Criado: {new Date(c.created_at).toLocaleDateString("pt-BR")}{" "}
                    <span className="mx-1">•</span>{" "}
                    {relativeActivity(c.last_message_at, c.updated_at)}
                  </p>
                  <div className="flex">
                    <button
                      aria-label={`Editar ${contactLabel(c)}`}
                      onClick={() => setEditingContact(c)}
                      className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-primary-400"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      aria-label={`Excluir ${contactLabel(c)}`}
                      onClick={() => setDeleteContact(c)}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-red-950 hover:text-red-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!visible.length && (
              <p className="py-8 text-center text-sm text-zinc-500">
                Nenhum contato encontrado.
              </p>
            )}
          </div>
          <div className="hidden min-h-0 flex-1 overflow-auto lg:block">
            <table className="w-full text-left text-sm" aria-label="Lista de contatos">
              <thead className="bg-[var(--ds-bg-hover)] text-xs uppercase tracking-wider text-[var(--ds-text-secondary)]">
                <tr>
                  <th className="w-10 px-6 py-4">
                    <input
                      type="checkbox"
                      aria-label="Selecionar contatos desta página"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      className="accent-primary-500"
                    />
                  </th>
                  <th className="px-6 py-4">Contato</th>
                  <th className="px-6 py-4">Tags</th>
                  <th className="px-6 py-4">Status</th>
                  {status === "suppressed" && (
                    <th className="px-6 py-4">Motivo</th>
                  )}
                  <th className="px-6 py-4">Data Criação</th>
                  <th className="px-6 py-4">Última atividade</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr
                    key={c.id}
                    className="group border-b border-[var(--ds-border-subtle)] last:border-0 transition-all duration-200 hover:bg-[var(--ds-bg-hover)] hover:shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]"
                  >
                    <td className="px-6 py-[19px]">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${contactLabel(c)}`}
                        checked={selected.has(c.id)}
                        onChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                            return next;
                          })
                        }
                        className="accent-primary-500"
                      />
                    </td>
                    <td className="px-6 py-[19px]">
                      <button
                        type="button"
                        onClick={() => setEditingContact(c)}
                        className="flex items-center gap-3 text-left"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800/60 text-xs font-semibold text-zinc-200">
                          {initials(c.name)}
                        </span>
                        <span>
                          <span className="block font-medium text-[var(--ds-text-primary)] transition-colors group-hover:text-primary-400">
                            {c.name ?? "Sem nome"}
                          </span>
                          <span className="mt-0.5 block text-xs font-mono text-[var(--ds-text-muted)]">
                            {contactIdentifier(c)}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-[19px]">
                      <div className="flex max-w-48 flex-wrap gap-1.5">
                        {c.tags?.map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center rounded-md border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] px-2 py-1 text-[10px] font-medium text-[var(--ds-text-primary)]"
                          >
                            <Tag size={10} className="mr-1.5 opacity-50" /> {tag.name}
                          </span>
                        ))}
                        {!c.tags?.length && (
                          <span className="text-xs text-zinc-600">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-[19px]">
                      <ContactStatusPill status={c.status} />
                    </td>
                    {status === "suppressed" && (
                      <td className="px-6 py-[19px] text-xs text-zinc-400">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate">
                            {c.suppression_reason || "—"}
                          </span>
                          <button
                            type="button"
                            disabled={unsuppress.isPending}
                            onClick={() => unsuppress.mutate(c.id)}
                            aria-label={`Remover supressão de ${contactLabel(c)}`}
                            className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10"
                          >
                            <ShieldOff size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-[19px] text-xs text-zinc-500">
                      {new Date(c.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-6 py-[19px] text-xs text-zinc-500">
                      {relativeActivity(c.last_message_at, c.updated_at)}
                    </td>
                    <td className="px-6 py-[19px]">
                      <div className="flex justify-end gap-1">
                        <button
                          aria-label={`Editar ${contactLabel(c)}`}
                          onClick={() => setEditingContact(c)}
                        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-primary-400"
                      >
                          <Pencil size={16} />
                        </button>
                        <button
                          aria-label={`Excluir ${contactLabel(c)}`}
                          onClick={() => setDeleteContact(c)}
                          className="rounded-lg p-2 text-zinc-500 hover:bg-red-950 hover:text-red-400"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td
                      colSpan={status === "suppressed" ? 8 : 7}
                      className="px-5 py-10 text-center text-zinc-500"
                    >
                      <UsersRound
                        className="mx-auto mb-2 text-zinc-600"
                        size={24}
                      />{" "}
                      Nenhum contato encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div
              className="flex items-center justify-between border-t border-[var(--ds-border-subtle)] px-6 py-4"
              aria-label="Paginação de contatos"
            >
              <span className="text-sm text-[var(--ds-text-muted)]">
                Página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`${btnSecondary} !h-9 !w-9 !px-0`}
                  disabled={page === 1}
                  onClick={() => setPage((current) => current - 1)}
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="flex items-center gap-1">
                  {paginationPages(page, totalPages).map((pageNumber) => (
                    <button
                      type="button"
                      key={pageNumber}
                      onClick={() => setPage(pageNumber)}
                      aria-label={`Página ${pageNumber}`}
                      aria-current={page === pageNumber ? "page" : undefined}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm ${page === pageNumber ? "bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)]" : "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]"}`}
                    >
                      {pageNumber}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={`${btnSecondary} !h-9 !w-9 !px-0`}
                  disabled={page === totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  aria-label="Próxima página"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </Card>
      )}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          returnFocusRef={importTrigger}
        />
      )}
      {showAdd && <AddContactModal onClose={() => setShowAdd(false)} />}
      {showBulk === "status" && (
        <BulkStatusModal
          ids={[...selected]}
          mutation={bulkStatus}
          onClose={() => setShowBulk(null)}
          onDone={() => {
            setSelected(new Set());
            setShowBulk(null);
          }}
        />
      )}
      {showBulk === "tags" && (
        <BulkTagsModal
          ids={[...selected]}
          mutation={bulkTags}
          onClose={() => setShowBulk(null)}
          onDone={() => {
            setSelected(new Set());
            setShowBulk(null);
          }}
        />
      )}
      {showBulk === "field" && (
        <BulkCustomFieldModal
          ids={[...selected]}
          mutation={bulkField}
          onClose={() => setShowBulk(null)}
          onDone={() => {
            setSelected(new Set());
            setShowBulk(null);
          }}
        />
      )}
      {showOrganization && (
        <OrganizationModal onClose={() => setShowOrganization(false)} />
      )}
      {editingContact && (
        <EditContactModal
          contact={editingContact}
          onClose={() => setEditingContact(null)}
        />
      )}
      {deleteContact && (
        <DeleteContactModal
          contact={deleteContact}
          onClose={() => setDeleteContact(null)}
        />
      )}
      {bulkDeleteOpen && <BulkDeleteModal count={selectedCount} pending={bulkDelete.isPending} error={bulkDelete.error?.message} onClose={() => setBulkDeleteOpen(false)} onConfirm={() => bulkDelete.mutate([...selected], { onSuccess: () => { setSelected(new Set()); setBulkDeleteOpen(false); } })} />}
    </div>
  );
}

function ContactStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "blue" | "green" | "gray";
}) {
  const colors =
    tone === "blue"
      ? "bg-blue-500/20 text-blue-400"
      : tone === "green"
        ? "bg-primary-500/20 text-primary-400"
        : "bg-zinc-500/20 text-zinc-400";
  return (
    <div className="flex min-h-[104px] items-center rounded-2xl border border-white/10 bg-zinc-900/60 px-6 py-5 shadow-[0_12px_30px_rgba(0,0,0,0.2)]">
      <span
        className={`mr-4 flex items-center justify-center rounded-xl border border-[var(--ds-border-default)] p-3 [&>svg]:h-5 [&>svg]:w-5 ${colors}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-stat-label truncate">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-stat">{value.toLocaleString("pt-BR")}</span>
        </div>
      </div>
    </div>
  );
}

function ContactStatusPill({ status }: { status: string }) {
  const active = status === "opt_in";
  const suppressed = status === "suppressed";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${active ? "bg-primary-950 text-primary-400" : status === "opt_out" || suppressed ? "bg-red-950 text-red-400" : "bg-zinc-800 text-zinc-400"}`}
    >
      {suppressed ? "SUPRIMIDO" : status.toUpperCase()}
    </span>
  );
}

function initials(name: string | null) {
  return (name || "?").substring(0, 2).toUpperCase();
}
function paginationPages(currentPage: number, totalPages: number) {
  return Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
    if (totalPages <= 5) return index + 1;
    if (currentPage <= 3) return index + 1;
    if (currentPage >= totalPages - 2) return totalPages - 4 + index;
    return currentPage - 2 + index;
  });
}
function relativeActivity(timestamp?: number | null, updated?: string) {
  const ms = timestamp
    ? timestamp * 1000
    : updated
      ? new Date(updated).getTime()
      : 0;
  if (!ms) return "—";
  const hours = Math.max(0, Math.floor((Date.now() - ms) / 3600000));
  return hours < 1
    ? "agora"
    : hours < 24
      ? `${hours}h atrás`
      : `${Math.floor(hours / 24)}d atrás`;
}

function AddContactModal({ onClose }: { onClose: () => void }) {
  const create = useCreateContact();
  const tagsQuery = useContactTags();
  const fields = useCustomFields();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [tags, setTags] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string | number | boolean>>({});
  const [saveError, setSaveError] = useState("");
  const legacyContactInputClass = "mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none transition-colors focus:border-primary-500";
  const save = async () => {
    setSaveError("");
    try {
      // O formulário segue o contrato do SmartZap original: cadastro manual
      // não afirma consentimento visualmente. Sem declaração explícita o
      // contato nasce como "unknown" e não pode ser destinatário de campanha.
      const contact = await create.mutateAsync({ name, phone, email: email.trim() || undefined });
      const known = new Map((tagsQuery.data?.items ?? []).map((tag) => [tag.name.toLocaleLowerCase("pt-BR"), tag]));
      const tagIds: string[] = [];
      for (const tagName of [...new Set(tags.split(",").map((value) => value.trim()).filter(Boolean))]) {
        let tag = known.get(tagName.toLocaleLowerCase("pt-BR"));
        if (!tag) tag = await api<{ id: string; name: string }>("/api/contacts/tags", { method: "POST", body: JSON.stringify({ name: tagName }) });
        tagIds.push(tag.id);
      }
      if (tagIds.length) await api(`/api/contacts/${contact.id}/tags`, { method: "PUT", body: JSON.stringify({ tagIds }) });
      for (const field of fields.data?.items ?? []) {
        const value = customValues[field.id];
        if (value === "" || value === undefined) continue;
        await api(`/api/contacts/${contact.id}/custom-values/${field.id}`, { method: "PUT", body: JSON.stringify({ value }) });
      }
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não foi possível salvar o contato.");
    }
  };
  return (
    <Modal
      titleId="add-contact-title"
      onClose={onClose}
      closeDisabled={create.isPending}
      panelClassName="max-w-md !bg-zinc-950"
    >
      <div className="flex items-center justify-between">
        <h2 id="add-contact-title" className="text-xl font-bold">Novo Contato</h2>
        <button type="button" aria-label="Fechar formulário de novo contato" onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:text-white"><X /></button>
      </div>
      <div className="mt-6 space-y-4">
        <label className="block text-sm text-zinc-400">
          Nome Completo
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: João Silva"
            className={legacyContactInputClass}
          />
        </label>
        <label className="block text-sm text-zinc-400">
          Telefone (WhatsApp) *
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+55 21 99999-9999"
            className={legacyContactInputClass}
          />
        </label>
        <label className="block text-sm text-zinc-400">
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@exemplo.com"
            className={legacyContactInputClass}
          />
        </label>
        <label className="block text-sm text-zinc-400">Tags (separadas por vírgula)<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="VIP, Lead, Cliente" className={legacyContactInputClass} /></label>
        {Boolean(fields.data?.items.length) && <div className="border-t border-white/10 pt-3"><h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Campos Personalizados</h3><div className="space-y-3">{fields.data?.items.map((field) => <label key={field.id} className="block text-sm text-gray-400">{field.label}<input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={String(customValues[field.id] ?? "")} onChange={(event) => setCustomValues((current) => ({ ...current, [field.id]: field.type === "number" ? Number(event.target.value) : event.target.value }))} className={`mt-1 ${inputClass}`} /></label>)}</div></div>}
        {(create.error || saveError) && (
          <p className="text-sm text-status-failed">{saveError || create.error?.message}</p>
        )}
        <div className="pb-3 pt-4">
          <button
            className="w-full rounded-xl bg-white py-3 font-bold text-black hover:bg-gray-200 disabled:opacity-100"
            disabled={!name.trim() || !phone.trim() || create.isPending}
            onClick={save}
          >
            {create.isPending ? "Salvando…" : "Salvar Contato"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteContactModal({
  contact,
  onClose,
}: {
  contact: Contact;
  onClose: () => void;
}) {
  const remove = useDeleteContact();
  return (
    <Modal
      titleId="delete-contact-title"
      onClose={onClose}
      closeDisabled={remove.isPending}
      panelClassName="max-w-md !bg-zinc-950"
    >
      <div className="pb-[7px] text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-red-400"><AlertTriangle size={32} /></div>
        <h2 id="delete-contact-title" className="text-xl font-bold">Confirmar Exclusão</h2>
        <p className="mt-2 text-sm text-zinc-400">Tem certeza que deseja excluir este contato? Esta ação não pode ser desfeita.</p>
      {remove.error && (
        <p className="mt-3 text-sm text-status-failed">
          {remove.error.message}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <button className="flex-1 rounded-xl bg-zinc-800 py-3 font-medium text-white hover:bg-zinc-700" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 py-3 font-bold text-white hover:bg-red-400"
          disabled={remove.isPending}
          onClick={() => remove.mutate(contact.id, { onSuccess: onClose })}
        >
          {remove.isPending ? (
            "Excluindo…"
          ) : (
            <>
              <Trash2 aria-hidden="true" className="shrink-0" size={18} strokeWidth={2} />
              <span>Excluir</span>
            </>
          )}
        </button>
      </div>
      </div>
    </Modal>
  );
}

function BulkDeleteModal({ count, pending, error, onClose, onConfirm }: { count: number; pending: boolean; error?: string; onClose: () => void; onConfirm: () => void }) {
  return <Modal titleId="bulk-delete-title" onClose={onClose} closeDisabled={pending} panelClassName="max-w-md !bg-zinc-950">
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-red-400"><Trash2 size={32} /></div>
      <h2 id="bulk-delete-title" className="text-xl font-bold">Confirmar Exclusão</h2>
      <p className="mt-2 text-sm text-zinc-400">Tem certeza que deseja excluir {count} contatos? Esta ação não pode ser desfeita.</p>
      {error && <p role="alert" className="mt-3 text-sm text-status-failed">{error}</p>}
      <div className="mt-6 flex gap-3"><button type="button" disabled={pending} onClick={onClose} className="flex-1 rounded-xl bg-zinc-800 py-3 font-medium text-white hover:bg-zinc-700">Cancelar</button><button type="button" disabled={pending} onClick={onConfirm} className="flex-1 rounded-xl bg-red-500 py-3 font-bold text-white hover:bg-red-400">{pending ? "Excluindo…" : "Excluir"}</button></div>
    </div>
  </Modal>;
}

function LegacyOrganizationModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const tags = useContactTags();
  const fields = useCustomFields();
  const createTag = useCreateContactTag();
  const createField = useCreateCustomField();
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "tag"; id: string; label: string }
    | { kind: "field"; id: string; label: string }
    | null
  >(null);
  const deleteTag = useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/api/contacts/tags/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", "tags"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setDeleteTarget(null);
    },
  });
  const deleteField = useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/api/contacts/custom-fields/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", "custom-fields"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setDeleteTarget(null);
    },
  });
  const [tagName, setTagName] = useState("");
  const [field, setField] = useState({
    key: "",
    label: "",
    type: "text" as const,
  });
  return (
    <Modal titleId="contact-organization-title" onClose={onClose}>
      <h2 id="contact-organization-title" className="text-base font-semibold">
        Organização de contatos
      </h2>
      <p className="mt-1 text-sm text-zinc-400">
        Tags e campos ficam disponíveis na ficha de cada contato e para
        segmentação.
      </p>
      <section className="mt-5">
        <h3 className="text-sm font-semibold">Tags</h3>
        <div className="mt-2 flex gap-2">
          <input
            aria-label="Nome da tag"
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
            placeholder="Ex.: Cliente VIP"
            className={inputClass}
          />
          <button
            className={btnPrimary}
            disabled={!tagName.trim() || createTag.isPending}
            onClick={() =>
              createTag.mutate(tagName, { onSuccess: () => setTagName("") })
            }
          >
            Criar
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.data?.items.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full border border-primary-500/30 bg-primary-500/10 py-1 pl-2 pr-1 text-xs text-primary-200"
            >
              {tag.name}
              <button
                type="button"
                aria-label={`Excluir tag ${tag.name}`}
                title={`Excluir tag ${tag.name}`}
                onClick={() =>
                  setDeleteTarget({ kind: "tag", id: tag.id, label: tag.name })
                }
                className="rounded-full p-1 text-primary-300 hover:bg-red-500/15 hover:text-red-300"
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
          {!tags.isLoading && !tags.data?.items.length && (
            <p className="text-xs text-zinc-500">Nenhuma tag criada.</p>
          )}
        </div>
      </section>
      <section className="mt-6 border-t border-zinc-800 pt-5">
        <h3 className="text-sm font-semibold">Campos personalizados</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
          <input
            aria-label="Chave do campo"
            value={field.key}
            onChange={(event) =>
              setField((current) => ({
                ...current,
                key: event.target.value.replace(/[^a-z0-9_]/g, ""),
              }))
            }
            placeholder="empresa"
            className={inputClass}
          />
          <input
            aria-label="Rótulo do campo"
            value={field.label}
            onChange={(event) =>
              setField((current) => ({ ...current, label: event.target.value }))
            }
            placeholder="Empresa"
            className={inputClass}
          />
          <select
            aria-label="Tipo do campo"
            value={field.type}
            onChange={(event) =>
              setField((current) => ({
                ...current,
                type: event.target.value as typeof field.type,
              }))
            }
            className={inputClass}
          >
            <option value="text">Texto</option>
            <option value="number">Número</option>
            <option value="date">Data</option>
            <option value="boolean">Sim/Não</option>
          </select>
          <button
            className={btnPrimary}
            disabled={!field.key || !field.label || createField.isPending}
            onClick={() =>
              createField.mutate(field, {
                onSuccess: () => setField({ key: "", label: "", type: "text" }),
              })
            }
          >
            Criar
          </button>
        </div>
        <div className="mt-3 space-y-1">
          {fields.data?.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 text-xs text-zinc-400">
              <p>
                {item.label}{" "}
                <span className="font-mono text-zinc-600">
                  {item.key} · {item.type}
                </span>
              </p>
              <button
                type="button"
                aria-label={`Excluir campo ${item.label}`}
                title={`Excluir campo ${item.label}`}
                onClick={() =>
                  setDeleteTarget({ kind: "field", id: item.id, label: item.label })
                }
                className="rounded-md p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
      {deleteTarget && (
        <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/5 p-3">
          <p className="text-sm text-red-100">
            Excluir {deleteTarget.kind === "tag" ? "a tag" : "o campo"}{" "}
            <strong>{deleteTarget.label}</strong>?
          </p>
          <p className="mt-1 text-xs text-red-200/75">
            Esta ação remove a organização associada aos contatos e não pode ser desfeita.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button className={btnSecondary} onClick={() => setDeleteTarget(null)}>
              Cancelar
            </button>
            <button
              className={btnDanger}
              disabled={deleteTag.isPending || deleteField.isPending}
              onClick={() =>
                deleteTarget.kind === "tag"
                  ? deleteTag.mutate(deleteTarget.id)
                  : deleteField.mutate(deleteTarget.id)
              }
            >
              {deleteTag.isPending || deleteField.isPending ? "Excluindo…" : "Excluir"}
            </button>
          </div>
        </div>
      )}
      {(createTag.error ||
        createField.error ||
        deleteTag.error ||
        deleteField.error ||
        tags.error ||
        fields.error) && (
        <p className="mt-4 text-sm text-status-failed">
          {
            (
              createTag.error ??
              createField.error ??
              deleteTag.error ??
              deleteField.error ??
              tags.error ??
              fields.error
            )?.message
          }
        </p>
      )}
    </Modal>
  );
}

function slugField(label: string) {
  return label
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function OrganizationModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fields = useCustomFields();
  const createField = useCreateCustomField();
  const [label, setLabel] = useState("");
  const key = slugField(label);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);
  const deleteField = useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/api/contacts/custom-fields/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", "custom-fields"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-fields-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-white/10 bg-zinc-950 shadow-2xl sm:w-md"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="relative border-b border-white/10 p-6">
          <button type="button" aria-label="Fechar gerenciamento de campos" onClick={onClose} className="absolute right-5 top-5 rounded-lg p-2 text-gray-500 hover:text-white">
            <X size={20} />
          </button>
          <h2 id="custom-fields-title" className="flex items-center gap-2 text-lg font-semibold text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500/10 text-primary-500"><Type size={18} /></span>
            Gerenciar Campos
          </h2>
          <p className="mt-2 pr-8 text-sm text-gray-400">Crie campos para armazenar dados específicos dos seus contatos.</p>
        </header>

        <div className="flex-1 space-y-6 p-6">
          <section className="space-y-5 rounded-2xl border border-white/5 bg-zinc-900/50 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-500/10 text-primary-500"><Plus size={14} /></span>
              Novo Campo
            </h3>
            <label className="block text-xs font-medium text-gray-400">
              Nome do Campo
              <input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex: Empresa" className={`mt-1.5 ${inputClass}`} />
            </label>
            <div>
              <p className="text-xs font-medium text-gray-400">Chave (Variável)</p>
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950 p-3 font-mono text-xs text-gray-400">
                <span className="text-gray-600">{"{{"}</span><span className="text-primary-400">{key || "..."}</span><span className="text-gray-600">{"}}"}</span>
              </div>
            </div>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-bold text-black hover:bg-gray-200 disabled:opacity-50"
              disabled={!key || createField.isPending}
              onClick={() => createField.mutate({ key, label: label.trim(), type: "text" }, { onSuccess: () => setLabel("") })}
            >
              <Plus size={16} /> {createField.isPending ? "Criando…" : "Criar Campo"}
            </button>
          </section>

          <section className="space-y-2">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Campos do Sistema</h3>
            {[{ label: "Nome", key: "nome" }, { label: "Telefone", key: "telefone" }, { label: "E-mail", key: "email" }].map((field) => (
              <div key={field.key} className="flex items-center justify-between rounded-xl border border-primary-500/20 bg-primary-500/5 p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary-500/20 bg-primary-500/10 text-primary-400"><Type size={14} /></span>
                  <div><p className="text-sm font-medium text-white">{field.label}</p><p className="font-mono text-[10px] text-primary-400">{"{{ "}{field.key}{" }}"}</p></div>
                </div>
                <span className="rounded bg-zinc-800/50 px-2 py-1 text-[10px] text-gray-500">automático</span>
              </div>
            ))}
          </section>

          <section className="space-y-2.5">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Campos Personalizados</h3>
            {fields.data?.items.map((field) => (
              <div key={field.id} className="group flex items-center justify-between rounded-xl border border-white/5 bg-zinc-900/30 p-3.5 hover:border-white/10 hover:bg-zinc-900/80">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/5 bg-zinc-800 text-gray-400"><Type size={14} /></span>
                  <div><p className="text-sm font-medium text-white">{field.label}</p><p className="font-mono text-[10px] text-gray-500">{"{{ "}{field.key}{" }}"}</p></div>
                </div>
                <button type="button" aria-label={`Excluir campo ${field.label}`} onClick={() => deleteField.mutate(field.id)} className="rounded-lg p-2 text-gray-500 hover:bg-red-500/10 hover:text-red-400"><Trash2 size={15} /></button>
              </div>
            ))}
            {!fields.isLoading && !fields.data?.items.length && <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-gray-600">Nenhum campo personalizado ainda.</p>}
          </section>
          {(fields.error || createField.error || deleteField.error) && <p role="alert" className="text-sm text-status-failed">{(fields.error ?? createField.error ?? deleteField.error)?.message}</p>}
        </div>
      </aside>
    </div>
  );
}

function EditContactModal({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const profile = useContactProfile(contact.id);
  const allTags = useContactTags();
  const update = useUpdateContact(contact.id);
  const setTags = useSetContactTags(contact.id);
  const setValue = useSetCustomValue(contact.id);
  const bulkStatus = useBulkContactStatus();
  const [form, setForm] = useState({
    name: contact.name ?? "",
    phone: contact.phone.startsWith("bsuid:") ? "" : contact.phone,
    email: contact.email ?? "",
    tags: contact.tags?.map((tag) => tag.name).join(", ") ?? "",
    status: contact.status,
  });
  const [customValues, setCustomValues] = useState<Record<string, string | number | boolean>>({});
  const [optInConfirmed, setOptInConfirmed] = useState(contact.status === "opt_in");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!profile.data) return;
    setForm({
      name: profile.data.name ?? "",
      phone: profile.data.phone.startsWith("bsuid:") ? "" : profile.data.phone,
      email: profile.data.email ?? "",
      tags: profile.data.tags.map((tag) => tag.name).join(", "),
      status: profile.data.status,
    });
    setCustomValues(Object.fromEntries(profile.data.customValues.map((field) => [field.id, field.value ?? ""])));
  }, [profile.data]);

  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await update.mutateAsync({ name: form.name.trim() || null, phone: form.phone, email: form.email.trim() || null });
      const names = [...new Set(form.tags.split(",").map((name) => name.trim()).filter(Boolean))];
      const known = new Map((allTags.data?.items ?? []).map((tag) => [tag.name.toLocaleLowerCase("pt-BR"), tag]));
      const tagIds: string[] = [];
      for (const name of names) {
        let tag = known.get(name.toLocaleLowerCase("pt-BR"));
        if (!tag) {
          tag = await api<{ id: string; name: string }>("/api/contacts/tags", { method: "POST", body: JSON.stringify({ name }) });
          known.set(name.toLocaleLowerCase("pt-BR"), tag);
        }
        tagIds.push(tag.id);
      }
      await setTags.mutateAsync(tagIds);
      for (const field of profile.data?.customValues ?? []) {
        const value = customValues[field.id];
        if (value !== "" && value !== null && value !== undefined) await setValue.mutateAsync({ fieldId: field.id, value });
      }
      if (form.status !== contact.status) {
        await bulkStatus.mutateAsync({ ids: [contact.id], status: form.status as "opt_in" | "opt_out" | "unknown", optInConfirmed: form.status === "opt_in" ? optInConfirmed : undefined });
      }
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não foi possível salvar o contato.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal titleId="edit-contact-title" onClose={onClose} closeDisabled={saving} panelClassName="max-w-md !bg-zinc-950" overlayClassName="items-center" showCloseButton={false}>
      <div className="flex items-center justify-between">
        <h2 id="edit-contact-title" className="text-xl font-bold text-white">Editar Contato</h2>
        <button type="button" aria-label="Fechar formulário de edição de contato" onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:text-white"><X /></button>
      </div>
      {profile.isLoading ? <PageLoading label="Carregando contato…" /> : (
        <div className="mt-6 space-y-4">
          <label className="block text-sm text-gray-400">Nome Completo<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none transition-colors focus:border-primary-500" /></label>
          <label className="block text-sm text-gray-400">Telefone (WhatsApp) *<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none transition-colors focus:border-primary-500" /></label>
          <label className="block text-sm text-gray-400">E-mail<input type="email" placeholder="email@exemplo.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none transition-colors focus:border-primary-500" /></label>
          <label className="block text-sm text-gray-400">Tags (separadas por vírgula)<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none transition-colors focus:border-primary-500" /></label>
          {Boolean(profile.data?.customValues.length) && (
            <div className="border-t border-white/10 pt-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Campos Personalizados</h3>
              <div className="space-y-3">{profile.data?.customValues.map((field) => (
                <label key={field.id} className="block text-sm text-gray-400">{field.label}<input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={String(customValues[field.id] ?? "")} onChange={(event) => setCustomValues((current) => ({ ...current, [field.id]: field.type === "number" ? Number(event.target.value) : event.target.value }))} className={`mt-1 ${inputClass}`} /></label>
              ))}</div>
            </div>
          )}
          <label className="block text-sm text-gray-400">Status<select value={form.status} onChange={(event) => { const status = event.target.value; setForm({ ...form, status }); if (status !== "opt_in") setOptInConfirmed(false); }} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none transition-colors focus:border-primary-500"><option value="opt_in">Opt-in</option><option value="opt_out">Opt-out</option><option value="unknown">Desconhecido</option></select></label>
          {form.status === "opt_in" && contact.status !== "opt_in" && <label className="flex gap-2 text-xs leading-relaxed text-zinc-300"><input type="checkbox" checked={optInConfirmed} onChange={(event) => setOptInConfirmed(event.target.checked)} className="mt-0.5 accent-primary-500" /> Confirmo que o contato consentiu em receber mensagens via WhatsApp.</label>}
          {(profile.error || saveError) && <p role="alert" className="text-sm text-status-failed">{saveError || profile.error?.message}</p>}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-zinc-800 py-3 font-medium text-white hover:bg-zinc-700">Cancelar</button>
            <button type="button" onClick={save} disabled={saving || !form.phone.trim() || (form.status === "opt_in" && contact.status !== "opt_in" && !optInConfirmed)} className="flex-1 rounded-xl bg-primary-500 py-3 font-bold text-zinc-950 hover:bg-primary-400 disabled:opacity-50">{saving ? "Salvando…" : "Salvar Alterações"}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ContactProfileModal({
  contact,
  onClose,
}: {
  contact: Contact;
  onClose: () => void;
}) {
  const profile = useContactProfile(contact.id);
  const allTags = useContactTags();
  const setTags = useSetContactTags(contact.id);
  const setValue = useSetCustomValue(contact.id);
  const update = useUpdateContact(contact.id);
  const history = useContactHistory(contact.id);
  const memory = useContactMemory(contact.id);
  const setMemory = useSetContactMemory(contact.id);
  const deleteMemory = useDeleteContactMemory(contact.id);
  const [name, setName] = useState(contact.name ?? "");
  const [phone, setPhone] = useState(
    contact.phone.startsWith("bsuid:") ? "" : contact.phone,
  );
  const [email, setEmail] = useState(contact.email ?? "");
  const [memoryText, setMemoryText] = useState("");
  const currentTags = profile.data?.tags ?? [];
  useEffect(() => {
    if (memory.data?.memory?.summary) setMemoryText(memory.data.memory.summary);
  }, [memory.data?.memory?.summary]);
  return (
    <Modal
      titleId="contact-profile-title"
      onClose={onClose}
      panelClassName="max-w-2xl"
    >
      <h2 id="contact-profile-title" className="text-lg font-semibold">
        Editar contato
      </h2>
      <p className="mt-1 text-sm text-zinc-400">
        Dados, organização e histórico do contato.
      </p>
      {profile.isLoading && <PageLoading label="Carregando perfil…" />}
      {profile.error && (
        <PageError
          message={profile.error.message}
          onRetry={() => profile.refetch()}
        />
      )}
      {profile.data && (
        <div className="mt-5 space-y-6">
          <section className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-400">
              Nome
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-zinc-400">
              Telefone
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-zinc-400 sm:col-span-2">
              E-mail
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <button
                className={btnPrimary}
                disabled={update.isPending || !phone.trim()}
                onClick={() =>
                  update.mutate({ name: name.trim() || null, phone, email: email.trim() || null })
                }
              >
                {update.isPending ? "Salvando…" : "Salvar dados"}
              </button>
            </div>
          </section>
          <section className="border-t border-zinc-800 pt-5">
            <h3 className="text-sm font-semibold">Tags</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {allTags.data?.items.map((tag) => {
                const active = currentTags.some((item) => item.id === tag.id);
                return (
                  <button
                    type="button"
                    key={tag.id}
                    disabled={setTags.isPending}
                    onClick={() => {
                      const ids = currentTags.map((item) => item.id);
                      setTags.mutate(
                        active
                          ? ids.filter((id) => id !== tag.id)
                          : [...ids, tag.id],
                      );
                    }}
                    className={`rounded-full border px-2 py-1 text-xs ${active ? "border-primary-500/40 bg-primary-500/10 text-primary-200" : "border-zinc-700 text-zinc-500"}`}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </section>
          <section>
            <h3 className="text-sm font-semibold">Campos personalizados</h3>
            <div className="mt-2 space-y-3">
              {profile.data.customValues.map((field) => (
                <CustomValueEditor
                  key={field.id}
                  field={field}
                  onSave={(value) =>
                    setValue.mutate({ fieldId: field.id, value })
                  }
                  pending={setValue.isPending}
                />
              ))}
              {!profile.data.customValues.length && (
                <p className="text-xs text-zinc-500">
                  Nenhum campo configurado.
                </p>
              )}
            </div>
          </section>
          <section>
            <h3 className="text-sm font-semibold">Memória</h3>
            <textarea
              rows={3}
              value={memoryText}
              onChange={(e) => setMemoryText(e.target.value)}
              placeholder="Preferências e contexto persistente deste contato"
              className={`mt-2 ${inputClass}`}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-zinc-500">
                {memory.data?.memory
                  ? `Versão ${memory.data.memory.version}`
                  : "Sem memória salva"}
              </span>
              <div className="flex flex-wrap gap-2">
                {memory.data?.memory && (
                  <button
                    className={btnDanger}
                    disabled={deleteMemory.isPending}
                    onClick={() =>
                      deleteMemory.mutate(undefined, {
                        onSuccess: () => setMemoryText(""),
                      })
                    }
                  >
                    {deleteMemory.isPending ? "Apagando…" : "Apagar memória"}
                  </button>
                )}
                <button
                  className={btnSecondary}
                  disabled={!memoryText.trim() || setMemory.isPending}
                  onClick={() => setMemory.mutate(memoryText)}
                >
                  Salvar memória
                </button>
              </div>
            </div>
          </section>
          <section>
            <h3 className="text-sm font-semibold">Histórico</h3>
            <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
              {history.data?.events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/30 px-3 py-2"
                >
                  <p className="text-xs text-zinc-300">{event.summary}</p>
                  <p className="mt-1 text-[10px] text-zinc-600">
                    {new Date(event.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
              {!history.isLoading && !history.data?.events.length && (
                <p className="text-xs text-zinc-500">
                  Nenhum evento registrado.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
      {(setTags.error || setValue.error || update.error || setMemory.error) && (
        <p className="mt-3 text-sm text-status-failed">
          {
            (setTags.error ?? setValue.error ?? update.error ?? setMemory.error)
              ?.message
          }
        </p>
      )}
    </Modal>
  );
}

function CustomValueEditor({
  field,
  onSave,
  pending,
}: {
  field: {
    label: string;
    type: "text" | "number" | "date" | "boolean";
    value: string | number | boolean | null;
  };
  onSave: (value: string | number | boolean) => void;
  pending: boolean;
}) {
  const [value, setValue] = useState(
    field.value ?? (field.type === "boolean" ? false : ""),
  );
  if (field.type === "boolean")
    return (
      <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
        <span>{field.label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={pending}
          onChange={(event) => {
            setValue(event.target.checked);
            onSave(event.target.checked);
          }}
          className="accent-primary-500"
        />
      </label>
    );
  return (
    <label className="block text-xs text-zinc-400">
      {field.label}
      <div className="mt-1 flex gap-2">
        <input
          type={
            field.type === "date"
              ? "date"
              : field.type === "number"
                ? "number"
                : "text"
          }
          value={String(value ?? "")}
          onChange={(event) => setValue(event.target.value)}
          className={`${inputClass} py-2`}
        />
        <button
          type="button"
          className={`${btnSecondary} px-3 py-2 text-xs`}
          disabled={pending || value === ""}
          onClick={() =>
            onSave(field.type === "number" ? Number(value) : String(value))
          }
        >
          Salvar
        </button>
      </div>
    </label>
  );
}

function BulkStatusModal({
  ids,
  mutation,
  onClose,
  onDone,
}: {
  ids: string[];
  mutation: ReturnType<typeof useBulkContactStatus>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<"opt_in" | "opt_out" | "unknown">(
    "unknown",
  );
  const [optInConfirmed, setOptInConfirmed] = useState(false);
  return (
    <Modal
      titleId="bulk-contact-status-title"
      onClose={onClose}
      closeDisabled={mutation.isPending}
    >
      <h2 id="bulk-contact-status-title" className="text-base font-semibold">
        Alterar status em lote
      </h2>
      <p className="mt-1 text-sm text-zinc-400">
        A alteração será aplicada a {ids.length} contato(s).
      </p>
      <select
        aria-label="Novo status"
        className={`mt-4 ${inputClass}`}
        value={status}
        onChange={(event) => setStatus(event.target.value as typeof status)}
      >
        <option value="unknown">Sem status</option>
        <option value="opt_out">Opt-out</option>
        <option value="opt_in">Opt-in</option>
      </select>
      {status === "opt_in" && (
        <label className="mt-3 flex gap-2 text-xs leading-relaxed text-zinc-300">
          <input
            type="checkbox"
            checked={optInConfirmed}
            onChange={(event) => setOptInConfirmed(event.target.checked)}
            className="mt-0.5 accent-primary-500"
          />{" "}
          Confirmo que os contatos consentiram em receber mensagens via
          WhatsApp.
        </label>
      )}
      {mutation.error && (
        <p className="mt-3 text-sm text-status-failed">
          {mutation.error.message}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          className={btnSecondary}
          disabled={mutation.isPending}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          className={btnPrimary}
          disabled={
            mutation.isPending || (status === "opt_in" && !optInConfirmed)
          }
          onClick={() =>
            mutation.mutate(
              { ids, status, optInConfirmed },
              { onSuccess: onDone },
            )
          }
        >
          {mutation.isPending ? "Salvando…" : "Confirmar alteração"}
        </button>
      </div>
    </Modal>
  );
}

function BulkTagsModal({
  ids,
  mutation,
  onClose,
  onDone,
}: {
  ids: string[];
  mutation: ReturnType<typeof useBulkContactTags>;
  onClose: () => void;
  onDone: () => void;
}) {
  const tags = useContactTags();
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"add" | "remove" | "replace">("add");
  return (
    <Modal
      titleId="bulk-tags-title"
      onClose={onClose}
      closeDisabled={mutation.isPending}
    >
      <h2 id="bulk-tags-title" className="text-base font-semibold">
        Alterar tags em lote
      </h2>
      <p className="mt-1 text-sm text-zinc-400">
        Aplique tags a {ids.length} contato(s).
      </p>
      <select
        aria-label="Operação de tags"
        value={mode}
        onChange={(event) => setMode(event.target.value as typeof mode)}
        className={`mt-4 ${inputClass}`}
      >
        <option value="add">Adicionar tags</option>
        <option value="remove">Remover tags</option>
        <option value="replace">Substituir todas as tags</option>
      </select>
      <div className="mt-4 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-[var(--ds-border-default)] p-3">
        {tags.data?.items.map((tag) => (
          <label
            key={tag.id}
            className="flex items-center gap-2 text-sm text-zinc-300"
          >
            <input
              type="checkbox"
              checked={tagIds.includes(tag.id)}
              onChange={(event) =>
                setTagIds((current) =>
                  event.target.checked
                    ? [...current, tag.id]
                    : current.filter((id) => id !== tag.id),
                )
              }
              className="accent-primary-500"
            />
            {tag.name}
          </label>
        ))}
        {!tags.isLoading && !tags.data?.items.length && (
          <p className="text-xs text-zinc-500">Nenhuma tag criada.</p>
        )}
      </div>
      {mutation.error && (
        <p className="mt-3 text-sm text-status-failed">
          {mutation.error.message}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          className={btnSecondary}
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Cancelar
        </button>
        <button
          className={btnPrimary}
          disabled={!tagIds.length || mutation.isPending}
          onClick={() =>
            mutation.mutate({ ids, tagIds, mode }, { onSuccess: onDone })
          }
        >
          {mutation.isPending ? "Aplicando…" : "Aplicar tags"}
        </button>
      </div>
    </Modal>
  );
}

function BulkCustomFieldModal({
  ids,
  mutation,
  onClose,
  onDone,
}: {
  ids: string[];
  mutation: ReturnType<typeof useBulkContactCustomField>;
  onClose: () => void;
  onDone: () => void;
}) {
  const fields = useCustomFields();
  const [fieldId, setFieldId] = useState("");
  const [value, setValue] = useState<string | boolean>("");
  const field = fields.data?.items.find((item) => item.id === fieldId);
  const parsedValue = field?.type === "number" ? Number(value) : value;
  const valid =
    Boolean(fieldId) &&
    (field?.type === "boolean" || String(value).trim().length > 0) &&
    (field?.type !== "number" || Number.isFinite(parsedValue));
  return (
    <Modal
      titleId="bulk-field-title"
      onClose={onClose}
      closeDisabled={mutation.isPending}
    >
      <h2 id="bulk-field-title" className="text-base font-semibold">
        Preencher campo em lote
      </h2>
      <p className="mt-1 text-sm text-zinc-400">
        Defina um valor para {ids.length} contato(s).
      </p>
      <select
        aria-label="Campo personalizado do lote"
        value={fieldId}
        onChange={(event) => {
          setFieldId(event.target.value);
          setValue("");
        }}
        className={`mt-4 ${inputClass}`}
      >
        <option value="">Selecione um campo</option>
        {fields.data?.items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      {field?.type === "boolean" ? (
        <label className="mt-4 flex items-center justify-between rounded-xl border border-[var(--ds-border-default)] p-3 text-sm text-zinc-300">
          Valor ativo
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => setValue(event.target.checked)}
            className="accent-primary-500"
          />
        </label>
      ) : field ? (
        <input
          aria-label="Valor do campo em lote"
          type={
            field.type === "date"
              ? "date"
              : field.type === "number"
                ? "number"
                : "text"
          }
          value={String(value)}
          onChange={(event) => setValue(event.target.value)}
          className={`mt-4 ${inputClass}`}
        />
      ) : null}
      {mutation.error && (
        <p className="mt-3 text-sm text-status-failed">
          {mutation.error.message}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          className={btnSecondary}
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Cancelar
        </button>
        <button
          className={btnPrimary}
          disabled={!valid || mutation.isPending}
          onClick={() =>
            mutation.mutate(
              { ids, fieldId, value: parsedValue },
              { onSuccess: onDone },
            )
          }
        >
          {mutation.isPending ? "Aplicando…" : "Aplicar campo"}
        </button>
      </div>
    </Modal>
  );
}

type ImportPreview = {
  total: number;
  valid: number;
  existing: number;
  duplicates: number;
  invalid: number;
  sample: Array<{ phone: string; name: string; email: string }>;
};

type ImportMapping = {
  phone: string;
  name?: string;
  email?: string;
  tags?: string;
  defaultTags: string[];
  customFields: Record<string, string>;
};

function csvHeaders(csv: string) {
  const firstLine = csv.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
  const values: string[] = [];
  let current = "";
  let quote = false;
  for (let index = 0; index < firstLine.length; index += 1) {
    const char = firstLine[index];
    if (char === '"') {
      if (quote && firstLine[index + 1] === '"') { current += char; index += 1; }
      else quote = !quote;
    } else if (char === "," && !quote) { values.push(current.trim()); current = ""; }
    else current += char;
  }
  values.push(current.trim());
  return values.filter(Boolean);
}

function findImportColumn(headers: string[], names: string[]) {
  const normalized = new Map(headers.map((header) => [header.toLocaleLowerCase("pt-BR").trim(), header]));
  return names.map((name) => normalized.get(name)).find(Boolean) || "";
}

function csvPreviewRows(csv: string, headers: string[]) {
  return csv.replace(/^\uFEFF/, "").split(/\r?\n/).slice(1).filter(Boolean).slice(0, 3).map((line) => {
    const cells = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function ImportModal({ onClose, returnFocusRef }: { onClose: () => void; returnFocusRef: RefObject<HTMLElement | null> }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({ phone: "", name: "", email: "", tags: "", defaultTags: [], customFields: {} });
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [mappingFieldsOpen, setMappingFieldsOpen] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number" | "date" | "boolean">("text");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const fields = useCustomFields();
  const createField = useCreateCustomField();
  const importMut = useImportContacts();

  const setFile = (file?: File) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { setPreviewError("Selecione um arquivo CSV (.csv)."); return; }
    if (file.size > 5_000_000) { setPreviewError("O arquivo excede o limite de 5 MB."); return; }
    const reader = new FileReader();
    reader.onerror = () => setPreviewError("Não foi possível ler o arquivo CSV.");
    reader.onload = () => {
      const content = String(reader.result || "");
      const detectedHeaders = csvHeaders(content);
      if (!detectedHeaders.length) { setPreviewError("O CSV precisa ter uma linha de cabeçalhos."); return; }
      const phone = findImportColumn(detectedHeaders, ["telefone", "phone", "celular", "whatsapp", "número", "numero"]);
      setCsv(content); setFileName(file.name); setHeaders(detectedHeaders); setPreview(null); setPreviewError("");
      setMapping({ phone, name: findImportColumn(detectedHeaders, ["nome", "name", "nome completo"]), email: findImportColumn(detectedHeaders, ["email", "e-mail", "e_mail"]), tags: findImportColumn(detectedHeaders, ["tags", "tag"]), defaultTags: [], customFields: {} });
      setStep(2);
    };
    reader.readAsText(file, "UTF-8");
  };

  const refreshPreview = async () => {
    if (!mapping.phone) { setPreview(null); setPreviewError("Selecione a coluna de telefone para continuar."); return; }
    setPreviewError("");
    try {
      const result = await api<ImportPreview>("/api/contacts/import-preview", { method: "POST", body: JSON.stringify({ csv, mapping }) });
      setPreview(result);
    } catch (error) { setPreview(null); setPreviewError(error instanceof Error ? error.message : "Não foi possível gerar a prévia."); }
  };

  useEffect(() => { if (step === 2 && csv && mapping.phone) void refreshPreview(); }, [step, csv, mapping.phone, mapping.name, mapping.email, mapping.tags, JSON.stringify(mapping.customFields)]);

  const updateMapping = (key: "phone" | "name" | "email" | "tags", value: string) => setMapping((current) => ({ ...current, [key]: value || undefined }));
  const fieldKey = newFieldLabel.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "campo_").slice(0, 64);
  const createCustomField = () => createField.mutate({ label: newFieldLabel.trim(), key: fieldKey || "campo", type: newFieldType }, { onSuccess: (field) => { setMapping((current) => ({ ...current, customFields: { ...current.customFields, [field.id]: "" } })); setNewFieldLabel(""); } });

  const submit = () => importMut.mutate({ csv, mapping }, { onSuccess: () => setStep(3) });
  const examples = csvPreviewRows(csv, headers);
  return <Modal titleId="import-contacts-title" onClose={onClose} closeDisabled={importMut.isPending} initialFocusRef={closeButton} returnFocusRef={returnFocusRef} panelClassName="max-w-2xl !rounded-2xl !p-8">
    <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-6">
      <div><h2 id="import-contacts-title" className="text-2xl font-bold">Importar Contatos</h2><p className="mt-1 text-sm text-zinc-400">Adicione múltiplos contatos de uma vez via CSV</p></div>
      <button ref={closeButton} type="button" onClick={onClose} disabled={importMut.isPending} aria-label="Fechar importação" className={`rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white ${focusRing}`}><X size={20} /></button>
    </div>
    {step === 1 && <div className="mt-6 px-3"><input ref={fileInput} aria-label="Selecionar arquivo CSV para importação" type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => setFile(event.target.files?.[0])} /><button type="button" onClick={() => fileInput.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); setFile(event.dataTransfer.files?.[0]); }} className={`flex min-h-[234px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${dragging ? "border-primary-400 bg-primary-500/10" : "border-zinc-700 bg-zinc-900/40 hover:border-primary-500/60"}`}><UploadCloud size={28} className="mb-3 text-primary-400"/><span className="font-semibold text-white">Clique para selecionar ou arraste aqui</span><span className="mt-2 text-sm text-zinc-500">Suporta arquivos .csv (Máx 5MB)</span></button>{previewError && <p role="alert" className="mt-3 text-sm text-red-300">{previewError}</p>}<div className="mt-6 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-sm"><p className="font-medium text-white">ⓘ &nbsp; Dica de Formatação</p><p className="mt-1 pl-7 text-[var(--ds-text-secondary)]">Seu arquivo deve ter cabeçalhos na primeira linha (Ex: Nome, Telefone). O sistema tentará identificar as colunas automaticamente.</p></div><div className="mt-6 flex justify-end border-t border-zinc-800 pt-5"><button type="button" onClick={onClose} className="text-sm text-zinc-400 hover:text-white">Cancelar</button></div></div>}
    {step === 2 && <div className="mt-6 space-y-5"><div className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900/50 px-4 py-3 text-sm"><span className="font-medium text-white">{fileName}</span><button type="button" onClick={() => { setStep(1); setCsv(""); setHeaders([]); setPreview(null); }} className="text-red-400 hover:underline">Trocar</button></div><h3 className="text-sm font-medium uppercase tracking-wider text-zinc-200">Mapear colunas</h3><div className="space-y-3"><ImportColumn label="Nome do Contato" value={mapping.name || ""} headers={headers} onChange={(value) => updateMapping("name", value)} /><ImportColumn label="Telefone / WhatsApp *" value={mapping.phone} headers={headers} onChange={(value) => updateMapping("phone", value)} /><ImportColumn label="E-mail" value={mapping.email || ""} headers={headers} onChange={(value) => updateMapping("email", value)} /><ImportColumn label="Tags" value={mapping.tags || ""} headers={headers} onChange={(value) => updateMapping("tags", value)} /></div><div className="border-t border-zinc-800 pt-4"><h3 className="text-sm font-medium uppercase tracking-wider text-zinc-200">Campos personalizados</h3>{(fields.data?.items.length ?? 0) === 0 ? <button type="button" onClick={() => setMappingFieldsOpen(true)} className="mt-3 w-full rounded-xl border border-zinc-800 px-3 py-3 text-left text-sm italic text-zinc-500 hover:border-primary-500/40 hover:text-zinc-300">Nenhum campo personalizado encontrado. Crie campos personalizados nas configurações para mapeá-los aqui.</button> : <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-zinc-500">Mapeie colunas extras ou crie um campo sem sair da importação.</p><button type="button" onClick={() => setMappingFieldsOpen(true)} className={btnSecondary}>Mapear campos</button></div>}{Object.entries(mapping.customFields).filter(([, column]) => column).length > 0 && <p className="mt-3 text-xs text-primary-300">{Object.entries(mapping.customFields).filter(([, column]) => column).length} campo(s) mapeado(s).</p>}</div>{preview && <div className="border-t border-zinc-800 pt-4"><h3 className="text-sm font-medium uppercase tracking-wider text-zinc-400">Resumo da importação</h3><div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5"><ImportStat label="Total" value={preview.total} /><ImportStat label="Novos" value={Math.max(0, preview.valid - preview.existing)} /><ImportStat label="Existentes" value={preview.existing} /><ImportStat label="Duplicados" value={preview.duplicates} /><ImportStat label="Inválidos" value={preview.invalid} /></div></div>}{previewError && <p role="alert" className="text-sm text-red-300">{previewError}</p>}<div className="flex justify-end gap-7"><button type="button" className="text-sm text-zinc-400 hover:text-white" onClick={() => setStep(1)}>Cancelar</button><button type="button" disabled={!preview || importMut.isPending || preview.valid === 0} onClick={submit} className="rounded-xl bg-primary-500 px-5 py-3 text-sm font-bold text-white hover:bg-primary-400 disabled:opacity-50">{importMut.isPending ? "Importando…" : "ⓘ  Confirmar Importação"}</button></div>{importMut.error && <p role="alert" className="text-sm text-red-300">{importMut.error.message}</p>}</div>}
    {step === 3 && importMut.data && <div className="mt-16 pb-[30px] text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary-500/15 text-primary-300"><UserCheck size={32}/></div><h3 className="mt-6 text-2xl font-bold">Importação Concluída!</h3><p className="mt-2 text-sm text-zinc-400">Seus contatos foram processados com sucesso.</p><div className="mx-auto mt-8 grid max-w-lg grid-cols-2 gap-3 sm:grid-cols-4"><ImportStat label="Linhas" value={importMut.data.imported + importMut.data.duplicates + importMut.data.invalid}/><ImportStat label="Importados" value={importMut.data.imported} className="border-primary-500/40 bg-primary-500/10 text-primary-400"/><ImportStat label="Atualizados" value={importMut.data.updated} className="border-blue-500/40 bg-blue-500/10 text-blue-400"/><ImportStat label="Ignorados" value={importMut.data.duplicates + importMut.data.invalid}/></div>{importMut.data.invalid > 0 && <p className="mt-3 text-xs text-amber-300">Erros de validação: {importMut.data.invalid}</p>}<div className="mt-16 flex justify-end border-t border-zinc-800 pt-6"><button type="button" onClick={onClose} className="rounded-xl bg-white px-8 py-3 text-sm font-bold text-black hover:bg-zinc-200">Fechar</button></div></div>}
    {mappingFieldsOpen && <ImportFieldMappingSheet headers={headers} fields={fields.data?.items || []} mapping={mapping.customFields} onChange={(customFields) => setMapping((current) => ({ ...current, customFields }))} onClose={() => setMappingFieldsOpen(false)} newFieldLabel={newFieldLabel} newFieldType={newFieldType} onLabelChange={setNewFieldLabel} onTypeChange={setNewFieldType} onCreate={createCustomField} creating={createField.isPending} createError={createField.error?.message} />}
  </Modal>;
}

function ImportColumn({ label, value, headers, onChange }: { label: string; value: string; headers: string[]; onChange: (value: string) => void }) { return <label className="grid items-center gap-2 text-sm text-zinc-300 sm:grid-cols-[1fr_290px]">{label}<select aria-label={`Coluna para ${label.replace(" *", "")}`} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}><option value="">Não importar</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>; }
function ImportStat({ label, value, className = "" }: { label: string; value: number; className?: string }) { return <div className={`rounded-lg border border-zinc-700 bg-zinc-950/40 px-2 py-3 text-center ${className}`}><strong className="block text-lg">{value}</strong><span className="text-[11px] text-zinc-500">{label}</span></div>; }
function ImportFieldMappingSheet({ headers, fields, mapping, onChange, onClose, newFieldLabel, newFieldType, onLabelChange, onTypeChange, onCreate, creating, createError }: { headers: string[]; fields: Array<{ id: string; label: string }>; mapping: Record<string, string>; onChange: (value: Record<string, string>) => void; onClose: () => void; newFieldLabel: string; newFieldType: "text" | "number" | "date" | "boolean"; onLabelChange: (value: string) => void; onTypeChange: (value: "text" | "number" | "date" | "boolean") => void; onCreate: () => void; creating: boolean; createError?: string }) { return <div className="fixed inset-0 z-[80] flex justify-end bg-black/50" role="dialog" aria-modal="true" aria-label="Mapear campos personalizados"><aside className="h-full w-full max-w-md overflow-y-auto border-l border-zinc-700 bg-zinc-950 p-6 shadow-2xl"><div className="flex items-center justify-between"><div><h3 className="text-lg font-bold">Mapear campos</h3><p className="mt-1 text-sm text-zinc-400">Associe uma coluna a cada campo.</p></div><button type="button" aria-label="Fechar mapeamento de campos" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800"><X size={20}/></button></div><div className="mt-6 space-y-3">{fields.map((field) => <label key={field.id} className="block text-sm text-zinc-300">{field.label}<select value={mapping[field.id] || ""} onChange={(event) => onChange({ ...mapping, [field.id]: event.target.value })} className={`mt-1.5 ${inputClass}`}><option value="">Não importar</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div><div className="mt-7 border-t border-zinc-800 pt-5"><h4 className="font-semibold">Criar campo</h4><input value={newFieldLabel} onChange={(event) => onLabelChange(event.target.value)} placeholder="Ex.: Empresa" className={`mt-3 ${inputClass}`}/><select value={newFieldType} onChange={(event) => onTypeChange(event.target.value as "text" | "number" | "date" | "boolean")} className={`mt-3 ${inputClass}`}><option value="text">Texto</option><option value="number">Número</option><option value="date">Data</option><option value="boolean">Sim ou não</option></select>{createError && <p className="mt-2 text-sm text-red-300">{createError}</p>}<button type="button" disabled={!newFieldLabel.trim() || creating} onClick={onCreate} className={`mt-3 w-full ${btnPrimary}`}>{creating ? "Criando…" : "Criar campo"}</button></div><button type="button" onClick={onClose} className={`mt-6 w-full ${btnSecondary}`}>Concluir mapeamento</button></aside></div>; }

function LegacyImportModal({
  onClose,
  returnFocusRef,
}: {
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const [csv, setCsv] = useState("");
  const [phoneCol, setPhoneCol] = useState("telefone");
  const [nameCol, setNameCol] = useState("nome");
  const [emailCol, setEmailCol] = useState("");
  const [tagsCol, setTagsCol] = useState("");
  const [defaultTags, setDefaultTags] = useState("");
  const [customMapping, setCustomMapping] = useState<Record<string, string>>({});
  const customFields = useCustomFields();
  const [optIn, setOptIn] = useState(false);
  const importMut = useImportContacts();
  const closeButton = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      titleId="import-contacts-title"
      onClose={onClose}
      closeDisabled={importMut.isPending}
      initialFocusRef={closeButton}
      returnFocusRef={returnFocusRef}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 id="import-contacts-title" className="text-base font-semibold">
          Importar contatos (CSV)
        </h2>
        <button
          ref={closeButton}
          type="button"
          disabled={importMut.isPending}
          onClick={onClose}
          aria-label="Fechar"
          className={`rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200 ${focusRing}`}
        >
          ✕
        </button>
      </div>

      <textarea
        aria-label="Conteúdo CSV"
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={6}
        placeholder={"telefone,nome\n11999990001,Ana"}
        className={`mb-3 font-mono text-xs ${inputClass}`}
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="Coluna do telefone"
          value={phoneCol}
          onChange={(e) => setPhoneCol(e.target.value)}
          placeholder="coluna do telefone"
          className={`flex-1 ${inputClass}`}
        />
        <input
          aria-label="Coluna do nome"
          value={nameCol}
          onChange={(e) => setNameCol(e.target.value)}
          placeholder="coluna do nome (opcional)"
          className={`flex-1 ${inputClass}`}
        />
      </div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="Coluna do e-mail"
          value={emailCol}
          onChange={(e) => setEmailCol(e.target.value)}
          placeholder="coluna do e-mail (opcional)"
          className={`flex-1 ${inputClass}`}
        />
        <input
          aria-label="Coluna das tags"
          value={tagsCol}
          onChange={(e) => setTagsCol(e.target.value)}
          placeholder="coluna das tags (opcional)"
          className={`flex-1 ${inputClass}`}
        />
      </div>
      <input
        aria-label="Tags padrão"
        value={defaultTags}
        onChange={(e) => setDefaultTags(e.target.value)}
        placeholder="tags padrão, separadas por vírgula (opcional)"
        className={`mb-3 ${inputClass}`}
      />
      {(customFields.data?.items.length ?? 0) > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--ds-border-default)] p-3">
          <p className="mb-3 text-xs font-semibold text-zinc-300">Mapear campos personalizados</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {customFields.data!.items.map((field) => (
              <label key={field.id} className="text-xs text-zinc-400">
                {field.label}
                <input
                  aria-label={`Coluna para ${field.label}`}
                  value={customMapping[field.id] || ""}
                  onChange={(event) =>
                    setCustomMapping((current) => ({ ...current, [field.id]: event.target.value }))
                  }
                  placeholder="nome da coluna (opcional)"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <label className="mb-4 flex items-start gap-2.5 rounded-[--radius-app] border border-status-skipped/35 bg-status-skipped/5 p-3 text-xs leading-relaxed text-zinc-300">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
          className="mt-0.5 accent-primary-500"
        />
        <span>
          <strong className="text-zinc-100">
            Declaração de opt-in obrigatória:
          </strong>{" "}
          confirmo que esta lista possui consentimento documentado dos titulares
          (LGPD art. 7º) e atende à política anti-spam da Meta.
        </span>
      </label>

      {importMut.data && (
        <p className="mb-3 rounded-[--radius-app] border border-primary-500/25 bg-primary-500/10 px-3 py-2 text-sm text-primary-300">
          {importMut.data.imported} importados · {importMut.data.duplicates}{" "}
          duplicados · {importMut.data.invalid} inválidos
        </p>
      )}
      {importMut.error && (
        <p className="mb-3 text-sm text-status-failed">
          {importMut.error.message}
        </p>
      )}

      <button
        disabled={!optIn || !csv || importMut.isPending}
        onClick={() =>
          importMut.mutate({
            csv,
            mapping: {
              phone: phoneCol,
              name: nameCol || undefined,
              email: emailCol || undefined,
              tags: tagsCol || undefined,
              defaultTags: defaultTags.split(",").map((tag) => tag.trim()).filter(Boolean),
              customFields: Object.fromEntries(
                Object.entries(customMapping).filter(([, column]) => column.trim()),
              ),
            },
            optInConfirmed: optIn,
          })
        }
        className={`w-full ${btnPrimary}`}
      >
        Importar
      </button>
    </Modal>
  );
}
