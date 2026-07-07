import { useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useLogin() {
  return useMutation({
    mutationFn: (input: { password: string; turnstileToken?: string }) =>
      api<{ ok: true }>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => { location.href = '/' },
  })
}
