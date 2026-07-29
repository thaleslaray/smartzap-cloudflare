// Primitivos visuais do design system SmartZap CF (DS/templates/*.dc.html).
// Superfícies zinc, acento emerald, radius 10px. Ícones lucide.
import { useEffect, useRef, type ButtonHTMLAttributes, type ComponentType, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X, Zap } from 'lucide-react'

// Anel de foco visível padrão (acessibilidade/teclado) — aplicado a todos os
// elementos interativos do design system.
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#96f6bc] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090d0b]'

// Marca original: gradiente emerald, raio 12px e raio branco preenchido.
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-primary-600 to-primary-800 shadow-lg shadow-primary-900/20"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Logo SmartZap"
    >
      <Zap size={size * 0.5} className="text-white" fill="currentColor" aria-hidden="true" />
    </div>
  )
}

// Botões — primário emerald (texto verde-escuro), secundário zinc, perigo vermelho.
// Todos com estado hover, disabled e anel de foco visível.
const btnBase = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full text-sm transition-all duration-200 active:translate-y-px disabled:opacity-40 disabled:pointer-events-none ${focusRing}`
export const btnPrimary =
  `${btnBase} legacy-primary-action h-11 rounded-lg border px-4 font-semibold`
export const btnSecondary =
  `${btnBase} border border-white/[0.09] bg-white/[0.045] px-4 py-2 font-medium text-[#c8d1cb] hover:border-white/20 hover:bg-white/[0.08] hover:text-white`
export const btnDanger =
  `${btnBase} border border-red-500/20 bg-red-950/50 px-3 py-2 font-medium text-status-failed hover:bg-red-950`
const VARIANTS = { primary: btnPrimary, secondary: btnSecondary, danger: btnDanger } as const

// Input — estados default, focus (borda + anel), disabled e erro (aria-invalid).
export const inputClass =
  `w-full min-h-11 rounded-[14px] border border-white/10 bg-[#111413] px-3.5 py-2.5 text-sm text-[#e7eee9] outline-none transition-all placeholder:text-[#68736d] focus:border-[#96f6bc] focus:bg-[#151a17] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-status-failed ${focusRing}`

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

export function PageLoading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-3 text-sm text-zinc-500" role="status">
      <Spinner />
      <span>{label}</span>
    </div>
  )
}

export function PageError({
  message = 'Não foi possível carregar esta tela.', onRetry,
}: { message?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[--radius-app] border border-red-800/50 bg-red-950/25 px-5 py-4" role="alert">
      <p className="text-sm text-status-failed">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`mt-3 ${btnSecondary}`}>
          Tentar novamente
        </button>
      )}
    </div>
  )
}

export function Modal({
  titleId, children, onClose, closeDisabled = false, initialFocusRef,
  returnFocusRef, panelClassName = 'max-w-lg', overlayClassName = '', showCloseButton = false,
  layout = 'app',
}: {
  titleId: string
  children: ReactNode
  onClose: () => void
  closeDisabled?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  returnFocusRef?: RefObject<HTMLElement | null>
  panelClassName?: string
  overlayClassName?: string
  showCloseButton?: boolean
  /** Replica o posicionamento do Dialog Radix usado no SmartZap legado. */
  layout?: 'app' | 'legacy-dialog'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const closeDisabledRef = useRef(closeDisabled)
  onCloseRef.current = onClose
  closeDisabledRef.current = closeDisabled

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    const root = document.getElementById('root')
    const rootWasInert = root?.hasAttribute('inert') ?? false
    document.body.style.overflow = 'hidden'
    root?.setAttribute('inert', '')

    const focusableSelector = [
      'a[href]', 'button:not([disabled])', 'input:not([disabled])',
      'textarea:not([disabled])', 'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')
    const focusInitial = () => {
      const target = initialFocusRef?.current
        ?? panelRef.current?.querySelector<HTMLElement>(focusableSelector)
        ?? panelRef.current
      target?.focus()
    }
    requestAnimationFrame(focusInitial)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabledRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)]
        .filter((element) => element.getClientRects().length > 0)
      if (!focusable.length) { event.preventDefault(); panelRef.current.focus(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (!rootWasInert) root?.removeAttribute('inert')
      const returnTarget = returnFocusRef?.current ?? previousFocus
      if (returnTarget?.isConnected) returnTarget.focus()
    }
  }, [initialFocusRef, returnFocusRef])

  return createPortal(
    <div
      className={layout === 'legacy-dialog'
        ? `fixed inset-0 z-50 bg-black/50 ${overlayClassName}`
        : `fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-4 sm:items-center sm:py-6 ${overlayClassName}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={layout === 'legacy-dialog'
          ? `fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-6 shadow-lg duration-200 ${panelClassName}`
          : `relative my-auto max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-[24px] border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-5 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-6 ${panelClassName}`}
      >
        {children}
        {showCloseButton && (
          <button
            type="button"
            aria-label="Fechar"
            disabled={closeDisabled}
            onClick={onClose}
            className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>,
    document.body,
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

// Card base — variante `default` do Container do SmartZap original. A variante
// glass existe no legado, mas não é o padrão: usar transparência aqui altera
// todos os painéis, tabelas e filtros migrados.
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`premium-card min-w-0 max-w-full rounded-[22px] border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] transition-all duration-200 ${className}`}>
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
    <div className="premium-card rounded-[22px] border border-white/10 bg-[#111413] px-5 py-[18px] shadow-[0_14px_34px_rgba(0,0,0,0.18)]">
      <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="mt-3 text-metric font-semibold leading-none tracking-[-0.03em]">{value}</p>
      {hint != null && <p className={`mt-1.5 text-xs ${tone}`}>{hint}</p>}
    </div>
  )
}

// Cabeçalho de página — título + subtítulo à esquerda, ação à direita.
export function PageHeader({
  title, subtitle, action, icon: Icon,
}: {
  title: string; subtitle?: string; action?: ReactNode; icon?: ComponentType<{ size?: number; className?: string }>
}) {
  return (
    <div className="premium-page-header mb-7 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className={Icon ? 'flex min-w-0 items-start gap-3' : 'min-w-0'}>
        {Icon && <span className="mt-1 flex size-10 items-center justify-center rounded-xl bg-primary-500/10 text-primary-400"><Icon size={21}/></span>}
        <div className="min-w-0"><h1 className="text-heading-1 break-words">{title}</h1>
        {subtitle && <p className="text-body-sm break-words">{subtitle}</p>}</div>
      </div>
      {action && <div className="w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto">{action}</div>}
    </div>
  )
}
