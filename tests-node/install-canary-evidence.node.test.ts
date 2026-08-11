import { describe, expect, it } from "vitest";
import {
  assertInstallCanarySnapshot,
  assertManifestIntegrity,
  assessInstallCanarySnapshot,
  buildInstallCanaryManifest,
  fingerprintManifest,
} from "../scripts/lib/install-canary-evidence.mjs";
import type { CanarySnapshot } from "../scripts/lib/install-canary-evidence.mjs";

const release = {
  repository: "https://github.com/thaleslaray/smartzap-cloudflare",
  commit: "e1e3ab843fe13bdf36eff4ce91b3f7b200435b44",
  tag: "v1.0.0-rc.5",
  snapshotSha256: "b97532c4d6441245b09f27f411ff647c090e400cc70ef510f704fae6ba6a4333",
};

function manifest() {
  return buildInstallCanaryManifest({ prefix: "smartzap-b878c2e2", release, generatedAt: "2026-08-10T06:00:00.000Z" });
}

function emptySnapshot(): CanarySnapshot {
  return { workers: [], d1: [], r2: [], queues: [], workflows: [], durableObjects: [] };
}

function provisionedSnapshot() {
  const current = manifest();
  return {
    workers: [{ id: current.resources.worker }],
    d1: [{ name: current.resources.d1 }],
    r2: [{ name: current.resources.r2 }],
    queues: current.resources.queues.map((queue_name) => ({ queue_name })),
    workflows: current.resources.workflows.map((name) => ({ name })),
    durableObjects: current.resources.durableObjects.map((name) => ({ name })),
    cronTriggers: [{ cron: current.runtime.cron }],
    runtime: {
      workflowBindings: current.runtime.workflowBindings,
      rateLimitNamespace: current.runtime.rateLimitNamespace,
      aiGatewayId: current.runtime.aiGatewayId,
    },
    d1State: {
      installVersions: [current.runtime.baselineTarget],
    },
  };
}

describe("evidência do canário de instalação", () => {
  it("deriva todos os recursos isolados da RC5 sem incluir secrets", () => {
    const current = manifest();
    expect(current.resources.worker).toBe("smartzap-b878c2e2");
    expect(current.release.deploySource).toBe("https://github.com/thaleslaray/smartzap-cloudflare/tree/v1.0.0-rc.5");
    expect(current.resources.queues).toHaveLength(6);
    expect(current.resources.workflows).toEqual([
      "smartzap-b878c2e2-campaign-send",
      "smartzap-b878c2e2-setup-health",
    ]);
    expect(current.resources.durableObjects).toEqual([
      "smartzap-b878c2e2_RealtimeHub",
      "smartzap-b878c2e2_PhoneThrottle",
    ]);
    expect(current.expectedSecrets).toEqual(["MASTER_PASSWORD", "SMARTZAP_VAULT_KEY"]);
    expect(current).not.toHaveProperty("secrets");
    expect(current).not.toHaveProperty("secretValues");
  });

  it("reprova manifesto adulterado", () => {
    const current = manifest();
    current.resources.r2 = "smartzap-producao-media";
    expect(() => assertManifestIntegrity(current)).toThrow(/alterado depois de gerado/i);
    expect(fingerprintManifest(current)).not.toBe(current.fingerprintSha256);
  });

  it("aprova baseline quando nenhum nome do canário existe", () => {
    const report = assertInstallCanarySnapshot({ phase: "baseline", snapshot: emptySnapshot(), manifest: manifest() });
    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(13);
  });

  it("reprova baseline ao detectar colisão", () => {
    const snapshot = emptySnapshot();
    snapshot.r2 = [{ name: manifest().resources.r2 }];
    const report = assessInstallCanarySnapshot({ phase: "baseline", snapshot, manifest: manifest() });
    expect(report.passed).toBe(false);
    expect(report.failures).toContain(`${manifest().resources.r2} ainda existe`);
  });

  it("aprova infraestrutura somente com recursos e bindings exatos", () => {
    const report = assertInstallCanarySnapshot({ phase: "provisioned", snapshot: provisionedSnapshot(), manifest: manifest() });
    expect(report.passed).toBe(true);
    expect(report.checks.length).toBeGreaterThan(18);
  });

  it("reprova infraestrutura com Workflow ou namespace compartilhado", () => {
    const snapshot = provisionedSnapshot();
    snapshot.runtime.workflowBindings.CAMPAIGN_WF = "campaign-send";
    snapshot.runtime.rateLimitNamespace = "1001";
    const report = assessInstallCanarySnapshot({ phase: "provisioned", snapshot, manifest: manifest() });
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/campaign-send/);
    expect(report.failures.join(" ")).toMatch(/1001/);
  });

  it("exige sent, delivered, read, filas e DLQs verdes para fechar setup", () => {
    const snapshot = {
      ...provisionedSnapshot(),
      app: { reachable: true, setupCompleted: true, messageStates: { sent: true, delivered: true, read: true } },
      queuesState: { backlogTotal: 0, dlqTotal: 0 },
    };
    expect(assertInstallCanarySnapshot({ phase: "setup-complete", snapshot, manifest: manifest() }).passed).toBe(true);
    snapshot.app.messageStates.read = false;
    expect(() => assertInstallCanarySnapshot({ phase: "setup-complete", snapshot, manifest: manifest() })).toThrow(/Mensagem lida/i);
  });

  it("aprova cleanup somente quando todos os recursos rastreados sumiram", () => {
    expect(assertInstallCanarySnapshot({ phase: "cleanup", snapshot: emptySnapshot(), manifest: manifest() }).passed).toBe(true);
    const residual = emptySnapshot();
    residual.durableObjects = [{ name: manifest().resources.durableObjects[0] }];
    expect(() => assertInstallCanarySnapshot({ phase: "cleanup", snapshot: residual, manifest: manifest() })).toThrow(/ainda existe/i);
  });
});
