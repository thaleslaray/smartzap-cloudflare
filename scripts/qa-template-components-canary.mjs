import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseUrl = "https://smartzap-cf-staging.thales2581.workers.dev";
const graphVersion = "v25.0";
const fixtureName = "qa_suporte_telefone_20260803";
const desiredFooter = "Atendimento SmartZap • fixture AUTOQA v2";
const reportDir = resolve(
  root,
  process.env.QA_REPORT_DIR || "qa/reports/AUTOQA_TEMPLATE_COMPONENTS",
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
  throw new Error("Defina QA_ALLOW_REAL_META=1 para autorizar a edição da fixture oficial.");
if (!token || !apiKey) throw new Error("Credenciais privadas necessárias estão ausentes.");

const report = {
  schemaVersion: 1,
  status: "running",
  startedAt: new Date().toISOString(),
  finishedAt: null,
  environment: "staging",
  provider: "Meta Cloud API",
  fixture: { name: fixtureName, metaId: null, beforeStatus: null, afterStatus: null },
  providerAccepted: false,
  componentWebhookObserved: false,
  callback: { stagingConfirmed: false, productionRestored: false },
  error: null,
};

function persist() {
  writeFileSync(resolve(reportDir, "template-components-canary.json"), `${JSON.stringify(report, null, 2)}\n`, {
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

async function listTemplates() {
  const response = await fetch(`${baseUrl}/api/templates`, {
    headers: { "x-api-key": apiKey, "cache-control": "no-cache" },
  });
  if (!response.ok) throw new Error(`Catálogo de staging respondeu HTTP ${response.status}.`);
  return (await response.json()).items;
}

function footerOf(template) {
  const footer = Array.isArray(template?.components)
    ? template.components.find((component) => String(component?.type).toUpperCase() === "FOOTER")
    : null;
  return typeof footer?.text === "string" ? footer.text : null;
}

persist();
try {
  const fixture = (await listTemplates()).find(
    (item) => item.source === "meta" && item.name === fixtureName && item.language === "pt_BR",
  );
  if (!fixture || fixture.status !== "APPROVED" || !fixture.meta_id)
    throw new Error("Fixture AUTOQA de telefone não está aprovada e identificada no staging.");
  if (footerOf(fixture) === desiredFooter)
    throw new Error("Fixture já contém o rodapé esperado; este canário exige uma mudança real.");
  report.fixture.metaId = fixture.meta_id;
  report.fixture.beforeStatus = fixture.status;
  persist();

  switchCallback("staging");
  report.callback.stagingConfirmed = true;
  persist();

  const components = fixture.components.map((component) =>
    String(component?.type).toUpperCase() === "FOOTER"
      ? { ...component, text: desiredFooter }
      : component,
  );
  const providerResponse = await fetch(
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(fixture.meta_id)}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: fixture.name,
        language: fixture.language,
        category: fixture.category,
        components,
      }),
    },
  );
  const providerBody = await providerResponse.json().catch(() => ({}));
  if (!providerResponse.ok || providerBody.success !== true)
    throw new Error(`Meta recusou edição da fixture: HTTP ${providerResponse.status}, code=${providerBody?.error?.code ?? "unknown"}.`);
  report.providerAccepted = true;
  persist();

  const deadline = Date.now() + Number(process.env.QA_META_COMPONENTS_TIMEOUT_MS || 300_000);
  let observed = null;
  while (Date.now() < deadline) {
    const item = (await listTemplates()).find(
      (candidate) => candidate.source === "meta" && candidate.meta_id === fixture.meta_id,
    );
    if (item && footerOf(item) === desiredFooter) {
      observed = item;
      break;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000));
  }
  if (!observed)
    throw new Error("Componente aceito pela Meta não convergiu pelo webhook no staging.");
  report.componentWebhookObserved = true;
  report.fixture.afterStatus = observed.status;
  report.status = "passed";
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
  console.error(`Canário oficial de componentes reprovado. Relatório: ${reportDir}`);
  if (report.error) console.error(report.error);
  process.exitCode = 1;
} else {
  console.log(`Canário oficial de componentes aprovado; callback restaurado. Relatório: ${reportDir}`);
}
