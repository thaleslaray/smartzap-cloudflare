import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const config = "config/wrangler.staging.jsonc";
const baseUrl = "https://smartzap-cf-staging.thales2581.workers.dev";
const reportDir = resolve(
  root,
  process.env.QA_REPORT_DIR || "qa/reports/rollback-staging",
);
mkdirSync(reportDir, { recursive: true });

function run(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("npx", ["wrangler", ...args], {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      if (code === 0) resolveRun(stdout);
      else rejectRun(new Error((stderr || stdout).slice(0, 2_000)));
    });
    child.on("error", rejectRun);
  });
}

async function healthy() {
  for (let attempt = 1; attempt <= 18; attempt++) {
    const started = performance.now();
    const response = await fetch(
      `${baseUrl}/api/health?rollback=${Date.now()}`,
    ).catch(() => null);
    if (response?.ok) {
      const body = await response.json().catch(() => null);
      if (body?.ok === true)
        return {
          attempts: attempt,
          latencyMs: Math.round(performance.now() - started),
        };
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 5_000));
  }
  throw new Error("Worker de staging não ficou saudável em 90 segundos.");
}

function versionIds(deployments) {
  const ids = [];
  for (const deployment of deployments)
    for (const version of deployment.versions || [])
      if (
        typeof version.version_id === "string" &&
        !ids.includes(version.version_id)
      )
        ids.push(version.version_id);
  return ids;
}

const report = {
  schemaVersion: 1,
  mode: "cloudflare-staging-rollback",
  baseUrl,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  status: "running",
  rollbackTarget: null,
  restoreTarget: null,
  phases: [],
};
let restoreTarget;

try {
  const deployments = JSON.parse(
    await run(["deployments", "list", "--config", config, "--json"]),
  );
  const ids = versionIds(deployments);
  restoreTarget = ids.at(-1);
  const rollbackTarget = ids.at(-2);
  if (!restoreTarget || !rollbackTarget || restoreTarget === rollbackTarget)
    throw new Error("São necessárias duas versões distintas no staging.");
  report.restoreTarget = restoreTarget;
  report.rollbackTarget = rollbackTarget;

  const rollbackStarted = performance.now();
  await run([
    "rollback",
    rollbackTarget,
    "--config",
    config,
    "--yes",
    "--message",
    "AUTOQA rollback drill",
  ]);
  report.phases.push({
    phase: "rollback",
    versionId: rollbackTarget,
    durationMs: Math.round(performance.now() - rollbackStarted),
    health: await healthy(),
  });

  const restoreStarted = performance.now();
  await run([
    "rollback",
    restoreTarget,
    "--config",
    config,
    "--yes",
    "--message",
    "AUTOQA rollback drill restore",
  ]);
  report.phases.push({
    phase: "restore",
    versionId: restoreTarget,
    durationMs: Math.round(performance.now() - restoreStarted),
    health: await healthy(),
  });
  report.totalDurationMs = report.phases.reduce(
    (total, phase) => total + phase.durationMs,
    0,
  );
  report.status =
    report.totalDurationMs <= 10 * 60_000 ? "passed" : "failed";
  if (report.status === "failed")
    report.error = "Rollback e restauração excederam dez minutos.";
} catch (error) {
  report.status = "failed";
  report.error =
    error instanceof Error ? error.message.slice(0, 2_000) : "falha desconhecida";
  if (
    restoreTarget &&
    !report.phases.some((phase) => phase.phase === "restore")
  ) {
    try {
      await run([
        "rollback",
        restoreTarget,
        "--config",
        config,
        "--yes",
        "--message",
        "AUTOQA emergency restore",
      ]);
      report.emergencyRestore = { status: "passed", health: await healthy() };
    } catch (restoreError) {
      report.emergencyRestore = {
        status: "failed",
        error:
          restoreError instanceof Error
            ? restoreError.message.slice(0, 2_000)
            : "falha desconhecida",
      };
    }
  }
} finally {
  report.finishedAt = new Date().toISOString();
  const output = resolve(reportDir, "rollback-drill.json");
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  chmodSync(output, 0o600);
}

if (report.status !== "passed") {
  console.error(`Drill de rollback reprovado: ${report.error}`);
  process.exit(1);
}
console.log(
  `Drill de rollback aprovado em ${(report.totalDurationMs / 1_000).toFixed(1)}s, com staging restaurado.`,
);
