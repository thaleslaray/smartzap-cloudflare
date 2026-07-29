import type { Context } from 'hono'

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: string }

export type TextBodyResult =
  | { ok: true; value: string }
  | { ok: false; status: 400 | 413; error: string }

export type BytesBodyResult =
  | { ok: true; value: Uint8Array }
  | { ok: false; status: 400 | 413; error: string }

export async function readBodyBytes(
  c: Context<{ Bindings: Env }>, maxBytes: number,
): Promise<BytesBodyResult> {
  const declared = c.req.header('content-length')
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes)
    return { ok: false, status: 413, error: 'payload excede o limite permitido' }

  const reader = c.req.raw.body?.getReader()
  if (!reader) return { ok: true, value: new Uint8Array() }
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel('payload too large').catch(() => undefined)
        return { ok: false, status: 413, error: 'payload excede o limite permitido' }
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return { ok: true, value: bytes }
  } catch {
    return { ok: false, status: 400, error: 'corpo inválido' }
  }
}

export async function readTextBody(
  c: Context<{ Bindings: Env }>, maxBytes: number,
): Promise<TextBodyResult> {
  const body = await readBodyBytes(c, maxBytes)
  if (!body.ok) return body
  try {
    return { ok: true, value: new TextDecoder('utf-8', { fatal: true }).decode(body.value) }
  } catch {
    return { ok: false, status: 400, error: 'corpo inválido' }
  }
}

// Lê o stream com teto real, inclusive quando Content-Length está ausente ou é falso.
// Isso evita que endpoints públicos/autenticados materializem até 100 MB antes do Zod.
export async function readJsonBody(
  c: Context<{ Bindings: Env }>, maxBytes: number,
): Promise<JsonBodyResult> {
  const body = await readTextBody(c, maxBytes)
  if (!body.ok) return body.status === 413
    ? body
    : { ok: false, status: 400, error: 'JSON inválido' }
  try { return { ok: true, value: JSON.parse(body.value) } }
  catch { return { ok: false, status: 400, error: 'JSON inválido' } }
}
