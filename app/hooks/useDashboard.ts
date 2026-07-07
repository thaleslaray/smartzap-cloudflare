import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export type DashboardData = {
  sent30d: number; deliveryRate: number; readRate: number; failed30d: number
  recentCampaigns: CampaignRow[]
}
export type CampaignRow = {
  id: string; name: string; template_name: string; status: string
  total: number; sent: number; delivered: number; read: number; failed: number
  scheduled_at: string | null; created_at: string
}

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardData>('/api/dashboard') })
}
