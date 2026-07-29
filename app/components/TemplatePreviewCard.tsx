import { ArrowUpRight, FileText, Image, Phone, Video } from 'lucide-react'
import type { ReactNode } from 'react'

type TemplateButton = { type?: string; text?: string; url?: string; phone_number?: string }
type TemplateComponent = { type?: string; format?: string; text?: string; buttons?: TemplateButton[] }

const componentOf = (components: unknown, type: string) => Array.isArray(components)
  ? (components as TemplateComponent[]).find((component) => String(component.type).toUpperCase() === type)
  : undefined

function richText(text: string): ReactNode[] {
  return text.split(/(\{\{[^}]+\}\}|\*[^*]+\*|_[^_]+_|~[^~]+~)/g).filter(Boolean).map((part, index) => {
    if (/^\{\{[^}]+\}\}$/.test(part)) return <span key={index} className="rounded-md border border-primary-500/25 bg-primary-500/10 px-1.5 py-0.5 font-mono text-xs text-primary-200">{part}</span>
    if (part.startsWith('*') && part.endsWith('*')) return <strong key={index} className="font-semibold text-[var(--ds-text-primary)]">{part.slice(1, -1)}</strong>
    if (part.startsWith('_') && part.endsWith('_')) return <em key={index}>{part.slice(1, -1)}</em>
    if (part.startsWith('~') && part.endsWith('~')) return <s key={index}>{part.slice(1, -1)}</s>
    return part.split('\n').map((line, lineIndex) => <span key={`${index}-${lineIndex}`}>{line}{lineIndex < part.split('\n').length - 1 && <br />}</span>)
  })
}

export function TemplatePreviewCard({ name, components }: { name: string; components: unknown }) {
  const header = componentOf(components, 'HEADER')
  const body = componentOf(components, 'BODY')
  const footer = componentOf(components, 'FOOTER')
  const buttons = componentOf(components, 'BUTTONS')?.buttons ?? []
  const mediaFormat = String(header?.format ?? '').toUpperCase()
  return (
    <div aria-label={`Preview do template ${name}`} className="overflow-hidden rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-glass)] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.45)]">
      {['IMAGE', 'VIDEO', 'GIF', 'DOCUMENT'].includes(mediaFormat) && <div className="mb-5 flex h-40 items-center justify-center rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)]"><div className="flex items-center gap-2 text-xs text-[var(--ds-text-secondary)]">{mediaFormat === 'DOCUMENT' ? <FileText size={18} /> : mediaFormat === 'VIDEO' || mediaFormat === 'GIF' ? <Video size={18} /> : <Image size={18} />}<span>Carregando mídia…</span></div></div>}
      {header?.text && <div className="mb-5 border-l-2 border-primary-500/40 pl-4 text-[13px] font-semibold text-[var(--ds-text-primary)]">{richText(header.text)}</div>}
      {body?.text && <div className="text-[15px] leading-7 text-[var(--ds-text-secondary)]">{richText(body.text)}</div>}
      {footer?.text && <div className="mt-5 border-t border-[var(--ds-border-default)] pt-4 text-xs text-[var(--ds-text-secondary)]">{richText(footer.text)}</div>}
      {buttons.length > 0 && <div className="mt-6 grid gap-2">{buttons.map((button, index) => <div key={`${button.type}-${index}`} className="flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-4 py-3"><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-[var(--ds-text-primary)]">{button.text}</div>{(button.url || button.phone_number) && <div className="mt-1 truncate text-xs text-[var(--ds-text-muted)]">{button.url || button.phone_number}</div>}</div>{String(button.type).toUpperCase() === 'PHONE_NUMBER' ? <Phone size={16} className="text-primary-300" /> : <ArrowUpRight size={16} className="text-primary-300" />}</div>)}</div>}
    </div>
  )
}
