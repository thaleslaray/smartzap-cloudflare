import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet } from 'react-router'
import { LayoutDashboard, Megaphone, Users, FileText, Settings } from 'lucide-react'
import { api } from '../lib/api'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/campaigns', label: 'Campanhas', icon: Megaphone },
  { to: '/contacts', label: 'Contatos', icon: Users },
  { to: '/templates', label: 'Templates', icon: FileText },
  { to: '/settings', label: 'Configurações', icon: Settings },
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
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-6 text-lg font-semibold text-primary-400">SmartZap</div>
        <nav className="space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-[--radius-app] px-3 py-2 text-sm ${
                  isActive ? 'bg-zinc-800 text-primary-400' : 'text-zinc-400 hover:bg-zinc-800/50'}`}>
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8"><Outlet /></main>
    </div>
  )
}
