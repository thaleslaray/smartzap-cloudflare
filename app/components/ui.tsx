// Primitivos visuais do design system SmartZap CF (DS/templates/*.dc.html).
// Superfícies zinc, acento emerald, radius 10px. Ícones lucide.
import type { ReactNode } from 'react'

// Marca: quadrado emerald arredondado com "S" em verde-escuro.
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg bg-primary-500 font-extrabold text-primary-950"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      S
    </div>
  )
}

// Botões — primário emerald (texto verde-escuro), secundário zinc, perigo vermelho.
export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-primary-950 transition-colors hover:bg-primary-600 hover:text-primary-50 disabled:opacity-40 disabled:pointer-events-none'
export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-40 disabled:pointer-events-none'
export const btnDanger =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-red-950 px-3 py-1.5 text-sm font-medium text-status-failed transition-colors hover:bg-red-900'
export const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-primary-400'

// Card base — superfície elevada com borda sutil.
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[--radius-app] border border-zinc-800 bg-zinc-900 ${className}`}>
      {children}
    </div>
  )
}

// Stat card — rótulo, valor grande e linha de apoio (delta/detalhe).
export function StatCard({
  label, value, hint, hintTone = 'muted',
}: {
  label: string; value: ReactNode; hint?: ReactNode
  hintTone?: 'muted' | 'positive' | 'failed'
}) {
  const tone =
    hintTone === 'positive' ? 'text-primary-400'
    : hintTone === 'failed' ? 'text-status-failed'
    : 'text-zinc-500'
  return (
    <div className="rounded-[--radius-app] border border-zinc-800 bg-zinc-900 px-5 py-[18px]">
      <p className="text-[13px] text-zinc-400">{label}</p>
      <p className="mt-2 text-[28px] font-bold leading-none tracking-[-0.02em]">{value}</p>
      {hint != null && <p className={`mt-1.5 text-xs ${tone}`}>{hint}</p>}
    </div>
  )
}

// Cabeçalho de página — título + subtítulo à esquerda, ação à direita.
export function PageHeader({
  title, subtitle, action,
}: {
  title: string; subtitle?: string; action?: ReactNode
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-zinc-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
