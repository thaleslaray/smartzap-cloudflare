import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { CampaignRow } from './useDashboard'

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api<{ items: CampaignRow[] }>('/api/campaigns'),
  })
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api<CampaignRow & { cost: { unit: number; estimated: number; real: number } }>(`/api/campaigns/${id}`),
    refetchInterval: (q) => (q.state.data?.status === 'sending' ? 5000 : false), // fallback do WS
  })
}

export function useCampaignContacts(id: string, page = 1) {
  return useQuery({
    queryKey: ['campaign', id, 'contacts', page],
    queryFn: () => api<{ items: Record<string, unknown>[] }>(`/api/campaigns/${id}/contacts?page=${page}`),
  })
}

export function useCampaignAction(id: string, action: 'dispatch' | 'cancel' | 'pause' | 'resume') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body?: { tags?: string[] }) =>
      api(`/api/campaigns/${id}/${action}`, { method: 'POST', body: JSON.stringify(body ?? {}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      qc.invalidateQueries({ queryKey: ['campaign', id] })
    },
  })
}

export function useCreateCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; template_name: string; scheduled_at?: string }) =>
      api<CampaignRow>('/api/campaigns', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useEstimate(id: string) {
  return useMutation({
    mutationFn: (body: { tags?: string[] }) =>
      api<{ recipients: number; skipped: number; unit: number; total: number }>(
        `/api/campaigns/${id}/estimate`, { method: 'POST', body: JSON.stringify(body) }),
  })
}
