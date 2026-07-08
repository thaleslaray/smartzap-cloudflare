import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet } from 'react-router'
import { api } from '../lib/api'
import { Logo, focusRing } from './ui'

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/campaigns', label: 'Campanhas' },
  { to: '/contacts', label: 'Contatos' },
  { to: '/templates', label: 'Templates' },
  { to: '/settings', label: 'Configurações' },
]

export default function Shell() {
  // Guarda de rota: em navegação direta sem sessão, esta query recebe 401 e o
  // próprio api() redireciona para /login; throwOnError evita error boundary
  useQuery({
    queryKey: ['auth-status'],
    queryFn: () => api<{ authenticated: boolean }>('/api/auth/status'),
    throwOnError: false,
    retry: false,
  })
  return (
    <div className="flex min-h-screen bg-zinc-950">
      <aside className="flex w-56 shrink-0 flex-col gap-0.5 border-r border-border-subtle bg-zinc-900 px-3 py-4">
        <div className="flex items-center gap-2.5 px-2.5 pb-5 pt-1.5">
          <Logo />
          <div className="flex flex-col leading-tight">
            <span className="text-subtitle font-bold tracking-[-0.01em]">SmartZap</span>
            <span className="text-micro uppercase tracking-[0.1em] text-zinc-500">Cloudflare</span>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `rounded-lg px-2.5 py-2 text-sm transition-colors ${focusRing} ${
                  isActive
                    ? 'bg-primary-500/10 font-semibold text-primary-400'
                    : 'text-zinc-400 hover:bg-border-subtle hover:text-zinc-100'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2 border-t border-border-subtle p-2.5">
          <span className="h-[7px] w-[7px] rounded-full bg-primary-400" />
          <span className="text-xs text-zinc-400">Meta conectada</span>
        </div>
      </aside>
      <main className="flex-1 overflow-auto px-10 py-8">
        <div className="mx-auto max-w-[1160px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
