import {
  chmodSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const baseUrl = (
  process.env.QA_BASE_URL ||
  "https://smartzap-cf-staging.thales2581.workers.dev"
).replace(/\/+$/, "");
const hostname = new URL(baseUrl).hostname;
if (hostname !== "smartzap-cf-staging.thales2581.workers.dev")
  throw new Error("A sonda mutante só pode rodar no staging.");

function readEnv(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    )
      value = value.slice(1, -1);
    values[key] = value.replaceAll("\\n", "\n");
  }
  return values;
}

const localSecrets = readEnv(resolve(root, ".dev.vars"));
const apiKey = process.env.QA_API_KEY || localSecrets.SMARTZAP_API_KEY;
if (!apiKey) throw new Error("QA_API_KEY ausente.");

const runId = `AUTOQA_AI_PROBE_${new Date()
  .toISOString()
  .replace(/\D/g, "")
  .slice(0, 14)}_${randomUUID().slice(0, 8)}`;
const reportDir = resolve(root, `qa/reports/${runId}`);
mkdirSync(reportDir, { recursive: true });
const reportPath = resolve(reportDir, "ai-search-probe.json");
const knowledge = readFileSync(resolve(root, "qa/ai-knowledge.md"), "utf8");

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /token|secret|password|api.?key/i.test(key)
          ? "[SEGREDO_REDACTED]"
          : redact(item),
      ]),
    );
  if (typeof value !== "string") return value;
  return value
    .replace(/\b(?:\+?55)?\d{10,11}\b/g, "[TELEFONE_MASCARADO]")
    .slice(0, 10_000);
}

function save(report) {
  writeFileSync(reportPath, `${JSON.stringify(redact(report), null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(reportPath, 0o600);
}

async function api(path, init = {}, accepted = [200]) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!accepted.includes(response.status))
    throw new Error(`${init.method || "GET"} ${path}: HTTP ${response.status}`);
  return body;
}

let documentId;
const report = {
  schemaVersion: 1,
  runId,
  baseUrl,
  startedAt: new Date().toISOString(),
  status: "running",
  documentId: null,
  filteredSearch: null,
  cleanup: "pending",
};
save(report);

try {
  const created = await api(
    "/api/knowledge/documents",
    {
      method: "POST",
      body: JSON.stringify({
        name: `${runId}-base-smartzap.md`,
        mimeType: "text/markdown",
        content: knowledge,
      }),
    },
    [202],
  );
  documentId = created.id;
  report.documentId = documentId;
  save(report);

  const deadline = Date.now() + 240_000;
  let status = "indexing";
  while (Date.now() < deadline) {
    const documents = await api("/api/knowledge/documents");
    const current = documents.items.find((item) => item.id === documentId);
    status = current?.status || "missing";
    if (status === "ready") break;
    if (status === "failed")
      throw new Error(`indexação falhou: ${current?.error_code || "sem código"}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 5_000));
  }
  if (status !== "ready")
    throw new Error(`indexação não concluiu: ${status}`);

  report.filteredSearch = await api("/api/knowledge/search", {
    method: "POST",
    body: JSON.stringify({
      query:
        process.env.QA_PROBE_QUERY ||
        "Qual API do WhatsApp o SmartZap usa e como segmenta contatos?",
    }),
  });
  report.status = "ready-for-direct-comparison";
  save(report);
  console.log(`Sonda pronta para comparação direta: ${documentId}`);
  console.log(`Relatório privado: ${reportPath}`);

  if (process.argv.includes("--hold")) {
    console.log("Envie Enter para remover o artefato temporário.");
    process.stdin.resume();
    await new Promise((resolveWait) => process.stdin.once("data", resolveWait));
    process.stdin.pause();
  }
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  if (documentId) {
    try {
      await api(`/api/knowledge/documents/${documentId}`, {
        method: "DELETE",
      });
      report.cleanup = "passed";
    } catch (error) {
      report.cleanup = "failed";
      report.cleanupError =
        error instanceof Error ? error.message : String(error);
    }
  } else {
    report.cleanup = "not-needed";
  }
  report.finishedAt = new Date().toISOString();
  save(report);
}

if (report.status === "failed" || report.cleanup === "failed") {
  console.error(`Sonda reprovada. Relatório: ${reportPath}`);
  process.exit(1);
}
