import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const runRoot = resolve(
  root,
  process.env.QA_REPORT_DIR || `qa/reports/AUTOQA_TEMPLATE_CATEGORIES_${stamp}`,
);
mkdirSync(runRoot, { recursive: true });

function readEnv(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
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

const qa = readEnv(resolve(root, ".dev.vars.qa.local"));
const apiKey = process.env.QA_API_KEY || qa.QA_STAGING_API_KEY;
if (!apiKey) throw new Error("Credencial técnica dedicada do staging ausente.");

const baseEnv = {
  ...process.env,
  QA_API_KEY: apiKey,
  QA_BASE_URL: "https://smartzap-cf-staging.thales2581.workers.dev",
  QA_ALLOW_REAL_META: "1",
  QA_META_SEND_COUNT: "1",
  QA_META_MAX_RUNS_PER_DAY: "10",
};

function run(label, script, extraEnv = {}) {
  const result = spawnSync("node", [script], {
    cwd: root,
    env: { ...baseEnv, ...extraEnv },
    stdio: "inherit",
  });
  if (result.status !== 0)
    throw new Error(`${label} falhou com código ${result.status ?? "desconhecido"}.`);
}

const cases = [
  {
    capability: "utility-static",
    category: "UTILITY",
    name: process.env.QA_META_UTILITY_TEMPLATE_NAME || "hello_world",
    language: process.env.QA_META_UTILITY_TEMPLATE_LANGUAGE || "en_US",
  },
  {
    capability: "marketing-static",
    category: "MARKETING",
    name: process.env.QA_META_MARKETING_TEMPLATE_NAME || "template_20260125_1739",
    language: process.env.QA_META_MARKETING_TEMPLATE_LANGUAGE || "pt_BR",
  },
  {
    capability: "quick-reply",
    category: "MARKETING",
    name: process.env.QA_META_QUICK_REPLY_TEMPLATE_NAME || "template_20260125_1841",
    language: process.env.QA_META_QUICK_REPLY_TEMPLATE_LANGUAGE || "pt_BR",
  },
  {
    capability: "dynamic-url",
    category: "MARKETING",
    name:
      process.env.QA_META_DYNAMIC_URL_TEMPLATE_NAME ||
      "ea_comunidade_assinatura_renovada",
    language: process.env.QA_META_DYNAMIC_URL_TEMPLATE_LANGUAGE || "pt_BR",
    variableMapping: {
      "body.1": { source: "fixed", value: "Cliente de teste" },
      "button.0.1": { source: "fixed", value: "suporte-comunidade" },
    },
  },
  {
    capability: "phone-number",
    category: "UTILITY",
    name:
      process.env.QA_META_PHONE_TEMPLATE_NAME ||
      "qa_suporte_telefone_20260803",
    language: process.env.QA_META_PHONE_TEMPLATE_LANGUAGE || "pt_BR",
  },
];
const requestedCapabilities = new Set(
  String(process.env.QA_META_CASE_FILTER || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const selectedCases = requestedCapabilities.size
  ? cases.filter((item) => requestedCapabilities.has(item.capability))
  : cases;
if (!selectedCases.length)
  throw new Error("QA_META_CASE_FILTER não selecionou nenhum caso conhecido.");
if (
  requestedCapabilities.size &&
  selectedCases.length !== requestedCapabilities.size
)
  throw new Error("QA_META_CASE_FILTER contém caso desconhecido.");

const summary = {
  schemaVersion: 1,
  status: "running",
  startedAt: new Date().toISOString(),
  finishedAt: null,
  cases: [],
  callbackRestored: false,
};

let primaryError;
try {
  run("troca de callback para staging", "scripts/qa-meta-callback-switch.mjs", {
    QA_META_CALLBACK_TARGET: "staging",
    QA_REPORT_DIR: resolve(runRoot, "callback-staging"),
  });
  for (const template of selectedCases) {
    const categoryRunId = `AUTOQA_TEMPLATE_${template.capability.replaceAll("-", "_").toUpperCase()}_${stamp}`;
    run(`canário ${template.capability}`, "scripts/qa-meta-canary.mjs", {
      QA_RUN_ID: categoryRunId,
      QA_REPORT_DIR: resolve(runRoot, template.capability),
      QA_META_TEMPLATE_NAME: template.name,
      QA_META_TEMPLATE_LANGUAGE: template.language,
      QA_META_TEMPLATE_CATEGORY: template.category,
      ...(template.variableMapping
        ? { QA_META_VARIABLE_MAPPING: JSON.stringify(template.variableMapping) }
        : {}),
    });
    summary.cases.push({
      capability: template.capability,
      category: template.category,
      name: template.name,
      language: template.language,
      status: "passed",
      runId: categoryRunId,
    });
  }
  summary.status = "passed";
} catch (error) {
  primaryError = error;
  summary.status = "failed";
  summary.error = error instanceof Error ? error.message : "falha desconhecida";
} finally {
  try {
    run("restauração do callback de produção", "scripts/qa-meta-callback-switch.mjs", {
      QA_META_CALLBACK_TARGET: "production",
      QA_REPORT_DIR: resolve(runRoot, "callback-production"),
    });
    summary.callbackRestored = true;
  } catch (error) {
    summary.status = "failed";
    summary.restoreError = error instanceof Error ? error.message : "falha desconhecida";
  }
  summary.finishedAt = new Date().toISOString();
  writeFileSync(resolve(runRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, {
    mode: 0o600,
  });
}

if (summary.status !== "passed" || !summary.callbackRestored) {
  console.error(`Matriz real de templates reprovada. Relatório: ${runRoot}`);
  process.exitCode = 1;
} else {
  console.log(`Matriz real de templates aprovada em ${selectedCases.length}/${selectedCases.length} casos; callback restaurado. Relatório: ${runRoot}`);
}

if (primaryError && !summary.callbackRestored) throw primaryError;
