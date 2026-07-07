export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className="h-full bg-primary-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}
