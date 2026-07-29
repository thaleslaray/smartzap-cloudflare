export type MetaThroughputLevel = 'STANDARD' | 'HIGH' | 'COEXISTENCE' | 'UNKNOWN'

export type MetaThroughput = {
  level: MetaThroughputLevel
  /** Teto documentado/operacional em mensagens por segundo. */
  maxMps: number | null
  source: 'meta' | 'conservative_fallback'
}

/**
 * A Meta retorna um nível no campo throughput, não necessariamente um número.
 * O mapeamento fica isolado para não espalhar números históricos pelo produto.
 */
export function resolveMetaThroughput(input: unknown): MetaThroughput {
  const raw = input && typeof input === 'object'
    ? String((input as Record<string, unknown>).level ?? '').toUpperCase()
    : ''
  if (raw === 'HIGH') return { level: 'HIGH', maxMps: 1000, source: 'meta' }
  if (raw === 'COEXISTENCE') return { level: 'COEXISTENCE', maxMps: 20, source: 'meta' }
  if (raw === 'STANDARD') return { level: 'STANDARD', maxMps: 80, source: 'meta' }
  return { level: 'UNKNOWN', maxMps: null, source: 'conservative_fallback' }
}

export function safeRateForMode(
  maxMps: number | null,
  mode: 'automatic' | 'maximum' | 'manual',
  manualRate: number | null,
): number {
  const ceiling = Number.isFinite(maxMps) && (maxMps ?? 0) >= 1 ? maxMps! : 10
  if (mode === 'manual') return Math.max(1, Math.min(manualRate ?? 10, ceiling))
  if (mode === 'maximum') return Math.max(1, Math.floor(ceiling * 0.9))
  return Math.max(1, Math.floor(ceiling * 0.25))
}
