import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export type ConversionDeliveryStatus =
  | "pending"
  | "sending"
  | "accepted"
  | "unknown"
  | "temporary_failed"
  | "permanent_failed"
  | "dead_letter"
  | "cancelled";

export type ConversationAttribution = {
  id: string;
  conversation_id: string;
  attribution_kind: "ctwa" | "referral_without_click_id";
  source_id: string | null;
  source_type: string | null;
  source_url: string | null;
  occurred_at: number;
  captured_at: string;
  has_click_id: boolean;
  click_id_masked: string | null;
};

export type ConversationConversion = {
  id: string;
  event_id: string;
  event_name: "LeadSubmitted" | "QualifiedLead" | "Purchase";
  event_time: number;
  business_object_type: "lead" | "opportunity" | "order";
  business_object_id: string;
  value_minor: number | null;
  currency: string | null;
  delivery_status: ConversionDeliveryStatus;
  attempts: number;
  last_error_detail: string | null;
  events_received: number | null;
  accepted_at: string | null;
  correction_of: string | null;
  lifecycle_status: "active" | "cancelled";
  lifecycle_note: string | null;
  lifecycle_changed_at: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  match_status: "unknown" | "matched" | "unmatched";
  attribution_status: "unknown" | "attributed" | "unattributed";
};

export type ConversionDiagnostics = {
  enabled: boolean;
  ready: boolean;
  verificationStatus: string;
  graphVersion: string | null;
  wabaId: string | null;
  permissions: {
    whatsappBusinessManagement: boolean | null;
    whatsappBusinessManageEvents: boolean | null;
    marketingAccessConfirmed: boolean;
    operatingMode: "direct" | "partner" | null;
    ownBusinessDataConfirmed: boolean;
    advancedAccessRequired: boolean | null;
    manageEventsAdvancedAccessConfirmed: boolean;
  };
  dataset: {
    status: "found" | "missing" | "unknown";
    id: string | null;
    storedId: string | null;
    verified?: boolean;
    retryable?: boolean;
    error?: string | null;
  };
  technicalPrerequisitesReady: boolean;
  prerequisitesReady: boolean;
  canary: {
    eventId: string | null;
    status: ConversionDeliveryStatus | null;
    accepted: boolean;
    acceptedAt: string | null;
    error?: string | null;
  };
  meta?: { live: boolean; retryable: boolean; error: string | null };
  message: string;
};

export function useConversionDiagnostics() {
  return useQuery({
    queryKey: ["conversions", "diagnostics"],
    queryFn: () => api<ConversionDiagnostics>("/api/conversions/diagnostics"),
    retry: false,
  });
}

export function useCreateConversionDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true; datasetId: string }>(
      "/api/conversions/dataset",
      { method: "POST", body: JSON.stringify({ confirm: true }) },
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversions", "diagnostics"] }),
  });
}

export function useConversionCanaryCandidates(enabled: boolean) {
  return useQuery({
    queryKey: ["conversions", "canary-candidates"],
    queryFn: () => api<{ items: ConversationAttribution[] }>(
      "/api/conversions/canary-candidates",
    ),
    enabled,
    retry: false,
  });
}

export function useRunConversionCanary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      conversationId: string;
      attributionId: string;
      operatingMode: "direct" | "partner";
      ownBusinessDataConfirmed?: true;
      manageEventsAdvancedAccessConfirmed?: true;
    }) =>
      api<{ ok: true; eventId: string; status: "pending" }>("/api/conversions/canary", {
        method: "POST",
        body: JSON.stringify({
          confirm: true,
          marketingAccessConfirmed: true,
          ...input,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversions"] }),
  });
}

export function useSetConversionsEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      enabled: false;
    } | {
      enabled: true;
      operatingMode: "direct" | "partner";
      ownBusinessDataConfirmed?: true;
      manageEventsAdvancedAccessConfirmed?: true;
    }) => api<{ ok: true; enabled: boolean }>(
      "/api/conversions/activation",
      {
        method: "PUT",
        body: JSON.stringify(input.enabled
          ? {
            enabled: true,
            confirm: true,
            marketingAccessConfirmed: true,
            operatingMode: input.operatingMode,
            ...(input.operatingMode === "direct"
              ? { ownBusinessDataConfirmed: input.ownBusinessDataConfirmed }
              : { manageEventsAdvancedAccessConfirmed: input.manageEventsAdvancedAccessConfirmed }),
          }
          : { enabled: false }),
      },
    ),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ["conversions"] }),
      qc.invalidateQueries({ queryKey: ["settings-health"] }),
    ]),
  });
}

export function useConversationConversions(conversationId: string) {
  return useQuery({
    queryKey: ["conversions", "conversation", conversationId],
    queryFn: () => api<{
      attributions: ConversationAttribution[];
      events: ConversationConversion[];
    }>(`/api/conversions/conversations/${conversationId}`),
    enabled: Boolean(conversationId),
  });
}

export type CreateConversionInput = {
  requestKey: string;
  attributionId: string;
  eventName: "LeadSubmitted" | "QualifiedLead" | "Purchase";
  businessObjectType: "lead" | "opportunity" | "order";
  businessObjectId: string;
  value?: number;
  currency?: string;
  correctionOf?: string;
};

export function useCreateConversationConversion(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConversionInput) => api<{
      created: boolean;
      queued: boolean;
      recovery: "cron" | null;
      item: ConversationConversion;
    }>(`/api/conversions/conversations/${conversationId}/events`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ["conversions", "conversation", conversationId] }),
      qc.invalidateQueries({ queryKey: ["conversions", "summary"] }),
    ]),
  });
}

export function useCancelConversationConversion(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { eventId: string; reason: string }) => api<{
      ok: true;
      cancelled: boolean;
    }>(`/api/conversions/conversations/${conversationId}/events/${input.eventId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ confirm: true, reason: input.reason }),
    }),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ["conversions", "conversation", conversationId] }),
      qc.invalidateQueries({ queryKey: ["conversions", "summary"] }),
    ]),
  });
}

export type ConversionSummary = {
  days: 7 | 30 | 90;
  totals: {
    total: number;
    leads: number;
    qualified: number;
    purchases: number;
    matched: number;
    attributed: number;
    match_unknown: number;
    attribution_unknown: number;
  } | null;
  revenues: Array<{ currency: string; value_minor: number }>;
  delivery: Array<{ status: ConversionDeliveryStatus; total: number }>;
  daily: Array<{
    day: string;
    event_name: "LeadSubmitted" | "QualifiedLead" | "Purchase";
    total: number;
    value_minor: number;
  }>;
  failures: Array<{
    id: string;
    event_name: string;
    event_time: number;
    status: ConversionDeliveryStatus;
    attempts: number;
    last_error_detail: string | null;
    last_error_code: string | null;
  }>;
  attributions: Array<{
    attribution_kind: "ctwa" | "referral_without_click_id";
    total: number;
  }>;
  latency: {
    measured: number;
    average_seconds: number | null;
    maximum_seconds: number | null;
  } | null;
};

export function useConversionSummary(days: 7 | 30 | 90) {
  return useQuery({
    queryKey: ["conversions", "summary", days],
    queryFn: () => api<ConversionSummary>(`/api/conversions/summary?days=${days}`),
  });
}

export type ConversionReconciliationMetric = {
  currency: string;
  spendMinor: number;
  impressions: number;
  reach: number;
  clicks: number;
  inlineLinkClicks: number;
  messagingConnections: number;
  conversationsStarted: number;
  leads: number;
  qualifiedLeads: number;
  purchases: number;
  purchaseValueMinor: number;
  costPerConversationMinor: number | null;
  costPerLeadMinor: number | null;
  costPerQualifiedLeadMinor: number | null;
  costPerPurchaseMinor: number | null;
  roas: number | null;
};

export type ConversionReconciliation = {
  days: 7 | 30 | 90;
  state: "not_synced" | "attention" | "healthy";
  configuration: {
    adAccountConfigured: boolean;
    adAccountSuffix: string | null;
    graphVersion: string | null;
  };
  latestRun: {
    id: string;
    status: "running" | "succeeded" | "partial" | "failed" | "skipped";
    error_detail: string | null;
    started_at: string;
    completed_at: string | null;
  } | null;
  latestSuccessfulRun: {
    id: string;
    status: "succeeded";
    insight_rows: number;
    scope_start: string;
    scope_end: string;
    completed_at: string;
  } | null;
  datasetQuality: {
    status: "not_applicable";
    detail: string;
  };
  totals: ConversionReconciliationMetric[];
  ads: Array<ConversionReconciliationMetric & {
    campaignId: string;
    campaignName: string;
    adsetId: string;
    adsetName: string;
    adId: string;
    adName: string;
    firstDay: string;
    lastDay: string;
    fetchedAt: string;
    smartZap: {
      conversations: number;
      acceptedLeads: number;
      acceptedQualifiedLeads: number;
      acceptedPurchases: number;
      informedPurchaseValueMinor: number;
    };
  }>;
  alerts: Array<{
    severity: "info" | "warning" | "critical";
    code: string;
    title: string;
    detail: string;
  }>;
};

export function useConversionReconciliation(days: 7 | 30 | 90) {
  return useQuery({
    queryKey: ["conversions", "reconciliation", days],
    queryFn: () => api<ConversionReconciliation>(
      `/api/conversions/reconciliation?days=${days}`,
    ),
    retry: false,
  });
}

export function useSyncConversionReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{
      ok: true;
      status: "succeeded";
      rows: number;
      pages: number;
    }>("/api/conversions/reconciliation/sync", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversions", "reconciliation"] }),
  });
}
