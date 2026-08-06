import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { consolidateSoak } from "./lib/soak-consolidation.mjs";

const root = resolve(import.meta.dirname, "..");
const START_AT = "2026-07-30T02:45:00.000Z";
const END_AT = "2026-08-13T02:45:00.000Z";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function readJson(path, fallback = {}) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}

function writePrivate(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function wrangler(args) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Wrangler falhou");
  return JSON.parse(result.stdout);
}

function monitorReports() {
  const keys = wrangler([
    "kv", "key", "list", "--config", "config/wrangler.monitor.jsonc",
    "--binding", "STATE", "--prefix", "run:", "--remote",
  ]).map((entry) => entry.name).sort();
  const temp = mkdtempSync(join(tmpdir(), "smartzap-soak-"));
  const reports = [];
  try {
    for (let index = 0; index < keys.length; index += 100) {
      const chunk = keys.slice(index, index + 100);
      const input = join(temp, `keys-${index}.json`);
      writeFileSync(input, JSON.stringify(chunk), { mode: 0o600 });
      const values = wrangler([
        "kv", "bulk", "get", input, "--config", "config/wrangler.monitor.jsonc",
        "--binding", "STATE", "--remote",
      ]);
      for (const value of Object.values(values)) {
        try { reports.push(JSON.parse(value)); } catch { reports.push({ invalid: true }); }
      }
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  return reports;
}

function parseEnv(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

async function queueSnapshot(baseUrl, headers) {
  try {
    const response = await fetch(`${baseUrl}/api/settings/infrastructure-usage`, { headers });
    const body = await response.json();
    const backlog = Number(body?.queues?.backlog);
    return { status: response.ok && Number.isFinite(backlog) ? "passed" : "failed", backlog };
  } catch (error) {
    return { status: "failed", backlog: null, error: String(error?.message || error).slice(0, 200) };
  }
}

function integritySnapshot() {
  const sql = `SELECT
    (SELECT COUNT(*) FROM (SELECT event_key FROM status_events WHERE event_key IS NOT NULL GROUP BY event_key HAVING COUNT(*)>1)) AS event_key_duplicates,
    (SELECT COUNT(*) FROM (SELECT request_key FROM conversation_draft_sends GROUP BY request_key HAVING COUNT(*)>1)) AS send_request_duplicates,
    (SELECT COUNT(*) FROM campaigns c
      WHERE (c.status='scheduled' AND c.scheduled_at<datetime('now','-1 hour'))
         OR (c.status='sending' AND c.created_at<datetime('now','-1 hour')
             AND NOT EXISTS (
               SELECT 1 FROM campaign_contacts cc
               WHERE cc.campaign_id=c.id AND cc.updated_at>=datetime('now','-1 hour')
             ))) AS stalled_campaigns,
    (SELECT COUNT(*) FROM conversation_draft_sends
      WHERE status IN('reserved','ambiguous') AND updated_at<datetime('now','-1 hour')) AS stalled_sends;`;
  const output = wrangler(["d1", "execute", "smartzap", "--remote", "--json", "--command", sql]);
  const row = output?.[0]?.results?.[0] || {};
  return {
    eventKeyDuplicates: Number(row.event_key_duplicates),
    sendRequestDuplicates: Number(row.send_request_duplicates),
    stalledCampaigns: Number(row.stalled_campaigns),
    stalledSends: Number(row.stalled_sends),
  };
}

const spec = readJson(resolve(root, option("spec", "qa/production-certification.json")));
const outputDir = resolve(root, option("output", "qa/reports/AUTOQA_SOAK_CURRENT"));
const exceptionsPath = resolve(root, option("exceptions", "qa/soak-exceptions.json"));
const productionEnv = parseEnv(resolve(root, ".dev.vars.qa.production.local"));
const stagingEnv = parseEnv(resolve(root, ".dev.vars.qa.local"));
const [stagingQueue, productionQueue] = await Promise.all([
  queueSnapshot("https://smartzap-cf-staging.thales2581.workers.dev", { "x-api-key": stagingEnv.QA_STAGING_API_KEY || "" }),
  queueSnapshot("https://smartzap-cf.thales2581.workers.dev", { "x-qa-readonly-key": productionEnv.QA_READONLY_API_KEY || "" }),
]);
const operations = { queues: { staging: stagingQueue, production: productionQueue }, integrity: integritySnapshot() };
const details = consolidateSoak({
  reports: monitorReports(),
  release: spec.release,
  startAt: START_AT,
  endAt: END_AT,
  observedAt: option("observed-at", new Date().toISOString()),
  exceptions: readJson(exceptionsPath),
  operations,
});
const detailsPath = resolve(outputDir, "soak-details.json");
writePrivate(detailsPath, details);
const attestation = {
  schemaVersion: 1,
  kind: "smartzap-certification-attestation",
  evidenceId: "soak-14-days",
  status: details.status,
  release: spec.release,
  performedBy: "Codex QA autônomo",
  performedAt: details.observedAt,
  checks: details.checks,
  artifacts: [{ path: relative(root, detailsPath), sha256: sha256(detailsPath) }],
  issues: details.issues,
};
const attestationPath = resolve(outputDir, "soak-attestation.json");
writePrivate(attestationPath, attestation);
console.log(`Soak: ${details.status}; ${details.metrics.cycles} ciclos; ${details.metrics.unexplainedGaps} lacunas sem explicação.`);
console.log(`Atestado: ${attestationPath}`);
if (details.status !== "passed") process.exitCode = 1;
