import { execFileSync, spawn } from "node:child_process";
import {
  createWriteStream,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const command = process.argv[2] || "all";
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
const runId = (
  process.env.QA_RUN_ID || `AUTOQA_${stamp}_${randomUUID().slice(0, 8)}`
).replace(/[^A-Za-z0-9_-]/g, "_");
const reportDir = resolve(
  root,
  process.env.QA_REPORT_DIR || `qa/reports/${runId}`,
);
mkdirSync(reportDir, { recursive: true });

const contractTests = [
  "tests/auth.test.ts",
  "tests/campaigns.test.ts",
  "tests/workflow.test.ts",
  "tests/pilot.test.ts",
  "tests/webhook.test.ts",
  "tests/whatsapp.test.ts",
  "tests/ai.test.ts",
  "tests/automation.test.ts",
  "tests/google-calendar.test.ts",
  "tests/flow-endpoint.test.ts",
  "tests/error-handling.test.ts",
  "tests/domain/redaction.test.ts",
];

const definitions = {
  validate: [["manifest", "node", ["scripts/qa-validate.mjs"]]],
  preflight: [
    ["ci-policy", "node", ["scripts/qa-ci-policy.mjs"]],
    ["manifest", "node", ["scripts/qa-validate.mjs"]],
    ["secrets", "node", ["scripts/qa-secret-scan.mjs"]],
    ["diff-check", "git", ["diff", "--check"]],
    ["types", "npx", ["tsc", "--noEmit"]],
    ["build", "npm", ["run", "build"]],
    ["dependency-audit", "npm", ["audit", "--audit-level=moderate"]],
  ],
  unit: [["vitest", "npm", ["test"]]],
  contract: [
    [
      "contracts",
      "npx",
      ["vitest", "run", "--max-workers=1", ...contractTests],
    ],
  ],
  "e2e:p0": [["e2e-p0", "node", ["scripts/qa-e2e.mjs", "p0"]]],
  "e2e:matrix": [
    ["e2e-matrix", "node", ["scripts/qa-e2e.mjs", "matrix"]],
  ],
  visual: [["visual", "node", ["scripts/qa-e2e.mjs", "visual"]]],
  ai: [["ai-evals", "node", ["scripts/qa-ai-eval.mjs"]]],
  "meta:canary": [
    ["meta-canary", "node", ["scripts/qa-meta-canary.mjs"]],
  ],
  cleanup: [["cleanup", "node", ["scripts/qa-cleanup.mjs"]]],
};

definitions.all = [
  ...definitions.preflight,
  ...definitions.unit,
  ...definitions.contract,
  ...definitions["e2e:p0"],
  ...definitions.ai,
  ...definitions.cleanup,
];
definitions.release = [
  ...definitions.preflight,
  ...definitions.unit,
  ...definitions.contract,
  ...definitions["e2e:matrix"],
  ...definitions.visual,
  ...definitions.ai,
  ...definitions["meta:canary"],
  ...definitions.cleanup,
];

if (!definitions[command]) {
  console.error(
    `Gate desconhecido: ${command}. Opções: ${Object.keys(definitions).join(", ")}`,
  );
  process.exit(2);
}

const report = {
  schemaVersion: 1,
  runId,
  command,
  branch: "",
  commit: "",
  startedAt: new Date().toISOString(),
  finishedAt: null,
  status: "running",
  steps: [],
};
try {
  report.branch = execFileSync(
    "git",
    ["branch", "--show-current"],
    { cwd: root, encoding: "utf8" },
  ).trim() || "detached";
  report.commit = execFileSync(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: root, encoding: "utf8" },
  ).trim();
} catch {}

function persist() {
  writeFileSync(
    resolve(reportDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

async function runStep([name, executable, args]) {
  const started = Date.now();
  const logPath = resolve(reportDir, `${name}.log`);
  const log = createWriteStream(logPath, { flags: "w", mode: 0o600 });
  console.log(`\n[${runId}] ${name}: ${executable} ${args.join(" ")}`);
  const child = spawn(executable, args, {
    cwd: root,
    env: {
      ...process.env,
      QA_RUN_ID: runId,
      QA_REPORT_DIR: reportDir,
      FORCE_COLOR: process.env.FORCE_COLOR || "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    log.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    log.write(chunk);
  });
  const exitCode = await new Promise((resolveExit) => {
    child.on("close", (code) => resolveExit(code ?? 1));
    child.on("error", () => resolveExit(1));
  });
  log.end();
  const step = {
    name,
    command: [executable, ...args],
    status: exitCode === 0 ? "passed" : "failed",
    exitCode,
    durationMs: Date.now() - started,
    log: `${name}.log`,
  };
  report.steps.push(step);
  persist();
  return step;
}

persist();
let failedStep = null;
for (const stepDefinition of definitions[command]) {
  const result = await runStep(stepDefinition);
  if (result.status === "failed") {
    failedStep = result;
    break;
  }
}

if (
  failedStep &&
  ["all", "release"].includes(command) &&
  !report.steps.some((step) => step.name === "cleanup")
) {
  await runStep(definitions.cleanup[0]);
}

if (failedStep) {
  report.status = "failed";
  report.finishedAt = new Date().toISOString();
  persist();
  console.error(`\nQA reprovado em ${failedStep.name}. Relatório: ${reportDir}`);
  process.exit(failedStep.exitCode || 1);
}

report.status = "passed";
report.finishedAt = new Date().toISOString();
persist();
console.log(`\nQA aprovado. Relatório: ${reportDir}`);
