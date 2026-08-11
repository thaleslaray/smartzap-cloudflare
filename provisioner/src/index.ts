import { CloudflareApi, exchangeOAuthCode, revokeOAuthToken } from "./cloudflare-api";
import { executeInstallation, planInstallation } from "./engine";
import { loadRelease } from "./release";
import {
  assertSameOrigin,
  clearSessionCookie,
  cleanupExpiredOAuthSessions,
  consumeOAuthState,
  createOAuthSession,
  getOAuthTokens,
  getSession,
  revokeSession,
  selectAccount,
  storeOAuthTokens,
} from "./session";
import type { ProvisionerEnv } from "./types";
import { installerHtml } from "./ui";

export default {
  async fetch(request: Request, env: ProvisionerEnv): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/") return html(installerHtml());
      if (request.method === "GET" && url.pathname === "/health") return json({ ok: true });
      if (request.method === "GET" && url.pathname.startsWith("/release/")) return await releaseObject(url, env);
      if (request.method === "GET" && url.pathname === "/oauth/start") return await oauthStart(env);
      if (request.method === "GET" && url.pathname === "/oauth/callback") return await oauthCallback(request, url, env);
      if (request.method === "GET" && url.pathname === "/api/session") return await sessionState(request, env);
      if (request.method === "POST") assertSameOrigin(request, env);
      if (request.method === "POST" && url.pathname === "/api/account") return await chooseAccount(request, env);
      if (request.method === "POST" && url.pathname === "/api/plan") return await plan(request, env);
      if (request.method === "POST" && url.pathname === "/api/install") return await install(request, env);
      if (request.method === "POST" && url.pathname === "/api/disconnect") return await disconnect(request, env);
      return json({ error: "Rota não encontrada" }, 404);
    } catch (error) {
      return json({ error: safeMessage(error) }, error instanceof SyntaxError ? 400 : 422);
    }
  },
  async scheduled(_controller: ScheduledController, env: ProvisionerEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(cleanupExpiredOAuthSessions(env).then(() => undefined));
  },
};

async function releaseObject(url: URL, env: ProvisionerEnv): Promise<Response> {
  if (!env.RELEASES) return json({ error: "Distribuição de releases não configurada" }, 404);
  const key = url.pathname.slice("/release/".length);
  if (!key || key.includes("..")) return json({ error: "Artefato inválido" }, 400);
  const object = await env.RELEASES.get(key);
  if (!object) return json({ error: "Artefato não encontrado" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", key === "manifest.json" ? "no-cache" : "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}

async function oauthStart(env: ProvisionerEnv): Promise<Response> {
  assertConfig(env);
  await cleanupExpiredOAuthSessions(env);
  const session = await createOAuthSession(env);
  const redirectUri = `${normalizedOrigin(env)}/oauth/callback`;
  const authorize = new URL("https://dash.cloudflare.com/oauth2/auth");
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: env.CF_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    state: session.state,
    code_challenge: session.challenge,
    code_challenge_method: "S256",
    scope: env.CF_OAUTH_SCOPES,
  }).toString();
  return new Response(null, { status: 302, headers: { Location: authorize.toString(), "Set-Cookie": session.cookie } });
}

async function oauthCallback(request: Request, url: URL, env: ProvisionerEnv): Promise<Response> {
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (error) throw new Error(`Autorização Cloudflare recusada: ${error}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) throw new Error("Callback OAuth incompleto");
  const consumed = await consumeOAuthState(env, state);
  const cookieSession = await getSession(env, request);
  if (cookieSession.id !== consumed.session.id) throw new Error("A sessão OAuth não corresponde a este navegador");
  const tokens = await exchangeOAuthCode({
    clientId: env.CF_OAUTH_CLIENT_ID,
    clientSecret: env.CF_OAUTH_CLIENT_SECRET,
    code,
    verifier: consumed.verifier,
    redirectUri: `${normalizedOrigin(env)}/oauth/callback`,
  });
  await storeOAuthTokens(env, consumed.session.id, tokens);
  return new Response(null, { status: 302, headers: { Location: normalizedOrigin(env) } });
}

async function sessionState(request: Request, env: ProvisionerEnv): Promise<Response> {
  try {
    const session = await getSession(env, request);
    if (!session.token_ciphertext) return json({ authorized: false });
    const tokens = await getOAuthTokens(env, session);
    const api = new CloudflareApi(tokens.accessToken);
    const accounts = await api.listAccounts().catch(() => []);
    return json({
      authorized: true,
      accountId: session.account_id,
      accountName: session.account_name,
      accounts,
    });
  } catch {
    return json({ authorized: false });
  }
}

async function chooseAccount(request: Request, env: ProvisionerEnv): Promise<Response> {
  const session = await getSession(env, request);
  const tokens = await getOAuthTokens(env, session);
  const body = await request.json() as { accountId?: string; accountName?: string };
  if (!body.accountId || !/^[a-f0-9]{32}$/i.test(body.accountId)) throw new Error("Account ID inválido");
  const api = new CloudflareApi(tokens.accessToken, body.accountId);
  await api.validateAccount();
  await selectAccount(env, session.id, body.accountId, String(body.accountName || "Conta validada").slice(0, 100));
  return json({ ok: true });
}

async function plan(request: Request, env: ProvisionerEnv): Promise<Response> {
  const session = await requireSelectedSession(request, env);
  const tokens = await getOAuthTokens(env, session);
  const body = await request.json() as { prefix?: string };
  const release = await loadRelease(env);
  const result = await planInstallation({
    env,
    api: new CloudflareApi(tokens.accessToken, session.account_id!),
    accountId: session.account_id!,
    prefix: String(body.prefix || ""),
    release: release.manifest,
  });
  return json(result);
}

async function install(request: Request, env: ProvisionerEnv): Promise<Response> {
  const session = await requireSelectedSession(request, env);
  const tokens = await getOAuthTokens(env, session);
  const body = await request.json() as { prefix?: string; masterPassword?: string; vaultKey?: string };
  const release = await loadRelease(env);
  const result = await executeInstallation({
    env,
    sessionId: session.id,
    accountId: session.account_id!,
    accessToken: tokens.accessToken,
    prefix: String(body.prefix || ""),
    release: release.manifest,
    manifestUrl: release.url,
    secrets: { masterPassword: String(body.masterPassword || ""), vaultKey: String(body.vaultKey || "") },
  });
  const authorizationReleased = await revokeOAuthToken(tokens.accessToken).then(() => true).catch(() => false);
  await revokeSession(env, session.id);
  return json(
    { ...result, authorizationReleased },
    200,
    { "Set-Cookie": clearSessionCookie(env.PUBLIC_ORIGIN.startsWith("https://")) },
  );
}

async function disconnect(request: Request, env: ProvisionerEnv): Promise<Response> {
  const session = await getSession(env, request);
  const tokens = await getOAuthTokens(env, session).catch(() => null);
  if (tokens?.accessToken) await revokeOAuthToken(tokens.accessToken).catch(() => undefined);
  await revokeSession(env, session.id);
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(env.PUBLIC_ORIGIN.startsWith("https://")) });
}

async function requireSelectedSession(request: Request, env: ProvisionerEnv) {
  const session = await getSession(env, request);
  if (!session.account_id || session.status !== "account_selected") throw new Error("Selecione e valide uma conta Cloudflare primeiro");
  return session;
}

function assertConfig(env: ProvisionerEnv): void {
  if (!env.CF_OAUTH_CLIENT_ID || env.CF_OAUTH_CLIENT_ID.startsWith("REPLACE_")) throw new Error("Cliente OAuth Cloudflare ainda não configurado");
  if (!env.CF_OAUTH_SCOPES || env.CF_OAUTH_SCOPES.startsWith("REPLACE_")) throw new Error("Escopos OAuth Cloudflare ainda não configurados");
}

function normalizedOrigin(env: ProvisionerEnv): string {
  return new URL(env.PUBLIC_ORIGIN).origin;
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Falha inesperada";
  return message.replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]").slice(0, 500);
}

function html(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://dash.cloudflare.com" } });
}

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}
