import { useState } from 'react'
import { useLogin } from '../hooks/useAuth'

export default function Login() {
  const [password, setPassword] = useState('')
  const login = useLogin()
  return (
    <div className="flex min-h-screen items-center justify-center">
      <form
        className="w-80 space-y-4 rounded-[--radius-app] bg-zinc-900 p-8"
        onSubmit={(e) => { e.preventDefault(); login.mutate({ password }) }}
      >
        <h1 className="text-xl font-semibold text-primary-400">SmartZap</h1>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha mestra" autoFocus
          className="w-full rounded-[--radius-app] border border-zinc-700 bg-zinc-800 px-3 py-2 outline-none focus:border-primary-500"
        />
        {/* Turnstile: widget carregado quando TURNSTILE_SITE_KEY estiver configurada (produção) */}
        {login.error && <p className="text-sm text-status-failed">{login.error.message}</p>}
        <button
          type="submit" disabled={login.isPending}
          className="w-full rounded-[--radius-app] bg-primary-600 py-2 font-medium hover:bg-primary-500 disabled:opacity-50"
        >
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
