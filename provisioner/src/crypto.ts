const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(normalized);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array): string {
  let raw = "";
  for (const byte of value) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function importKey(encodedKey: string): Promise<CryptoKey> {
  const bytes = decodeBase64Url(encodedKey);
  if (bytes.byteLength !== 32) throw new Error("PROVISIONER_TOKEN_KEY deve conter exatamente 32 bytes em base64url");
  return crypto.subtle.importKey("raw", asBuffer(bytes), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", asBuffer(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function encryptJson(value: unknown, encodedKey: string, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBuffer(iv), additionalData: asBuffer(encoder.encode(aad)) },
    await importKey(encodedKey),
    encoder.encode(JSON.stringify(value)),
  ));
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(ciphertext)}`;
}

export async function decryptJson<T>(value: string, encodedKey: string, aad: string): Promise<T> {
  const [version, encodedIv, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext) throw new Error("Envelope cifrado inválido");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBuffer(decodeBase64Url(encodedIv)), additionalData: asBuffer(encoder.encode(aad)) },
    await importKey(encodedKey),
    asBuffer(decodeBase64Url(encodedCiphertext)),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}

export function randomBase64Url(bytes: number): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier)));
  return encodeBase64Url(digest);
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}
