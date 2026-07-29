import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Loader2,
  LogOut,
  Moon,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Sun,
  User,
} from "lucide-react";

type Permissions = { canView: boolean; canReply: boolean; canHandoff: boolean };
type Attendant = { id: string; name: string; permissions: Permissions };
type Conversation = {
  id: string;
  contactName: string;
  contactPhone: string;
  status: "ai_active" | "human_active" | "handoff_requested" | "resolved";
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};
type Message = {
  id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  text_body: string | null;
  meta_timestamp: number;
  delivery_status?: string | null;
};
type Filter = "all" | "urgent" | "ai" | "human";

async function portal<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/attendant${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-attendant-token": token,
      ...init?.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data as T;
}
const relative = (date: string) => {
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

export default function AttendantPortal() {
  const navigate = useNavigate();
  const { id: routeConversationId } = useParams();
  const token = new URLSearchParams(location.search).get("token") || "";
  const [dark, setDark] = useState(true);
  const [attendant, setAttendant] = useState<Attendant | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState("");
  const openedRouteRef = useRef("");
  useEffect(() => {
    if (!token) {
      setError(
        "Link de acesso inválido. Solicite um novo link ao administrador.",
      );
      setLoading(false);
      return;
    }
    fetch("/api/attendant/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          valid: boolean;
          attendant?: Attendant;
          error?: string;
        };
        if (!response.ok || !data.attendant)
          throw new Error(data.error || "Token inválido");
        setAttendant(data.attendant);
        return load();
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Token inválido"),
      )
      .finally(() => setLoading(false));
  }, [token]);
  async function load() {
    setRefreshing(true);
    try {
      const data = await portal<{ conversations: Conversation[] }>(
        `/conversations${search ? `?search=${encodeURIComponent(search)}` : ""}`,
        token,
      );
      setItems(data.conversations);
    } finally {
      setRefreshing(false);
    }
  }
  async function open(item: Conversation) {
    setSelected(item);
    if (routeConversationId !== item.id) {
      navigate(`/atendimento/conversa/${item.id}?token=${encodeURIComponent(token)}`);
    }
    const data = await portal<{ messages: Message[] }>(
      `/conversations/${item.id}`,
      token,
    );
    setMessages(data.messages);
  }
  useEffect(() => {
    if (!routeConversationId || !items.length || openedRouteRef.current === routeConversationId) return;
    const target = items.find((item) => item.id === routeConversationId);
    if (!target) return;
    openedRouteRef.current = routeConversationId;
    open(target).catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível abrir a conversa"));
  }, [routeConversationId, items]);
  async function handoff(action: "handoff" | "resolve") {
    if (!selected) return;
    await portal(`/conversations/${selected.id}/${action}`, token, {
      method: "POST",
    });
    await load();
    setSelected(null);
  }
  async function sendReply() {
    if (!selected || !reply.trim() || sending) return;
    setSending(true);
    setReplyError("");
    try {
      await portal(`/conversations/${selected.id}/reply`, token, {
        method: "POST",
        body: JSON.stringify({
          text: reply.trim(),
          requestKey: crypto.randomUUID(),
        }),
      });
      setReply("");
      await open(selected);
    } catch (reason) {
      setReplyError(
        reason instanceof Error ? reason.message : "Não foi possível enviar",
      );
    } finally {
      setSending(false);
    }
  }
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          filter === "all" ||
          (filter === "urgent" && item.status === "handoff_requested") ||
          (filter === "ai" && item.status === "ai_active") ||
          (filter === "human" && item.status === "human_active"),
      ),
    [items, filter],
  );
  const counts = {
    all: items.length,
    urgent: items.filter((x) => x.status === "handoff_requested").length,
    ai: items.filter((x) => x.status === "ai_active").length,
    human: items.filter((x) => x.status === "human_active").length,
  };
  if (loading)
    return (
      <State
        icon={<Loader2 className="animate-spin" />}
        title="Validando acesso"
        text="Aguarde um instante…"
      />
    );
  if (error || !attendant)
    return (
      <State
        icon={<AlertCircle className="text-red-400" />}
        title="Acesso indisponível"
        text={error || "Token inválido"}
      />
    );
  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-[#f0f2f5] text-[#1a1a1a] dark:bg-black dark:text-[#ededed]">
        <div className="mx-auto flex min-h-screen max-w-xl flex-col border-x border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
          {selected ? (
            <>
              <header className="flex h-16 items-center gap-3 border-b border-zinc-200 px-4 dark:border-zinc-800">
                <button aria-label="Voltar" onClick={() => { setSelected(null); openedRouteRef.current = ""; navigate(`/atendimento?token=${encodeURIComponent(token)}`); }}>
                  <ArrowLeft size={20} />
                </button>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00a884] font-semibold text-white">
                  {selected.contactName[0]?.toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h1 className="truncate font-semibold">
                    {selected.contactName}
                  </h1>
                  <p className="text-xs text-zinc-500">
                    {selected.contactPhone}
                  </p>
                </div>
                {attendant.permissions.canHandoff && (
                  <button
                    onClick={() =>
                      handoff(
                        selected.status === "resolved" ? "handoff" : "resolve",
                      )
                    }
                    className="ml-auto rounded-full border border-zinc-700 px-3 py-1.5 text-xs"
                  >
                    {selected.status === "resolved" ? "Reabrir" : "Concluir"}
                  </button>
                )}
              </header>
              <main className="flex flex-1 flex-col bg-[#efeae2] dark:bg-[#0b141a]">
                <div className="flex-1 space-y-2 overflow-y-auto p-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[82%] rounded-lg px-3 py-2 text-sm shadow-sm ${message.direction === "outbound" ? "bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]" : "bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]"}`}
                      >
                        <p className="whitespace-pre-wrap">
                          {message.text_body || `[${message.message_type}]`}
                        </p>
                        <span className="mt-1 block text-right text-[10px] opacity-60">
                          {new Date(
                            message.meta_timestamp * 1000,
                          ).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-zinc-300 bg-white p-3 dark:border-zinc-800 dark:bg-[#111b21]">
                  {replyError && (
                    <p className="mb-2 text-center text-xs text-red-400">
                      {replyError}
                    </p>
                  )}
                  {attendant.permissions.canReply ? (
                    <div className="flex gap-2">
                      <input
                        aria-label="Responder mensagem"
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") sendReply();
                        }}
                        disabled={sending}
                        placeholder="Digite uma mensagem"
                        className="min-w-0 flex-1 rounded-full border border-zinc-300 bg-transparent px-4 py-2 text-sm dark:border-zinc-700"
                      />
                      <button
                        onClick={sendReply}
                        disabled={!reply.trim() || sending}
                        aria-label="Enviar"
                        className="rounded-full bg-[#00a884] p-3 text-white disabled:opacity-50"
                      >
                        <Send size={17} />
                      </button>
                    </div>
                  ) : (
                    <p className="text-center text-xs text-zinc-500">
                      Seu link permite somente visualização.
                    </p>
                  )}
                </div>
              </main>
            </>
          ) : (
            <>
              <header className="border-b border-zinc-200 px-4 pb-3 pt-4 dark:border-zinc-800">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h1 className="text-lg font-semibold">Atendimento</h1>
                    <p className="text-xs text-zinc-500">
                      Olá, {attendant.name}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      aria-label="Alternar tema"
                      className="rounded-md p-2"
                      onClick={() => setDark(!dark)}
                    >
                      {dark ? (
                        <Sun size={18} className="text-amber-400" />
                      ) : (
                        <Moon size={18} />
                      )}
                    </button>
                    <button
                      aria-label="Atualizar"
                      className="rounded-md p-2"
                      onClick={load}
                    >
                      <RefreshCw
                        size={18}
                        className={refreshing ? "animate-spin" : ""}
                      />
                    </button>
                    <button
                      aria-label="Sair"
                      className="rounded-md p-2"
                      onClick={() => (location.href = "/atendimento")}
                    >
                      <LogOut size={18} />
                    </button>
                  </div>
                </div>
                <label className="flex items-center gap-2 rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                  <Search size={16} className="text-zinc-500" />
                  <input
                    aria-label="Buscar conversa"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") load();
                    }}
                    placeholder="Buscar conversa..."
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </label>
              </header>
              <div className="flex gap-1.5 overflow-x-auto border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                {(
                  [
                    ["all", "Todos"],
                    ["urgent", "Urgente"],
                    ["ai", "IA"],
                    ["human", "Humano"],
                  ] as [Filter, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setFilter(id)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${filter === id ? (id === "urgent" ? "border-red-500 bg-red-500 text-white" : id === "human" ? "border-[#00a884] bg-[#00a884] text-white" : "border-current bg-zinc-100 text-black dark:bg-white") : "border-zinc-300 text-zinc-500 dark:border-zinc-700"}`}
                  >
                    {id === "urgent" && <AlertCircle size={13} />}{" "}
                    {id === "ai" && <Sparkles size={13} />}{" "}
                    {id === "human" && <User size={13} />} {label}
                    {counts[id] > 0 && (
                      <span className="rounded-full bg-black/10 px-1.5 text-xs">
                        {counts[id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <main className="flex-1 overflow-y-auto">
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => open(item)}
                    className={`w-full border-b border-zinc-200 p-4 text-left transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900 ${item.status === "handoff_requested" ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                  >
                    <div className="flex gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-semibold text-white ${item.status === "handoff_requested" ? "bg-red-500" : item.status === "ai_active" ? "bg-zinc-500" : "bg-[#00a884]"}`}
                      >
                        {item.contactName[0]?.toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate">
                          {item.contactName}
                        </strong>
                        <div className="flex gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm text-zinc-500">
                            {item.lastMessage}
                          </p>
                          {item.unreadCount > 0 && (
                            <span className="rounded-full bg-blue-500 px-2 text-xs font-bold text-white">
                              {item.unreadCount}
                            </span>
                          )}
                        </div>
                        <span
                          className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${item.status === "handoff_requested" ? "bg-red-100 text-red-600 dark:bg-red-950" : item.status === "ai_active" ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-900" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950"}`}
                        >
                          {item.status === "handoff_requested" ? (
                            <AlertCircle size={11} />
                          ) : item.status === "ai_active" ? (
                            <Sparkles size={11} />
                          ) : (
                            <User size={11} />
                          )}{" "}
                          {item.status === "handoff_requested"
                            ? "Aguardando"
                            : item.status === "ai_active"
                              ? "IA"
                              : "Humano"}{" "}
                          · {relative(item.lastMessageAt)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
                {!filtered.length && (
                  <div className="py-20 text-center text-zinc-500">
                    <Search className="mx-auto" size={32} />
                    <h2 className="mt-4 font-medium">Nenhuma conversa</h2>
                    <p className="mt-1 text-sm">
                      Suas conversas aparecerão aqui
                    </p>
                  </div>
                )}
              </main>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function State({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-6 text-zinc-100">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900">
          {icon}
        </span>
        <h1 className="mt-5 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">{text}</p>
      </div>
    </div>
  );
}
