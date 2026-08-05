import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "../lib/api";

export type DashboardData = {
  sent30d: number;
  deliveryRate: number;
  readRate: number;
  failed30d: number;
  latestFailure: {
    campaign_id: string;
    campaign_name: string;
    failed_count: number;
    error_code: string | null;
    error_detail: string | null;
    updated_at: string | null;
  } | null;
  activeCampaigns: number;
  volume: Array<{ day: string; sent: number; delivered: number }>;
  recentCampaigns: CampaignRow[];
};
export type CampaignRow = {
  id: string;
  name: string;
  template_name: string;
  template_language: string;
  status: string;
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  scheduled_at: string | null;
  created_at: string;
  completed_at?: string | null;
  folder_id?: string | null;
  tags?: Array<{ id: string; name: string; color: string | null }>;
  status_counts?: Record<string, number>;
};

export function parseDashboardData(value: unknown): DashboardData {
  if (!value || typeof value !== "object")
    throw new ApiError(502, "o Dashboard recebeu dados inválidos; tente novamente");
  const data = value as Partial<DashboardData>;
  const numbers = [
    data.sent30d,
    data.deliveryRate,
    data.readRate,
    data.failed30d,
    data.activeCampaigns,
  ];
  if (
    numbers.some((number) => typeof number !== "number" || !Number.isFinite(number)) ||
    !Array.isArray(data.volume) ||
    !data.volume.every(
      (point) =>
        point &&
        typeof point.day === "string" &&
        typeof point.sent === "number" &&
        typeof point.delivered === "number",
    ) ||
    !Array.isArray(data.recentCampaigns)
  )
    throw new ApiError(502, "o Dashboard recebeu dados incompletos; tente novamente");
  return {
    ...(data as DashboardData),
    latestFailure: data.latestFailure ?? null,
  };
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async ({ signal }) =>
      parseDashboardData(await api<unknown>("/api/dashboard", { signal })),
  });
}
