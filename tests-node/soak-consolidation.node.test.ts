import { describe, expect, it } from "vitest";
// @ts-expect-error módulo interno .mjs executado pelo Node de QA
import * as soak from "../scripts/lib/soak-consolidation.mjs";

const release = { sourceCommit: "a".repeat(40), productionVersion: "11111111-2222-4333-8444-555555555555", productionUrl: "https://example.test" };
const startAt = "2026-07-30T02:45:00.000Z";
const endAt = "2026-08-13T02:45:00.000Z";
const operations = {
  queues: { staging: { status: "passed", backlog: 0 }, production: { status: "passed", backlog: 0 } },
  integrity: { eventKeyDuplicates: 0, sendRequestDuplicates: 0, stalledCampaigns: 0, stalledSends: 0 },
};

function report(time: string, status = "passed") {
  return { schemaVersion: 1, scheduledTime: time, status, checks: [
    { targetId: "production-health", status, latencyMs: 50, attempts: 1 },
  ] };
}

describe("consolidação do soak", () => {
  it("aprova a janela integral sem lacunas, filas ou duplicações", () => {
    const reports = [];
    for (let time = Date.parse(startAt); time <= Date.parse(endAt); time += 5 * 60 * 1000)
      reports.push(report(new Date(time).toISOString()));
    const result = soak.consolidateSoak({ reports, release, startAt, endAt, observedAt: endAt, operations });
    expect(result.status).toBe("passed");
    expect(result.metrics.cycles).toBe(4033);
    expect(Object.values(result.checks).every(Boolean)).toBe(true);
  });

  it("não antecipa o término temporal", () => {
    const result = soak.consolidateSoak({ reports: [report(startAt)], release, startAt, endAt, observedAt: "2026-08-06T00:00:00.000Z", operations });
    expect(result.status).toBe("failed");
    expect(result.checks.fourteenDaysElapsed).toBe(false);
  });

  it("reprova falha e lacuna sem explicação", () => {
    const reports = [report(startAt, "failed"), report("2026-07-30T03:15:00.000Z")];
    const result = soak.consolidateSoak({ reports, release, startAt, endAt, observedAt: endAt, operations });
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("1 falha(s) sem explicação aceita");
    expect(result.issues).toContain("1 lacuna(s) sem explicação aceita");
  });

  it("aceita apenas incidente e lacuna documentados", () => {
    const failedAt = startAt;
    const nextAt = "2026-07-30T03:15:00.000Z";
    const result = soak.consolidateSoak({
      reports: [report(failedAt, "failed"), report(nextAt)], release, startAt, endAt,
      observedAt: "2026-08-06T00:00:00.000Z", operations,
      exceptions: {
        acceptedFailures: [{ scheduledTime: failedAt, fixedAt: "2026-07-30T03:00:00.000Z", reason: "Defeito inicial corrigido e retestado.", evidence: "AUD-1" }],
        explainedGaps: [{ from: failedAt, to: nextAt, reason: "Janela de implantação documentada.", evidence: "AUD-2" }],
      },
    });
    expect(result.metrics.explainedFailures).toBe(1);
    expect(result.metrics.unexplainedGaps).toBe(0);
  });

  it("reprova backlog, duplicação ou item travado", () => {
    const badOperations = { queues: { ...operations.queues, production: { status: "passed", backlog: 2 } }, integrity: { ...operations.integrity, stalledSends: 1 } };
    const result = soak.consolidateSoak({ reports: [report(startAt)], release, startAt, endAt, observedAt: endAt, operations: badOperations });
    expect(result.status).toBe("failed");
    expect(result.checks.queuesReviewed).toBe(false);
    expect(result.checks.duplicatesReviewed).toBe(false);
  });
});
