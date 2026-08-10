import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { timingSafeEqualStr } from "../middleware/auth";
import { hashSessionToken } from "../domain/session";
import { z } from "zod";
import { redactOperationalDetail } from "../domain/redaction";
import { readJsonBody } from "./body";

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 dias
const LoginSchema = z
  .object({
    password: z.string().min(1).max(512),
    turnstileToken: z.string().min(1).max(4096).optional(),
  })
  .strict();

export async function verifyTurnstile(
  env: Env,
  token: string | undefined,
  ip: string,
  expectedHostname?: string,
): Promise<boolean> {
  if (env.TURNSTILE_ENABLED !== "true") return true;
  if (!env.TURNSTILE_SECRET) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "Turnstile habilitado sem TURNSTILE_SECRET — login bloqueado",
      }),
    );
    return false;
  }
  if (!token) return false;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET,
          response: token,
          remoteip: ip,
        }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "Siteverify respondeu HTTP inválido",
          status: res.status,
        }),
      );
      return false;
    }
    const data = (await res.json()) as {
      success?: unknown;
      hostname?: unknown;
      action?: unknown;
      "error-codes"?: unknown;
    };
    const valid =
      data.success === true &&
      data.action === "login" &&
      (!expectedHostname || data.hostname === expectedHostname);
    if (!valid) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "Siteverify rejeitou tentativa de login",
          errorCodes: Array.isArray(data["error-codes"])
            ? data["error-codes"]
            : [],
          actionValid: data.action === "login",
          hostnameValid:
            !expectedHostname || data.hostname === expectedHostname,
        }),
      );
    }
    return valid;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "Siteverify indisponível; login bloqueado",
        error: redactOperationalDetail(
          error instanceof Error ? error.message : error,
        ),
      }),
    );
    return false;
  }
}

export const authRoutes = new Hono<{ Bindings: Env }>()
  .get("/config", (c) =>
    c.json({
      turnstileSiteKey:
        c.env.TURNSTILE_ENABLED === "true"
          ? c.env.TURNSTILE_SITE_KEY || null
          : null,
      turnstileRequired: c.env.TURNSTILE_ENABLED === "true",
    }),
  )
  .post("/login", async (c) => {
    const ip = c.req.header("cf-connecting-ip") ?? "local";
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = LoginSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "payload inválido" }, 400);
    if (
      !(await verifyTurnstile(
        c.env,
        body.data.turnstileToken,
        ip,
        new URL(c.req.url).hostname,
      ))
    )
      return c.json({ error: "verificação anti-bot falhou" }, 403);
    if (
      !(await timingSafeEqualStr(body.data.password, c.env.MASTER_PASSWORD))
    ) {
      // O rate limiter protege tentativas inválidas. Logins corretos não devem
      // consumir a cota e bloquear operadores, testes ou renovações de sessão.
      const { success } = await c.env.LOGIN_LIMITER.limit({ key: ip });
      if (!success) return c.json({ error: "muitas tentativas, aguarde" }, 429);
      return c.json({ error: "senha incorreta" }, 401);
    }

    const token = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO sessions (token_hash, expires_at) VALUES (?1, ?2)",
    )
      .bind(
        await hashSessionToken(token),
        Math.floor(Date.now() / 1000) + SESSION_TTL,
      )
      .run();
    setCookie(c, "smartzap_session", token, {
      httpOnly: true,
      // Produção continua Secure. Em desenvolvimento/teste HTTP, omitir Secure
      // evita que WebKit descarte o cookie e entre em loop de login.
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_TTL,
    });
    return c.json({ ok: true });
  })
  .post("/logout", async (c) => {
    const token = getCookie(c, "smartzap_session");
    if (token)
      await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1")
        .bind(await hashSessionToken(token))
        .run();
    deleteCookie(c, "smartzap_session", { path: "/" });
    return c.json({ ok: true });
  })
  .get("/status", async (c) => {
    // requireAuth já passou: se chegou aqui autenticado por cookie ou API key
    return c.json({ authenticated: true });
  });
