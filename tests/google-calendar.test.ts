import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/api/router";
import { settingsDb } from "../src/db/settings";
import {
  completeGoogleAuthorization,
  createCalendarEvent,
  getConnection,
  saveCalendarOAuthConfiguration,
} from "../src/integrations/google-calendar";

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

  afterEach(() => vi.unstubAllGlobals());

  it("salva as credenciais cifradas pelo app e libera o consentimento sem segredo de deploy", async () => {
    const app = createApp();
    const bindings = {
      ...env,
      ENVIRONMENT: "staging",
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
    expect(location).toContain(encodeURIComponent("https://www.googleapis.com/auth/calendar.calendarlist.readonly"));
  });

  it("lista e escolhe agenda, consulta slots, cria evento e desconecta", async () => {
    const app = createApp();
    const bindings = {
      ...env,
      ENVIRONMENT: "staging",
      GOOGLE_CALENDAR_ENCRYPTION_KEY: "test-google-calendar-encryption-key",
      GOOGLE_CALENDAR_CLIENT_ID: "",
      GOOGLE_CALENDAR_CLIENT_SECRET: "",
    } as unknown as Env;
    await saveCalendarOAuthConfiguration(bindings, env.DB, {
      clientId: "123456789012-abcdefghijklmnopqrstuv.apps.googleusercontent.com",
      clientSecret: "GOCSPX-not-a-real-secret",
    });

    const googleFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token")
        return Response.json({ access_token: "access-token", refresh_token: "refresh-token", expires_in: 3600 });
      if (url.endsWith("/users/me/calendarList"))
        return Response.json({ items: [
          { id: "primary@example.com", summary: "Principal", primary: true, timeZone: "America/Sao_Paulo" },
          { id: "work@example.com", summary: "Trabalho", timeZone: "America/Sao_Paulo" },
        ] });
      if (url.endsWith("/freeBusy"))
        return Response.json({ calendars: { "work@example.com": { busy: [] } } });
      if (url.endsWith("/calendars/work%40example.com/events") && init?.method === "POST")
        return Response.json({ id: "a".repeat(64), htmlLink: "https://calendar.google.com/event?eid=test" });
      if (url.endsWith(`/calendars/work%40example.com/events/${"a".repeat(64)}`) && init?.method === "DELETE")
        return new Response(null, { status: 204 });
      throw new Error(`Chamada Google inesperada: ${url}`);
    });
    vi.stubGlobal("fetch", googleFetch);

    await completeGoogleAuthorization(bindings, env.DB, "https://smartzap.example", "authorization-code");
    const calendars = await app.fetch(new Request("https://smartzap.example/api/google-calendar/calendars", { headers: auth }), bindings);
    expect(await calendars.json()).toMatchObject({ items: [
      { id: "primary@example.com", primary: true },
      { id: "work@example.com", summary: "Trabalho" },
    ] });

    const selected = await app.fetch(new Request("https://smartzap.example/api/google-calendar/connection", {
      method: "PUT", headers: auth, body: JSON.stringify({ calendarId: "work@example.com" }),
    }), bindings);
    expect(await selected.json()).toMatchObject({ connection: { calendarId: "work@example.com", calendarSummary: "Trabalho" } });

    const configured = await app.fetch(new Request("https://smartzap.example/api/google-calendar/booking-config", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({
        timezone: "America/Sao_Paulo",
        slotDurationMinutes: 30,
        slotBufferMinutes: 0,
        minAdvanceHours: 0,
        maxAdvanceDays: 14,
        services: [{ id: "consulta", title: "Consulta", durationMinutes: 30 }],
        workingHours: Array.from({ length: 7 }, (_, day) => ({ day, enabled: true, start: "09:00", end: "18:00" })),
      }),
    }), bindings);
    expect(configured.status).toBe(200);

    const future = new Date(Date.now() + 3 * 86_400_000);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(future);
    const slotsResponse = await app.fetch(new Request(`https://smartzap.example/api/google-calendar/slots?date=${date}`, { headers: auth }), bindings);
    const slots = await slotsResponse.json() as { items: Array<{ id: string; title: string }> };
    expect(slots.items.length).toBeGreaterThan(0);

    const event = await createCalendarEvent(bindings, env.DB, {
      slot: slots.items[0].id,
      service: "consulta",
      customerName: "Cliente de teste",
      idempotencyKey: "calendar-lifecycle-test",
    });
    expect(event).toEqual({ id: "a".repeat(64), link: "https://calendar.google.com/event?eid=test" });

    const cleanup = await app.fetch(new Request(
      `https://smartzap.example/api/google-calendar/qa-events/${"a".repeat(64)}`,
      { method: "DELETE", headers: auth },
    ), bindings);
    expect(cleanup.status).toBe(200);
    expect(await cleanup.json()).toEqual({ ok: true, deleted: true });

    const disconnected = await app.fetch(new Request("https://smartzap.example/api/google-calendar/connection", {
      method: "DELETE", headers: auth,
    }), bindings);
    expect(disconnected.status).toBe(200);
    expect(await getConnection(env.DB)).toBeNull();
  });
});
