import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { CampaignRow } from "./useDashboard";

export function useCampaigns(
  q = "",
  page = 1,
  status = "",
  folderId = "",
  tagIds: string[] = [],
) {
  return useQuery({
    queryKey: ["campaigns", q, page, status, folderId, tagIds],
    queryFn: () =>
      api<{ items: CampaignRow[]; total: number }>(
        `/api/campaigns?q=${encodeURIComponent(q)}&page=${page}${status ? `&status=${encodeURIComponent(status)}` : ""}${folderId ? `&folderId=${encodeURIComponent(folderId)}` : ""}${tagIds.length ? `&tagIds=${encodeURIComponent(tagIds.join(","))}` : ""}`,
      ),
  });
}

export type CampaignFolder = {
  id: string;
  name: string;
  campaign_count: number;
  color?: string | null;
};
export function useCampaignFolders() {
  return useQuery({
    queryKey: ["campaigns", "folders"],
    queryFn: () => api<{ items: CampaignFolder[] }>("/api/campaigns/folders"),
  });
}
export function useCreateCampaignFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color?: string | null }) =>
      api<CampaignFolder>("/api/campaigns/folders", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["campaigns", "folders"] }),
  });
}
export function useUpdateCampaignFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; name: string; color?: string | null }) =>
      api<{ ok: true }>(`/api/campaigns/folders/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: input.name, color: input.color ?? null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns", "folders"] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}
export function useDeleteCampaignFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/api/campaigns/folders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns", "folders"] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}
export function useMoveCampaignToFolder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folderId: string | null) =>
      api<{ ok: true }>(`/api/campaigns/${id}/folder`, {
        method: "PUT",
        body: JSON.stringify({ folderId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaigns", "folders"] });
      qc.invalidateQueries({ queryKey: ["campaign", id] });
    },
  });
}
export type CampaignTag = {
  id: string;
  name: string;
  color: string | null;
  campaign_count: number;
};
export function useCampaignTags() {
  return useQuery({
    queryKey: ["campaigns", "tags"],
    queryFn: () => api<{ items: CampaignTag[] }>("/api/campaigns/tags"),
  });
}
export function useCreateCampaignTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color?: string | null }) =>
      api<CampaignTag>("/api/campaigns/tags", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns", "tags"] }),
  });
}
export function useDeleteCampaignTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/api/campaigns/tags/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns", "tags"] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}
export function useSetCampaignTags(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagIds: string[]) =>
      api<{ ok: true }>(`/api/campaigns/${id}/tags`, {
        method: "PUT",
        body: JSON.stringify({ tagIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaigns", "tags"] });
      qc.invalidateQueries({ queryKey: ["campaign", id] });
    },
  });
}
export function useSetCampaignSchedule(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduledAt: string | null) =>
      api<{ ok: true }>(`/api/campaigns/${id}/schedule`, {
        method: "PUT",
        body: JSON.stringify({ scheduledAt }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign", id] });
    },
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ["campaign", id],
    queryFn: () =>
      api<
        CampaignRow & {
          template: null | {
            name: string;
            language: string;
            components: unknown;
          };
          cost: {
            state: "estimated" | "unavailable";
            amount: number | null;
            currency: string | null;
            effectiveFrom: string | null;
            confidence: "high" | "medium" | "low" | "unavailable";
            source: string;
            assumptions: string[];
            unavailableReasons: string[];
            breakdown: Array<{ market: string; recipients: number; unitPrice: number; amount: number }>;
            confirmed: {
              state: "actual_from_meta" | "invoice" | "unavailable";
              amount: number | null;
              currency: string | null;
              source: string;
              created_at: string;
            } | null;
          };
        }
      >(`/api/campaigns/${id}`),
    refetchInterval: (q) => (q.state.data?.status === "sending" ? 5000 : false), // fallback do WS
  });
}

export function useCampaignContacts(id: string, page = 1) {
  return useQuery({
    queryKey: ["campaign", id, "contacts", page],
    queryFn: () =>
      api<{ items: Record<string, unknown>[]; total: number }>(
        `/api/campaigns/${id}/contacts?page=${page}`,
      ),
  });
}

export type CampaignBatch = {
  id: string;
  sequence: number;
  status: string;
  recipient_count: number;
  accepted_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  started_at: string | null;
  completed_at: string | null;
};
export function useCampaignBatches(id: string) {
  return useQuery({
    queryKey: ["campaign", id, "batches"],
    queryFn: () =>
      api<{
        items: CampaignBatch[];
        traces: Array<{
          id: number;
          event_type: string;
          severity: string;
          created_at: string;
        }>;
      }>(`/api/campaigns/${id}/batches`),
    enabled: Boolean(id),
    refetchInterval: 5_000,
  });
}

export function useCampaignAction(
  id: string,
  action: "dispatch" | "cancel" | "pause" | "resume",
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: {
      tags?: string[];
      segmentId?: string;
      contactIds?: string[];
      phonePrefixes?: string[];
      combinator?: "and" | "or";
      skipInvalid?: boolean;
    }) =>
      api(`/api/campaigns/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign", id] });
    },
  });
}

export function useResendSkippedCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{
        status: "nothing" | "skipped" | "queued";
        resent: number;
        stillSkipped: number;
        message: string;
      }>(`/api/campaigns/${id}/resend-skipped`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign", id] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign", id, "contacts"] });
      qc.invalidateQueries({ queryKey: ["campaign", id, "batches"] });
    },
  });
}

export function useDuplicateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<CampaignRow>(`/api/campaigns/${id}/duplicate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/api/campaigns/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaigns", "folders"] });
      qc.invalidateQueries({ queryKey: ["campaigns", "tags"] });
    },
  });
}

export function useBulkDeleteCampaigns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<{ ok: true; removed: number; missing: number }>("/api/campaigns/bulk", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaigns", "folders"] });
      qc.invalidateQueries({ queryKey: ["campaigns", "tags"] });
    },
  });
}

export function useCampaignSelectionIds() {
  return useMutation({
    mutationFn: (filters: {
      q: string;
      status: string;
      folderId: string;
      tagIds: string[];
    }) =>
      api<{ ids: string[]; total: number }>(
        `/api/campaigns/ids?q=${encodeURIComponent(filters.q)}${filters.status ? `&status=${encodeURIComponent(filters.status)}` : ""}${filters.folderId ? `&folderId=${encodeURIComponent(filters.folderId)}` : ""}${filters.tagIds.length ? `&tagIds=${encodeURIComponent(filters.tagIds.join(","))}` : ""}`,
      ),
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      template_name: string;
      template_language: string;
      scheduled_at?: string;
      variable_mapping?: Record<
        string,
        {
          source: "contact_name" | "contact_phone" | "contact_email" | "custom_field" | "fixed";
          value?: string;
          fieldId?: string;
          fallback?: string;
        }
      >;
    }) =>
      api<CampaignRow>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

export function useEstimate(id: string) {
  return useMutation({
    mutationFn: (body: {
      tags?: string[];
      segmentId?: string;
      contactIds?: string[];
      phonePrefixes?: string[];
      combinator?: "and" | "or";
    }) =>
      api<{
        recipients: number;
        skipped: number;
        state: "estimated" | "unavailable";
        amount: number | null;
        currency: string | null;
        effectiveFrom: string | null;
        confidence: "high" | "medium" | "low" | "unavailable";
        source: string;
        assumptions: string[];
        unavailableReasons: string[];
        breakdown: Array<{ market: string; recipients: number; unitPrice: number; amount: number }>;
      }>(`/api/campaigns/${id}/estimate`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export type CampaignPrecheck = {
  totals: { valid: number; skipped: number; candidates: number };
  validIds: string[];
  skippedItems: Array<{
    id: string;
    phone: string;
    name: string | null;
    reason: string;
    detail?: string;
    missingFieldIds?: string[];
  }>;
};
export function useCampaignPrecheck(id: string) {
  return useMutation({
    mutationFn: (body: {
      tags?: string[];
      segmentId?: string;
      contactIds?: string[];
      phonePrefixes?: string[];
      combinator?: "and" | "or";
    }) =>
      api<CampaignPrecheck>(`/api/campaigns/${id}/precheck`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}
