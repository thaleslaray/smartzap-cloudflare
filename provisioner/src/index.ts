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
import { forkInstallerHtml, installationChooserHtml } from "./fork-ui";
import { installerHtml } from "./ui";
import provisionerGuideMarkdown from "../../docs/GUIA-PROVISIONADOR-CLOUDFLARE-POR-PRODUTO.md";

const provisionerWorker = {
  async fetch(request: Request, env: ProvisionerEnv): Promise<Response> {
    try {
      const url = new URL(request.url);
      const basePath = publicBasePath(env);
      if (request.method === "GET" && url.pathname === "/") return html(portalHtml(basePath));
      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/guia.md") {
        return markdown(provisionerGuideMarkdown, request.method === "HEAD");
      }
      if (request.method === "GET" && url.pathname === basePath) return Response.redirect(`${publicBaseUrl(env)}/`, 308);
      const path = productPath(url.pathname, basePath);
      if (request.method === "GET" && path === "/") return html(installationChooserHtml());
      if (request.method === "GET" && path === "/fork") return Response.redirect(`${publicBaseUrl(env)}/fork/`, 308);
      if (request.method === "GET" && path === "/fork/") return html(forkInstallerHtml());
      if (request.method === "GET" && path === "/quick") return Response.redirect(`${publicBaseUrl(env)}/quick/`, 308);
      if (request.method === "GET" && path === "/quick/") return html(await quickInstallerHtml(env));
      if ((request.method === "GET" || request.method === "HEAD") && path === "/logo.svg") return logo(request.method === "HEAD");
      if (request.method === "GET" && path === "/health") return json({ ok: true, product: "smartzap" });
      if (request.method === "GET" && path.startsWith("/release/")) return await releaseObject(path, env);
      if (request.method === "GET" && path === "/oauth/start") return await oauthStart(env);
      if (request.method === "GET" && path === "/oauth/callback") return await oauthCallback(request, url, env);
      if (request.method === "GET" && path === "/api/session") return await sessionState(request, env);
      if (request.method === "POST") assertSameOrigin(request, env);
      if (request.method === "POST" && path === "/api/account") return await chooseAccount(request, env);
      if (request.method === "POST" && path === "/api/plan") return await plan(request, env);
      if (request.method === "POST" && path === "/api/install") return await install(request, env);
      if (request.method === "POST" && path === "/api/disconnect") return await disconnect(request, env);
      return json({ error: "Rota não encontrada" }, 404);
    } catch (error) {
      return json(publicError(error), error instanceof SyntaxError ? 400 : 422);
    }
  },
  async scheduled(_controller: ScheduledController, env: ProvisionerEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(cleanupExpiredOAuthSessions(env).then(() => undefined));
  },
};

export default provisionerWorker;

function logo(head = false): Response {
  return new Response(
    head ? null : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="title"><title id="title">SmartZap</title><rect width="256" height="256" rx="64" fill="#0b1512"/><path d="M142 24 61 139h58l-13 93 89-127h-61l8-81Z" fill="#6ff0b0"/></svg>`,
    {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

async function releaseObject(path: string, env: ProvisionerEnv): Promise<Response> {
  if (!env.RELEASES) return json({ error: "Distribuição de releases não configurada" }, 404);
  const key = path.slice("/release/".length);
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
  const redirectUri = `${publicBaseUrl(env)}/oauth/callback`;
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
    redirectUri: `${publicBaseUrl(env)}/oauth/callback`,
  });
  await storeOAuthTokens(env, consumed.session.id, tokens);
  return new Response(null, { status: 302, headers: { Location: `${publicBaseUrl(env)}/quick/` } });
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
    { "Set-Cookie": clearSessionCookie(env.PUBLIC_ORIGIN.startsWith("https://"), publicBasePath(env)) },
  );
}

async function disconnect(request: Request, env: ProvisionerEnv): Promise<Response> {
  const session = await getSession(env, request);
  const tokens = await getOAuthTokens(env, session).catch(() => null);
  if (tokens?.accessToken) await revokeOAuthToken(tokens.accessToken).catch(() => undefined);
  await revokeSession(env, session.id);
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(env.PUBLIC_ORIGIN.startsWith("https://"), publicBasePath(env)) });
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

function publicBaseUrl(env: ProvisionerEnv): string {
  const url = new URL(env.PUBLIC_ORIGIN);
  return `${url.origin}${normalizePath(url.pathname)}`;
}

function publicBasePath(env: ProvisionerEnv): string {
  return normalizePath(new URL(env.PUBLIC_ORIGIN).pathname);
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "";
  return `/${pathname.split("/").filter(Boolean).join("/")}`;
}

function productPath(pathname: string, basePath: string): string {
  if (!basePath) return pathname;
  if (!pathname.startsWith(`${basePath}/`)) return "__outside_product__";
  return pathname.slice(basePath.length) || "/";
}

function portalHtml(basePath: string): string {
  const smartzapPath = `${basePath || "/smartzap"}/`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Instaladores · Escola de Automação</title><style>:root{font-family:Inter,system-ui,sans-serif;color:#f4f7f5;background:#08110e}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 80% 0,#123729,transparent 35%),#08110e}main{width:min(720px,calc(100% - 32px));padding:48px 0}.brand{color:#7ef2bb;font-size:.8rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.3rem,8vw,4.8rem);line-height:.95;letter-spacing:-.055em;margin:18px 0}p{color:#aab8b1;line-height:1.6}.card{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-top:34px;padding:24px;border:1px solid #294139;border-radius:22px;background:#0f1b16}a{display:inline-flex;min-height:48px;align-items:center;padding:0 20px;border-radius:999px;background:#7ef2bb;color:#07120d;font-weight:800;text-decoration:none;white-space:nowrap}a:focus-visible{outline:3px solid white;outline-offset:4px}@media(max-width:560px){.card{align-items:flex-start;flex-direction:column}a{width:100%;justify-content:center}}</style></head><body><main><div class="brand">Escola de Automação</div><h1>Instaladores oficiais.</h1><p>Escolha o sistema que deseja instalar na sua própria infraestrutura Cloudflare.</p><section class="card"><div><strong>SmartZap</strong><p>WhatsApp, campanhas, Inbox, contatos e templates.</p></div><a href="${smartzapPath}">Instalar SmartZap →</a></section></main></body></html>`;
}

async function quickInstallerHtml(env: ProvisionerEnv): Promise<string> {
  const version = await loadRelease(env).then((release) => release.manifest.version).catch(() => "versão fixa publicada");
  return installerHtml({ apiBase: "../", version });
}

export function publicError(error: unknown): { error: string; code?: string } {
  const message = error instanceof Error ? error.message : "Falha inesperada";
  const safe = message.replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]").slice(0, 500);
  if (/enable R2|R2.+(?:subscription|not enabled)|(?:subscription|enable).+R2/i.test(safe)) {
    return {
      code: "R2_SUBSCRIPTION_REQUIRED",
      error: "O R2 ainda não está ativado nesta conta. A Cloudflare exige concluir a ativação e cadastrar um meio de pagamento, mesmo quando o uso fica dentro da franquia gratuita. Nenhuma cobrança é feita pelo SmartZap.",
    };
  }
  return { error: safe };
}

function html(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://dash.cloudflare.com" } });
}

function markdown(body: string, head = false): Response {
  return new Response(head ? null : body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'inline; filename="guia.md"',
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}
