import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export type Contact = { id: string; phone: string; name: string | null; status: string; created_at: string }

export function useContacts(q = '', page = 1) {
  return useQuery({
    queryKey: ['contacts', q, page],
    queryFn: () => api<{ items: Contact[]; total: number }>(`/api/contacts?q=${encodeURIComponent(q)}&page=${page}`),
  })
}

export function useImportContacts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { csv: string; mapping: { phone: string; name?: string }; optInConfirmed: boolean }) =>
      api<{ imported: number; duplicates: number; invalid: number }>(
        '/api/contacts/import', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}
