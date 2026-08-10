import { settingsDb } from "../db/settings";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API = "https://www.googleapis.com/calendar/v3";
const TOKEN_KEY = "google_calendar_tokens_v1";
const CONFIG_KEY = "google_calendar_booking_v1";
const OAUTH_CONFIG_KEY = "google_calendar_oauth_config_v1";

const scopes = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

export type CalendarConnection = {
  calendarId: string;
  calendarSummary: string | null;
  calendarTimeZone: string | null;
  accountEmail: string | null;
  connectedAt: string;
};

export type BookingConfig = {
  timezone: string;
  slotDurationMinutes: number;
  slotBufferMinutes: number;
  minAdvanceHours: number;
  maxAdvanceDays: number;
  services: Array<{ id: string; title: string; durationMinutes?: number }>;
  workingHours: Array<{ day: number; enabled: boolean; start: string; end: string }>;
};

type Tokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
};

type OAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

const defaultConfig: BookingConfig = {
  timezone: "America/Sao_Paulo",
  slotDurationMinutes: 30,
  slotBufferMinutes: 10,
  minAdvanceHours: 4,
  maxAdvanceDays: 14,
  services: [
    { id: "consulta", title: "Consulta", durationMinutes: 30 },
    { id: "visita", title: "Visita", durationMinutes: 60 },
    { id: "suporte", title: "Suporte", durationMinutes: 30 },
  ],
  workingHours: [
    { day: 1, enabled: true, start: "09:00", end: "18:00" },
    { day: 2, enabled: true, start: "09:00", end: "18:00" },
    { day: 3, enabled: true, start: "09:00", end: "18:00" },
    { day: 4, enabled: true, start: "09:00", end: "18:00" },
    { day: 5, enabled: true, start: "09:00", end: "18:00" },
    { day: 6, enabled: false, start: "09:00", end: "13:00" },
    { day: 0, enabled: false, start: "09:00", end: "13:00" },
  ],
};

function bytesToBase64(bytes: Uint8Array): string {
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    result += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(result);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey(env: Env): Promise<CryptoKey> {
  const secret = env.GOOGLE_CALENDAR_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error("Google Calendar requer a chave de cifragem do Worker");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(env: Env, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(sealed))}`;
}

async function decrypt<T>(env: Env, value: string): Promise<T> {
  const [ivRaw, payloadRaw] = value.split(".");
  if (!ivRaw || !payloadRaw) throw new Error("Tokens Google inválidos");
  const iv = Uint8Array.from(base64ToBytes(ivRaw));
  const payload = Uint8Array.from(base64ToBytes(payloadRaw));
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    payload,
  );
  return JSON.parse(new TextDecoder().decode(clear)) as T;
}

async function storedCredentials(env: Env, db: D1Database): Promise<OAuthCredentials | null> {
  const stored = await settingsDb(db).get(OAUTH_CONFIG_KEY);
  if (!stored) return null;
  try {
    const credentials = await decrypt<OAuthCredentials>(env, stored);
    return credentials.clientId?.trim() && credentials.clientSecret?.trim()
      ? { clientId: credentials.clientId.trim(), clientSecret: credentials.clientSecret.trim() }
      : null;
  } catch {
    return null;
  }
}

async function credentials(env: Env, db: D1Database): Promise<OAuthCredentials | null> {
  const stored = await storedCredentials(env, db);
  if (stored) return stored;
  const clientId = env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function calendarRedirectUri(origin: string): string {
  return `${origin}/api/integrations/google-calendar/callback`;
}

export async function calendarConfiguration(env: Env, db: D1Database): Promise<{ configured: boolean; source: "app" | "worker" | null }> {
  const stored = await storedCredentials(env, db);
  if (stored) return { configured: true, source: "app" };
  const fallback = Boolean(env.GOOGLE_CALENDAR_CLIENT_ID?.trim() && env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim());
  return { configured: fallback, source: fallback ? "worker" : null };
}

export async function saveCalendarOAuthConfiguration(
  env: Env,
  db: D1Database,
  input: OAuthCredentials,
): Promise<void> {
  await settingsDb(db).set(OAUTH_CONFIG_KEY, await encrypt(env, input));
}

export async function removeCalendarOAuthConfiguration(db: D1Database): Promise<void> {
  await settingsDb(db).delete(OAUTH_CONFIG_KEY);
}

function saneTime(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return fallback;
  return text;
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function normalizeBookingConfig(input: unknown): BookingConfig {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const services = Array.isArray(raw.services)
    ? raw.services
        .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
        .map((service) => ({
          id: String(service.id ?? "").trim().replace(/[^a-z0-9_-]/gi, "_").slice(0, 48),
          title: String(service.title ?? "").trim().slice(0, 80),
          durationMinutes: integer(service.durationMinutes, defaultConfig.slotDurationMinutes, 5, 240),
        }))
        .filter((service) => service.id && service.title)
        .slice(0, 20)
    : defaultConfig.services;
  const hoursByDay = new Map<number, Record<string, unknown>>();
  if (Array.isArray(raw.workingHours)) {
    for (const item of raw.workingHours) {
      if (!item || typeof item !== "object") continue;
      const source = item as Record<string, unknown>;
      const day = Number(source.day);
      if (Number.isInteger(day) && day >= 0 && day <= 6) hoursByDay.set(day, source);
    }
  }
  const timezone = typeof raw.timezone === "string" && raw.timezone.trim() ? raw.timezone.trim() : defaultConfig.timezone;
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); } catch { return defaultConfig; }
  return {
    timezone,
    slotDurationMinutes: integer(raw.slotDurationMinutes, defaultConfig.slotDurationMinutes, 5, 240),
    slotBufferMinutes: integer(raw.slotBufferMinutes, defaultConfig.slotBufferMinutes, 0, 120),
    minAdvanceHours: integer(raw.minAdvanceHours, defaultConfig.minAdvanceHours, 0, 168),
    maxAdvanceDays: integer(raw.maxAdvanceDays, defaultConfig.maxAdvanceDays, 1, 90),
    services: services.length ? services : defaultConfig.services,
    workingHours: defaultConfig.workingHours.map((fallback) => {
      const source = hoursByDay.get(fallback.day);
      return source
        ? {
            day: fallback.day,
            enabled: source.enabled === true,
            start: saneTime(source.start, fallback.start),
            end: saneTime(source.end, fallback.end),
          }
        : fallback;
    }),
  };
}

export async function getBookingConfig(db: D1Database): Promise<BookingConfig> {
  const stored = await settingsDb(db).get(CONFIG_KEY);
  if (!stored) return defaultConfig;
  try { return normalizeBookingConfig(JSON.parse(stored)); } catch { return defaultConfig; }
}

export async function saveBookingConfig(db: D1Database, config: unknown): Promise<BookingConfig> {
  const normalized = normalizeBookingConfig(config);
  await settingsDb(db).set(CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}

async function readTokens(env: Env, db: D1Database): Promise<Tokens | null> {
  const stored = await settingsDb(db).get(TOKEN_KEY);
  if (!stored) return null;
  try { return await decrypt<Tokens>(env, stored); } catch { return null; }
}

async function saveTokens(env: Env, db: D1Database, tokens: Tokens): Promise<void> {
  await settingsDb(db).set(TOKEN_KEY, await encrypt(env, tokens));
}

async function googleToken(env: Env, body: URLSearchParams): Promise<Tokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string")
    throw new Error("Google recusou a autorização da agenda");
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresAt: typeof payload.expires_in === "number" ? Date.now() + payload.expires_in * 1000 : null,
  };
}

export async function googleAuthorizationUrl(env: Env, db: D1Database, origin: string, state: string): Promise<string> {
  const oauth = await credentials(env, db);
  if (!oauth) throw new Error("Configure o Google Calendar antes de conectar");
  const query = new URLSearchParams({
    client_id: oauth.clientId,
    redirect_uri: calendarRedirectUri(origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: scopes.join(" "),
    state,
  });
  return `${GOOGLE_AUTH_URL}?${query}`;
}

export async function completeGoogleAuthorization(env: Env, db: D1Database, origin: string, code: string): Promise<void> {
  const oauth = await credentials(env, db);
  if (!oauth) throw new Error("Configure o Google Calendar antes de conectar");
  const tokens = await googleToken(env, new URLSearchParams({
    code,
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    redirect_uri: calendarRedirectUri(origin),
    grant_type: "authorization_code",
  }));
  await saveTokens(env, db, tokens);
}

async function accessToken(env: Env, db: D1Database): Promise<string> {
  const tokens = await readTokens(env, db);
  if (!tokens) throw new Error("Google Calendar não está conectado");
  if (tokens.expiresAt && tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
  const oauth = await credentials(env, db);
  if (!tokens.refreshToken || !oauth) throw new Error("Reconecte o Google Calendar");
  const refreshed = await googleToken(env, new URLSearchParams({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
  }));
  refreshed.refreshToken = tokens.refreshToken;
  await saveTokens(env, db, refreshed);
  return refreshed.accessToken;
}

async function googleApi(env: Env, db: D1Database, path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(`${GOOGLE_API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await accessToken(env, db)}`, "content-type": "application/json", ...init.headers },
    // O endpoint de Flows precisa responder em menos de 10 s.
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(response.status === 401 ? "Reconecte o Google Calendar" : "Google Calendar não respondeu") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function listCalendars(env: Env, db: D1Database): Promise<Array<{ id: string; summary: string; timeZone: string | null; primary: boolean }>> {
  const result = await googleApi(env, db, "/users/me/calendarList");
  return Array.isArray(result.items)
    ? result.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({ id: String(item.id ?? ""), summary: String(item.summary ?? item.id ?? ""), timeZone: typeof item.timeZone === "string" ? item.timeZone : null, primary: item.primary === true }))
      .filter((item) => item.id)
    : [];
}

export async function getConnection(db: D1Database): Promise<CalendarConnection | null> {
  const stored = await settingsDb(db).get("google_calendar_connection_v1");
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as CalendarConnection;
    return value.calendarId ? value : null;
  } catch { return null; }
}

export async function saveConnection(env: Env, db: D1Database, calendarId: string): Promise<CalendarConnection> {
  const available = await listCalendars(env, db);
  const found = available.find((calendar) => calendar.id === calendarId);
  if (!found) throw new Error("Calendário não encontrado na conta conectada");
  const connection: CalendarConnection = {
    calendarId: found.id,
    calendarSummary: found.summary,
    calendarTimeZone: found.timeZone,
    accountEmail: null,
    connectedAt: new Date().toISOString(),
  };
  await settingsDb(db).set("google_calendar_connection_v1", JSON.stringify(connection));
  return connection;
}

export async function disconnectGoogleCalendar(db: D1Database): Promise<void> {
  const settings = settingsDb(db);
  await Promise.all([settings.delete(TOKEN_KEY), settings.delete("google_calendar_connection_v1")]);
}

export async function googleCalendarStatus(env: Env, db: D1Database) {
  const [tokens, connection, config, oauth] = await Promise.all([
    readTokens(env, db),
    getConnection(db),
    getBookingConfig(db),
    calendarConfiguration(env, db),
  ]);
  return { oauthConfigured: oauth.configured, configurationSource: oauth.source, connected: Boolean(tokens), connection, config };
}

function dateParts(date: Date, timezone: string) {
  const values = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(date);
  const get = (type: string) => values.find((part) => part.type === type)?.value ?? "";
  const weekday: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday: weekday[get("weekday")] ?? -1 };
}

function localToUtc(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desired;
  for (let index = 0; index < 2; index++) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(candidate));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const represented = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    candidate += desired - represented;
  }
  return new Date(candidate);
}

function minutes(time: string): number { const [hour, minute] = time.split(":").map(Number); return hour * 60 + minute; }
function timeFromMinutes(value: number): string { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }

export async function availableDates(db: D1Database): Promise<Array<{ id: string; title: string }>> {
  const config = await getBookingConfig(db);
  const now = new Date();
  const output: Array<{ id: string; title: string }> = [];
  for (let offset = 0; offset < config.maxAdvanceDays; offset++) {
    const date = new Date(now.getTime() + offset * 86_400_000);
    const parts = dateParts(date, config.timezone);
    if (!config.workingHours.find((day) => day.day === parts.weekday)?.enabled) continue;
    const title = new Intl.DateTimeFormat("pt-BR", { timeZone: config.timezone, weekday: "short", day: "2-digit", month: "short" }).format(date);
    output.push({ id: parts.date, title });
  }
  return output;
}

export async function availableSlots(env: Env, db: D1Database, date: string): Promise<Array<{ id: string; title: string }>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Data de agendamento inválida");
  const [config, connection] = await Promise.all([getBookingConfig(db), getConnection(db)]);
  if (!connection) throw new Error("Google Calendar não está conectado");
  const day = dateParts(localToUtc(date, "12:00", config.timezone), config.timezone).weekday;
  const hours = config.workingHours.find((item) => item.day === day);
  if (!hours?.enabled) return [];
  const start = localToUtc(date, "00:00", config.timezone);
  const end = localToUtc(date, "23:59", config.timezone);
  const busyResponse = await googleApi(env, db, "/freeBusy", { method: "POST", body: JSON.stringify({ timeMin: start.toISOString(), timeMax: end.toISOString(), timeZone: config.timezone, items: [{ id: connection.calendarId }] }) });
  const calendars = busyResponse.calendars as Record<string, unknown> | undefined;
  const selected = calendars?.[connection.calendarId] as Record<string, unknown> | undefined;
  const busy = Array.isArray(selected?.busy) ? selected!.busy : [];
  const buffer = config.slotBufferMinutes * 60_000;
  const blocked = busy.map((item) => item as Record<string, unknown>).map((item) => ({ start: new Date(String(item.start)).getTime() - buffer, end: new Date(String(item.end)).getTime() + buffer }));
  const earliest = Date.now() + config.minAdvanceHours * 3_600_000;
  const output: Array<{ id: string; title: string }> = [];
  for (let at = minutes(hours.start); at + config.slotDurationMinutes <= minutes(hours.end); at += config.slotDurationMinutes) {
    const slot = localToUtc(date, timeFromMinutes(at), config.timezone);
    const slotEnd = slot.getTime() + config.slotDurationMinutes * 60_000;
    if (slot.getTime() <= earliest || blocked.some((range) => slot.getTime() < range.end && slotEnd > range.start)) continue;
    output.push({ id: slot.toISOString(), title: timeFromMinutes(at) });
  }
  return output;
}

export async function createCalendarEvent(env: Env, db: D1Database, input: { slot: string; service: string; customerName: string; customerPhone?: string; notes?: string; idempotencyKey?: string }) {
  const [config, connection] = await Promise.all([getBookingConfig(db), getConnection(db)]);
  if (!connection) throw new Error("Google Calendar não está conectado");
  const start = new Date(input.slot);
  if (Number.isNaN(start.getTime())) throw new Error("Horário de agendamento inválido");
  const offered = await availableSlots(env, db, dateParts(start, config.timezone).date);
  if (!offered.some((slot) => slot.id === input.slot)) throw new Error("Este horário não está mais disponível");
  const service = config.services.find((item) => item.id === input.service)?.title ?? input.service;
  const eventId = input.idempotencyKey
    ? [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.idempotencyKey)))]
        .map((byte) => byte.toString(16).padStart(2, "0")).join("")
    : undefined;
  const eventBody = {
      ...(eventId ? { id: eventId } : {}),
      summary: `${service} - ${input.customerName}`.slice(0, 250),
      description: [
        `Cliente: ${input.customerName}`,
        input.customerPhone ? `Telefone: ${input.customerPhone}` : null,
        input.notes ? `Observações: ${input.notes}` : null,
        "Agendado via WhatsApp (SmartZap)",
      ].filter(Boolean).join("\n"),
      start: { dateTime: start.toISOString(), timeZone: config.timezone },
      end: { dateTime: new Date(start.getTime() + config.slotDurationMinutes * 60_000).toISOString(), timeZone: config.timezone },
  };
  let result: Record<string, unknown>;
  try {
    result = await googleApi(env, db, `/calendars/${encodeURIComponent(connection.calendarId)}/events`, {
      method: "POST",
      body: JSON.stringify(eventBody),
    });
  } catch (error) {
    if (!(eventId && (error as Error & { status?: number }).status === 409)) throw error;
    result = await googleApi(
      env,
      db,
      `/calendars/${encodeURIComponent(connection.calendarId)}/events/${eventId}`,
    );
  }
  return { id: String(result.id ?? "created"), link: typeof result.htmlLink === "string" ? result.htmlLink : null };
}

/** Remove somente um evento conhecido; usado pelo cleanup autenticado de QA em staging. */
export async function deleteCalendarEvent(
  env: Env,
  db: D1Database,
  eventId: string,
): Promise<void> {
  const connection = await getConnection(db);
  if (!connection) throw new Error("Google Calendar não está conectado");
  try {
    await googleApi(
      env,
      db,
      `/calendars/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    if ((error as Error & { status?: number }).status !== 404) throw error;
  }
}
