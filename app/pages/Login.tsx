import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLogin } from '../hooks/useAuth'
import { Logo, Card, btnPrimary, inputClass } from '../components/ui'
import { Turnstile } from '../components/Turnstile'
import { api } from '../lib/api'

export default function Login() {
  const [password, setPassword] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)
  const login = useLogin()
  const config = useQuery({
    queryKey: ['auth-config'],
    queryFn: () => api<{ turnstileSiteKey: string | null; turnstileRequired: boolean }>('/api/auth/config'),
    retry: false,
  })
  useEffect(() => {
    if (login.failureCount > 0) {
      setTurnstileToken(null)
      setTurnstileReset(login.failureCount)
    }
  }, [login.failureCount])
  const required = config.data?.turnstileRequired ?? true
  const siteKey = config.data?.turnstileSiteKey ?? null
  const turnstileMisconfigured = required && !siteKey && !config.isLoading
  return (
    <div
      className="legacy-app flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100"
    >
      <div className="w-full max-w-[380px] px-4 sm:px-6">
        <div className="mb-7 flex flex-col items-center">
          <Logo size={48} />
          <h1 className="mt-3.5 text-xl font-bold tracking-[-0.01em]">SmartZap</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.1em] text-zinc-500">Campanhas de WhatsApp</p>
        </div>

        <Card className="p-6">
          <form onSubmit={(e) => {
            e.preventDefault()
            login.mutate({ password, turnstileToken: turnstileToken ?? undefined })
          }}>
            <label htmlFor="master-password" className="mb-2 block text-body font-medium text-zinc-400">
              Senha mestra
            </label>
            <input
              id="master-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="current-password"
              autoFocus
              className={`${inputClass} mb-3.5`}
            />

            {login.error && <p role="alert" className="mb-3.5 text-xs text-status-failed">{login.error.message}</p>}
            {config.error && <p role="alert" className="mb-3.5 text-xs text-status-failed">Não foi possível carregar a proteção anti-bot.</p>}
            {turnstileMisconfigured && (
              <p className="mb-3.5 text-xs text-status-failed">Turnstile obrigatório, mas a chave pública não foi configurada.</p>
            )}
            {siteKey && <Turnstile key={turnstileReset} siteKey={siteKey} onToken={setTurnstileToken} />}

            <button
              type="submit"
              disabled={login.isPending || config.isLoading || password.length === 0 || turnstileMisconfigured || (required && !turnstileToken)}
              className={`w-full ${btnPrimary}`}
            >
              {login.isPending ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </Card>
      </div>
    </div>
  )
}
