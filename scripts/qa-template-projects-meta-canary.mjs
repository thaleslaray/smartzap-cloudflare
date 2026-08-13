import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseUrl = String(
  process.env.QA_BASE_URL || "https://smartzap-cf-staging.thales2581.workers.dev",
).replace(/\/+$/, "");
if (new URL(baseUrl).hostname !== "smartzap-cf-staging.thales2581.workers.dev")
  throw new Error("O canário de Projetos/Fábrica só pode operar no staging canônico.");
if (process.env.QA_ALLOW_REAL_META !== "1")
  throw new Error("Defina QA_ALLOW_REAL_META=1 para autorizar a criação oficial temporária.");

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

const qa = readEnv(resolve(root, ".dev.vars.qa.local"));
const apiKey = process.env.QA_API_KEY || qa.QA_STAGING_API_KEY;
if (!apiKey) throw new Error("QA_STAGING_API_KEY ausente.");

const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const runId = `AUTOQA_PROJECTS_META_${stamp}`;
const reportDir = resolve(root, process.env.QA_REPORT_DIR || `qa/reports/${runId}`);
const reportPath = resolve(reportDir, "template-projects-meta-canary.json");
const names = {
  utility: `autoqa_project_utility_${stamp}`,
  marketing: `autoqa_project_marketing_${stamp}`,
};
const report = {
  schemaVersion: 1,
  journey: "PRJ-03",
  runId,
  environment: baseUrl,
  provider: "Meta Cloud API",
  startedAt: new Date().toISOString(),
  finishedAt: null,
  status: "running",
  projectId: null,
  templates: [],
  cleanup: {
    providerTemplatesRemoved: [],
    localProjectRemoved: false,
    residue: null,
  },
  error: null,
};

function persist() {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

async function api(path, init = {}, accepted = [200]) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      "cache-control": "no-cache",
      ...(init.body ? { "content-type": "application/json", origin: baseUrl } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!accepted.includes(response.status))
    throw new Error(`${init.method || "GET"} ${path}: HTTP ${response.status} ${body.error || "sem detalhe"}`);
  return { status: response.status, body };
}

function d1(sql) {
  const output = execFileSync(
    resolve(root, "node_modules/.bin/wrangler"),
    [
      "d1", "execute", "smartzap-staging",
      "--config", "config/wrangler.staging.jsonc",
      "--remote", "--json", "--command", sql,
    ],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(output).flatMap((entry) => entry.results || []);
}

persist();
let primaryError = null;
const submittedNames = new Set();
try {
  const health = await api("/api/health");
  if (health.body.ok !== true) throw new Error("Health de staging não confirmou prontidão.");

  const project = await api(
    "/api/template-projects",
    {
      method: "POST",
      body: JSON.stringify({
        title: `${runId} canários oficiais`,
        strategy: "utility",
        source: "manual",
        prompt: "Canário temporário de homologação oficial da Fábrica.",
      }),
    },
    [201],
  );
  report.projectId = project.body.id;
  persist();

  const fixtures = [
    {
      name: names.utility,
      content: "Olá {{1}}, informamos que o protocolo de atendimento {{2}} foi confirmado com sucesso e está agendado para a data {{3}}. Guarde esta mensagem para sua referência.",
      language: "pt_BR",
      category: "UTILITY",
      variables: { "1": "Ana", "2": "SZ-20260805", "3": "05/08/2026" },
      sampleVariables: { "1": "Ana", "2": "SZ-20260805", "3": "05/08/2026" },
    },
    {
      name: names.marketing,
      content: "Conheça a nova experiência de automação do SmartZap.",
      language: "pt_BR",
      category: "MARKETING",
      variables: {},
      sampleVariables: {},
      footer: { text: "Teste temporário automatizado" },
    },
  ];
  const itemIds = [];
  for (const fixture of fixtures) {
    const item = await api(
      `/api/template-projects/${encodeURIComponent(report.projectId)}/items`,
      { method: "POST", body: JSON.stringify(fixture) },
      [201],
    );
    itemIds.push(item.body.id);
  }

  const submission = await api(
    `/api/template-projects/${encodeURIComponent(report.projectId)}/submit`,
    { method: "POST", body: JSON.stringify({ itemIds }) },
    [200, 207],
  );
  for (const item of submission.body.created || []) submittedNames.add(item.name);
  report.templates = (submission.body.created || []).map((item) => ({
    name: item.name,
    metaId: item.metaId,
    initialStatus: "PENDING",
    terminalStatus: null,
  }));
  persist();
  if (submission.body.created?.length !== 2 || submission.body.failed?.length)
    throw new Error(
      `A rota de Projetos não confirmou os dois aceites oficiais: ${(submission.body.failed || []).map((item) => `${item.name}=${item.error}`).join(", ") || "resultado incompleto"}`,
    );

  const deadline = Date.now() + Number(process.env.QA_META_PROJECT_TIMEOUT_MS || 600_000);
  while (Date.now() < deadline) {
    await api(`/api/template-projects/${encodeURIComponent(report.projectId)}/sync`, { method: "POST", body: "{}" });
    const detail = await api(`/api/template-projects/${encodeURIComponent(report.projectId)}`);
    for (const template of report.templates) {
      const item = detail.body.items.find((candidate) => candidate.name === template.name);
      template.terminalStatus = item?.meta_status || null;
      template.rejectedReason = item?.rejected_reason || null;
    }
    persist();
    if (report.templates.every((template) => ["APPROVED", "REJECTED"].includes(template.terminalStatus))) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000));
  }
  if (!report.templates.every((template) => template.terminalStatus === "APPROVED"))
    throw new Error(
      `Canários não foram aprovados: ${report.templates.map((item) => `${item.name}=${item.terminalStatus || "PENDING"}`).join(", ")}`,
    );
  report.status = "passed";
} catch (error) {
  primaryError = error;
  report.status = "failed";
  report.error = error instanceof Error ? error.message : "falha desconhecida";
} finally {
  for (const name of submittedNames) {
    try {
      await api(`/api/templates/${encodeURIComponent(name)}`, { method: "DELETE" }, [200, 404]);
      report.cleanup.providerTemplatesRemoved.push(name);
    } catch {}
  }
  if (report.projectId && /^[0-9a-f-]{36}$/i.test(report.projectId)) {
    try {
      d1(`DELETE FROM template_projects WHERE id='${report.projectId}';`);
      report.cleanup.localProjectRemoved = true;
      const residue = d1(`SELECT COUNT(*) AS total FROM template_projects WHERE id='${report.projectId}';`);
      report.cleanup.residue = Number(residue[0]?.total || 0);
      if (report.cleanup.residue !== 0) throw new Error("Projeto AUTOQA permaneceu no D1.");
    } catch (error) {
      report.status = "failed";
      report.error = `${report.error ? `${report.error}; ` : ""}cleanup local falhou: ${error instanceof Error ? error.message : "erro desconhecido"}`;
    }
  }
  if (report.cleanup.providerTemplatesRemoved.length !== submittedNames.size) {
    report.status = "failed";
    report.error = `${report.error ? `${report.error}; ` : ""}nem todos os templates oficiais foram removidos`;
  }
  report.finishedAt = new Date().toISOString();
  persist();
}

if (report.status !== "passed") {
  console.error(`Canário real de Projetos/Fábrica reprovado. Relatório: ${reportPath}`);
  if (primaryError) console.error(primaryError instanceof Error ? primaryError.message : primaryError);
  process.exit(1);
}
console.log(`Canário real de Projetos/Fábrica aprovado e removido. Relatório: ${reportPath}`);
