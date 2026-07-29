import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Brain,
  CircleUserRound,
  MoreHorizontal,
  MoreVertical,
  Paperclip,
  FileText,
  Search,
  Send,
  Settings,
  MessageSquareDashed,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Users,
  X,
} from "lucide-react";
import {
  useConversation,
  useConversationAi,
  useConversationMessages,
  useConversations,
  useCreateManualDraft,
  useUploadConversationMedia,
  useGenerateAiDraft,
  useMarkConversationRead,
  useReviewAiDraft,
  useSendAiDraft,
  useToggleConversationAi,
  useContactMemory,
  useConversationLabels,
  useInboxLabels,
  useSaveContactMemory,
  useSetConversationLabels,
  useConversationOperation,
  useInboxAgents,
  useSetConversationAgent,
  useAddConversationNote,
  useConversationNotes,
  useCreateQuickReply,
  useQuickReplies,
  useInboxTemplates,
  useSendConversationTemplate,
} from "../hooks/useConversations";
import type { InboxTemplateMapping } from "../hooks/useConversations";
import {
  Button,
  Card,
  Modal,
  btnSecondary,
  focusRing,
  inputClass,
} from "../components/ui";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { TemplatePreviewCard } from "../components/TemplatePreviewCard";

const PAGE_SIZE = 50;
type Attendant = {
  id: string;
  name: string;
  token: string;
  is_active: boolean;
  access_count: number;
  permissions: { canView: boolean; canReply: boolean; canHandoff: boolean };
};

function timestamp(seconds: number | null) {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTimestamp(seconds: number | null) {
  if (!seconds) return "—";
  const diff = Math.max(0, Date.now() - seconds * 1000);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} ${hours === 1 ? "hora" : "horas"}`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function conversationIdentity(item?: {
  phone?: string | null;
  username?: string | null;
  user_id?: string | null;
}) {
  if (item?.username) return `@${item.username}`;
  if (item?.phone && !item.phone.startsWith("bsuid:")) return item.phone;
  return item?.user_id ? "Usuário WhatsApp" : "Contato";
}

function messageTime(seconds: number) {
  return new Date(seconds * 1000).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function remainingTime(seconds: number | null | undefined) {
  if (!seconds) return "";
  const minutes = Math.max(
    0,
    Math.ceil((seconds * 1000 - Date.now()) / 60_000),
  );
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

type InboxTemplateVariable = { key: string; label: string };

function inboxTemplateVariables(components: unknown): InboxTemplateVariable[] {
  if (!Array.isArray(components)) return [];
  const result: InboxTemplateVariable[] = [];
  for (const raw of components) {
    if (!raw || typeof raw !== "object") continue;
    const component = raw as { type?: unknown; text?: unknown; buttons?: unknown };
    const type = String(component.type ?? "").toLowerCase();
    if (type === "header" || type === "body") {
      const indexes = [...String(component.text ?? "").matchAll(/{{\s*(\d+)\s*}}/g)]
        .map((match) => Number(match[1]));
      for (const index of [...new Set(indexes)].sort((a, b) => a - b))
        result.push({ key: `${type}.${index}`, label: `${type === "header" ? "Cabeçalho" : "Corpo"} {{${index}}}` });
    }
    if (type === "buttons" && Array.isArray(component.buttons)) {
      component.buttons.forEach((button, buttonIndex) => {
        const url = button && typeof button === "object"
          ? String((button as { url?: unknown }).url ?? "")
          : "";
        const indexes = [...url.matchAll(/{{\s*(\d+)\s*}}/g)].map((match) => Number(match[1]));
        for (const index of [...new Set(indexes)].sort((a, b) => a - b))
          result.push({ key: `button.${buttonIndex}.${index}`, label: `Botão ${buttonIndex + 1} {{${index}}}` });
      });
    }
  }
  return result;
}

function inboxTemplatePreview(
  components: unknown,
  mapping: InboxTemplateMapping,
  conversation: { name?: string | null; phone?: string | null } | undefined,
) {
  if (!Array.isArray(components)) return components;
  const valueOf = (key: string) => {
    const source = mapping[key];
    if (!source) return undefined;
    if (source.source === "fixed") return source.value;
    if (source.source === "contact_name") return conversation?.name || "Nome do contato";
    if (source.source === "contact_phone") return conversation?.phone || "Telefone";
    return "E-mail do contato";
  };
  return components.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const component = { ...(raw as Record<string, unknown>) };
    const type = String(component.type ?? "").toLowerCase();
    if (type === "header" || type === "body")
      component.text = String(component.text ?? "").replace(
        /{{\s*(\d+)\s*}}/g,
        (match, index: string) => valueOf(`${type}.${index}`) || match,
      );
    if (type === "buttons" && Array.isArray(component.buttons))
      component.buttons = component.buttons.map((button, buttonIndex) => {
        if (!button || typeof button !== "object") return button;
        const next = { ...(button as Record<string, unknown>) };
        next.url = String(next.url ?? "").replace(
          /{{\s*(\d+)\s*}}/g,
          (match, index: string) => valueOf(`button.${buttonIndex}.${index}`) || match,
        );
        return next;
      });
    return component;
  });
}

function messageFallback(
  type: string,
  content: Record<string, unknown> | null,
) {
  if (type === "reaction" && typeof content?.emoji === "string")
    return content.emoji;
  const labels: Record<string, string> = {
    image: "Imagem",
    video: "Vídeo",
    audio: "Áudio",
    document: "Documento",
    sticker: "Figurinha",
    location: "Localização",
    contacts: "Contato",
    interactive: "Resposta interativa",
    button: "Botão",
    unsupported: "Mensagem não suportada",
  };
  return `[${labels[type] ?? type}]`;
}

function MessageMedia({
  conversationId,
  message,
}: {
  conversationId: string;
  message: {
    id: string;
    message_type: string;
    content: Record<string, unknown> | null;
  };
}) {
  const mediaId =
    typeof message.content?.mediaId === "string"
      ? message.content.mediaId
      : null;
  if (
    !mediaId ||
    !["image", "video", "audio", "document", "sticker"].includes(
      message.message_type,
    )
  )
    return null;
  const src = `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(message.id)}/media`;
  const filename =
    typeof message.content?.filename === "string"
      ? message.content.filename
      : "Baixar mídia";
  if (message.message_type === "image" || message.message_type === "sticker")
    return (
      <img
        src={src}
        alt={
          message.message_type === "sticker"
            ? "Figurinha recebida"
            : "Imagem recebida"
        }
        className="mb-2 max-h-72 max-w-full rounded-lg object-contain"
        loading="lazy"
      />
    );
  if (message.message_type === "video")
    return (
      <video
        controls
        preload="metadata"
        src={src}
        className="mb-2 max-h-72 max-w-full rounded-lg"
      />
    );
  if (message.message_type === "audio")
    return (
      <audio controls preload="metadata" src={src} className="mb-2 w-full" />
    );
  return (
    <a
      href={src}
      download={filename}
      className="mb-2 inline-flex rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-primary-300 hover:text-primary-200"
    >
      {filename}
    </a>
  );
}

export default function Inbox() {
  const { id = "" } = useParams();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [messagesPage, setMessagesPage] = useState(1);
  const [sendConfirmation, setSendConfirmation] = useState<{
    draftId: string;
    requestKey: string;
    text?: string;
    media?: import("../hooks/useConversations").OutboundMedia;
  } | null>(null);
  const [manualText, setManualText] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [templateMapping, setTemplateMapping] = useState<InboxTemplateMapping>({});
  const mediaInput = useRef<HTMLInputElement | null>(null);
  const sendMessageButton = useRef<HTMLButtonElement | null>(null);
  const [noteText, setNoteText] = useState("");
  const [quickReplyForm, setQuickReplyForm] = useState({
    title: "",
    shortcut: "",
    body: "",
  });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [headerActionsOpen, setHeaderActionsOpen] = useState(false);
  const [toolbarPopover, setToolbarPopover] = useState<
    "attendants" | "settings" | "filters" | null
  >(null);
  const [statusFilter, setStatusFilter] = useState<"open" | "closed" | null>(
    null,
  );
  const [modeFilter, setModeFilter] = useState<"human" | "bot" | null>(null);
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [inboxSettings, setInboxSettings] = useState({
    retention_days: 365,
    human_mode_timeout_hours: 0,
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState("");
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [attendantName, setAttendantName] = useState("");
  const [attendantBusy, setAttendantBusy] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  const readRequested = useRef<string | null>(null);
  const messagesViewport = useRef<HTMLDivElement | null>(null);
  const conversations = useConversations(q, page, {
    status: statusFilter ?? undefined,
    mode: modeFilter ?? undefined,
    labelId: labelFilter ?? undefined,
  });
  const conversation = useConversation(id);
  const messages = useConversationMessages(id, messagesPage);
  const markRead = useMarkConversationRead(id);
  const ai = useConversationAi(id);
  const toggleAi = useToggleConversationAi(id);
  const generateDraft = useGenerateAiDraft(id);
  const createManualDraft = useCreateManualDraft(id);
  const uploadMedia = useUploadConversationMedia(id);
  const inboxTemplates = useInboxTemplates();
  const sendTemplate = useSendConversationTemplate(id);
  const reviewDraft = useReviewAiDraft(id);
  const sendDraft = useSendAiDraft(id);
  const labels = useInboxLabels();
  const conversationLabels = useConversationLabels(id);
  const setLabels = useSetConversationLabels(id);
  const memory = useContactMemory(conversation.data?.contact_id ?? "");
  const saveMemory = useSaveContactMemory(conversation.data?.contact_id ?? "");
  const operation = useConversationOperation(id);
  const agents = useInboxAgents();
  const setAgent = useSetConversationAgent(id);
  const notes = useConversationNotes(id);
  const addNote = useAddConversationNote(id);
  const quickReplies = useQuickReplies();
  const createQuickReply = useCreateQuickReply();
  const total = conversations.data?.total ?? 0;
  const totalUnread = (conversations.data?.items ?? []).reduce(
    (sum, item) => sum + item.unread_count,
    0,
  );
  const activeFilterCount =
    Number(Boolean(statusFilter)) +
    Number(Boolean(modeFilter)) +
    Number(Boolean(labelFilter));
  const visibleConversations = conversations.data?.items ?? [];
  const latestDraft = ai.data?.drafts.find(
    (draft) => draft.status === "pending_review" || draft.status === "approved",
  );
  const availableTemplates = (inboxTemplates.data?.items ?? []).filter((item) =>
    `${item.name} ${item.language} ${item.category}`
      .toLowerCase()
      .includes(templateSearch.trim().toLowerCase()),
  );
  const selectedTemplate = (inboxTemplates.data?.items ?? []).find(
    (item) => `${item.name}:${item.language}` === selectedTemplateKey,
  );
  const selectedTemplateVariables = inboxTemplateVariables(
    selectedTemplate?.components,
  );
  const templateReady = Boolean(selectedTemplate) && selectedTemplateVariables.every((variable) => {
    const source = templateMapping[variable.key];
    return Boolean(source && (source.source !== "fixed" || source.value.trim()));
  });

  useEffect(() => {
    if ((conversation.data?.unread_count ?? 0) === 0) {
      readRequested.current = null;
      return;
    }
    if (id && readRequested.current !== id && !markRead.isPending) {
      readRequested.current = id;
      markRead.mutate();
    }
  }, [id, conversation.data?.unread_count, markRead.isPending]);

  useEffect(() => {
    setMessagesPage(1);
    setModeMenuOpen(false);
    setHeaderActionsOpen(false);
  }, [id]);
  useEffect(() => {
    setMemoryDraft(memory.data?.memory?.summary ?? "");
  }, [memory.data?.memory?.summary, id]);
  useEffect(() => {
    const viewport = messagesViewport.current;
    if (!viewport || messages.isLoading) return;
    requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
  }, [id, messages.data?.items.length, messages.isLoading]);
  useEffect(() => {
    if (toolbarPopover !== "settings") return;
    let active = true;
    api<{ retention_days: number; human_mode_timeout_hours: number }>(
      "/api/settings/inbox",
    )
      .then((value) => {
        if (active) setInboxSettings(value);
      })
      .catch((error: Error) => {
        if (active) setSettingsFeedback(error.message);
      });
    return () => {
      active = false;
    };
  }, [toolbarPopover]);
  useEffect(() => {
    if (toolbarPopover !== "attendants") return;
    api<Attendant[]>("/api/attendants")
      .then(setAttendants)
      .catch(() => setAttendants([]));
  }, [toolbarPopover]);

  async function saveInboxSettings() {
    setSettingsSaving(true);
    setSettingsFeedback("");
    try {
      const saved = await api<typeof inboxSettings>("/api/settings/inbox", {
        method: "PATCH",
        body: JSON.stringify(inboxSettings),
      });
      setInboxSettings(saved);
      setSettingsFeedback("Configurações salvas");
    } catch (error) {
      setSettingsFeedback(
        error instanceof Error ? error.message : "Erro ao salvar",
      );
    } finally {
      setSettingsSaving(false);
    }
  }

  async function createAttendant() {
    if (!attendantName.trim()) return;
    setAttendantBusy(true);
    try {
      const created = await api<Attendant>("/api/attendants", {
        method: "POST",
        body: JSON.stringify({ name: attendantName.trim() }),
      });
      setAttendants((current) => [created, ...current]);
      setAttendantName("");
    } finally {
      setAttendantBusy(false);
    }
  }

  async function deleteAttendant(attendantId: string) {
    setAttendantBusy(true);
    try {
      await api<{ success: true }>(`/api/attendants/${attendantId}`, {
        method: "DELETE",
      });
      setAttendants((current) =>
        current.filter((item) => item.id !== attendantId),
      );
    } finally {
      setAttendantBusy(false);
    }
  }

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-[var(--ds-bg-base)]">
    <section className={`relative w-full min-w-0 flex-col overflow-hidden bg-[var(--ds-bg-elevated)] shadow-[1px_0_8px_-2px_rgba(0,0,0,0.3)] lg:flex lg:w-[28%] lg:shrink-0 lg:min-w-[290px] lg:max-w-[420px] ${id ? "hidden" : "flex"}`}>
        <div className="px-3 py-2.5">
          <div className="relative flex items-center gap-1.5">
            <label className="relative block flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                size={15}
                aria-hidden="true"
              />
              <input
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(1);
                }}
                placeholder="Buscar..."
                aria-label="Buscar conversa"
                className="h-8 w-full rounded-lg border-0 bg-[var(--ds-bg-surface)]/60 py-1.5 pl-9 pr-8 text-xs text-[var(--ds-text-primary)] outline-none placeholder:text-[var(--ds-text-muted)] focus:ring-1 focus:ring-[var(--ds-border-strong)]"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)]"
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <button
              type="button"
              aria-label="Atendentes"
              aria-expanded={toolbarPopover === "attendants"}
              onClick={() =>
                setToolbarPopover((current) =>
                  current === "attendants" ? null : "attendants",
                )
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-surface)]/60 hover:text-[var(--ds-text-secondary)]"
            >
              <Users size={14} />
            </button>
            <button
              type="button"
              aria-label="Configurações da Inbox"
              aria-expanded={toolbarPopover === "settings"}
              onClick={() =>
                setToolbarPopover((current) =>
                  current === "settings" ? null : "settings",
                )
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-surface)]/60 hover:text-[var(--ds-text-secondary)]"
            >
              <Settings size={14} />
            </button>
            <button
              type="button"
              aria-label="Filtros"
              aria-expanded={toolbarPopover === "filters"}
              onClick={() =>
                setToolbarPopover((current) =>
                  current === "filters" ? null : "filters",
                )
              }
              className={`relative flex h-8 w-8 items-center justify-center rounded-lg ${activeFilterCount ? "bg-emerald-500/10 text-emerald-400" : "text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-surface)]/60 hover:text-[var(--ds-text-secondary)]"}`}
            >
              <SlidersHorizontal size={14} />
              {activeFilterCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          {totalUnread > 0 && (
            <div className="mt-2 flex items-center gap-1.5 px-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="whitespace-nowrap text-[10px] text-[var(--ds-text-muted)]">
                {totalUnread} {totalUnread === 1 ? "não lida" : "não lidas"}
              </span>
            </div>
          )}
          {toolbarPopover === "filters" && (
            <div className="absolute right-2 top-11 z-40 w-48 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-1.5 shadow-2xl">
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                Status
              </p>
              {(
                [
                  ["Todas", null],
                  ["Abertas", "open"],
                  ["Fechadas", "closed"],
                ] as const
              ).map(([label, value]) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => setStatusFilter(value)}
                  className={`block w-full rounded px-2 py-1.5 text-left text-xs ${statusFilter === value ? "bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)]" : "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]"}`}
                >
                  {label}
                </button>
              ))}
              <div className="my-1 border-t border-[var(--ds-border-subtle)]" />
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                Modo
              </p>
              {(
                [
                  ["Todos", null],
                  ["Bot", "bot"],
                  ["Humano", "human"],
                ] as const
              ).map(([label, value]) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => setModeFilter(value)}
                  className={`block w-full rounded px-2 py-1.5 text-left text-xs ${modeFilter === value ? "bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)]" : "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]"}`}
                >
                  {label}
                </button>
              ))}
              {labels.data?.items.length ? (
                <>
                  <div className="my-1 border-t border-[var(--ds-border-subtle)]" />
                  <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                    Etiquetas
                  </p>
                  <button
                    type="button"
                    onClick={() => setLabelFilter(null)}
                    className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]"
                  >
                    Todas
                  </button>
                  {labels.data.items.map((label) => (
                    <button
                      type="button"
                      key={label.id}
                      onClick={() => setLabelFilter(label.id)}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: label.color ?? "#10b981" }}
                      />
                      {label.name}
                    </button>
                  ))}
                </>
              ) : null}
              {activeFilterCount > 0 && (
                <>
                  <div className="my-1 border-t border-[var(--ds-border-subtle)]" />
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter(null);
                      setModeFilter(null);
                      setLabelFilter(null);
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]"
                  >
                    Limpar filtros
                  </button>
                </>
              )}
            </div>
          )}
          {toolbarPopover === "attendants" && (
            <div className="absolute right-2 top-11 z-40 w-72 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] shadow-2xl">
              <div className="flex items-center gap-2 border-b border-[var(--ds-border-subtle)] px-3 py-2">
                <Users size={14} className="text-emerald-400" />
                <span className="text-xs font-medium">Atendentes</span>
              </div>
              <div className="space-y-2 p-2">
                <div className="flex gap-1.5">
                  <input
                    aria-label="Nome do atendente"
                    value={attendantName}
                    onChange={(event) => setAttendantName(event.target.value)}
                    placeholder="Nome do atendente"
                    className={`${inputClass} h-8 py-1 text-xs`}
                  />
                  <button
                    type="button"
                    disabled={!attendantName.trim() || attendantBusy}
                    onClick={createAttendant}
                    className="shrink-0 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white disabled:opacity-40"
                  >
                    Criar
                  </button>
                </div>
                {attendants.length ? (
                  <div className="max-h-64 space-y-1.5 overflow-y-auto">
                    {attendants.map((attendant) => (
                      <div
                        key={attendant.id}
                        className="rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 p-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-semibold text-emerald-400">
                            {attendant.name[0]?.toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">
                              {attendant.name}
                            </p>
                            <p className="text-[10px] text-[var(--ds-text-muted)]">
                              {attendant.access_count} acessos
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              navigator.clipboard.writeText(
                                `${window.location.origin}/atendimento?token=${attendant.token}`,
                              )
                            }
                            className="rounded p-1 text-[10px] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]"
                          >
                            Copiar
                          </button>
                          <button
                            type="button"
                            disabled={attendantBusy}
                            onClick={() => deleteAttendant(attendant.id)}
                            className="rounded p-1 text-[10px] text-red-400 hover:bg-red-500/10"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-5 text-center">
                    <Users className="mx-auto mb-2 h-8 w-8 text-[var(--ds-text-muted)]" />
                    <p className="text-xs text-[var(--ds-text-muted)]">
                      Nenhum atendente
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          {toolbarPopover === "settings" && (
            <div className="absolute right-2 top-11 z-40 w-72 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] shadow-2xl">
              <div className="border-b border-[var(--ds-border-subtle)] px-3 py-2 text-sm font-medium">
                Configurações do Inbox
              </div>
              <div className="space-y-3 p-3">
                <label className="block text-xs text-[var(--ds-text-secondary)]">
                  Timeout do modo humano
                  <select
                    aria-label="Timeout do modo humano"
                    className={`${inputClass} mt-1 h-8 py-1 text-xs`}
                    value={inboxSettings.human_mode_timeout_hours}
                    onChange={(event) =>
                      setInboxSettings((current) => ({
                        ...current,
                        human_mode_timeout_hours: Number(event.target.value),
                      }))
                    }
                  >
                    <option value="0">Nunca (recomendado)</option>
                    <option value="1">1 hora</option>
                    <option value="2">2 horas</option>
                    <option value="4">4 horas</option>
                    <option value="8">8 horas</option>
                    <option value="24">1 dia</option>
                    <option value="48">2 dias</option>
                    <option value="168">7 dias</option>
                  </select>
                </label>
                <label className="block text-xs text-[var(--ds-text-secondary)]">
                  Retenção de mensagens
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      aria-label="Retenção de mensagens"
                      type="number"
                      min={7}
                      max={365}
                      value={inboxSettings.retention_days}
                      onChange={(event) =>
                        setInboxSettings((current) => ({
                          ...current,
                          retention_days: Number(event.target.value),
                        }))
                      }
                      className={`${inputClass} h-8 w-20 py-1 text-xs`}
                    />
                    <span className="text-xs text-[var(--ds-text-muted)]">
                      dias
                    </span>
                  </div>
                </label>
                <button
                  type="button"
                  onClick={saveInboxSettings}
                  disabled={settingsSaving}
                  className="h-8 w-full rounded-lg bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {settingsSaving ? "Salvando…" : "Salvar alterações"}
                </button>
                {settingsFeedback && (
                  <p className="text-center text-[10px] text-[var(--ds-text-muted)]">
                    {settingsFeedback}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <div
          className={`flex-1 overflow-y-auto px-1.5 py-0.5 ${id ? "-mt-6" : ""}`}
        >
          {visibleConversations.map((item) => (
            <Link
              key={item.id}
              to={`/inbox/${item.id}`}
              className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-all duration-150 ${item.id === id ? "bg-[var(--ds-bg-surface)]/80" : item.unread_count > 0 ? "bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]" : "hover:bg-[var(--ds-bg-hover)]"}`}
            >
              <div className="relative shrink-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ds-bg-surface)]">
                  <span className="text-xs font-medium text-[var(--ds-text-secondary)]">
                    {initials(item.name ?? conversationIdentity(item))}
                  </span>
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--ds-bg-elevated)] ${item.mode === "bot" ? "bg-emerald-500" : "bg-amber-500"}`}
                />
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-[13px] ${item.unread_count > 0 ? "font-medium text-[var(--ds-text-primary)]" : "text-[var(--ds-text-secondary)]"}`}
                  >
                    {item.name ?? conversationIdentity(item)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.unread_count > 0 && (
                      <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-medium text-white">
                        {item.unread_count > 99 ? "99" : item.unread_count}
                      </span>
                    )}
                    <span className="text-[10px] text-[var(--ds-text-muted)]">
                      {relativeTimestamp(item.last_message_at)}
                    </span>
                  </div>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {item.status === "closed" && (
                    <span className="rounded bg-[var(--ds-bg-surface)] px-1 py-0.5 text-[9px] text-[var(--ds-text-muted)]">
                      fechada
                    </span>
                  )}
                  <p
                    className={`truncate text-[11px] ${item.unread_count > 0 ? "text-[var(--ds-text-secondary)]" : "text-[var(--ds-text-muted)]"}`}
                  >
                    {item.last_message_preview ?? "Sem mensagens"}
                  </p>
                </div>
              </div>
            </Link>
          ))}
          {conversations.isLoading && (
            <p className="px-5 py-12 text-center text-sm text-zinc-500">
              Carregando conversas…
            </p>
          )}
          {conversations.error && (
            <p className="px-5 py-12 text-center text-sm text-status-failed">
              {conversations.error.message}
            </p>
          )}
          {!conversations.isLoading &&
            !conversations.error &&
            (conversations.data?.items ?? []).length === 0 && (
              <p className="px-5 py-12 text-center text-sm text-zinc-500">
                Nenhuma conversa recebida.
              </p>
            )}
        </div>
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-zinc-800 p-3">
            <button
              className={btnSecondary}
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </button>
            <span className="text-xs text-zinc-500">{page}</span>
            <button
              className={btnSecondary}
              disabled={page * PAGE_SIZE >= total}
              onClick={() => setPage((value) => value + 1)}
            >
              Próxima
            </button>
          </div>
        )}
      </section>

      {!id ? (
        <div className="hidden flex-1 flex-col items-center justify-center bg-[var(--ds-bg-base)] text-center lg:flex">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ds-bg-surface)]">
            <CircleUserRound className="h-7 w-7 text-[var(--ds-text-muted)]" />
          </div>
          <p className="text-sm text-[var(--ds-text-muted)]">
            Selecione uma conversa
          </p>
        </div>
      ) : (
        <section className="relative flex min-w-0 flex-1 flex-col bg-[var(--ds-bg-base)]">
          <header className="flex items-center justify-between border-b border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <Link
                to="/inbox"
                aria-label="Voltar para conversas"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] lg:hidden"
              >
                <ArrowLeft size={17} aria-hidden="true" />
              </Link>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ds-bg-surface)] text-[11px] font-medium text-[var(--ds-text-secondary)]">
                {initials(
                  conversation.data?.name ?? conversationIdentity(conversation.data),
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-[13px] font-medium text-[var(--ds-text-primary)]">
                    {conversation.data?.name ??
                      conversationIdentity(conversation.data) ??
                      "Carregando…"}
                  </h3>
                  {conversation.data?.priority &&
                    conversation.data.priority !== "normal" && (
                      <AlertCircle
                        size={12}
                        aria-label={`Prioridade ${conversation.data.priority}`}
                        className={`shrink-0 ${conversation.data.priority === "urgent" ? "text-red-400" : conversation.data.priority === "high" ? "text-amber-400" : "text-[var(--ds-text-secondary)]"}`}
                      />
                    )}
                </div>
                <span className="text-[10px] text-[var(--ds-text-muted)]">
                  {conversationIdentity(conversation.data)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setDetailsOpen(true);
                  setModeMenuOpen(false);
                  setHeaderActionsOpen(false);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-violet-400 hover:bg-violet-500/10 hover:text-violet-300"
                aria-label="Contexto e memória"
              >
                <Brain size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setModeMenuOpen((open) => !open);
                  setHeaderActionsOpen(false);
                }}
                aria-expanded={modeMenuOpen}
                aria-haspopup="menu"
                className={`flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-medium ${conversation.data?.mode === "bot" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}
              >
                <Bot size={10} className="shrink-0" />
                <span className="max-w-[60px] truncate">
                  {conversation.data?.mode === "bot"
                    ? conversation.data?.ai_agent_name || "Agente IA"
                    : "Humano"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setHeaderActionsOpen((open) => !open);
                  setModeMenuOpen(false);
                }}
                aria-expanded={headerActionsOpen}
                aria-haspopup="menu"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-secondary)]"
                aria-label="Mais ações"
              >
                <MoreVertical size={16} />
              </button>
            </div>
          </header>
          {modeMenuOpen && (
            <div className="absolute top-12 right-12 z-20 w-56 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-2 shadow-2xl" role="menu" aria-label="Modo da conversa">
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                Modo da conversa
              </p>
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-lg px-2 py-2 text-left text-xs text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
                disabled={operation.isPending || conversation.data?.mode === "human"}
                onClick={() => {
                  operation.mutate({ mode: "human", handoffReason: "Assumido pelo operador" });
                  setModeMenuOpen(false);
                }}
              >
                Assumir atendimento humano
              </button>
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-lg px-2 py-2 text-left text-xs text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] disabled:opacity-50"
                disabled={operation.isPending || conversation.data?.mode === "bot" || !agents.data?.enabled}
                onClick={() => {
                  operation.mutate({ mode: "bot", handoffReason: null });
                  setModeMenuOpen(false);
                }}
              >
                Devolver à IA
              </button>
              <p className="px-2 pt-1 text-[10px] text-[var(--ds-text-muted)]">
                Atendimento global: {agents.data?.enabled ? "ativo" : "desativado"}
              </p>
            </div>
          )}
          {headerActionsOpen && (
            <div className="absolute top-12 right-3 z-20 w-48 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-2 shadow-2xl" role="menu" aria-label="Mais ações da conversa">
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-lg px-2 py-2 text-left text-xs text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
                onClick={() => {
                  setDetailsOpen(true);
                  setHeaderActionsOpen(false);
                }}
              >
                Abrir contexto e detalhes
              </button>
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-lg px-2 py-2 text-left text-xs text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
                disabled={operation.isPending}
                onClick={() => {
                  operation.mutate({
                    status: conversation.data?.status === "closed" ? "open" : "closed",
                  });
                  setHeaderActionsOpen(false);
                }}
              >
                {conversation.data?.status === "closed" ? "Reabrir conversa" : "Encerrar conversa"}
              </button>
            </div>
          )}
          {conversation.error && (
            <p
              className="border-b border-zinc-800 px-5 py-3 text-sm text-status-failed"
              role="alert"
            >
              {conversation.error.message}
            </p>
          )}
          <div
            ref={messagesViewport}
            className="flex-1 space-y-1.5 overflow-y-auto bg-[var(--ds-bg-base)] px-3 py-2"
          >
            {(messages.data?.items ?? [])
              .slice()
              .reverse()
              .map((message) => (
                <div
                  key={message.id}
                  className={`mb-2 flex w-full ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`flex max-w-[85%] flex-col ${message.direction === "outbound" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`rounded-2xl px-3.5 py-2 ${message.direction === "outbound" ? "rounded-br-sm bg-emerald-700/70 text-emerald-50" : "rounded-bl-sm bg-[var(--ds-bg-surface)]/80 text-[var(--ds-text-primary)]"}`}
                    >
                      <MessageMedia conversationId={id} message={message} />
                      <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
                        {message.text_body ??
                          messageFallback(
                            message.message_type,
                            message.content,
                          )}
                      </p>
                      {message.direction === "outbound" &&
                        Array.isArray(message.content?.aiSources) &&
                        message.content.aiSources.length > 0 && (
                          <p className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-200/70">
                            <Sparkles size={10} />
                            <span>
                              {message.content.aiSources.length} fontes
                            </span>
                          </p>
                        )}
                    </div>
                    <div
                      className={`mt-1 flex items-center gap-1.5 px-1 text-[10px] text-[var(--ds-text-muted)] ${message.direction === "outbound" ? "flex-row-reverse" : ""}`}
                    >
                      <span>{messageTime(message.meta_timestamp)}</span>
                      {message.direction === "outbound" &&
                        message.delivery_status && (
                          <span
                            className={
                              message.delivery_status === "failed"
                                ? "text-red-400"
                                : "text-blue-400"
                            }
                            aria-label={message.delivery_status}
                          >
                            ✓
                            {message.delivery_status === "delivered" ||
                            message.delivery_status === "read"
                              ? "✓"
                              : ""}
                          </span>
                        )}
                    </div>
                  </div>
                </div>
              ))}
            {messages.isLoading && (
              <p className="py-12 text-center text-sm text-zinc-500">
                Carregando mensagens…
              </p>
            )}
            {messages.error && (
              <p className="py-12 text-center text-sm text-status-failed">
                {messages.error.message}
              </p>
            )}
            {!messages.isLoading &&
              !messages.error &&
              (messages.data?.items ?? []).length === 0 && (
                <p className="py-12 text-center text-sm text-zinc-500">
                  Nenhuma mensagem nesta conversa.
                </p>
              )}
          </div>
          {(messages.data?.total ?? 0) > PAGE_SIZE && (
            <div className="flex items-center justify-end gap-3 border-t border-zinc-800 px-4 py-3">
              <button
                className={btnSecondary}
                disabled={messagesPage === 1}
                onClick={() => setMessagesPage((value) => value - 1)}
              >
                Mais recentes
              </button>
              <span className="text-xs text-zinc-500">
                Página {messagesPage}
              </span>
              <button
                className={btnSecondary}
                disabled={
                  messagesPage * PAGE_SIZE >= (messages.data?.total ?? 0)
                }
                onClick={() => setMessagesPage((value) => value + 1)}
              >
                Mais antigas
              </button>
            </div>
          )}
          <div className="flex h-[61px] shrink-0 items-center gap-2 border-t border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] px-3">
            <input
              ref={mediaInput}
              type="file"
              aria-label="Selecionar mídia para enviar"
              className="sr-only"
              accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.xls,.xlsx"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                uploadMedia.mutate(file, {
                  onSuccess: (media) => {
                    const caption = manualText.trim();
                    const draftText = caption || media.filename;
                    createManualDraft.mutate(draftText, {
                      onSuccess: (draft) => {
                        setSendConfirmation({
                          draftId: draft.id,
                          requestKey: crypto.randomUUID(),
                          text: caption,
                          media: { ...media, ...(caption ? { caption } : {}) },
                        });
                        setManualText("");
                      },
                    });
                  },
                });
              }}
            />
            <details className="relative">
              <summary
                className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)]"
                aria-label="Ações da mensagem"
              >
                <MessageSquareDashed size={16} />
              </summary>
              <div className="absolute bottom-11 left-0 z-20 max-h-64 w-72 overflow-y-auto rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-1 shadow-xl">
                <button
                  type="button"
                  disabled={conversation.data?.status === "closed"}
                  onClick={() => setTemplateOpen(true)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] disabled:opacity-40"
                >
                  <FileText size={14} />
                  Enviar template aprovado
                </button>
                <button
                  type="button"
                  disabled={conversation.data?.status === "closed" || uploadMedia.isPending || createManualDraft.isPending}
                  onClick={() => mediaInput.current?.click()}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] disabled:opacity-40"
                >
                  <Paperclip size={14} />
                  {uploadMedia.isPending ? "Enviando arquivo…" : "Anexar mídia (máx. 25 MB)"}
                </button>
                {quickReplies.data?.items.map((reply) => (
                    <button
                      type="button"
                      key={reply.id}
                      onClick={() => setManualText(reply.body)}
                      className="block w-full rounded-md px-2 py-2 text-left hover:bg-[var(--ds-bg-hover)]"
                    >
                      <span className="block text-xs font-medium text-[var(--ds-text-primary)]">
                        {reply.title}
                      </span>
                      <span className="block truncate text-[10px] text-[var(--ds-text-muted)]">
                        /{reply.shortcut} · {reply.body}
                      </span>
                    </button>
                ))}
                <button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  className="block w-full rounded-md px-2 py-2 text-left text-xs text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-hover)]"
                >
                  Gerenciar respostas rápidas
                </button>
              </div>
            </details>
            <div className="flex h-9 min-w-0 flex-1 items-center rounded-[11px] border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/55 px-3">
              <label className="sr-only" htmlFor="manual-message">
                Responder manualmente
              </label>
              <input
                id="manual-message"
                value={manualText}
                onChange={(event) => setManualText(event.target.value)}
                maxLength={4096}
                placeholder={
                  conversation.data?.status === "closed"
                    ? "Conversa fechada"
                    : "Mensagem..."
                }
                disabled={conversation.data?.status === "closed"}
                className="w-full border-0 bg-transparent text-xs text-[var(--ds-text-primary)] outline-none placeholder:text-[var(--ds-text-muted)]"
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    manualText.trim() &&
                    !createManualDraft.isPending
                  ) {
                    event.preventDefault();
                    createManualDraft.mutate(manualText, {
                      onSuccess: (draft) => {
                        setSendConfirmation({
                          draftId: draft.id,
                          requestKey: crypto.randomUUID(),
                          text: manualText,
                        });
                        setManualText("");
                      },
                    });
                  }
                }}
              />
            </div>
            <button
              type="button"
              aria-label="Enviar resposta"
              disabled={
                !manualText.trim() ||
                createManualDraft.isPending ||
                conversation.data?.status === "closed"
              }
              onClick={() =>
                createManualDraft.mutate(manualText, {
                  onSuccess: (draft) => {
                    setSendConfirmation({
                      draftId: draft.id,
                      requestKey: crypto.randomUUID(),
                      text: manualText,
                    });
                    setManualText("");
                  },
                })
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-bg-surface)] text-[var(--ds-text-muted)] transition-colors enabled:hover:bg-emerald-700 enabled:hover:text-white disabled:opacity-50"
            >
              <Send size={15} />
            </button>
          </div>
          {(uploadMedia.error || createManualDraft.error) && (
            <p role="alert" className="border-t border-[var(--ds-border-subtle)] px-3 py-1.5 text-xs text-status-failed">
              {(uploadMedia.error ?? createManualDraft.error)?.message}
            </p>
          )}
        </section>
      )}
      {id && detailsOpen && (
        <aside className="absolute inset-y-0 right-0 z-30 w-full overflow-y-auto border-l border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] shadow-2xl sm:w-[420px]">
          <div className="border-b border-zinc-800 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500/10 text-sm font-bold text-primary-300">
                {(conversation.data?.name ?? conversationIdentity(conversation.data))
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {conversation.data?.name ??
                    conversationIdentity(conversation.data) ??
                    "Contato"}
                </p>
                <p className="truncate font-mono text-micro text-zinc-500">
                  {conversationIdentity(conversation.data)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                aria-label="Fechar detalhes"
                className="ml-auto rounded-lg p-2 text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)]"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="space-y-5 p-4 text-xs">
            <section>
              <div className="mb-2 flex items-center gap-2 text-zinc-400">
                <Tags size={14} aria-hidden="true" />
                <span className="font-semibold uppercase tracking-wide">
                  Etiquetas
                </span>
              </div>
              {labels.isLoading || conversationLabels.isLoading ? (
                <p className="text-zinc-500">Carregando etiquetas…</p>
              ) : labels.data?.items.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {labels.data.items.map((label) => {
                    const active = (conversationLabels.data?.items ?? []).some(
                      (item) => item.id === label.id,
                    );
                    return (
                      <button
                        type="button"
                        key={label.id}
                        disabled={setLabels.isPending}
                        onClick={() => {
                          const current =
                            conversationLabels.data?.items.map(
                              (item) => item.id,
                            ) ?? [];
                          setLabels.mutate(
                            active
                              ? current.filter((item) => item !== label.id)
                              : [...current, label.id],
                          );
                        }}
                        className={`rounded-full border px-2 py-1 text-micro ${active ? "border-primary-500/40 bg-primary-500/10 text-primary-300" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}
                      >
                        <span
                          className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: label.color ?? "#10b981" }}
                        />
                        {label.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-zinc-500">
                  Crie etiquetas nas operações da Inbox para organizá-las aqui.
                </p>
              )}
            </section>
            <section>
              <div className="mb-2 flex items-center gap-2 text-zinc-400">
                <MoreHorizontal size={14} aria-hidden="true" />
                <span className="font-semibold uppercase tracking-wide">
                  Notas internas
                </span>
              </div>
              <textarea
                aria-label="Nova nota interna"
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="Adicionar nota para a equipe…"
                className={`${inputClass} min-h-16 resize-y py-2 text-xs`}
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className={`${btnSecondary} px-2.5 py-1.5 text-xs`}
                  disabled={!noteText.trim() || addNote.isPending}
                  onClick={() =>
                    addNote.mutate(noteText, {
                      onSuccess: () => setNoteText(""),
                    })
                  }
                >
                  {addNote.isPending ? "Salvando…" : "Adicionar nota"}
                </button>
              </div>
              {notes.data?.items.length ? (
                <div className="mt-3 space-y-2">
                  {notes.data.items.slice(0, 3).map((note) => (
                    <div
                      key={note.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2"
                    >
                      <p className="whitespace-pre-wrap text-xs text-zinc-300">
                        {note.body}
                      </p>
                      <p className="mt-1 text-micro text-zinc-600">
                        {new Date(note.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
            <section>
              <details>
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Gerenciar respostas rápidas
                </summary>
                <div className="mt-2 space-y-2">
                  <input
                    aria-label="Título da resposta rápida"
                    value={quickReplyForm.title}
                    onChange={(event) =>
                      setQuickReplyForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Título"
                    className={`${inputClass} py-2 text-xs`}
                  />
                  <input
                    aria-label="Atalho da resposta rápida"
                    value={quickReplyForm.shortcut}
                    onChange={(event) =>
                      setQuickReplyForm((current) => ({
                        ...current,
                        shortcut: event.target.value,
                      }))
                    }
                    placeholder="atalho"
                    className={`${inputClass} py-2 text-xs`}
                  />
                  <textarea
                    aria-label="Texto da resposta rápida"
                    value={quickReplyForm.body}
                    onChange={(event) =>
                      setQuickReplyForm((current) => ({
                        ...current,
                        body: event.target.value,
                      }))
                    }
                    placeholder="Texto da resposta"
                    className={`${inputClass} min-h-16 resize-y py-2 text-xs`}
                  />
                  <button
                    type="button"
                    className={`${btnSecondary} w-full px-2.5 py-1.5 text-xs`}
                    disabled={
                      !quickReplyForm.title.trim() ||
                      !quickReplyForm.shortcut.trim() ||
                      !quickReplyForm.body.trim() ||
                      createQuickReply.isPending
                    }
                    onClick={() =>
                      createQuickReply.mutate(quickReplyForm, {
                        onSuccess: () =>
                          setQuickReplyForm({
                            title: "",
                            shortcut: "",
                            body: "",
                          }),
                      })
                    }
                  >
                    {createQuickReply.isPending
                      ? "Salvando…"
                      : "Salvar resposta rápida"}
                  </button>
                </div>
              </details>
            </section>
            <section>
              <div className="mb-2 flex items-center gap-2 text-zinc-400">
                <Bot size={14} aria-hidden="true" />
                <span className="font-semibold uppercase tracking-wide">
                  Assistente
                </span>
              </div>
              <p className="mb-2 leading-relaxed text-zinc-500">
                A IA pode responder automaticamente quando o atendimento global,
                o agente ativo e o modo IA estão ligados. Rascunhos gerados
                manualmente continuam revisáveis antes do envio.
              </p>
              <label className="mb-3 block text-[10px] uppercase tracking-wide text-[var(--ds-text-muted)]">
                Agente atribuído
                <select
                  aria-label="Agente atribuído"
                  value={conversation.data?.ai_agent_id || ""}
                  disabled={setAgent.isPending}
                  onChange={(event) =>
                    setAgent.mutate(event.target.value || null)
                  }
                  className={`${inputClass} mt-1 h-8 py-1 text-xs`}
                >
                  <option value="">Agente padrão</option>
                  {agents.data?.items
                    .filter((agent) => agent.active)
                    .map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                        {agent.is_default ? " (Padrão)" : ""}
                      </option>
                    ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={operation.isPending}
                  onClick={() =>
                    operation.mutate({
                      mode: "human",
                      handoffReason: "Assumido manualmente no Inbox",
                    })
                  }
                  className={`${btnSecondary} px-2 py-1 text-micro`}
                >
                  Assumir atendimento
                </button>
                <button
                  type="button"
                  disabled={operation.isPending}
                  onClick={() =>
                    operation.mutate({ mode: "bot", handoffReason: null })
                  }
                  className={`${btnSecondary} px-2 py-1 text-micro`}
                >
                  Devolver à IA
                </button>
                <button
                  type="button"
                  disabled={operation.isPending}
                  onClick={() =>
                    operation.mutate({
                      status:
                        conversation.data?.status === "closed"
                          ? "open"
                          : "closed",
                    })
                  }
                  className={`${btnSecondary} px-2 py-1 text-micro`}
                >
                  {conversation.data?.status === "closed"
                    ? "Reabrir"
                    : "Encerrar"}
                </button>
              </div>
              {conversation.data?.mode === "human" &&
                conversation.data.human_mode_expires_at && (
                  <p className="mt-2 text-[10px] text-amber-400">
                    Volta para a IA em{" "}
                    {remainingTime(conversation.data.human_mode_expires_at)}
                  </p>
                )}
              <div className="mt-3 border-t border-[var(--ds-border-subtle)] pt-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Prioridade
                </p>
                <div className="grid grid-cols-4 gap-1">
                  {(
                    [
                      ["low", "Baixa"],
                      ["normal", "Normal"],
                      ["high", "Alta"],
                      ["urgent", "Urgente"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      disabled={operation.isPending}
                      onClick={() => operation.mutate({ priority: value })}
                      className={`rounded-md px-1 py-1.5 text-[10px] ${conversation.data?.priority === value ? "bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)]" : "text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-hover)]"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Automação
                </p>
                {conversation.data?.automation_paused_until &&
                conversation.data.automation_paused_until >
                  Date.now() / 1000 ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-orange-400">
                      Pausada por{" "}
                      {remainingTime(conversation.data.automation_paused_until)}
                    </span>
                    <button
                      type="button"
                      disabled={operation.isPending}
                      onClick={() => operation.mutate({ pausedUntil: null })}
                      className={`${btnSecondary} px-2 py-1 text-[10px]`}
                    >
                      Retomar
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {([5, 15, 30, 60, 240, 1440] as const).map((minutes) => (
                      <button
                        type="button"
                        key={minutes}
                        disabled={operation.isPending}
                        onClick={() =>
                          operation.mutate({
                            pausedUntil:
                              Math.floor(Date.now() / 1000) + minutes * 60,
                          })
                        }
                        className={`${btnSecondary} px-2 py-1 text-[10px]`}
                      >
                        {minutes < 60
                          ? `${minutes}min`
                          : minutes < 1440
                            ? `${minutes / 60}h`
                            : "24h"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-3 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/40 p-3">
                {!ai.data?.global.ready ? (
                  <p className="text-[11px] text-[var(--ds-text-muted)]">
                    O provedor de IA ainda não está pronto. Verifique a Central de IA.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] text-[var(--ds-text-secondary)]">
                        IA assistiva {ai.data.enabled ? "ativa" : "desativada"}
                      </p>
                      <button
                        type="button"
                        className={`${btnSecondary} px-2.5 py-1 text-[10px]`}
                        disabled={toggleAi.isPending}
                        onClick={() => toggleAi.mutate(!ai.data.enabled)}
                      >
                        {ai.data.enabled ? "Desativar" : "Ativar"}
                      </button>
                    </div>
                    {ai.data.enabled && (
                      <button
                        type="button"
                        className="mt-2 w-full rounded-lg bg-violet-500/15 px-3 py-2 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20"
                        disabled={generateDraft.isPending}
                        onClick={() => generateDraft.mutate()}
                      >
                        {generateDraft.isPending
                          ? "Gerando…"
                          : "Gerar rascunho com IA"}
                      </button>
                    )}
                    {latestDraft?.text_body && (
                      <div className="mt-2 rounded-lg bg-[var(--ds-bg-base)] p-2.5">
                        <p className="text-[10px] font-medium text-[var(--ds-text-muted)]">
                          {latestDraft.status === "approved"
                            ? "Rascunho aprovado"
                            : "Aguardando revisão"}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--ds-text-primary)]">
                          {latestDraft.text_body}
                        </p>
                        <div className="mt-2 flex justify-end gap-1.5">
                          {latestDraft.status === "pending_review" && (
                            <>
                              <button
                                className={`${btnSecondary} px-2 py-1 text-[10px]`}
                                onClick={() =>
                                  reviewDraft.mutate({
                                    draftId: latestDraft.id,
                                    status: "discarded",
                                  })
                                }
                              >
                                Descartar
                              </button>
                              <button
                                className="rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-medium text-emerald-950"
                                onClick={() =>
                                  reviewDraft.mutate({
                                    draftId: latestDraft.id,
                                    status: "approved",
                                  })
                                }
                              >
                                Aprovar
                              </button>
                            </>
                          )}
                          {latestDraft.status === "approved" &&
                            !latestDraft.send_status && (
                              <button
                                ref={sendMessageButton}
                                aria-label="Enviar mensagem"
                                className="rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-medium text-emerald-950 disabled:opacity-40"
                                disabled={
                                  !ai.data.sending.enabled ||
                                  !ai.data.sending.serviceWindowOpen
                                }
                                onClick={() =>
                                  setSendConfirmation({
                                    draftId: latestDraft.id,
                                    requestKey: crypto.randomUUID(),
                                  })
                                }
                              >
                                Enviar
                              </button>
                            )}
                          {latestDraft.send_status && (
                            <StatusBadge status={latestDraft.send_status} />
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
            <section>
              <div className="mb-2 flex items-center gap-2 text-zinc-400">
                <Sparkles size={14} aria-hidden="true" />
                <span className="font-semibold uppercase tracking-wide">
                  Memória
                </span>
              </div>
              <textarea
                aria-label="Memória do contato"
                value={memoryDraft}
                onChange={(event) => setMemoryDraft(event.target.value)}
                placeholder="Preferências, contexto e informações relevantes…"
                className={`${inputClass} min-h-24 resize-y py-2 text-xs`}
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className={`${btnSecondary} px-2.5 py-1.5 text-xs`}
                  disabled={
                    !conversation.data?.contact_id ||
                    saveMemory.isPending ||
                    !memoryDraft.trim()
                  }
                  onClick={() => saveMemory.mutate(memoryDraft)}
                >
                  {" "}
                  {saveMemory.isPending ? "Salvando…" : "Salvar memória"}{" "}
                </button>
              </div>
              {(memory.error ||
                saveMemory.error ||
                labels.error ||
                conversationLabels.error ||
                setLabels.error ||
                operation.error ||
                setAgent.error ||
                notes.error ||
                addNote.error ||
                quickReplies.error ||
                createQuickReply.error) && (
                <p className="mt-2 text-micro text-status-failed">
                  {
                    (
                      memory.error ??
                      saveMemory.error ??
                      labels.error ??
                      conversationLabels.error ??
                      setLabels.error ??
                      operation.error ??
                      setAgent.error ??
                      notes.error ??
                      addNote.error ??
                      quickReplies.error ??
                      createQuickReply.error
                    )?.message
                  }
                </p>
              )}
            </section>
          </div>
        </aside>
      )}
      {templateOpen && (
        <Modal
          titleId="enviar-template-titulo"
          onClose={() => !sendTemplate.isPending && setTemplateOpen(false)}
          closeDisabled={sendTemplate.isPending}
        >
          <h2 id="enviar-template-titulo" className="text-lg font-bold">
            Enviar template aprovado
          </h2>
          <p className="mt-2 text-sm text-[var(--ds-text-secondary)]">
            Templates podem iniciar ou retomar a conversa fora da janela de 24 horas.
            O envio exige confirmação e acontece uma única vez.
          </p>
          <div className="mt-4 grid max-h-[70dvh] gap-4 overflow-y-auto pr-1 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <label className="block text-xs font-medium text-[var(--ds-text-secondary)]">
                Buscar template
                <input
                  aria-label="Buscar template aprovado"
                  value={templateSearch}
                  onChange={(event) => setTemplateSearch(event.target.value)}
                  placeholder="Nome, idioma ou categoria"
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block text-xs font-medium text-[var(--ds-text-secondary)]">
                Template
                <select
                  aria-label="Template aprovado para envio"
                  value={selectedTemplateKey}
                  onChange={(event) => {
                    const key = event.target.value;
                    setSelectedTemplateKey(key);
                    const template = (inboxTemplates.data?.items ?? []).find(
                      (item) => `${item.name}:${item.language}` === key,
                    );
                    setTemplateMapping(
                      Object.fromEntries(
                        inboxTemplateVariables(template?.components).map((variable) => [
                          variable.key,
                          { source: "fixed", value: "" },
                        ]),
                      ) as InboxTemplateMapping,
                    );
                  }}
                  className={`${inputClass} mt-1`}
                >
                  <option value="">Selecione um template</option>
                  {availableTemplates.map((template) => (
                    <option
                      key={`${template.name}:${template.language}`}
                      value={`${template.name}:${template.language}`}
                    >
                      {template.name} · {template.language} · {template.category}
                    </option>
                  ))}
                </select>
              </label>
              {inboxTemplates.isLoading && (
                <p className="text-xs text-[var(--ds-text-muted)]">Carregando templates…</p>
              )}
              {selectedTemplateVariables.map((variable) => {
                const source = templateMapping[variable.key] ?? {
                  source: "fixed" as const,
                  value: "",
                };
                return (
                  <div
                    key={variable.key}
                    className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)]/40 p-3"
                  >
                    <label className="text-xs font-medium text-[var(--ds-text-primary)]">
                      {variable.label}
                      <select
                        aria-label={`Fonte de ${variable.label}`}
                        value={source.source}
                        onChange={(event) => {
                          const next = event.target.value as
                            | "fixed"
                            | "contact_name"
                            | "contact_phone"
                            | "contact_email";
                          setTemplateMapping((current) => ({
                            ...current,
                            [variable.key]: next === "fixed"
                              ? { source: "fixed", value: "" }
                              : { source: next },
                          }));
                        }}
                        className={`${inputClass} mt-1`}
                      >
                        <option value="fixed">Valor fixo</option>
                        <option value="contact_name">Nome do contato</option>
                        <option value="contact_phone">Telefone do contato</option>
                        <option value="contact_email">E-mail do contato</option>
                      </select>
                    </label>
                    {source.source === "fixed" && (
                      <input
                        aria-label={`Valor de ${variable.label}`}
                        value={source.value}
                        onChange={(event) =>
                          setTemplateMapping((current) => ({
                            ...current,
                            [variable.key]: { source: "fixed", value: event.target.value },
                          }))
                        }
                        placeholder="Digite o valor enviado à Meta"
                        className={`${inputClass} mt-2`}
                      />
                    )}
                  </div>
                );
              })}
              {(inboxTemplates.error || sendTemplate.error) && (
                <p role="alert" className="text-xs text-status-failed">
                  {(inboxTemplates.error ?? sendTemplate.error)?.message}
                </p>
              )}
            </div>
            <div>
              {selectedTemplate ? (
                <TemplatePreviewCard
                  name={selectedTemplate.name}
                  components={inboxTemplatePreview(
                    selectedTemplate.components,
                    templateMapping,
                    conversation.data,
                  )}
                />
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--ds-border-default)] p-8 text-center text-xs text-[var(--ds-text-muted)]">
                  Selecione um template para visualizar a mensagem.
                </div>
              )}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className={btnSecondary}
              disabled={sendTemplate.isPending}
              onClick={() => setTemplateOpen(false)}
            >
              Cancelar
            </button>
            <Button
              loading={sendTemplate.isPending}
              disabled={!templateReady}
              onClick={() => {
                if (!selectedTemplate) return;
                sendTemplate.mutate(
                  {
                    requestKey: crypto.randomUUID(),
                    name: selectedTemplate.name,
                    language: selectedTemplate.language,
                    mapping: templateMapping,
                  },
                  {
                    onSuccess: () => {
                      setTemplateOpen(false);
                      setSelectedTemplateKey("");
                      setTemplateMapping({});
                    },
                  },
                );
              }}
            >
              Confirmar e enviar template
            </Button>
          </div>
        </Modal>
      )}
      {sendConfirmation &&
        (sendConfirmation.media || sendConfirmation.text || latestDraft?.text_body) && (
          <Modal
            titleId="confirmar-envio-titulo"
            onClose={() => setSendConfirmation(null)}
            closeDisabled={sendDraft.isPending}
            returnFocusRef={sendMessageButton}
          >
            <h2 id="confirmar-envio-titulo" className="text-lg font-bold">
              Confirmar envio pelo WhatsApp
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Esta ação envia uma mensagem real ao destinatário desta conversa.
              O envio não é automático e não será repetido se o resultado ficar
              incerto.
            </p>
            <Card className="mt-4 p-4">
              {sendConfirmation.media && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] p-3 text-sm">
                  <Paperclip size={16} className="shrink-0 text-emerald-400" />
                  <span className="min-w-0 truncate">{sendConfirmation.media.filename}</span>
                  <span className="ml-auto shrink-0 text-xs text-[var(--ds-text-muted)]">
                    {(sendConfirmation.media.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
              )}
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200">
                {sendConfirmation.text || (!sendConfirmation.media ? latestDraft?.text_body : "")}
              </p>
            </Card>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className={btnSecondary}
                disabled={sendDraft.isPending}
                onClick={() => setSendConfirmation(null)}
              >
                Cancelar
              </button>
              <Button
                loading={sendDraft.isPending}
                onClick={() =>
                  sendDraft.mutate(sendConfirmation, {
                    onSuccess: () => setSendConfirmation(null),
                  })
                }
              >
                Confirmar e enviar
              </Button>
            </div>
          </Modal>
        )}
    </div>
  );
}
