export function parsePage(value: string | undefined): number | null {
  if (value === undefined) return 1
  if (!/^\d+$/.test(value)) return null
  const page = Number(value)
  // Evita offsets absurdos/overflow ao multiplicar pelo tamanho da página.
  return Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000 ? page : null
}
