import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { readJsonBody } from "./body";
import {
  availableSlots,
  calendarConfiguration,
  calendarRedirectUri,
  completeGoogleAuthorization,
  disconnectGoogleCalendar,
  getBookingConfig,
  googleAuthorizationUrl,
  googleCalendarStatus,
  listCalendars,
  removeCalendarOAuthConfiguration,
  saveBookingConfig,
  saveConnection,
  saveCalendarOAuthConfiguration,
} from "../integrations/google-calendar";

const STATE_COOKIE = "smartzap_google_oauth_state";
const RETURN_COOKIE = "smartzap_google_oauth_return";
const stateSchema = z.string().regex(/^[a-f0-9-]{36}$/i);
const calendarIdSchema = z.object({ calendarId: z.string().trim().min(1).max(500) }).strict();
const oauthConfigurationSchema = z.object({
  clientId: z.string().trim().min(20).max(512),
  clientSecret: z.string().trim().min(8).max(1_024),
}).strict();

function origin(c: { req: { url: string } }) { return new URL(c.req.url).origin; }
function returnPath(value: string | undefined): string { return value?.startsWith("/") && !value.startsWith("//") ? value : "/settings"; }

/** Callback público do OAuth. Não recebe nem expõe segredos no navegador. */
export const googleCalendarPublicRoutes = new Hono<{ Bindings: Env }>()
  .get("/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const expected = getCookie(c, STATE_COOKIE);
    const destination = returnPath(getCookie(c, RETURN_COOKIE));
    deleteCookie(c, STATE_COOKIE, { path: "/" });
    deleteCookie(c, RETURN_COOKIE, { path: "/" });
    if (!code || !state || !expected || !stateSchema.safeParse(state).success || state !== expected)
      return c.json({ error: "Retorno OAuth inválido" }, 400);
    try {
      await completeGoogleAuthorization(c.env, c.env.DB, origin(c), code);
      const calendars = await listCalendars(c.env, c.env.DB);
      const selected = calendars.find((calendar) => calendar.primary) ?? calendars[0];
      if (selected) await saveConnection(c.env, c.env.DB, selected.id);
      return c.redirect(destination);
    } catch (error) {
      console.error("google_calendar_oauth_callback", error instanceof Error ? error.message : "unknown");
      return c.json({ error: "Não foi possível concluir a conexão com Google Calendar" }, 502);
    }
  });

export const googleCalendarRoutes = new Hono<{ Bindings: Env }>()
  .get("/status", async (c) => c.json({ ...(await googleCalendarStatus(c.env, c.env.DB)), redirectUri: calendarRedirectUri(origin(c)) }))
  .put("/oauth-configuration", async (c) => {
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const input = oauthConfigurationSchema.safeParse(raw.value);
    if (!input.success) return c.json({ error: "Client ID ou Client Secret inválido" }, 400);
    await saveCalendarOAuthConfiguration(c.env, c.env.DB, input.data);
    return c.json({ ok: true, configured: true });
  })
  .delete("/oauth-configuration", async (c) => {
    await disconnectGoogleCalendar(c.env.DB);
    await removeCalendarOAuthConfiguration(c.env.DB);
    return c.json({ ok: true });
  })
  .get("/connect", async (c) => {
    if (!(await calendarConfiguration(c.env, c.env.DB)).configured)
      return c.json({ error: "Configure o Google Calendar antes de conectar" }, 409);
    const state = crypto.randomUUID();
    setCookie(c, STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 600 });
    setCookie(c, RETURN_COOKIE, returnPath(c.req.query("returnTo")), { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 600 });
    return c.redirect(await googleAuthorizationUrl(c.env, c.env.DB, origin(c), state));
  })
  .get("/calendars", async (c) => {
    try { return c.json({ items: await listCalendars(c.env, c.env.DB) }); }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : "Não foi possível listar calendários" }, 409); }
  })
  .put("/connection", async (c) => {
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const input = calendarIdSchema.safeParse(raw.value);
    if (!input.success) return c.json({ error: "Calendário inválido" }, 400);
    try { return c.json({ connection: await saveConnection(c.env, c.env.DB, input.data.calendarId) }); }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : "Não foi possível selecionar calendário" }, 409); }
  })
  .delete("/connection", async (c) => { await disconnectGoogleCalendar(c.env.DB); return c.json({ ok: true }); })
  .get("/booking-config", async (c) => c.json({ config: await getBookingConfig(c.env.DB) }))
  .put("/booking-config", async (c) => {
    const raw = await readJsonBody(c, 64_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    return c.json({ config: await saveBookingConfig(c.env.DB, raw.value) });
  })
  .get("/slots", async (c) => {
    try { return c.json({ items: await availableSlots(c.env, c.env.DB, String(c.req.query("date") ?? "")) }); }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : "Não foi possível consultar horários" }, 409); }
  });
