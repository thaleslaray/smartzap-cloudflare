import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseUrl = String(process.env.QA_BASE_URL || "").replace(/\/+$/, "");
const apiKey = process.env.QA_API_KEY;
const readOnlyKey = process.env.QA_READONLY_API_KEY;
const allowedHosts = new Set([
  "smartzap-cf.thales2581.workers.dev",
  "smartzap-cf-preview.thales2581.workers.dev",
  "smartzap-cf-staging.thales2581.workers.dev",
]);

if (!baseUrl || !allowedHosts.has(new URL(baseUrl).hostname))
  throw new Error("QA_BASE_URL precisa apontar para um Worker SmartZap conhecido.");

const reportDir = resolve(
  root,
  process.env.QA_REPORT_DIR || "qa/reports/remote-health",
);
mkdirSync(reportDir, { recursive: true });
const hostname = new URL(baseUrl).hostname;
const mode = hostname.includes("-preview.")
  ? "cloudflare-preview-read-only"
  : hostname.includes("-staging.")
    ? "cloudflare-staging-read-only"
    : "cloudflare-production-read-only";

const report = {
  schemaVersion: 1,
  mode,
  baseUrl,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  status: "running",
  checks: [],
};

async function check(path, { authenticated = true, validate }) {
  if (authenticated && !apiKey && !readOnlyKey)
    throw new Error(`${path} exige credencial técnica para um monitor autenticado.`);
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: controller.signal,
      headers: authenticated
        ? readOnlyKey
          ? { "x-qa-readonly-key": readOnlyKey }
          : { "x-api-key": apiKey }
        : {},
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("json")
      ? await response.json()
      : await response.text();
    if (!response.ok)
      throw new Error(`${path} respondeu HTTP ${response.status}`);
    if (!validate(body, contentType))
      throw new Error(`${path} respondeu um contrato inesperado`);
    report.checks.push({
      path,
      status: "passed",
      httpStatus: response.status,
      latencyMs: Math.round(performance.now() - started),
    });
  } finally {
    clearTimeout(timeout);
  }
}

try {
  await check("/api/health", {
    authenticated: false,
    validate: (body) => body?.ok === true,
  });
  if (apiKey || readOnlyKey) {
    await check("/api/auth/status", {
      validate: (body) => body?.authenticated === true,
    });
    await check("/api/dashboard", {
      validate: (body) =>
        body &&
        Array.isArray(body.volume) &&
        Array.isArray(body.recentCampaigns) &&
        typeof body.sent30d === "number",
    });
  }
  await check("/", {
    authenticated: false,
    validate: (body, contentType) =>
      contentType.includes("text/html") &&
      typeof body === "string" &&
      body.includes('id="root"'),
  });
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error =
    error instanceof Error ? error.message.slice(0, 500) : "falha desconhecida";
} finally {
  report.finishedAt = new Date().toISOString();
  const output = resolve(reportDir, "remote-health.json");
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  chmodSync(output, 0o600);
}

if (report.status !== "passed") {
  console.error(`Monitor remoto reprovado: ${report.error}`);
  process.exit(1);
}
console.log(
  `Monitor remoto aprovado: ${report.checks.length} contratos read-only em ${report.mode}${apiKey || readOnlyKey ? " com autenticação técnica" : " no perímetro público"}.`,
);
