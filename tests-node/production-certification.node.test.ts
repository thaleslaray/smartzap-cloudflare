import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error módulo interno JavaScript executado pelo Node do gate
import * as certification from "../scripts/lib/production-certification.mjs";

const {
  ATTESTATION_KIND,
  CERTIFICATION_EVIDENCE_REQUIREMENTS,
  buildCertificationManifest,
  evaluateProductionCertification,
  hashFile,
} = certification;

const SOURCE_COMMIT = "d4700fe06e58f3fe73f84e11c68336f6f7f4ea08";
const PRODUCTION_VERSION = "b56677ab-51ad-4353-bba8-f7824890b854";
const CATALOG = `# Jornadas\n\n| ID | Área | Jornada | Entrada | Estado atual |\n| --- | --- | --- | --- | --- |\n| AUTH-01 | Auth | Login | /login | aprovada |\n| A11Y-01 | Acessibilidade | Teclado | aplicação | aprovada |\n| WFL-01 | Workflows | Retirado | /workflows | fora do escopo |\n| DES-01 | Design | Retirado | /design | descontinuada |\n`;

function playwright() {
  return {
    config: {
      metadata: {
        sourceCommit: SOURCE_COMMIT,
        productionVersion: PRODUCTION_VERSION,
        productionUrl: "https://smartzap.example.com",
      },
    },
    errors: [],
    stats: { expected: 3, skipped: 0, unexpected: 0, flaky: 0 },
    suites: [{ specs: ["chromium", "firefox", "webkit"].map((projectName) => ({
      tests: [{ projectName, status: "expected", results: [{ status: "passed", retry: 0 }] }],
    })) }],
  };
}

function attestation(requirement: { id: string; checks?: string[] }, supportHash: string) {
  return {
    schemaVersion: 1,
    kind: ATTESTATION_KIND,
    evidenceId: requirement.id,
    status: "passed",
    release: { sourceCommit: SOURCE_COMMIT, productionVersion: PRODUCTION_VERSION },
    performedBy: "Revisor Humano",
    performedAt: "2026-08-13T03:00:00.000Z",
    checks: Object.fromEntries((requirement.checks || []).map((check) => [check, true])),
    issues: [],
    artifacts: [{ path: "support.txt", sha256: supportHash }],
  };
}

function evidenceFor(requirement: { id: string; validator: string; command?: string; checks?: string[] }, supportHash: string) {
  if (requirement.validator === "runner") return {
    schemaVersion: 1,
    status: "passed",
    command: requirement.command,
    commit: SOURCE_COMMIT,
    steps: [{ status: "passed", exitCode: 0 }],
  };
  if (requirement.validator === "playwright") return playwright();
  if (requirement.validator === "remote-health") return {
    schemaVersion: 1,
    status: "passed",
    release: {
      sourceCommit: SOURCE_COMMIT,
      productionVersion: PRODUCTION_VERSION,
      productionUrl: "https://smartzap.example.com",
    },
    checks: Array.from({ length: 4 }, () => ({ status: "passed" })),
  };
  if (requirement.validator === "meta-canary") return {
    schemaVersion: 1,
    status: "passed",
    scope: "full-lifecycle",
    transport: { status: "passed", accepted: 1, attempted: 1 },
    timeline: [{ contacts: [{ status: "delivered" }] }],
    cleanup: { status: "passed", errors: [] },
  };
  if (requirement.validator === "ai-eval") return {
    schemaVersion: 1,
    status: "passed",
    traces: Array.from({ length: 84 }, (_, index) => ({ index })),
    gates: {
      pass1: 1,
      pass3: 1,
      allAttempts: 1,
      security: 1,
      handoff: 1,
      factualGrounding: 1,
    },
    cleanup: { status: "passed", errors: [] },
  };
  if (requirement.validator === "ai-human-calibration") return {
    schemaVersion: 1,
    kind: "smartzap-ai-human-calibration-result",
    status: "passed",
    reviewer: "Revisor Humano",
    reviewedAt: "2026-08-13T03:00:00.000Z",
    metrics: { total: 84, reviewed: 84, humanPassed: 84, agreements: 84 },
    issues: [],
    disagreements: [],
    humanFailures: [],
  };
  if (requirement.validator === "stress") return {
    schemaVersion: 1,
    status: "passed",
    families: [{ status: "passed" }, { status: "passed-local-isolated" }],
    cleanup: { status: "passed", remaining: [] },
  };
  if (requirement.validator === "cleanup") return {
    schemaVersion: 1,
    status: "passed",
    errors: [],
    residue: {},
  };
  if (requirement.validator === "rollback") return {
    schemaVersion: 1,
    status: "passed",
    totalDurationMs: 20_000,
    phases: [
      { phase: "rollback", health: { attempts: 1 } },
      { phase: "restore", health: { attempts: 1 } },
    ],
  };
  if (requirement.validator === "attestation") return attestation(requirement, supportHash);
  throw new Error(`Fixture ausente: ${requirement.validator}`);
}

function cloudflare() {
  return {
    version: {
      id: PRODUCTION_VERSION,
      annotations: { "workers/message": "d4700fe release certificada" },
      resources: { bindings: [{ name: "ENVIRONMENT", text: "production" }] },
    },
    deployments: [{
      created_on: "2026-08-13T03:00:00.000Z",
      versions: [{ version_id: PRODUCTION_VERSION, percentage: 100 }],
    }],
  };
}

function prepared() {
  const root = mkdtempSync(join(tmpdir(), "smartzap-cert-"));
  const supportPath = join(root, "support.txt");
  writeFileSync(supportPath, "evidência comprobatória\n");
  const supportHash = hashFile(supportPath);
  const evidence: Record<string, string> = {};
  for (const requirement of CERTIFICATION_EVIDENCE_REQUIREMENTS) {
    const path = join(root, `${requirement.id}.json`);
    writeFileSync(path, `${JSON.stringify(evidenceFor(requirement, supportHash))}\n`);
    evidence[requirement.id] = `${requirement.id}.json`;
  }
  const spec = {
    release: {
      sourceCommit: SOURCE_COMMIT,
      productionVersion: PRODUCTION_VERSION,
      productionUrl: "https://smartzap.example.com",
    },
    evidence,
  };
  const cf = cloudflare();
  const manifest = buildCertificationManifest({
    root,
    spec,
    journeyMarkdown: CATALOG,
    cloudflareVersion: cf.version,
    cloudflareDeployments: cf.deployments,
    runtimeDrift: [],
    createdAt: "2026-08-13T03:00:00.000Z",
  });
  return { root, spec, manifest, cf };
}

function verify(state: ReturnType<typeof prepared>, overrides: Record<string, unknown> = {}) {
  return evaluateProductionCertification({
    root: state.root,
    manifest: state.manifest,
    journeyMarkdown: CATALOG,
    liveCloudflare: state.cf,
    currentRuntimeDrift: [],
    ...overrides,
  });
}

describe("certificação integral de produção", () => {
  it("aprova somente o pacote completo da mesma versão", () => {
    const state = prepared();
    const result = verify(state);
    expect(result.status).toBe("passed");
    expect(result.catalog).toMatchObject({ total: 4, active: 2, approvedActive: 2 });
    expect(result.evidence).toMatchObject({
      required: CERTIFICATION_EVIDENCE_REQUIREMENTS.length,
      present: CERTIFICATION_EVIDENCE_REQUIREMENTS.length,
      passed: CERTIFICATION_EVIDENCE_REQUIREMENTS.length,
    });
  });

  it("reprova evidência obrigatória ausente", () => {
    const state = prepared();
    const entry = state.manifest.evidence.find((item: { id: string }) => item.id === "meta-bsuid");
    Object.assign(entry, { path: null, sha256: null, present: false });
    const result = verify(state);
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("meta-bsuid: evidência obrigatória ausente");
  });

  it("reprova arquivo adulterado depois da preparação", () => {
    const state = prepared();
    writeFileSync(join(state.root, "unit.json"), JSON.stringify({ status: "passed", adulterado: true }));
    const result = verify(state);
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("unit: hash do arquivo diverge");
  });

  it("reprova relatório de outro commit", () => {
    const state = prepared();
    const path = join(state.root, "unit.json");
    const report = JSON.parse(readFileSync(path, "utf8"));
    report.commit = "a".repeat(40);
    writeFileSync(path, JSON.stringify(report));
    const rebuilt = buildCertificationManifest({
      root: state.root,
      spec: state.spec,
      journeyMarkdown: CATALOG,
      cloudflareVersion: state.cf.version,
      cloudflareDeployments: state.cf.deployments,
      runtimeDrift: [],
    });
    state.manifest = rebuilt;
    const result = verify(state);
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("unit: commit diverge da versão certificada");
  });

  it("reprova Playwright de outra release", () => {
    const state = prepared();
    const path = join(state.root, "production-routes.json");
    const report = JSON.parse(readFileSync(path, "utf8"));
    report.config.metadata.productionVersion =
      "11111111-1111-1111-1111-111111111111";
    writeFileSync(path, JSON.stringify(report));
    state.manifest = buildCertificationManifest({
      root: state.root,
      spec: state.spec,
      journeyMarkdown: CATALOG,
      cloudflareVersion: state.cf.version,
      cloudflareDeployments: state.cf.deployments,
      runtimeDrift: [],
    });
    const result = verify(state);
    expect(result.status).toBe("failed");
    expect(result.issues).toContain(
      "production-routes: relatório pertence a outra release",
    );
  });

  it("reprova health remoto de outra release", () => {
    const state = prepared();
    const path = join(state.root, "production-health-1.json");
    const report = JSON.parse(readFileSync(path, "utf8"));
    report.release.sourceCommit = "a".repeat(40);
    writeFileSync(path, JSON.stringify(report));
    state.manifest = buildCertificationManifest({
      root: state.root,
      spec: state.spec,
      journeyMarkdown: CATALOG,
      cloudflareVersion: state.cf.version,
      cloudflareDeployments: state.cf.deployments,
      runtimeDrift: [],
    });
    const result = verify(state);
    expect(result.status).toBe("failed");
    expect(result.issues).toContain(
      "production-health-1: health pertence a outra release",
    );
  });

  it("reprova jornada produtiva ainda aberta", () => {
    const state = prepared();
    const openCatalog = CATALOG.replace("AUTH-01 | Auth | Login | /login | aprovada", "AUTH-01 | Auth | Login | /login | em teste");
    const result = verify(state, { journeyMarkdown: openCatalog });
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("AUTH-01: jornada ativa está em teste");
  });

  it("reprova divergência do runtime após o commit publicado", () => {
    const state = prepared();
    const result = verify(state, { currentRuntimeDrift: ["src/index.ts"] });
    expect(result.status).toBe("failed");
    expect(result.issues.some((issue: string) => issue.includes("runtime mudou depois do commit publicado"))).toBe(true);
  });

  it("reprova quando outra versão recebe o tráfego atual", () => {
    const state = prepared();
    const live = cloudflare();
    live.deployments[0].versions = [{ version_id: "11111111-1111-1111-1111-111111111111", percentage: 100 }];
    const result = verify(state, { liveCloudflare: live });
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("cloudflare: versão certificada não recebe 100% do tráfego atual");
  });

  it("reprova tentativa de trocar o validador exigido", () => {
    const state = prepared();
    state.manifest.evidence.find((item: { id: string }) => item.id === "meta-bsuid").validator = "cleanup";
    const result = verify(state);
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("meta-bsuid: validador do manifesto foi alterado");
  });

  it("reprova entrada de evidência duplicada", () => {
    const state = prepared();
    state.manifest.evidence.push({ ...state.manifest.evidence[0] });
    const result = verify(state);
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("preflight: entrada de evidência duplicada");
  });

  it("reprova atestado declaratório sem artefato verificável", () => {
    const state = prepared();
    const path = join(state.root, "meta-bsuid.json");
    const report = JSON.parse(readFileSync(path, "utf8"));
    report.artifacts = [];
    writeFileSync(path, JSON.stringify(report));
    state.manifest = buildCertificationManifest({
      root: state.root,
      spec: state.spec,
      journeyMarkdown: CATALOG,
      cloudflareVersion: state.cf.version,
      cloudflareDeployments: state.cf.deployments,
      runtimeDrift: [],
    });
    const result = verify(state);
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("meta-bsuid: atestado sem artefato comprobatório");
  });
});
