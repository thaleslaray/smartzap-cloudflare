import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export type Contact = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  user_id: string | null;
  parent_user_id: string | null;
  username: string | null;
  status: string;
  suppression_reason?: string | null;
  created_at: string;
  updated_at?: string;
  last_message_at?: number | null;
  tags?: ContactTag[];
};

export function getContactIds(q = "", status = "", tagId = "") {
  return api<{ ids: string[]; total: number }>(
    `/api/contacts/ids?q=${encodeURIComponent(q)}${status ? `&status=${encodeURIComponent(status)}` : ""}${tagId ? `&tagId=${encodeURIComponent(tagId)}` : ""}`,
  );
}

export function useContacts(q = "", page = 1, status = "", tagId = "") {
  return useQuery({
    queryKey: ["contacts", q, page, status, tagId],
    queryFn: () =>
      api<{
        items: Contact[];
        total: number;
        stats: { total: number; optIn: number; optOut: number };
      }>(
        `/api/contacts?q=${encodeURIComponent(q)}&page=${page}${status ? `&status=${encodeURIComponent(status)}` : ""}${tagId ? `&tagId=${encodeURIComponent(tagId)}` : ""}`,
      ),
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      phone: string;
      email?: string;
      optInConfirmed?: boolean;
    }) =>
      api<Contact>("/api/contacts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useImportContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      csv: string;
      mapping: {
        phone: string;
        name?: string;
        email?: string;
        tags?: string;
        defaultTags?: string[];
        customFields?: Record<string, string>;
      };
      optInConfirmed?: boolean;
    }) =>
      api<{ imported: number; updated: number; duplicates: number; invalid: number }>(
        "/api/contacts/import",
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useBulkContactStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      ids: string[];
      status: "opt_in" | "opt_out" | "unknown";
      optInConfirmed?: boolean;
    }) =>
      api<{ ok: true; changed: number }>("/api/contacts/bulk-status", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useBulkContactTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      ids: string[];
      tagIds: string[];
      mode: "add" | "remove" | "replace";
    }) =>
      api<{ ok: true; changed: number }>("/api/contacts/bulk-tags", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useBulkContactCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      ids: string[];
      fieldId: string;
      value: string | number | boolean;
    }) =>
      api<{ ok: true; changed: number }>("/api/contacts/bulk-custom-field", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useUnsuppressContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/api/contacts/${id}/unsuppress`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export type ContactTag = { id: string; name: string };
export type CustomField = {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean";
};

export function useContactTags() {
  return useQuery({
    queryKey: ["contacts", "tags"],
    queryFn: () => api<{ items: ContactTag[] }>("/api/contacts/tags"),
  });
}

export function useCreateContactTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<ContactTag>("/api/contacts/tags", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts", "tags"] }),
  });
}

export function useCustomFields() {
  return useQuery({
    queryKey: ["contacts", "custom-fields"],
    queryFn: () => api<{ items: CustomField[] }>("/api/contacts/custom-fields"),
  });
}

export function useCreateCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CustomField, "id">) =>
      api<CustomField>("/api/contacts/custom-fields", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (created) => {
      // A criação também acontece dentro do painel de mapeamento de CSV.
      // Atualizar o cache imediatamente permite selecionar o novo campo sem
      // depender da latência do refetch; a invalidação mantém o servidor como
      // fonte de verdade em seguida.
      qc.setQueryData<{ items: CustomField[] }>(
        ["contacts", "custom-fields"],
        (current) => ({
          items: [...(current?.items ?? []).filter((field) => field.id !== created.id), created],
        }),
      );
      return qc.invalidateQueries({ queryKey: ["contacts", "custom-fields"] });
    },
  });
}

export type ContactProfile = Contact & {
  tags: ContactTag[];
  customValues: Array<{
    id: string;
    key: string;
    label: string;
    type: CustomField["type"];
    value: string | number | boolean | null;
  }>;
};

export function useContactProfile(id: string) {
  return useQuery({
    queryKey: ["contacts", "profile", id],
    queryFn: () => api<ContactProfile>(`/api/contacts/${id}/profile`),
    enabled: Boolean(id),
  });
}

export function useUpdateContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string | null; phone: string; email?: string | null }) =>
      api<Contact>(`/api/contacts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["contacts", "profile", id] });
      qc.invalidateQueries({ queryKey: ["campaign"] });
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/api/contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useBulkDeleteContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<{ ok: true; deleted: number }>("/api/contacts/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useSetContactTags(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagIds: string[]) =>
      api<{ ok: true }>(`/api/contacts/${id}/tags`, {
        method: "PUT",
        body: JSON.stringify({ tagIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", "profile", id] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useSetCustomValue(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      fieldId,
      value,
    }: {
      fieldId: string;
      value: string | number | boolean;
    }) =>
      api<{ ok: true }>(`/api/contacts/${contactId}/custom-values/${fieldId}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["contacts", "profile", contactId] }),
  });
}

export type ContactHistoryEvent = {
  id: string;
  event_type: string;
  actor_type: string;
  summary: string;
  metadata: unknown;
  created_at: string;
};
export function useContactHistory(id: string) {
  return useQuery({
    queryKey: ["contacts", "history", id],
    queryFn: () =>
      api<{ contact: Contact; events: ContactHistoryEvent[] }>(
        `/api/contacts/${id}/history`,
      ),
    enabled: Boolean(id),
  });
}
export function useContactMemory(id: string) {
  return useQuery({
    queryKey: ["contacts", "memory", id],
    queryFn: () =>
      api<{
        memory: { summary: string; version: number; updated_at: string } | null;
      }>(`/api/contacts/${id}/memory`),
    enabled: Boolean(id),
  });
}
export function useSetContactMemory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (summary: string) =>
      api<{ ok: true }>(`/api/contacts/${id}/memory`, {
        method: "PUT",
        body: JSON.stringify({ summary }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", "memory", id] });
      qc.invalidateQueries({ queryKey: ["contacts", "history", id] });
    },
  });
}

export function useDeleteContactMemory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ ok: true; deleted: boolean }>(`/api/contacts/${id}/memory`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", "memory", id] });
      qc.invalidateQueries({ queryKey: ["contacts", "history", id] });
    },
  });
}
