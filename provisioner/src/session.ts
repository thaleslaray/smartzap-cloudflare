import { decryptJson, encryptJson, pkceChallenge, randomBase64Url, sha256 } from "./crypto";
import { revokeOAuthToken } from "./cloudflare-api";
import type { OAuthTokens, ProvisionerEnv, SessionRecord } from "./types";

const COOKIE = "smartzap_provisioner_session";
const SESSION_TTL_SECONDS = 30 * 60;

export interface NewOAuthSession {
  sessionId: string;
  state: string;
  verifier: string;
  challenge: string;
  cookie: string;
}

export async function createOAuthSession(env: ProvisionerEnv): Promise<NewOAuthSession> {
  const sessionId = randomBase64Url(24);
  const state = randomBase64Url(32);
  const verifier = randomBase64Url(48);
  const challenge = await pkceChallenge(verifier);
  const verifierCiphertext = await encryptJson({ verifier }, env.PROVISIONER_TOKEN_KEY, verifierAad(sessionId));
  const expiresAt = sqliteTimestamp(Date.now() + SESSION_TTL_SECONDS * 1000);
  await env.PROVISIONER_DB.prepare(`
    INSERT INTO oauth_sessions (id, state_hash, pkce_verifier_ciphertext, status, expires_at)
    VALUES (?, ?, ?, 'authorizing', ?)
  `).bind(sessionId, await sha256(state), verifierCiphertext, expiresAt).run();
  return { sessionId, state, verifier, challenge, cookie: sessionCookie(sessionId, env.PUBLIC_ORIGIN.startsWith("https://")) };
}

export async function consumeOAuthState(env: ProvisionerEnv, state: string): Promise<{ session: SessionRecord; verifier: string }> {
  const stateHash = await sha256(state);
  const session = await env.PROVISIONER_DB.prepare(`
    SELECT * FROM oauth_sessions
    WHERE state_hash = ? AND status = 'authorizing' AND expires_at > CURRENT_TIMESTAMP
  `).bind(stateHash).first<SessionRecord>();
  if (!session) throw new Error("Autorização expirada ou state OAuth inválido");
  const decoded = await decryptJson<{ verifier: string }>(session.pkce_verifier_ciphertext, env.PROVISIONER_TOKEN_KEY, verifierAad(session.id));
  return { session, verifier: decoded.verifier };
}

export async function storeOAuthTokens(env: ProvisionerEnv, sessionId: string, tokens: OAuthTokens): Promise<void> {
  const ciphertext = await encryptJson(tokens, env.PROVISIONER_TOKEN_KEY, tokenAad(sessionId));
  const result = await env.PROVISIONER_DB.prepare(`
    UPDATE oauth_sessions
    SET token_ciphertext = ?, state_hash = ?, pkce_verifier_ciphertext = ?, status = 'authorized'
    WHERE id = ? AND status = 'authorizing'
  `).bind(ciphertext, await sha256(randomBase64Url(32)), "consumed", sessionId).run();
  if (!result.meta.changes) throw new Error("Sessão OAuth já foi consumida");
}

export async function getSession(env: ProvisionerEnv, request: Request): Promise<SessionRecord> {
  const sessionId = readCookie(request, COOKIE);
  if (!sessionId) throw new Error("Sessão de instalação ausente");
  const session = await env.PROVISIONER_DB.prepare(`
    SELECT * FROM oauth_sessions WHERE id = ? AND expires_at > CURRENT_TIMESTAMP
  `).bind(sessionId).first<SessionRecord>();
  if (!session || session.status === "revoked") throw new Error("Sessão de instalação expirada");
  return session;
}

export async function getOAuthTokens(env: ProvisionerEnv, session: SessionRecord): Promise<OAuthTokens> {
  if (!session.token_ciphertext) throw new Error("Cloudflare ainda não autorizada");
  return decryptJson<OAuthTokens>(session.token_ciphertext, env.PROVISIONER_TOKEN_KEY, tokenAad(session.id));
}

export async function selectAccount(env: ProvisionerEnv, sessionId: string, accountId: string, accountName: string): Promise<void> {
  const result = await env.PROVISIONER_DB.prepare(`
    UPDATE oauth_sessions SET account_id = ?, account_name = ?, status = 'account_selected'
    WHERE id = ? AND status IN ('authorized', 'account_selected')
  `).bind(accountId, accountName, sessionId).run();
  if (!result.meta.changes) throw new Error("Sessão não está autorizada para selecionar conta");
}

export async function revokeSession(env: ProvisionerEnv, sessionId: string): Promise<void> {
  await env.PROVISIONER_DB.prepare(`
    UPDATE oauth_sessions SET token_ciphertext = NULL, status = 'revoked' WHERE id = ?
  `).bind(sessionId).run();
}

export async function cleanupExpiredOAuthSessions(env: ProvisionerEnv): Promise<{
  found: number;
  remotelyRevoked: number;
  locallyCleared: number;
}> {
  const result = await env.PROVISIONER_DB.prepare(`
    SELECT id, token_ciphertext FROM oauth_sessions
    WHERE expires_at <= CURRENT_TIMESTAMP AND status != 'revoked'
    ORDER BY expires_at ASC
    LIMIT 50
  `).all<Pick<SessionRecord, "id" | "token_ciphertext">>();
  let remotelyRevoked = 0;
  let locallyCleared = 0;
  for (const session of result.results || []) {
    if (session.token_ciphertext) {
      try {
        const tokens = await decryptJson<OAuthTokens>(session.token_ciphertext, env.PROVISIONER_TOKEN_KEY, tokenAad(session.id));
        await revokeOAuthToken(tokens.accessToken);
        remotelyRevoked += 1;
      } catch {
        // A expiração ou uma revogação anterior não pode impedir a exclusão local.
      }
    }
    await revokeSession(env, session.id);
    locallyCleared += 1;
  }
  return { found: result.results?.length || 0, remotelyRevoked, locallyCleared };
}

export function sessionCookie(sessionId: string, secure = true): string {
  return `${COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(secure = true): string {
  return `${COOKIE}=; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=0`;
}

export function assertSameOrigin(request: Request, env: ProvisionerEnv): void {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(env.PUBLIC_ORIGIN).origin) throw new Error("Origem da requisição não autorizada");
}

function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function verifierAad(sessionId: string): string {
  return `smartzap:oauth-verifier:${sessionId}`;
}

function tokenAad(sessionId: string): string {
  return `smartzap:oauth-token:${sessionId}`;
}

function sqliteTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}
