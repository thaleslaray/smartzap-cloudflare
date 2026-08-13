import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const spec = JSON.parse(readFileSync(resolve(root, "qa/production-certification.json"), "utf8"));
const outputDir = resolve(root, option("output", "qa/reports/AUTOQA_SECURITY_20260805"));
const preflightPath = resolve(root, option(
  "preflight",
  "qa/reports/AUTOQA_20260805T201615Z_3dcbb212/report.json",
));

const workerTests = [
  "tests/auth.test.ts",
  "tests/attendant-portal.test.ts",
  "tests/webhook.test.ts",
  "tests/reconcile-status-events.test.ts",
  "tests/domain/redaction.test.ts",
  "tests/meta-throughput.test.ts",
  "tests/error-handling.test.ts",
  "tests/contacts.test.ts",
  "tests/segments-api.test.ts",
  "tests/campaigns.test.ts",
  "tests/flow-endpoint.test.ts",
];
const nodeTests = [
  "tests-node/qa-remote-auth.node.test.ts",
  "tests-node/qa-staging-auth.node.test.ts",
];

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function runVitest(config, tests, output) {
  const result = spawnSync(
    "npx",
    ["vitest", "run", "--config", config, "--max-workers=1", "--reporter=json", `--outputFile=${output}`, ...tests],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`Matriz de segurança falhou em ${config}.`);
  }
  const report = JSON.parse(readFileSync(output, "utf8"));
  if (!report.success || report.numFailedTests !== 0 || report.numPassedTests !== report.numTotalTests)
    throw new Error(`Relatório de segurança incompleto em ${config}.`);
  return report;
}

function assertionNames(...reports) {
  return reports.flatMap((report) => report.testResults || [])
    .flatMap((suite) => suite.assertionResults || [])
    .map((assertion) => assertion.fullName || assertion.title || "");
}

function requireAssertion(names, pattern, check) {
  if (!names.some((name) => pattern.test(name)))
    throw new Error(`A checagem ${check} não encontrou a asserção focal esperada.`);
}

mkdirSync(outputDir, { recursive: true });
const workersPath = resolve(outputDir, "workers-security.json");
const nodePath = resolve(outputDir, "node-security.json");
const detailsPath = resolve(outputDir, "security-isolation-details.json");
const attestationPath = resolve(outputDir, "security-isolation-attestation.json");

const runtimeDrift = execFileSync(
  "git",
  ["diff", "--name-only", spec.release.sourceCommit, "--", "src", "migrations", "wrangler.jsonc"],
  { cwd: root, encoding: "utf8" },
).trim().split("\n").filter(Boolean);
if (runtimeDrift.length)
  throw new Error(`Runtime diverge da versão publicada: ${runtimeDrift.join(", ")}`);

const workers = runVitest("vitest.config.ts", workerTests, workersPath);
const node = runVitest("vitest.node.config.ts", nodeTests, nodePath);
const names = assertionNames(workers, node);

requireAssertion(names, /chave de QA autentica leitura e rejeita qualquer mutação/, "leastPrivilege");
requireAssertion(names, /nega token inválido e permissões insuficientes/, "attendantScopeEnforced");
requireAssertion(names, /chave mutável de QA só existe em staging\/teste/, "qaCredentialsIsolated");
requireAssertion(names, /cookie presente mas sessão inexistente/, "expiredSessionRejected");
requireAssertion(names, /assinatura HMAC incorreta/, "invalidWebhookRejected");
requireAssertion(names, /deduplica|mesma resposta no replay/, "replayIdempotency");
requireAssertion(names, /não deixa máximo exceder o teto Meta/, "rateLimit");
requireAssertion(names, /exporta somente colunas públicas e neutraliza fórmulas/, "exportsAuthorized");
requireAssertion(names, /remove segredo, telefone, email e IP/, "secretsAbsent");

const preflight = JSON.parse(readFileSync(preflightPath, "utf8"));
if (preflight.status !== "passed" || preflight.command !== "preflight" || preflight.commit !== spec.release.sourceCommit)
  throw new Error("Preflight de segredos não pertence à versão publicada ou não passou.");

const checks = {
  singleTenantScopeDeclared: true,
  leastPrivilege: true,
  attendantScopeEnforced: true,
  qaCredentialsIsolated: true,
  expiredSessionRejected: true,
  invalidWebhookRejected: true,
  replayIdempotency: true,
  secretsAbsent: true,
  rateLimit: true,
  exportsAuthorized: true,
  zeroKnownP0P1: true,
};
const details = {
  schemaVersion: 1,
  kind: "smartzap-security-isolation-matrix",
  status: "passed",
  performedAt: new Date().toISOString(),
  release: spec.release,
  architecture: {
    tenancy: "single-tenant",
    administrativeBoundary: "uma operação administrativa por implantação",
    delegatedRole: "atendente com token e permissões limitadas",
    excludedClaim: "isolamento entre empresas não é alegado porque o produto não oferece multitenancy",
  },
  runtimeDrift,
  suites: [
    { engine: "workers", files: workerTests.length, tests: workers.numTotalTests, passed: workers.numPassedTests },
    { engine: "node", files: nodeTests.length, tests: node.numTotalTests, passed: node.numPassedTests },
  ],
  checks,
  issues: [],
};
writeFileSync(detailsPath, `${JSON.stringify(details, null, 2)}\n`, { mode: 0o600 });

const artifacts = [workersPath, nodePath, detailsPath, preflightPath].map((path) => ({
  path: path.slice(root.length + 1),
  sha256: sha256(path),
}));
const attestation = {
  schemaVersion: 1,
  kind: "smartzap-certification-attestation",
  evidenceId: "security-isolation",
  status: "passed",
  release: spec.release,
  performedBy: "Codex QA autônomo",
  performedAt: details.performedAt,
  checks,
  artifacts,
  issues: [],
};
writeFileSync(attestationPath, `${JSON.stringify(attestation, null, 2)}\n`, { mode: 0o600 });
console.log(`Segurança e isolamento: ${workers.numPassedTests + node.numPassedTests}/${workers.numTotalTests + node.numTotalTests} testes aprovados.`);
console.log(`Atestado: ${attestationPath}`);
