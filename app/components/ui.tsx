// Primitivos visuais do design system SmartZap CF (DS/templates/*.dc.html).
// Superfícies zinc, acento emerald, radius 10px. Ícones lucide.
import type { ButtonHTMLAttributes, ReactNode } from 'react'

// Anel de foco visível padrão (acessibilidade/teclado) — aplicado a todos os
// elementos interativos do design system.
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950'

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
// Todos com estado hover, disabled e anel de foco visível.
const btnBase = `inline-flex items-center justify-center gap-2 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none ${focusRing}`
export const btnPrimary =
  `${btnBase} bg-primary-500 px-4 py-2 font-semibold text-primary-950 hover:bg-primary-600 hover:text-primary-50`
export const btnSecondary =
  `${btnBase} bg-zinc-800 px-4 py-2 font-medium text-zinc-200 hover:bg-zinc-700`
export const btnDanger =
  `${btnBase} bg-red-950 px-3 py-1.5 font-medium text-status-failed hover:bg-red-900`
const VARIANTS = { primary: btnPrimary, secondary: btnSecondary, danger: btnDanger } as const

// Input — estados default, focus (borda + anel), disabled e erro (aria-invalid).
export const inputClass =
  `w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-primary-400 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-status-failed ${focusRing}`

// Spinner de carregamento (herda a cor do texto do botão).
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      role="status"
      aria-label="Carregando"
    />
  )
}

// Botão com variante + estado de loading (mostra spinner e desabilita).
export function Button({
  variant = 'primary', loading = false, disabled, children, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS; loading?: boolean
}) {
  return (
    <button className={`${VARIANTS[variant]} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  )
}

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
      <p className="text-body text-zinc-400">{label}</p>
      <p className="mt-2 text-metric font-bold leading-none tracking-[-0.02em]">{value}</p>
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
        <h1 className="text-title font-bold tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-zinc-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
