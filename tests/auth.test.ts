import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "../src/api/auth";

// Bindings de teste vêm do vitest.config.ts: MASTER_PASSWORD=dev, SMARTZAP_API_KEY=dev-api-key,
// TURNSTILE_ENABLED=false: bypass explícito, inclusive quando produção optar por não usá-lo.
describe("auth", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("config pública informa se o Turnstile é obrigatório", async () => {
    const res = await SELF.fetch("https://x.com/api/auth/config");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      turnstileSiteKey: null,
      turnstileRequired: false,
    });
  });
  it("flag desligada dispensa Turnstile explicitamente", async () => {
    expect(
      await verifyTurnstile(
        {
          ...env,
          ENVIRONMENT: "production",
          TURNSTILE_ENABLED: "false",
          TURNSTILE_SECRET: "",
        },
        undefined,
        "127.0.0.1",
      ),
    ).toBe(true);
  });
  it("flag ligada sem secret falha fechada", async () => {
    expect(
      await verifyTurnstile(
        {
          ...env,
          ENVIRONMENT: "production",
          TURNSTILE_ENABLED: "true",
          TURNSTILE_SECRET: "",
        },
        undefined,
        "127.0.0.1",
      ),
    ).toBe(false);
  });
  it("falha de rede no Siteverify também falha fechada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("rede indisponível");
      }),
    );
    expect(
      await verifyTurnstile(
        {
          ...env,
          ENVIRONMENT: "production",
          TURNSTILE_ENABLED: "true",
          TURNSTILE_SECRET: "secret",
        },
        "token",
        "127.0.0.1",
      ),
    ).toBe(false);
  });
  it("Siteverify valida action e hostname do login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              action: "login",
              hostname: "app.example",
            }),
            { status: 200 },
          ),
      ),
    );
    const configured = {
      ...env,
      ENVIRONMENT: "production",
      TURNSTILE_ENABLED: "true",
      TURNSTILE_SECRET: "secret",
    };
    expect(
      await verifyTurnstile(configured, "token", "127.0.0.1", "app.example"),
    ).toBe(true);
    expect(
      await verifyTurnstile(configured, "token", "127.0.0.1", "evil.example"),
    ).toBe(false);
  });
  it("rejeita payload de login excessivo na fronteira", async () => {
    const res = await SELF.fetch("https://x.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "x".repeat(10_000) }),
    });
    expect(res.status).toBe(400);
  });
  it("interrompe body de login acima do teto antes de materializar o JSON", async () => {
    const res = await SELF.fetch("https://x.com/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "192.0.2.44",
      },
      body: JSON.stringify({ password: "x".repeat(20_000) }),
    });
    expect(res.status).toBe(413);
  });
  it("rejeita campos inesperados no login", async () => {
    const res = await SELF.fetch("https://x.com/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "192.0.2.45",
      },
      body: JSON.stringify({ password: "dev", admin: true }),
    });
    expect(res.status).toBe(400);
  });
  it("rota protegida sem credencial → 401", async () => {
    const res = await SELF.fetch("https://x.com/api/contacts");
    expect(res.status).toBe(401);
  });
  it("cookie presente mas sessão inexistente no D1 → 401", async () => {
    const res = await SELF.fetch("https://x.com/api/contacts", {
      headers: { cookie: "smartzap_session=token-que-nao-existe-no-kv" },
    });
    expect(res.status).toBe(401);
  });
  it("login com senha errada → 401", async () => {
    const res = await SELF.fetch("https://x.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "errada" }),
    });
    expect(res.status).toBe(401);
  });
  it("login correto seta cookie e o cookie autentica", async () => {
    const login = await SELF.fetch("https://x.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "dev" }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!;
    expect(cookie).toContain("smartzap_session=");
    expect(cookie).toContain("Secure");
    const status = await SELF.fetch("https://x.com/api/auth/status", {
      headers: { cookie },
    });
    expect(await status.json()).toEqual({ authenticated: true });
    const logout = await SELF.fetch("https://x.com/api/auth/logout", {
      method: "POST",
      headers: { cookie },
    });
    expect(logout.status).toBe(200);
    const revoked = await SELF.fetch("https://x.com/api/auth/status", {
      headers: { cookie },
    });
    expect(revoked.status).toBe(401);
  });
  it("permite sessão local HTTP sem enfraquecer o cookie HTTPS de produção", async () => {
    const login = await SELF.fetch("http://x.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "dev" }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!;
    expect(cookie).toContain("smartzap_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
  });
  it("logins corretos sucessivos não consomem a cota de tentativas inválidas", async () => {
    for (let index = 0; index < 8; index += 1) {
      const login = await SELF.fetch("https://x.com/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "192.0.2.80",
        },
        body: JSON.stringify({ password: "dev" }),
      });
      expect(login.status).toBe(200);
    }
  });
  it("API key válida autentica; inválida não", async () => {
    const ok = await SELF.fetch("https://x.com/api/auth/status", {
      headers: { "x-api-key": "dev-api-key" },
    });
    expect(
      ((await ok.json()) as { authenticated: boolean }).authenticated,
    ).toBe(true);
    const bad = await SELF.fetch("https://x.com/api/contacts", {
      headers: { "x-api-key": "nope" },
    });
    expect(bad.status).toBe(401);
  });
  it("bloqueia mutações cross-site mesmo com credencial válida", async () => {
    for (const origin of ["https://atacante.example", "http://x.com"]) {
      const res = await SELF.fetch("https://x.com/api/contacts/bulk-status", {
        method: "POST",
        headers: {
          "x-api-key": "dev-api-key",
          "content-type": "application/json",
          origin,
        },
        body: JSON.stringify({ ids: ["qualquer"], status: "opt_out" }),
      });
      expect(res.status).toBe(403);
    }
  });
});
