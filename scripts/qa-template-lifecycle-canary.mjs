import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseUrl = String(
  process.env.QA_BASE_URL || "https://smartzap-cf-staging.thales2581.workers.dev",
).replace(/\/+$/, "");
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const templateName = `autoqa_lifecycle_${stamp}`;
const reportDir = resolve(
  root,
  process.env.QA_REPORT_DIR || `qa/reports/AUTOQA_TEMPLATE_LIFECYCLE_${stamp}`,
);
mkdirSync(reportDir, { recursive: true });

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
    ) value = value.slice(1, -1);
    values[key] = value.replaceAll("\\n", "\n");
  }
  return values;
}

const qa = readEnv(resolve(root, ".dev.vars.qa.local"));
const apiKey = process.env.QA_API_KEY || qa.QA_STAGING_API_KEY;
if (new URL(baseUrl).hostname !== "smartzap-cf-staging.thales2581.workers.dev")
  throw new Error("O canário de lifecycle só pode executar no staging canônico.");
if (!apiKey) throw new Error("Credencial técnica dedicada do staging ausente.");
if (process.env.QA_ALLOW_REAL_META !== "1")
  throw new Error("Defina QA_ALLOW_REAL_META=1 para autorizar a fixture oficial.");

const report = {
  schemaVersion: 1,
  status: "running",
  startedAt: new Date().toISOString(),
  finishedAt: null,
  environment: "staging",
  provider: "Meta Cloud API",
  template: {
    name: templateName,
    language: "pt_BR",
    category: "UTILITY",
    metaId: null,
    initialStatus: null,
    observedStatuses: [],
  },
  callback: { stagingConfirmed: false, productionRestored: false },
  cleanup: { draftRemoved: false, providerTemplateRemoved: false, localTemplateRemoved: false },
  error: null,
};

function persist() {
  writeFileSync(resolve(reportDir, "template-lifecycle-canary.json"), `${JSON.stringify(report, null, 2)}\n`, {
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
    throw new Error(`Falha ao direcionar callback para ${target}: ${(result.stderr || result.stdout).trim()}`);
}

async function api(path, init = {}, accepted = [200]) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      "cache-control": "no-cache",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("json")
    ? await response.json().catch(() => ({}))
    : await response.text();
  if (!accepted.includes(response.status))
    throw new Error(`${init.method || "GET"} ${path}: HTTP ${response.status} ${JSON.stringify(body)}`);
  return { status: response.status, body };
}

async function currentTemplate() {
  const response = await api("/api/templates");
  return response.body.items.find(
    (item) => item.source === "meta" && item.name === templateName && item.language === "pt_BR",
  ) || null;
}

function observe(item, source) {
  const status = String(item?.status || "UNKNOWN").toUpperCase();
  const previous = report.template.observedStatuses.at(-1);
  if (!previous || previous.status !== status || previous.source !== source) {
    report.template.observedStatuses.push({
      status,
      source,
      observedAt: new Date().toISOString(),
      webhookEventAt: item?.status_event_at ?? null,
      reason: item?.status_reason ?? null,
    });
    persist();
  }
  return status;
}

persist();
let draftId = null;
let submitted = false;
let primaryError = null;
try {
  switchCallback("staging");
  report.callback.stagingConfirmed = true;
  persist();

  const draft = await api(
    "/api/templates/drafts",
    {
      method: "POST",
      body: JSON.stringify({
        name: templateName,
        language: "pt_BR",
        category: "UTILITY",
        components: [
          {
            type: "BODY",
            text: "Sua solicitação de teste técnico do SmartZap foi confirmada.",
          },
          { type: "FOOTER", text: "Fixture automática; não enviar" },
        ],
      }),
    },
    [201],
  );
  draftId = draft.body.id;

  const submission = await api(
    `/api/templates/drafts/${encodeURIComponent(draftId)}/submit`,
    { method: "POST" },
  );
  submitted = true;
  report.template.metaId = typeof submission.body?.result?.id === "string"
    ? submission.body.result.id
    : null;
  report.template.initialStatus = String(submission.body?.result?.status || "PENDING").toUpperCase();
  report.cleanup.draftRemoved = true;
  persist();

  const initial = await currentTemplate();
  if (!initial) throw new Error("Template aceito pela Meta não foi persistido localmente como PENDING.");
  if (observe(initial, "submission") !== report.template.initialStatus)
    throw new Error("Status local inicial divergiu do aceite oficial da Meta.");

  const deadline = Date.now() + Number(process.env.QA_META_LIFECYCLE_TIMEOUT_MS || 600_000);
  let terminal = null;
  while (Date.now() < deadline) {
    const item = await currentTemplate();
    if (!item) throw new Error("Fixture desapareceu antes do encerramento do lifecycle.");
    const source = item.status_event_at ? "official-webhook" : "local-persistence";
    const status = observe(item, source);
    if (["APPROVED", "REJECTED", "PAUSED", "DISABLED"].includes(status)) {
      terminal = { item, status, source };
      break;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000));
  }
  if (!terminal) throw new Error("Meta não produziu estado terminal dentro da janela do canário.");
  if (terminal.status !== "APPROVED")
    throw new Error(`Fixture oficial terminou em ${terminal.status}.`);
  if (terminal.source !== "official-webhook")
    throw new Error("Aprovação observada sem timestamp do webhook oficial.");

  await api(`/api/templates/${encodeURIComponent(templateName)}`, { method: "DELETE" });
  report.cleanup.providerTemplateRemoved = true;
  report.cleanup.localTemplateRemoved = (await currentTemplate()) === null;
  if (!report.cleanup.localTemplateRemoved)
    throw new Error("Fixture removida no provedor permaneceu no catálogo local.");
  report.status = "passed";
} catch (error) {
  primaryError = error;
  report.status = "failed";
  report.error = error instanceof Error ? error.message : "falha desconhecida";
} finally {
  if (draftId && !submitted) {
    try {
      await api(`/api/templates/drafts/${encodeURIComponent(draftId)}`, { method: "DELETE" }, [200, 404]);
      report.cleanup.draftRemoved = true;
    } catch {}
  }
  if (submitted && !report.cleanup.providerTemplateRemoved) {
    try {
      await api(`/api/templates/${encodeURIComponent(templateName)}`, { method: "DELETE" }, [200, 404]);
      report.cleanup.providerTemplateRemoved = true;
      report.cleanup.localTemplateRemoved = (await currentTemplate()) === null;
    } catch {}
  }
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
  console.error(`Canário oficial de lifecycle reprovado. Relatório: ${reportDir}`);
  if (primaryError) console.error(primaryError instanceof Error ? primaryError.message : primaryError);
  process.exitCode = 1;
} else {
  console.log(`Canário oficial de lifecycle aprovado; fixture removida e callback restaurado. Relatório: ${reportDir}`);
}
