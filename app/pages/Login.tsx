import { useState } from 'react'
import { useLogin } from '../hooks/useAuth'
import { Logo, Card, btnPrimary, inputClass } from '../components/ui'

export default function Login() {
  const [password, setPassword] = useState('')
  const login = useLogin()
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100"
      style={{ backgroundImage: 'radial-gradient(ellipse 600px 400px at 50% -10%, rgba(16,185,129,0.08), transparent)' }}
    >
      <div className="w-[380px] px-6">
        <div className="mb-7 flex flex-col items-center">
          <Logo size={48} />
          <h1 className="mt-3.5 text-xl font-bold tracking-[-0.01em]">SmartZap</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.1em] text-zinc-500">Campanhas de WhatsApp</p>
        </div>

        <Card className="p-6">
          <form onSubmit={(e) => { e.preventDefault(); login.mutate({ password }) }}>
            <label htmlFor="master-password" className="mb-2 block text-body font-medium text-zinc-400">
              Senha mestra
            </label>
            <input
              id="master-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoFocus
              className={`${inputClass} mb-3.5`}
            />

            {login.error && <p className="mb-3.5 text-xs text-status-failed">{login.error.message}</p>}

            <button
              type="submit"
              disabled={login.isPending || password.length === 0}
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
