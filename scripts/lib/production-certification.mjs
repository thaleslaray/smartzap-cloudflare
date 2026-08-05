import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

export const CERTIFICATION_KIND = "smartzap-production-certification";
export const ATTESTATION_KIND = "smartzap-certification-attestation";

export const CERTIFICATION_EVIDENCE_REQUIREMENTS = Object.freeze([
  { id: "preflight", validator: "runner", command: "preflight" },
  { id: "unit", validator: "runner", command: "unit" },
  { id: "contract", validator: "runner", command: "contract" },
  { id: "e2e-matrix", validator: "runner", command: "e2e:matrix" },
  { id: "visual", validator: "runner", command: "visual" },
  { id: "production-routes", validator: "playwright", projects: ["chromium", "firefox", "webkit"] },
  { id: "production-meta-ui", validator: "playwright", projects: ["chromium", "firefox", "webkit"] },
  { id: "production-health-1", validator: "remote-health" },
  { id: "production-health-2", validator: "remote-health" },
  { id: "production-health-3", validator: "remote-health" },
  { id: "meta-canary", validator: "meta-canary" },
  { id: "ai-eval", validator: "ai-eval" },
  { id: "ai-human-calibration", validator: "ai-human-calibration" },
  { id: "miniapps-stress", validator: "stress" },
  { id: "projects-stress", validator: "stress" },
  { id: "cleanup", validator: "cleanup" },
  { id: "rollback", validator: "rollback" },
  { id: "meta-bsuid", validator: "attestation", checks: [
    "officialWebhookScenario", "phoneOmitted", "bsuidPersisted", "conversationAssociated",
    "officialReplyAccepted", "statusProgressed", "idempotencyConfirmed", "cleanupPassed",
  ] },
  { id: "soak-14-days", validator: "attestation", checks: [
    "fourteenDaysElapsed", "cyclesConsolidated", "gapsExplained", "latencyReviewed",
    "queuesReviewed", "duplicatesReviewed", "zeroKnownP0P1",
  ] },
  { id: "manual-accessibility", validator: "attestation", checks: [
    "keyboardOnly", "focusOrder", "visibleFocus", "zoom200", "screenReader",
    "modalsAndMenus", "criticalFlows", "zeroBlockingIssue",
  ] },
  { id: "backup-restore", validator: "attestation", checks: [
    "backupCreated", "hashVerified", "restoredInIsolation", "integrityVerified", "cleanupPassed",
  ] },
  { id: "security-isolation", validator: "attestation", checks: [
    "crossTenantIsolation", "leastPrivilege", "expiredSessionRejected", "invalidWebhookRejected",
    "replayIdempotency", "secretsAbsent", "rateLimit", "exportsAuthorized", "zeroKnownP0P1",
  ] },
  { id: "release-risk", validator: "attestation", checks: [
    "scopeAccepted", "exclusionsAccepted", "zeroKnownP0P1", "evidenceReviewed",
  ] },
]);

const ACTIVE_ALLOWED_STATE = "aprovada";
const NON_ACTIVE_STATES = new Set(["fora do escopo", "descontinuada"]);
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const VERSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

export function hashJson(value) {
  return sha256(JSON.stringify(canonical(value)));
}

export function hashFile(path) {
  return sha256(readFileSync(path));
}

export function parseJourneyCatalog(markdown) {
  const journeys = [];
  for (const line of String(markdown).split(/\r?\n/)) {
    if (!/^\| [A-Z0-9]+-\d+ \|/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 5) continue;
    journeys.push({ id: cells[0], area: cells[1], state: cells[4] });
  }
  return journeys;
}

function journeySummary(journeys) {
  const states = {};
  for (const journey of journeys) states[journey.state] = (states[journey.state] || 0) + 1;
  const active = journeys.filter((journey) => !NON_ACTIVE_STATES.has(journey.state));
  return {
    total: journeys.length,
    active: active.length,
    approvedActive: active.filter((journey) => journey.state === ACTIVE_ALLOWED_STATE).length,
    states,
  };
}

function safeRelative(root, path) {
  const result = relative(root, path).replaceAll("\\", "/");
  if (!result || result.startsWith("../") || result === "..")
    throw new Error(`evidência fora do repositório: ${path}`);
  return result;
}

function resolveEvidence(root, id, configuredPath) {
  if (!configuredPath) return { id, path: null, sha256: null, present: false };
  const absolute = resolve(root, configuredPath);
  const path = safeRelative(root, absolute);
  if (!existsSync(absolute)) return { id, path, sha256: null, present: false };
  return { id, path, sha256: hashFile(absolute), present: true };
}

export function buildCertificationManifest({
  root,
  spec,
  journeyMarkdown,
  cloudflareVersion,
  cloudflareDeployments,
  runtimeDrift = [],
  createdAt = new Date().toISOString(),
}) {
  const journeys = parseJourneyCatalog(journeyMarkdown);
  const evidence = CERTIFICATION_EVIDENCE_REQUIREMENTS.map((requirement) => ({
    ...resolveEvidence(root, requirement.id, spec?.evidence?.[requirement.id]),
    validator: requirement.validator,
  }));
  return {
    schemaVersion: 1,
    kind: CERTIFICATION_KIND,
    status: "draft",
    createdAt,
    release: {
      sourceCommit: spec?.release?.sourceCommit || "",
      productionVersion: spec?.release?.productionVersion || "",
      productionUrl: spec?.release?.productionUrl || "",
    },
    catalog: {
      path: "jornada.md",
      sha256: sha256(journeyMarkdown),
      summary: journeySummary(journeys),
      journeys,
    },
    cloudflare: {
      version: cloudflareVersion,
      deployments: cloudflareDeployments,
      snapshotHash: hashJson({ cloudflareVersion, cloudflareDeployments }),
    },
    runtimeDrift: [...runtimeDrift].sort(),
    evidence,
  };
}

function push(issues, id, message) {
  issues.push(`${id}: ${message}`);
}

function validateRunner(data, requirement, release, issues) {
  if (data?.schemaVersion !== 1) push(issues, requirement.id, "schemaVersion inválido");
  if (data?.status !== "passed") push(issues, requirement.id, "gate não aprovado");
  if (data?.command !== requirement.command) push(issues, requirement.id, `comando esperado: ${requirement.command}`);
  if (data?.commit !== release.sourceCommit) push(issues, requirement.id, "commit diverge da versão certificada");
  if (!Array.isArray(data?.steps) || !data.steps.length || data.steps.some((step) => step.status !== "passed" || step.exitCode !== 0))
    push(issues, requirement.id, "há etapa ausente ou reprovada");
}

function playwrightTests(data) {
  const tests = [];
  for (const suite of data?.suites || [])
    for (const spec of suite.specs || [])
      for (const test of spec.tests || []) tests.push(test);
  return tests;
}

function validatePlaywright(data, requirement, issues) {
  if (data?.stats?.unexpected !== 0 || data?.stats?.flaky !== 0 || data?.stats?.skipped !== 0)
    push(issues, requirement.id, "resultado contém falha, flake ou skip");
  if (!Number.isInteger(data?.stats?.expected) || data.stats.expected < requirement.projects.length)
    push(issues, requirement.id, "quantidade de testes menor que a matriz exigida");
  if (Array.isArray(data?.errors) && data.errors.length) push(issues, requirement.id, "há erros globais");
  const tests = playwrightTests(data);
  const projects = new Set(tests.map((test) => test.projectName));
  for (const project of requirement.projects)
    if (!projects.has(project)) push(issues, requirement.id, `navegador ausente: ${project}`);
  for (const test of tests) {
    if (test.status !== "expected") push(issues, requirement.id, `status inesperado em ${test.projectName || "projeto"}`);
    if (!Array.isArray(test.results) || test.results.length !== 1 || test.results[0]?.status !== "passed" || test.results[0]?.retry !== 0)
      push(issues, requirement.id, `execução inválida ou com retry em ${test.projectName || "projeto"}`);
  }
}

function validateRemoteHealth(data, requirement, issues) {
  if (data?.schemaVersion !== 1 || data?.status !== "passed") push(issues, requirement.id, "health não aprovado");
  if (!Array.isArray(data?.checks) || data.checks.length < 4 || data.checks.some((check) => check.status !== "passed"))
    push(issues, requirement.id, "contratos read-only incompletos ou reprovados");
}

function validateMetaCanary(data, requirement, issues) {
  if (data?.schemaVersion !== 1 || data?.status !== "passed" || data?.scope !== "full-lifecycle")
    push(issues, requirement.id, "ciclo Meta integral não aprovado");
  if (data?.transport?.status !== "passed" || data.transport.accepted !== data.transport.attempted || data.transport.accepted < 1)
    push(issues, requirement.id, "transporte oficial não comprovado");
  if (!data?.timeline?.some((entry) => entry?.contacts?.some((contact) => ["delivered", "read"].includes(contact.status))))
    push(issues, requirement.id, "webhook delivered/read ausente");
  if (data?.cleanup?.status !== "passed" || data.cleanup.errors?.length) push(issues, requirement.id, "cleanup do canário reprovado");
}

function validateAiEval(data, requirement, issues) {
  if (data?.schemaVersion !== 1 || data?.status !== "passed") push(issues, requirement.id, "avaliação de IA não aprovada");
  if (!Array.isArray(data?.traces) || data.traces.length !== 84) push(issues, requirement.id, "esperadas exatamente 84 respostas");
  for (const gate of ["pass1", "pass3", "allAttempts", "security", "handoff", "factualGrounding"])
    if (data?.gates?.[gate] !== 1) push(issues, requirement.id, `${gate} precisa ser 100%`);
  if (data?.cleanup?.status !== "passed" || data.cleanup.errors?.length) push(issues, requirement.id, "cleanup da IA reprovado");
}

function validateHumanCalibration(data, requirement, issues) {
  if (data?.schemaVersion !== 1 || data?.kind !== "smartzap-ai-human-calibration-result" || data?.status !== "passed")
    push(issues, requirement.id, "calibração humana não aprovada");
  if (data?.metrics?.total !== 84 || data?.metrics?.reviewed !== 84 || data?.metrics?.humanPassed !== 84 || data?.metrics?.agreements !== 84)
    push(issues, requirement.id, "revisão humana precisa aprovar e concordar em 84/84");
  if (data?.issues?.length || data?.disagreements?.length || data?.humanFailures?.length)
    push(issues, requirement.id, "calibração contém problema, divergência ou reprovação");
  if (!data?.reviewer || !Number.isFinite(Date.parse(data?.reviewedAt || "")))
    push(issues, requirement.id, "revisor ou data ausente");
}

function validateStress(data, requirement, issues) {
  if (data?.schemaVersion !== 1 || data?.status !== "passed") push(issues, requirement.id, "stress não aprovado");
  if (!Array.isArray(data?.families) || !data.families.length || data.families.some((family) => !String(family.status || "").startsWith("passed")))
    push(issues, requirement.id, "família de stress ausente ou reprovada");
  if (data?.cleanup?.status !== "passed") push(issues, requirement.id, "cleanup de stress reprovado");
  if (data?.cleanup?.failures?.length || data?.cleanup?.errors?.length)
    push(issues, requirement.id, "cleanup de stress contém falhas");
  const residue = data?.cleanup?.residue ?? data?.cleanup?.remaining;
  if (Array.isArray(residue) && residue.length) push(issues, requirement.id, "stress deixou resíduos");
  if (Number.isFinite(residue) && residue !== 0) push(issues, requirement.id, "stress deixou resíduos");
}

function validateCleanup(data, requirement, issues) {
  if (data?.schemaVersion !== 1 || data?.status !== "passed" || data?.errors?.length)
    push(issues, requirement.id, "cleanup global não aprovado");
  if (Array.isArray(data?.residue) ? data.residue.length : Object.values(data?.residue || {}).some((value) => Array.isArray(value) ? value.length : Boolean(value)))
    push(issues, requirement.id, "cleanup global deixou resíduos");
}

function validateRollback(data, requirement, issues) {
  if (data?.schemaVersion !== 1 || data?.status !== "passed") push(issues, requirement.id, "rollback não aprovado");
  const phases = new Set((data?.phases || []).map((phase) => phase.phase));
  if (!phases.has("rollback") || !phases.has("restore")) push(issues, requirement.id, "faltam fases rollback/restore");
  if ((data?.phases || []).some((phase) => !phase?.health || !Number.isFinite(phase.health.attempts)))
    push(issues, requirement.id, "health ausente em uma fase do rollback");
  if (!Number.isFinite(data?.totalDurationMs) || data.totalDurationMs > 600_000)
    push(issues, requirement.id, "rollback excedeu dez minutos");
}

function validateAttestation(data, requirement, release, root, issues) {
  if (data?.schemaVersion !== 1 || data?.kind !== ATTESTATION_KIND || data?.evidenceId !== requirement.id || data?.status !== "passed")
    push(issues, requirement.id, "atestado com contrato ou status inválido");
  if (data?.release?.sourceCommit !== release.sourceCommit || data?.release?.productionVersion !== release.productionVersion)
    push(issues, requirement.id, "atestado pertence a outra versão");
  if (!String(data?.performedBy || "").trim() || !Number.isFinite(Date.parse(data?.performedAt || "")))
    push(issues, requirement.id, "executor ou data ausente");
  if (data?.issues?.length) push(issues, requirement.id, "atestado contém problemas abertos");
  for (const check of requirement.checks || [])
    if (data?.checks?.[check] !== true) push(issues, requirement.id, `checagem obrigatória ausente: ${check}`);
  if (!Array.isArray(data?.artifacts) || !data.artifacts.length) {
    push(issues, requirement.id, "atestado sem artefato comprobatório");
    return;
  }
  for (const artifact of data.artifacts) {
    const absolute = resolve(root, artifact?.path || "");
    try {
      safeRelative(root, absolute);
    } catch (error) {
      push(issues, requirement.id, error.message);
      continue;
    }
    if (!artifact?.path || !existsSync(absolute)) {
      push(issues, requirement.id, "artefato comprobatório ausente");
      continue;
    }
    if (artifact?.sha256 !== hashFile(absolute))
      push(issues, requirement.id, `hash do artefato diverge: ${artifact.path}`);
  }
}

function validateEvidenceData(data, requirement, release, root, issues) {
  if (requirement.validator === "runner") return validateRunner(data, requirement, release, issues);
  if (requirement.validator === "playwright") return validatePlaywright(data, requirement, issues);
  if (requirement.validator === "remote-health") return validateRemoteHealth(data, requirement, issues);
  if (requirement.validator === "meta-canary") return validateMetaCanary(data, requirement, issues);
  if (requirement.validator === "ai-eval") return validateAiEval(data, requirement, issues);
  if (requirement.validator === "ai-human-calibration") return validateHumanCalibration(data, requirement, issues);
  if (requirement.validator === "stress") return validateStress(data, requirement, issues);
  if (requirement.validator === "cleanup") return validateCleanup(data, requirement, issues);
  if (requirement.validator === "rollback") return validateRollback(data, requirement, issues);
  if (requirement.validator === "attestation") return validateAttestation(data, requirement, release, root, issues);
  push(issues, requirement.id, `validador desconhecido: ${requirement.validator}`);
}

function validateCloudflare(manifest, liveCloudflare, issues) {
  const { sourceCommit, productionVersion } = manifest.release || {};
  const version = liveCloudflare?.version;
  const deployments = liveCloudflare?.deployments;
  if (version?.id !== productionVersion) push(issues, "cloudflare", "versão consultada diverge da certificada");
  if (!String(version?.annotations?.["workers/message"] || "").includes(sourceCommit.slice(0, 7)))
    push(issues, "cloudflare", "anotação da versão não referencia o commit certificado");
  if (!version?.resources?.bindings?.some((binding) => binding.name === "ENVIRONMENT" && binding.text === "production"))
    push(issues, "cloudflare", "binding ENVIRONMENT=production ausente");
  const latest = [...(deployments || [])].sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
  const target = latest?.versions?.find((item) => item.version_id === productionVersion);
  if (!target || target.percentage !== 100) push(issues, "cloudflare", "versão certificada não recebe 100% do tráfego atual");
}

export function evaluateProductionCertification({
  root,
  manifest,
  journeyMarkdown,
  liveCloudflare,
  currentRuntimeDrift = [],
}) {
  const issues = [];
  if (manifest?.schemaVersion !== 1 || manifest?.kind !== CERTIFICATION_KIND)
    issues.push("manifesto com contrato inválido");
  const release = manifest?.release || {};
  if (!SHA_PATTERN.test(release.sourceCommit || "")) issues.push("commit de origem inválido");
  if (!VERSION_PATTERN.test(release.productionVersion || "")) issues.push("versão Cloudflare inválida");
  if (!/^https:\/\//.test(release.productionUrl || "")) issues.push("URL de produção inválida");

  const journeys = parseJourneyCatalog(journeyMarkdown);
  if (!journeys.length) issues.push("catálogo de jornadas vazio");
  const journeyIds = new Set();
  for (const journey of journeys) {
    if (journeyIds.has(journey.id)) issues.push(`${journey.id}: ID de jornada duplicado`);
    journeyIds.add(journey.id);
  }
  if (sha256(journeyMarkdown) !== manifest?.catalog?.sha256) issues.push("catálogo mudou depois da preparação");
  if (hashJson(journeys) !== hashJson(manifest?.catalog?.journeys || [])) issues.push("snapshot das jornadas diverge");
  for (const journey of journeys)
    if (!NON_ACTIVE_STATES.has(journey.state) && journey.state !== ACTIVE_ALLOWED_STATE)
      issues.push(`${journey.id}: jornada ativa está ${journey.state}`);

  const preparedDrift = [...(manifest?.runtimeDrift || [])].sort();
  const currentDrift = [...currentRuntimeDrift].sort();
  if (hashJson(preparedDrift) !== hashJson(currentDrift)) issues.push("mudanças do runtime divergem do snapshot preparado");
  if (currentDrift.length) issues.push(`runtime mudou depois do commit publicado: ${currentDrift.join(", ")}`);

  if (manifest?.cloudflare?.snapshotHash !== hashJson({
    cloudflareVersion: manifest?.cloudflare?.version,
    cloudflareDeployments: manifest?.cloudflare?.deployments,
  })) issues.push("snapshot Cloudflare do manifesto foi alterado");
  validateCloudflare(manifest, liveCloudflare, issues);

  const evidenceRows = manifest?.evidence || [];
  const entries = new Map();
  for (const entry of evidenceRows) {
    if (entries.has(entry.id)) push(issues, entry.id, "entrada de evidência duplicada");
    entries.set(entry.id, entry);
  }
  for (const requirement of CERTIFICATION_EVIDENCE_REQUIREMENTS) {
    const entry = entries.get(requirement.id);
    if (!entry) {
      push(issues, requirement.id, "entrada de evidência ausente");
      continue;
    }
    if (entry.validator !== requirement.validator) push(issues, requirement.id, "validador do manifesto foi alterado");
    if (!entry.present || !entry.path || !entry.sha256) {
      push(issues, requirement.id, "evidência obrigatória ausente");
      continue;
    }
    const absolute = resolve(root, entry.path);
    try {
      safeRelative(root, absolute);
    } catch (error) {
      push(issues, requirement.id, error.message);
      continue;
    }
    if (!existsSync(absolute)) {
      push(issues, requirement.id, "arquivo não encontrado");
      continue;
    }
    if (hashFile(absolute) !== entry.sha256) {
      push(issues, requirement.id, "hash do arquivo diverge");
      continue;
    }
    let data;
    try {
      data = JSON.parse(readFileSync(absolute, "utf8"));
    } catch {
      push(issues, requirement.id, "arquivo não contém JSON válido");
      continue;
    }
    validateEvidenceData(data, requirement, release, root, issues);
  }
  for (const id of entries.keys())
    if (!CERTIFICATION_EVIDENCE_REQUIREMENTS.some((requirement) => requirement.id === id))
      push(issues, id, "evidência não pertence ao contrato de certificação");

  const uniqueIssues = [...new Set(issues)];
  const failedEvidence = new Set(
    uniqueIssues
      .map((issue) => issue.match(/^([^:]+):/)?.[1])
      .filter((id) => CERTIFICATION_EVIDENCE_REQUIREMENTS.some((requirement) => requirement.id === id)),
  );
  return {
    schemaVersion: 1,
    kind: "smartzap-production-certification-result",
    status: uniqueIssues.length ? "failed" : "passed",
    verifiedAt: new Date().toISOString(),
    release,
    catalog: journeySummary(journeys),
    evidence: {
      required: CERTIFICATION_EVIDENCE_REQUIREMENTS.length,
      present: [...entries.values()].filter((entry) => entry.present).length,
      passed: CERTIFICATION_EVIDENCE_REQUIREMENTS.length - failedEvidence.size,
    },
    issues: uniqueIssues,
  };
}
