import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/api/router";
import { settingsDb } from "../src/db/settings";

const auth = { "content-type": "application/json", "x-api-key": "dev-api-key" };

describe("configuração opcional do Google Calendar", () => {
  beforeEach(async () => {
    const settings = settingsDb(env.DB);
    await Promise.all([
      settings.delete("google_calendar_oauth_config_v1"),
      settings.delete("google_calendar_tokens_v1"),
      settings.delete("google_calendar_connection_v1"),
    ]);
  });

  it("salva as credenciais cifradas pelo app e libera o consentimento sem segredo de deploy", async () => {
    const app = createApp();
    const bindings = {
      ...env,
      GOOGLE_CALENDAR_ENCRYPTION_KEY: "test-google-calendar-encryption-key",
      GOOGLE_CALENDAR_CLIENT_ID: "",
      GOOGLE_CALENDAR_CLIENT_SECRET: "",
    } as unknown as Env;

    const before = await app.fetch(new Request("https://smartzap.example/api/google-calendar/status", { headers: auth }), bindings);
    expect(await before.json()).toMatchObject({ oauthConfigured: false, configurationSource: null });

    const clientId = "123456789012-abcdefghijklmnopqrstuv.apps.googleusercontent.com";
    const clientSecret = "GOCSPX-not-a-real-secret";
    const saved = await app.fetch(new Request("https://smartzap.example/api/google-calendar/oauth-configuration", {
      method: "PUT", headers: auth, body: JSON.stringify({ clientId, clientSecret }),
    }), bindings);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ ok: true, configured: true });

    const stored = await settingsDb(env.DB).get("google_calendar_oauth_config_v1");
    expect(stored).toBeTruthy();
    expect(stored).not.toContain(clientId);
    expect(stored).not.toContain(clientSecret);

    const status = await app.fetch(new Request("https://smartzap.example/api/google-calendar/status", { headers: auth }), bindings);
    expect(await status.json()).toMatchObject({
      oauthConfigured: true,
      configurationSource: "app",
      connected: false,
      redirectUri: "https://smartzap.example/api/integrations/google-calendar/callback",
    });

    const connect = await app.fetch(new Request("https://smartzap.example/api/google-calendar/connect?returnTo=/settings", { headers: auth }), bindings);
    expect(connect.status).toBe(302);
    const location = connect.headers.get("location") ?? "";
    expect(location).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(location).toContain(encodeURIComponent(clientId));
    expect(location).not.toContain(clientSecret);
    expect(location).toContain(encodeURIComponent("https://www.googleapis.com/auth/calendar.freebusy"));
    expect(location).toContain(encodeURIComponent("https://www.googleapis.com/auth/calendar.events"));
  });
});
