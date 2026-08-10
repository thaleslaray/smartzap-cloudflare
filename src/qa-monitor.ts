const REPORT_TTL_SECONDS = 21 * 24 * 60 * 60;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_ATTEMPTS = 2;
const ALLOWED_TARGET_HOSTS = new Set([
  "smartzap-staging.example.workers.dev",
  "smartzap.example.workers.dev",
]);

export type MonitorTargetKind = "health" | "app-shell";

export interface MonitorTarget {
  id: string;
  kind: MonitorTargetKind;
  url: string;
}

export interface MonitorCheck {
  targetId: string;
  kind: MonitorTargetKind;
  status: "passed" | "failed";
  httpStatus: number | null;
  latencyMs: number;
  attempts: number;
  error?: string;
}

export interface MonitorReport {
  schemaVersion: 1;
  releaseSha: string;
  scheduledTime: string;
  observedAt: string;
  status: "passed" | "failed";
  checks: MonitorCheck[];
}

export interface MonitorEnv {
  STATE: KVNamespace;
  ANALYTICS: AnalyticsEngineDataset;
  MONITOR_RELEASE_SHA: string;
  STAGING_URL: string;
  PRODUCTION_URL: string;
}

interface MonitorOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  attempts?: number;
  retryDelayMs?: number;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function sanitizeError(error: unknown): string {
  const detail = error instanceof Error ? error.message : "falha desconhecida";
  return detail.replace(/\s+/g, " ").slice(0, 240);
}

function normalizedBaseUrl(raw: string): string {
  const parsed = new URL(raw);
  if (
    parsed.protocol !== "https:" ||
    !ALLOWED_TARGET_HOSTS.has(parsed.hostname) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("alvo do monitor fora da allowlist");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

export function buildMonitorTargets(
  env: Pick<MonitorEnv, "STAGING_URL" | "PRODUCTION_URL">,
): MonitorTarget[] {
  const staging = normalizedBaseUrl(env.STAGING_URL);
  const production = normalizedBaseUrl(env.PRODUCTION_URL);
  return [
    {
      id: "staging-health",
      kind: "health",
      url: `${staging}/api/health`,
    },
    {
      id: "staging-shell",
      kind: "app-shell",
      url: `${staging}/`,
    },
    {
      id: "production-health",
      kind: "health",
      url: `${production}/api/health`,
    },
    {
      id: "production-shell",
      kind: "app-shell",
      url: `${production}/`,
    },
  ];
}

async function validateResponse(
  target: MonitorTarget,
  response: Response,
): Promise<void> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (target.kind === "health") {
    const body = await response.json().catch(() => null);
    if (
      !body ||
      typeof body !== "object" ||
      !("ok" in body) ||
      body.ok !== true
    ) {
      throw new Error("contrato de health inválido");
    }
    return;
  }
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  if (!contentType.includes("text/html") || !body.includes('id="root"')) {
    throw new Error("shell HTML inválido");
  }
}

async function checkTarget(
  target: MonitorTarget,
  scheduledTime: number,
  options: Required<MonitorOptions>,
): Promise<MonitorCheck> {
  let lastError = "falha desconhecida";
  let lastStatus: number | null = null;
  let totalLatency = 0;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const url = new URL(target.url);
      url.searchParams.set("qa_monitor", String(scheduledTime));
      url.searchParams.set("attempt", String(attempt));
      const response = await options.fetcher(url, {
        method: "GET",
        headers: { "cache-control": "no-cache" },
        signal: controller.signal,
      });
      lastStatus = response.status;
      await validateResponse(target, response);
      totalLatency += performance.now() - startedAt;
      return {
        targetId: target.id,
        kind: target.kind,
        status: "passed",
        httpStatus: response.status,
        latencyMs: Math.round(totalLatency),
        attempts: attempt,
      };
    } catch (error) {
      totalLatency += performance.now() - startedAt;
      lastError =
        error instanceof DOMException && error.name === "AbortError"
          ? `timeout após ${options.timeoutMs} ms`
          : sanitizeError(error);
      if (attempt < options.attempts && options.retryDelayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, options.retryDelayMs),
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    targetId: target.id,
    kind: target.kind,
    status: "failed",
    httpStatus: lastStatus,
    latencyMs: Math.round(totalLatency),
    attempts: options.attempts,
    error: lastError,
  };
}

export async function executeMonitor(
  env: MonitorEnv,
  scheduledTime: number,
  options: MonitorOptions = {},
): Promise<MonitorReport> {
  const requestedFetcher = options.fetcher;
  const resolvedOptions: Required<MonitorOptions> = {
    // O fetch global do workerd exige o receptor original; encapsular em uma
    // arrow evita "Illegal invocation" ao repassá-lo para o executor.
    fetcher: (input, init) =>
      requestedFetcher ? requestedFetcher(input, init) : fetch(input, init),
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    attempts: options.attempts || DEFAULT_ATTEMPTS,
    retryDelayMs: options.retryDelayMs ?? 250,
  };
  const checks = await Promise.all(
    buildMonitorTargets(env).map((target) =>
      checkTarget(target, scheduledTime, resolvedOptions),
    ),
  );
  const report: MonitorReport = {
    schemaVersion: 1,
    releaseSha: env.MONITOR_RELEASE_SHA || "unknown",
    scheduledTime: new Date(scheduledTime).toISOString(),
    observedAt: new Date().toISOString(),
    status: checks.every((check) => check.status === "passed")
      ? "passed"
      : "failed",
    checks,
  };
  const serialized = JSON.stringify(report);
  const runKey = `run:${scheduledTime}`;
  await Promise.all([
    env.STATE.put(runKey, serialized, {
      expirationTtl: REPORT_TTL_SECONDS,
    }),
    env.STATE.put("latest", serialized),
  ]);
  for (const check of checks) {
    env.ANALYTICS.writeDataPoint({
      blobs: [
        check.targetId,
        check.kind,
        check.status,
        check.error || "",
        report.releaseSha,
        report.scheduledTime,
      ],
      doubles: [
        check.status === "passed" ? 1 : 0,
        check.latencyMs,
        check.httpStatus || 0,
        check.attempts,
      ],
      indexes: [check.targetId],
    });
  }
  console.log(
    JSON.stringify({
      level: report.status === "passed" ? "info" : "error",
      msg: "smartzap soak monitor",
      scheduledTime: report.scheduledTime,
      status: report.status,
      checks: checks.map(({ targetId, status, httpStatus, latencyMs }) => ({
        targetId,
        status,
        httpStatus,
        latencyMs,
      })),
    }),
  );
  return report;
}

export async function handleScheduled(
  controller: Pick<ScheduledController, "scheduledTime" | "noRetry">,
  env: MonitorEnv,
  options: MonitorOptions = {},
): Promise<MonitorReport | null> {
  const runKey = `run:${controller.scheduledTime}`;
  if (await env.STATE.get(runKey)) {
    controller.noRetry();
    return null;
  }
  const report = await executeMonitor(env, controller.scheduledTime, options);
  if (report.status === "failed") {
    controller.noRetry();
    throw new Error("um ou mais alvos do SmartZap falharam");
  }
  return report;
}

export async function handleMonitorRequest(
  request: Request,
  env: Pick<MonitorEnv, "STATE" | "MONITOR_RELEASE_SHA">,
): Promise<Response> {
  if (request.method !== "GET") return json({ error: "método não permitido" }, 405);
  const pathname = new URL(request.url).pathname;
  if (pathname === "/health") {
    return json({ ok: true, releaseSha: env.MONITOR_RELEASE_SHA || "unknown" });
  }
  if (pathname === "/status") {
    const latest = await env.STATE.get("latest");
    if (!latest) return json({ error: "monitor ainda sem execução" }, 503);
    return new Response(latest, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  }
  return json({ error: "não encontrado" }, 404);
}

export default {
  fetch(request, env) {
    return handleMonitorRequest(request, env);
  },
  async scheduled(controller, env) {
    await handleScheduled(controller, env);
  },
} satisfies ExportedHandler<MonitorEnv>;
