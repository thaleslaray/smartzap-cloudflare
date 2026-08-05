import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseUrl = String(
  process.env.QA_BASE_URL || "https://smartzap-cf-staging.thales2581.workers.dev",
).replace(/\/+$/, "");
if (new URL(baseUrl).hostname !== "smartzap-cf-staging.thales2581.workers.dev")
  throw new Error("O estresse de Projetos/Fábrica só pode operar no staging canônico.");

function readEnv(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1 || line.trim().startsWith("#")) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['\"]|['\"]$/g, "");
  }
  return values;
}

const mutationKey = process.env.QA_STAGING_MUTATION_API_KEY;
const apiKey = process.env.QA_API_KEY || readEnv(resolve(root, ".dev.vars.qa.local")).QA_STAGING_API_KEY;
if (!mutationKey && !apiKey) throw new Error("Credencial mutável de QA do staging ausente.");
const authHeaders = mutationKey
  ? { "x-qa-mutation-key": mutationKey }
  : { "x-api-key": apiKey };
const runId = (process.env.QA_RUN_ID || `AUTOQA_PROJECT_STRESS_${Date.now()}`).replace(/[^A-Za-z0-9_-]/g, "_");
const reportDir = resolve(root, process.env.QA_REPORT_DIR || `qa/reports/${runId}`);
const reportPath = resolve(reportDir, "template-projects-stress.json");
const createdIds = new Set();
const removedIds = new Set();
const report = {
  schemaVersion: 1,
  journey: "PRJ-04",
  runId,
  environment: baseUrl,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  status: "running",
  safeguards: { stagingOnly: true, noMetaMutation: true, exactIdCleanup: true },
  families: [],
  cleanup: { status: "pending", created: 0, removed: 0, residue: null },
  error: null,
};

function save() {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}
async function api(path, init = {}, accepted = [200]) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders,
      "cache-control": "no-cache",
      ...(init.body ? { "content-type": "application/json", origin: baseUrl } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!accepted.includes(response.status))
    throw new Error(`${init.method || "GET"} ${path}: HTTP ${response.status} ${body.error || "sem detalhe"}`);
  return { body, status: response.status, latencyMs: performance.now() - started };
}
function p95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] || 0;
}
async function pool(values, concurrency, worker) {
  const queue = [...values];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const value = queue.shift();
      if (value !== undefined) await worker(value);
    }
  }));
}
async function family(id, run) {
  const started = performance.now();
  try {
    const evidence = await run();
    report.families.push({ id, status: "passed", durationMs: performance.now() - started, evidence });
  } catch (error) {
    report.families.push({ id, status: "failed", durationMs: performance.now() - started, detail: error instanceof Error ? error.message : "falha desconhecida" });
    throw error;
  } finally {
    save();
  }
}
function generatedItems(projectIndex, count = 20) {
  return Array.from({ length: count }, (_, itemIndex) => ({
    name: `autoqa_${String(projectIndex).padStart(3, "0")}_${String(itemIndex).padStart(2, "0")}`,
    content: "Olá {{1}}, sua confirmação técnica está disponível.",
    language: "pt_BR",
    category: "UTILITY",
    variables: { "1": "Ana" },
    sampleVariables: { "1": "Ana" },
  }));
}
async function createDense(index) {
  const result = await api("/api/template-projects/save-generated", {
    method: "POST",
    body: JSON.stringify({
      title: `${runId} ${String(index).padStart(3, "0")}`,
      strategy: "utility",
      prompt: "Carga técnica temporária",
      items: generatedItems(index),
    }),
  }, [201]);
  createdIds.add(result.body.id);
  return result;
}
async function remove(id) {
  if (!createdIds.has(id) || removedIds.has(id)) return;
  await api(`/api/template-projects/${encodeURIComponent(id)}`, { method: "DELETE" }, [200, 404]);
  removedIds.add(id);
}

save();
let primaryError = null;
try {
  const health = await api("/api/health");
  if (health.body.ok !== true) throw new Error("Health de staging não confirmou prontidão.");

  await family("PS-DENSE-CATALOG", async () => {
    const latencies = [];
    await pool(Array.from({ length: 200 }, (_, index) => index), 5, async (index) => {
      const result = await createDense(index);
      latencies.push(result.latencyMs);
    });
    if (createdIds.size !== 200) throw new Error(`Foram criados ${createdIds.size} de 200 projetos.`);
    return { projects: 200, templates: 4_000, createP95Ms: p95(latencies) };
  });

  await family("PS-LIST-P95", async () => {
    const latencies = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const listed = await api("/api/template-projects");
      latencies.push(listed.latencyMs);
      const ids = new Set((listed.body.items || []).map((item) => item.id));
      if ([...createdIds].some((id) => !ids.has(id))) throw new Error("A listagem perdeu projeto criado.");
    }
    const value = p95(latencies);
    if (value > 3_000) throw new Error(`p95 de listagem excedeu 3s: ${value.toFixed(1)}ms.`);
    return { samples: 20, p95Ms: value };
  });

  await family("PS-DETAIL-P95", async () => {
    const ids = [...createdIds].slice(0, 20);
    const latencies = [];
    for (const id of ids) {
      const detail = await api(`/api/template-projects/${encodeURIComponent(id)}`);
      latencies.push(detail.latencyMs);
      if (detail.body.items?.length !== 20) throw new Error("Detalhe não devolveu os 20 templates.");
    }
    const value = p95(latencies);
    if (value > 3_000) throw new Error(`p95 de detalhe excedeu 3s: ${value.toFixed(1)}ms.`);
    return { samples: ids.length, p95Ms: value };
  });

  await family("PS-CONCURRENT-MUTATION", async () => {
    const id = [...createdIds][0];
    const additions = await Promise.all(Array.from({ length: 10 }, (_, index) => api(
      `/api/template-projects/${encodeURIComponent(id)}/items`,
      {
        method: "POST",
        body: JSON.stringify({
          name: `autoqa_concurrent_${index}`,
          content: "Olá {{1}}, a gravação concorrente foi confirmada.",
          language: "pt_BR",
          category: "UTILITY",
          variables: { "1": "Ana" },
        }),
      },
      [201],
    )));
    const renames = await Promise.all(Array.from({ length: 10 }, (_, index) => api(
      `/api/template-projects/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify({ title: `${runId} concorrente ${index}`, strategy: "utility" }) },
    )));
    return {
      additions: additions.length,
      renames: renames.length,
      maxLatencyMs: Math.max(...additions.map((item) => item.latencyMs), ...renames.map((item) => item.latencyMs)),
    };
  });

  await family("PS-LIFECYCLE-20", async () => {
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const project = await api("/api/template-projects", {
        method: "POST",
        body: JSON.stringify({ title: `${runId} ciclo ${cycle}`, strategy: "utility", source: "manual" }),
      }, [201]);
      createdIds.add(project.body.id);
      await api(`/api/template-projects/${project.body.id}/items`, {
        method: "POST",
        body: JSON.stringify(generatedItems(300 + cycle, 1)[0]),
      }, [201]);
      await remove(project.body.id);
    }
    return { cycles: 20 };
  });
  report.status = "passed";
} catch (error) {
  primaryError = error;
  report.status = "failed";
  report.error = error instanceof Error ? error.message : "falha desconhecida";
} finally {
  try {
    await pool([...createdIds], 5, remove);
    const listed = await api("/api/template-projects");
    const ids = new Set((listed.body.items || []).map((item) => item.id));
    report.cleanup = {
      status: [...createdIds].every((id) => removedIds.has(id) && !ids.has(id)) ? "passed" : "failed",
      created: createdIds.size,
      removed: removedIds.size,
      residue: [...createdIds].filter((id) => ids.has(id)).length,
    };
    if (report.cleanup.status !== "passed") report.status = "failed";
  } catch (error) {
    report.cleanup.status = "failed";
    report.status = "failed";
    report.error = `${report.error ? `${report.error}; ` : ""}cleanup falhou: ${error instanceof Error ? error.message : "erro desconhecido"}`;
  }
  report.finishedAt = new Date().toISOString();
  save();
}

if (report.status !== "passed") {
  console.error(`Estresse de Projetos/Fábrica reprovado. Relatório: ${reportPath}`);
  if (primaryError) console.error(primaryError instanceof Error ? primaryError.message : primaryError);
  process.exit(1);
}
console.log(`Estresse de Projetos/Fábrica aprovado e limpo. Relatório: ${reportPath}`);
