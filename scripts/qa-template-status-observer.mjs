import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseUrl = "https://smartzap-cf-staging.thales2581.workers.dev";
const graphVersion = "v25.0";
const fixtureName = process.env.QA_META_TEMPLATE_NAME || "qa_suporte_telefone_20260803";
const fixtureId = process.env.QA_META_TEMPLATE_ID || "1968130000515411";
const reportDir = resolve(
  root,
  process.env.QA_REPORT_DIR || "qa/reports/AUTOQA_TEMPLATE_STATUS_OBSERVER",
);
mkdirSync(reportDir, { recursive: true });

function readEnv(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) value = value.slice(1, -1);
    values[match[1]] = value.replaceAll("\\n", "\n");
  }
  return values;
}

const runtime = readEnv(resolve(root, ".dev.vars"));
const qa = readEnv(resolve(root, ".dev.vars.qa.local"));
const token = runtime.WHATSAPP_TOKEN;
const apiKey = qa.QA_STAGING_API_KEY;
if (process.env.QA_ALLOW_REAL_META !== "1")
  throw new Error("Defina QA_ALLOW_REAL_META=1 para autorizar a observação oficial.");
if (!token || !apiKey) throw new Error("Credenciais privadas necessárias estão ausentes.");
if (!/^qa_/.test(fixtureName) || !/^\d{5,32}$/.test(fixtureId))
  throw new Error("A observação é restrita a fixture técnica qa_ identificada.");

const report = {
  schemaVersion: 1,
  status: "running",
  startedAt: new Date().toISOString(),
  finishedAt: null,
  environment: "staging",
  fixture: { name: fixtureName, metaId: fixtureId },
  observations: [],
  officialWebhookObserved: false,
  callback: { stagingConfirmed: false, productionRestored: false },
  error: null,
};

function persist() {
  writeFileSync(resolve(reportDir, "template-status-observer.json"), `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
}

function switchCallback(target) {
  const result = spawnSync("node", ["scripts/qa-meta-app-callback-switch.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      QA_API_KEY: apiKey,
      QA_BASE_URL: baseUrl,
      QA_META_CALLBACK_TARGET: target,
      QA_REPORT_DIR: resolve(reportDir, `callback-${target}`),
    },
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error(`Falha ao direcionar callback global para ${target}: ${(result.stderr || result.stdout).trim()}`);
}

async function providerTemplate() {
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${fixtureId}?fields=id,name,status,category,quality_score`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(`Consulta oficial da Meta falhou: HTTP ${response.status}, code=${body?.error?.code ?? "unknown"}.`);
  if (body.name !== fixtureName) throw new Error("ID oficial não pertence à fixture esperada.");
  return body;
}

async function localTemplate() {
  const response = await fetch(`${baseUrl}/api/templates`, {
    headers: { "x-api-key": apiKey, "cache-control": "no-cache" },
  });
  if (!response.ok) throw new Error(`Catálogo de staging respondeu HTTP ${response.status}.`);
  const items = (await response.json()).items;
  return items.find((item) => item.source === "meta" && item.meta_id === fixtureId) || null;
}

persist();
try {
  switchCallback("staging");
  report.callback.stagingConfirmed = true;
  persist();

  const deadline = Date.now() + Number(process.env.QA_META_STATUS_TIMEOUT_MS || 600_000);
  while (Date.now() < deadline) {
    const [provider, local] = await Promise.all([providerTemplate(), localTemplate()]);
    const observation = {
      at: new Date().toISOString(),
      providerStatus: String(provider.status || "UNKNOWN").toUpperCase(),
      localStatus: String(local?.status || "MISSING").toUpperCase(),
      localStatusEventAt: local?.status_event_at ?? null,
    };
    const previous = report.observations.at(-1);
    if (
      !previous ||
      previous.providerStatus !== observation.providerStatus ||
      previous.localStatus !== observation.localStatus ||
      previous.localStatusEventAt !== observation.localStatusEventAt
    ) {
      report.observations.push(observation);
      persist();
    }
    if (
      ["APPROVED", "REJECTED", "PAUSED", "DISABLED"].includes(observation.providerStatus) &&
      observation.localStatus === observation.providerStatus &&
      observation.localStatusEventAt !== null
    ) {
      report.officialWebhookObserved = true;
      report.status = observation.providerStatus === "APPROVED" ? "passed" : "failed";
      if (report.status === "failed") report.error = `Meta encerrou a revisão em ${observation.providerStatus}.`;
      break;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000));
  }
  if (report.status === "running") {
    report.status = "blocked";
    report.error = "Meta manteve a fixture em revisão além da janela de observação.";
  }
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : "falha desconhecida";
} finally {
  try {
    switchCallback("production");
    report.callback.productionRestored = true;
  } catch (error) {
    report.status = "failed";
    report.error = `${report.error ? `${report.error}; ` : ""}callback de produção não restaurado: ${error instanceof Error ? error.message : "falha desconhecida"}`;
  }
  report.finishedAt = new Date().toISOString();
  persist();
}

if (report.status !== "passed" || !report.callback.productionRestored) {
  console.error(`Observação oficial de status não aprovada. Relatório: ${reportDir}`);
  if (report.error) console.error(report.error);
  process.exitCode = 1;
} else {
  console.log(`Status oficial aprovado via webhook no staging; callback restaurado. Relatório: ${reportDir}`);
}
