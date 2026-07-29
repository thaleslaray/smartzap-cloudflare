import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

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

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/api/dashboard"),
  });
}
