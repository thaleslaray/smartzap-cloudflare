// Barra de progresso — 6px, trilho zinc-800, preenchimento emerald.
// `animated` (campanha enviando) aplica as listras animadas do DS.
export function ProgressBar({
  value, total, animated = false,
}: {
  value: number; total: number; animated?: boolean
}) {
  const pct = total ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div
        className={`h-full rounded-full bg-primary-500 transition-[width] duration-500 ${animated ? 'sz-stripes-fill' : ''}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
