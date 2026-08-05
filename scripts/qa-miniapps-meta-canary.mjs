import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseUrl = (process.env.QA_BASE_URL || "https://smartzap-cf-staging.thales2581.workers.dev").replace(/\/$/, "");
const reportDir = resolve(root, process.env.QA_REPORT_DIR || `qa/reports/miniapps-meta-${Date.now()}`);
const runId = (process.env.QA_RUN_ID || `AUTOQA_MINI_${Date.now()}_${randomUUID().slice(0, 8)}`)
  .replace(/[^A-Za-z0-9_-]/g, "_");

function readEnv(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    let value = trimmed.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) value = value.slice(1, -1);
    values[trimmed.slice(0, separator).trim()] = value.replaceAll("\\n", "\n");
  }
  return values;
}

const privateQa = readEnv(resolve(root, ".dev.vars.qa.local"));
const apiKey = process.env.QA_API_KEY || privateQa.QA_STAGING_API_KEY;
const allowlist = (process.env.QA_META_ALLOWLIST || privateQa.QA_META_ALLOWLIST || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const recipient = (process.env.QA_META_RECIPIENT || allowlist[0] || "").replace(/\D/g, "");
if (!apiKey) throw new Error("QA_STAGING_API_KEY ausente");
if (!recipient || !allowlist.includes(recipient))
  throw new Error("O destinatário do canário precisa pertencer à allowlist privada de QA");

function maskPhone(value) {
  return value.length > 6 ? `+${value.slice(0, 4)} ${"*".repeat(value.length - 6)}-${value.slice(-2)}` : "[mascarado]";
}

async function api(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      "cache-control": "no-cache",
      ...(init.body ? { "content-type": "application/json", origin: baseUrl } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`${init.method || "GET"} ${path} respondeu HTTP ${response.status}: ${body.error || "erro sem detalhe"}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

const report = {
  runId,
  startedAt: new Date().toISOString(),
  environment: baseUrl,
  recipient: maskPhone(recipient),
  status: "running",
  steps: [],
  artifacts: {},
  cleanup: { status: "pending" },
};
let localFlowId = null;

function step(name, detail = {}) {
  report.steps.push({ name, at: new Date().toISOString(), ...detail });
}

try {
  const health = await api("/api/health");
  if (health.ok !== true) throw new Error("Health de staging não confirmou prontidão");
  step("staging-health", { ok: true });

  const created = await api("/api/flows", {
    method: "POST",
    body: JSON.stringify({
      name: `${runId} MiniApp provider canary`.slice(0, 160),
      definition: {
        screens: [{
          id: "START",
          title: "Validação controlada",
          final: true,
          buttonText: "Concluir",
          blocks: [
            { type: "TextHeading", text: "Teste do MiniApp" },
            { type: "TextBody", text: "Este envio valida publicação, entrega à API e limpeza remota." },
            { type: "TextInput", inputType: "text", name: "answer", label: "Resposta", required: false },
          ],
        }],
      },
      mapping: {},
    }),
  });
  localFlowId = String(created.id || "");
  if (!localFlowId) throw new Error("A API não devolveu o ID local do MiniApp");
  step("local-draft-created", { localFlowHash: createHash("sha256").update(localFlowId).digest("hex") });

  const published = await api(`/api/flows/${encodeURIComponent(localFlowId)}/meta/publish`, {
    method: "POST",
    body: JSON.stringify({ publish: true }),
  });
  const metaStatus = published?.item?.meta_status ?? published?.item?.metaStatus;
  const metaId = published?.item?.meta_id ?? published?.item?.metaId;
  if (metaStatus !== "PUBLISHED" || !metaId)
    throw new Error("A Meta não confirmou o estado PUBLISHED");
  report.artifacts.metaFlowId = String(metaId);
  step("meta-published", {
    metaFlowId: report.artifacts.metaFlowId,
    validationErrors: published.item.validationErrors ?? null,
  });

  const sent = await api(`/api/flows/${encodeURIComponent(localFlowId)}/send`, {
    method: "POST",
    body: JSON.stringify({
      to: recipient,
      mode: "published",
      body: "Teste controlado do MiniApp SmartZap",
      ctaText: "Abrir teste",
      footer: runId,
    }),
  });
  if (!sent.ok || !sent.messageId) throw new Error("A Meta não aceitou o envio do MiniApp");
  report.artifacts.messageId = String(sent.messageId);
  report.artifacts.submissionIdHash = createHash("sha256").update(String(sent.submissionId || "")).digest("hex");
  step("meta-send-accepted", { messageId: report.artifacts.messageId });

  await api(`/api/flows/${encodeURIComponent(localFlowId)}`, { method: "DELETE", body: "{}" });
  localFlowId = null;
  report.cleanup = { status: "passed", remoteAction: "deprecate", localDeleted: true };
  step("cleanup-confirmed", report.cleanup);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : "Falha desconhecida";
  if (localFlowId) {
    try {
      await api(`/api/flows/${encodeURIComponent(localFlowId)}`, { method: "DELETE", body: "{}" });
      report.cleanup = { status: "passed-after-failure", localDeleted: true };
      localFlowId = null;
    } catch (cleanupError) {
      report.cleanup = {
        status: "failed",
        detail: cleanupError instanceof Error ? cleanupError.message : "Falha desconhecida",
      };
    }
  }
} finally {
  report.finishedAt = new Date().toISOString();
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(resolve(reportDir, "miniapps-meta-canary.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

console.log(JSON.stringify({
  runId: report.runId,
  status: report.status,
  recipient: report.recipient,
  metaFlowId: report.artifacts.metaFlowId || null,
  messageId: report.artifacts.messageId || null,
  cleanup: report.cleanup,
  report: resolve(reportDir, "miniapps-meta-canary.json"),
}, null, 2));
if (report.status !== "passed") process.exit(1);
