// Fail-closed: sem secret configurado ou sem header, NUNCA aceita.
export async function verifyMetaSignature(
  secret: string, rawBody: string, header: string | null,
): Promise<boolean> {
  if (!secret || !header?.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const expected = header.slice('sha256='.length)
  const sigBytes = new Uint8Array(expected.length / 2)
  for (let i = 0; i < sigBytes.length; i++) {
    const byte = Number.parseInt(expected.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) return false
    sigBytes[i] = byte
  }
  return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(rawBody))
}
