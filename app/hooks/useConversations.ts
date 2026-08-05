import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export type Conversation = {
  id: string;
  contact_id: string;
  name: string | null;
  phone: string;
  user_id: string | null;
  parent_user_id: string | null;
  username: string | null;
  contact_status: string;
  last_message_at: number | null;
  last_message_preview: string | null;
  unread_count: number;
  ai_enabled: number;
  status: "open" | "closed";
  mode: "human" | "bot";
  priority?: "low" | "normal" | "high" | "urgent";
  label_ids?: string;
  automation_paused_until?: number | null;
  human_mode_expires_at?: number | null;
  ai_agent_id?: string | null;
  ai_agent_name?: string | null;
};

export type ConversationMessage = {
  id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  text_body: string | null;
  content: Record<string, unknown> | null;
  meta_timestamp: number;
  read_at: string | null;
  received_at: string;
  delivery_status: "accepted" | "sent" | "delivered" | "read" | "failed" | null;
};

export function useConversations(
  q = "",
  page = 1,
  filters: {
    status?: "open" | "closed";
    mode?: "human" | "bot";
    labelId?: string;
  } = {},
) {
  const params = new URLSearchParams({ q, page: String(page) });
  if (filters.status) params.set("status", filters.status);
  if (filters.mode) params.set("mode", filters.mode);
  if (filters.labelId) params.set("labelId", filters.labelId);
  return useQuery({
    queryKey: [
      "conversations",
      "list",
      q,
      page,
      filters.status,
      filters.mode,
      filters.labelId,
    ],
    queryFn: () =>
      api<{ items: Conversation[]; total: number }>(
        `/api/conversations?${params.toString()}`,
      ),
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ["conversations", "detail", id],
    queryFn: () => api<Conversation>(`/api/conversations/${id}`),
    enabled: Boolean(id),
  });
}

export function useConversationMessages(id: string, page = 1) {
  return useQuery({
    queryKey: ["conversations", "messages", id, page],
    queryFn: () =>
      api<{ items: ConversationMessage[]; total: number }>(
        `/api/conversations/${id}/messages?page=${page}`,
      ),
    enabled: Boolean(id),
  });
}

export function useMarkConversationRead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ ok: true; changed: number }>(`/api/conversations/${id}/read`, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export type InboxLabel = { id: string; name: string; color: string | null };

export function useInboxLabels() {
  return useQuery({
    queryKey: ["inbox", "labels"],
    queryFn: () => api<{ items: InboxLabel[] }>("/api/conversations/labels"),
  });
}

export function useConversationLabels(id: string) {
  return useQuery({
    queryKey: ["conversations", "labels", id],
    queryFn: () =>
      api<{ items: InboxLabel[] }>(`/api/conversations/${id}/labels`),
    enabled: Boolean(id),
  });
}

export function useSetConversationLabels(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labelIds: string[]) =>
      api<{ ok: true }>(`/api/conversations/${id}/labels`, {
        method: "PUT",
        body: JSON.stringify({ labelIds }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["conversations", "labels", id] }),
  });
}

export function useConversationOperation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      status?: "open" | "closed";
      mode?: "human" | "bot";
      priority?: "low" | "normal" | "high" | "urgent";
      pausedUntil?: number | null;
      handoffReason?: string | null;
    }) =>
      api<{ ok: true }>(`/api/conversations/${id}/operation`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["conversations", "detail", id] }),
        qc.invalidateQueries({ queryKey: ["conversations", "list"] }),
      ]),
  });
}

export type InboxAgent = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  is_default: boolean;
};
export function useInboxAgents() {
  return useQuery({
    queryKey: ["ai-agents"],
    queryFn: () =>
      api<{ enabled: boolean; items: InboxAgent[] }>("/api/agents"),
  });
}
export function useSetConversationAgent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string | null) =>
      api<{ ok: true }>(`/api/conversations/${id}/agent`, {
        method: "PUT",
        body: JSON.stringify({ agentId }),
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["conversations", "detail", id] }),
        qc.invalidateQueries({ queryKey: ["conversations", "list"] }),
      ]),
  });
}

export type QuickReply = {
  id: string;
  title: string;
  shortcut: string;
  body: string;
  created_at: string;
};

export function useQuickReplies() {
  return useQuery({
    queryKey: ["inbox", "quick-replies"],
    queryFn: () =>
      api<{ items: QuickReply[] }>("/api/conversations/quick-replies"),
  });
}

export function useCreateQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; shortcut: string; body: string }) =>
      api<QuickReply>("/api/conversations/quick-replies", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["inbox", "quick-replies"] }),
  });
}

export type ConversationNote = { id: string; body: string; created_at: string };

export function useConversationNotes(id: string) {
  return useQuery({
    queryKey: ["conversations", "notes", id],
    queryFn: () =>
      api<{ items: ConversationNote[] }>(`/api/conversations/${id}/notes`),
    enabled: Boolean(id),
  });
}

export function useAddConversationNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<ConversationNote>(`/api/conversations/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["conversations", "notes", id] }),
  });
}

export function useContactMemory(contactId: string) {
  return useQuery({
    queryKey: ["contacts", "memory", contactId],
    queryFn: () =>
      api<{ memory: { summary: string; updated_at: string } | null }>(
        `/api/contacts/${contactId}/memory`,
      ),
    enabled: Boolean(contactId),
  });
}

export function useSaveContactMemory(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (summary: string) =>
      api<{ ok: true }>(`/api/contacts/${contactId}/memory`, {
        method: "PUT",
        body: JSON.stringify({ summary }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["contacts", "memory", contactId] }),
  });
}

export type AiDraft = {
  id: string;
  status: "generating" | "pending_review" | "approved" | "discarded" | "failed";
  text_body: string | null;
  model: string;
  prompt_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
  reviewed_at: string | null;
  send_id: string | null;
  send_status:
    | "reserved"
    | "accepted"
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | "rejected"
    | "ambiguous"
    | null;
  send_message_id: string | null;
  send_error_code: string | null;
};

export type ConversationAiState = {
  enabled: boolean;
  global: {
    enabled: boolean;
    configured: boolean;
    ready: boolean;
    model: string;
  };
  sending: { enabled: boolean; serviceWindowOpen: boolean };
  drafts: AiDraft[];
};

export function useConversationAi(id: string) {
  return useQuery({
    queryKey: ["conversations", "ai", id],
    queryFn: () => api<ConversationAiState>(`/api/conversations/${id}/ai`),
    enabled: Boolean(id),
  });
}

export function useToggleConversationAi(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      api<{ ok: true; enabled: boolean }>(`/api/conversations/${id}/ai`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["conversations", "ai", id] }),
  });
}

export function useGenerateAiDraft(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<AiDraft>(`/api/conversations/${id}/ai/drafts`, {
        method: "POST",
        body: JSON.stringify({ requestKey: crypto.randomUUID() }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["conversations", "ai", id] }),
  });
}

export function useCreateManualDraft(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      api<AiDraft>(`/api/conversations/${id}/manual-drafts`, {
        method: "POST",
        body: JSON.stringify({ text, requestKey: crypto.randomUUID() }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["conversations", "ai", id] }),
  });
}

export type OutboundMedia = {
  id: string;
  type: "image" | "video" | "audio" | "document";
  filename: string;
  mimeType: string;
  size: number;
  caption?: string;
};

export function useUploadConversationMedia(id: string) {
  return useMutation({
    mutationFn: async (file: File): Promise<OutboundMedia> => {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/conversations/${id}/media/uploads`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status === 401 && location.pathname !== "/login") location.href = "/login";
      const data = await response.json().catch(() => ({})) as OutboundMedia & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      return data;
    },
  });
}

export type InboxTemplate = {
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown;
  source: "meta" | "draft";
  simpleSendSupported?: boolean;
};

export function useInboxTemplates() {
  return useQuery({
    queryKey: ["inbox", "templates"],
    queryFn: async () => {
      const result = await api<{ items: InboxTemplate[] }>("/api/templates");
      return {
        items: result.items.filter(
          (item) =>
            item.source === "meta" &&
            item.status.toUpperCase() === "APPROVED" &&
            item.simpleSendSupported === true,
        ),
      };
    },
  });
}

export type InboxTemplateMapping = Record<
  string,
  | { source: "contact_name" | "contact_phone" | "contact_email"; fallback?: string }
  | { source: "fixed"; value: string }
>;

export function useSendConversationTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      requestKey: string;
      name: string;
      language: string;
      mapping: InboxTemplateMapping;
    }) =>
      api<{ status: string; message_id: string | null }>(
        `/api/conversations/${id}/templates/send`,
        {
          method: "POST",
          body: JSON.stringify({ ...input, confirm: true }),
        },
      ),
    onSettled: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["conversations", "messages", id] }),
        qc.invalidateQueries({ queryKey: ["conversations", "detail", id] }),
        qc.invalidateQueries({ queryKey: ["conversations", "list"] }),
      ]);
    },
  });
}

export function useReviewAiDraft(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      draftId,
      status,
    }: {
      draftId: string;
      status: "approved" | "discarded";
    }) =>
      api<AiDraft>(`/api/conversations/${id}/ai/drafts/${draftId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["conversations", "ai", id] }),
  });
}

export function useSendAiDraft(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      draftId,
      requestKey, media,
    }: {
      draftId: string;
      requestKey: string;
      media?: OutboundMedia;
    }) =>
      api<{ status: string }>(
        `/api/conversations/${id}/ai/drafts/${draftId}/send`,
        {
          method: "POST",
          body: JSON.stringify({ requestKey, confirm: true, ...(media ? { media } : {}) }),
        },
      ),
    onSettled: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["conversations", "ai", id] }),
        qc.invalidateQueries({ queryKey: ["conversations", "messages", id] }),
        qc.invalidateQueries({ queryKey: ["conversations", "detail", id] }),
        qc.invalidateQueries({ queryKey: ["conversations", "list"] }),
      ]);
    },
  });
}
