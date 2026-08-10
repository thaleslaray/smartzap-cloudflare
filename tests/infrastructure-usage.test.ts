import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const AUTH = { "x-api-key": "dev-api-key" };

describe("uso real da infraestrutura", () => {
  it("nunca devolve zero inventado para analytics não configurado", async () => {
    const response = await SELF.fetch("https://x.com/api/settings/infrastructure-usage", {
      headers: AUTH,
    });
    expect(response.status).toBe(200);
    const body = await response.json<{
      workers: { available: boolean; requests: number | null };
      queues: { backlog: number; backlogBytes: number; items: Array<{ name: string }> };
      database: { storageBytes: number | null; analyticsAvailable: boolean; rowsRead: number | null };
      whatsapp: { sentThisMonth: number };
      analytics: { configured: boolean; available: boolean; reason: string | null };
    }>();

    expect(body.analytics).toEqual({
      configured: false,
      available: false,
      reason: "not_configured",
    });
    expect(body.workers).toEqual({ available: false, requests: null });
    expect(body.database.analyticsAvailable).toBe(false);
    expect(body.database.rowsRead).toBeNull();
    expect(body.database.storageBytes).toBeNull();
    expect(body.queues.items.map((item) => item.name)).toEqual([
      "meta-webhooks",
      "inbox-automation",
      "meta-conversions",
      "meta-conversions-dlq",
    ]);
    expect(body.queues.backlog).toBeGreaterThanOrEqual(0);
    expect(body.queues.backlogBytes).toBeGreaterThanOrEqual(0);
    expect(body.whatsapp.sentThisMonth).toBeGreaterThanOrEqual(0);
  });
});
