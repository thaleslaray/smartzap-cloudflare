import { describe, expect, it, vi } from "vitest";
import {
  buildMonitorTargets,
  executeMonitor,
  handleMonitorRequest,
  handleScheduled,
  type MonitorEnv,
} from "../src/qa-monitor";

function createEnv() {
  const values = new Map<string, string>();
  const points: AnalyticsEngineDataPoint[] = [];
  const env = {
    STATE: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
    } as unknown as KVNamespace,
    ANALYTICS: {
      writeDataPoint: vi.fn((point: AnalyticsEngineDataPoint) => {
        points.push(point);
      }),
    } as unknown as AnalyticsEngineDataset,
    MONITOR_RELEASE_SHA: "abc123",
    STAGING_URL: "https://smartzap-cf-staging.thales2581.workers.dev",
    PRODUCTION_URL: "https://smartzap-cf.thales2581.workers.dev",
  } satisfies MonitorEnv;
  return { env, values, points };
}

function successfulFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input));
  if (url.pathname === "/api/health") {
    return Promise.resolve(Response.json({ ok: true }));
  }
  return Promise.resolve(
    new Response('<main id="root">SmartZap</main>', {
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  );
}

describe("monitor autônomo do soak", () => {
  it("aceita somente os Workers allowlisted e monta quatro provas públicas", () => {
    const { env } = createEnv();
    expect(buildMonitorTargets(env).map((target) => target.id)).toEqual([
      "staging-health",
      "staging-shell",
      "production-health",
      "production-shell",
    ]);
    expect(() =>
      buildMonitorTargets({
        STAGING_URL: "https://example.com",
        PRODUCTION_URL: env.PRODUCTION_URL,
      }),
    ).toThrow("fora da allowlist");
  });

  it("registra health e shell de staging/produção sem mutação", async () => {
    const { env, values, points } = createEnv();
    const fetcher = vi.fn(function (
      this: unknown,
      input: RequestInfo | URL,
    ): Promise<Response> {
      expect(this).toBeUndefined();
      return successfulFetch(input);
    });
    const report = await executeMonitor(env, Date.UTC(2026, 6, 29, 23, 45), {
      fetcher,
      retryDelayMs: 0,
    });

    expect(report.status).toBe("passed");
    expect(report.checks).toHaveLength(4);
    expect(report.checks.every((check) => check.attempts === 1)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(values.get("latest")).toContain('"status":"passed"');
    expect(values.get(`run:${Date.UTC(2026, 6, 29, 23, 45)}`)).toBeTruthy();
    expect(points).toHaveLength(4);
  });

  it("repete uma falha uma vez, persiste o diagnóstico e reprova o cron", async () => {
    const { env, values } = createEnv();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname.includes("-staging.") && url.pathname === "/api/health") {
        return new Response("indisponível", { status: 503 });
      }
      return successfulFetch(input);
    });
    const noRetry = vi.fn();
    const scheduledTime = Date.UTC(2026, 6, 29, 23, 50);

    await expect(
      handleScheduled(
        { scheduledTime, noRetry },
        env,
        { fetcher, retryDelayMs: 0 },
      ),
    ).rejects.toThrow("um ou mais alvos");

    const report = JSON.parse(values.get("latest") || "{}");
    expect(report.status).toBe("failed");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: "staging-health",
          status: "failed",
          httpStatus: 503,
          attempts: 2,
        }),
      ]),
    );
    expect(noRetry).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it("deduplica a mesma entrega do Cron", async () => {
    const { env, values } = createEnv();
    const scheduledTime = Date.UTC(2026, 6, 30, 0, 0);
    values.set(`run:${scheduledTime}`, '{"status":"passed"}');
    const noRetry = vi.fn();
    const fetcher = vi.fn(successfulFetch);

    await expect(
      handleScheduled(
        { scheduledTime, noRetry },
        env,
        { fetcher, retryDelayMs: 0 },
      ),
    ).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(noRetry).toHaveBeenCalledOnce();
  });

  it("expõe somente health próprio e o último relatório sanitizado", async () => {
    const { env, values } = createEnv();
    values.set(
      "latest",
      JSON.stringify({
        schemaVersion: 1,
        status: "passed",
        checks: [{ targetId: "production-health", status: "passed" }],
      }),
    );

    const health = await handleMonitorRequest(
      new Request("https://monitor.example/health"),
      env,
    );
    expect(await health.json()).toEqual({ ok: true, releaseSha: "abc123" });
    expect(health.headers.get("cache-control")).toBe("no-store");

    const status = await handleMonitorRequest(
      new Request("https://monitor.example/status"),
      env,
    );
    const statusBody = (await status.json()) as { status: string };
    expect(statusBody.status).toBe("passed");
    expect(status.headers.get("cache-control")).toBe("no-store");

    const method = await handleMonitorRequest(
      new Request("https://monitor.example/status", { method: "POST" }),
      env,
    );
    expect(method.status).toBe(405);
  });
});
