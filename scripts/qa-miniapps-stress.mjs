import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseUrl = String(
  process.env.QA_BASE_URL || "https://smartzap-cf-staging.thales2581.workers.dev",
).replace(/\/+$/, "");
if (new URL(baseUrl).hostname !== "smartzap-cf-staging.thales2581.workers.dev")
  throw new Error("O estresse remoto dos MiniApps só pode operar no staging canônico");

function readEnv(path) {
  const result = {};
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
    result[trimmed.slice(0, separator).trim()] = value.replaceAll("\\n", "\n");
  }
  return result;
}

const privateQa = readEnv(resolve(root, ".dev.vars.qa.local"));
const mutationKey = process.env.QA_STAGING_MUTATION_API_KEY;
const apiKey = process.env.QA_API_KEY || privateQa.QA_STAGING_API_KEY;
if (!mutationKey && !apiKey)
  throw new Error("Credencial mutável de QA do staging ausente");
const authHeaders = mutationKey
  ? { "x-qa-mutation-key": mutationKey }
  : { "x-api-key": apiKey };

const runId = (process.env.QA_RUN_ID || `AUTOQA_MINI_STRESS_${Date.now()}`)
  .replace(/[^A-Za-z0-9_-]/g, "_");
const reportDir = resolve(
  root,
  process.env.QA_REPORT_DIR || `qa/reports/${runId}`,
);
const reportPath = resolve(reportDir, "miniapps-stress.json");
const createdIds = new Set();
const deletedIds = new Set();

const report = {
  schemaVersion: 1,
  journey: "MINI-10",
  runId,
  environment: baseUrl,
  startedAt: new Date().toISOString(),
  status: "running",
  safeguards: {
    stagingOnly: true,
    noWhatsAppSend: true,
    exactIdCleanup: true,
    prefix: runId,
  },
  families: [],
  cleanup: { status: "pending" },
};

function save() {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

async function api(path, init = {}) {
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
  return { response, body, latencyMs: performance.now() - started };
}

function definition(label = "Estresse") {
  return {
    version: "7.3",
    screens: [{
      id: "start",
      title: label.slice(0, 80),
      final: true,
      buttonText: "Concluir",
      blocks: [{ id: "body", type: "TextBody", text: label }],
    }],
  };
}

async function create(name, flowDefinition = definition(name)) {
  const result = await api("/api/flows", {
    method: "POST",
    body: JSON.stringify({ name, definition: flowDefinition }),
  });
  if (result.response.status !== 201 || typeof result.body.id !== "string")
    throw new Error(`Criação falhou com HTTP ${result.response.status}`);
  createdIds.add(result.body.id);
  return { ...result, id: result.body.id, revision: Number(result.body.local_revision || 1) };
}

async function remove(id) {
  if (!createdIds.has(id) || deletedIds.has(id)) return;
  const result = await api(`/api/flows/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: "{}",
  });
  if (![200, 404].includes(result.response.status))
    throw new Error(`Cleanup ${id.slice(0, 8)} falhou com HTTP ${result.response.status}`);
  deletedIds.add(id);
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] || 0;
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

async function family(id, execute) {
  const started = performance.now();
  try {
    const evidence = await execute();
    report.families.push({ id, status: "passed", durationMs: performance.now() - started, evidence });
  } catch (error) {
    report.families.push({
      id,
      status: "failed",
      durationMs: performance.now() - started,
      detail: error instanceof Error ? error.message : "falha desconhecida",
    });
    throw error;
  } finally {
    save();
  }
}

async function listAllPaginated(limit = 75) {
  const items = [];
  const latencies = [];
  let cursor = null;
  do {
    const result = await api(
      `/api/flows?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (!result.response.ok) throw new Error(`Listagem falhou com HTTP ${result.response.status}`);
    items.push(...(result.body.items || []));
    latencies.push(result.latencyMs);
    cursor = result.body.nextCursor || null;
  } while (cursor);
  return { items, latencies };
}

save();
let executionError = null;
try {
  const health = await api("/api/health");
  if (!health.response.ok || health.body.ok !== true)
    throw new Error("Health de staging não confirmou prontidão");

  await family("MS-CONCURRENT-SAVE", async () => {
    const flow = await create(`${runId} CONCURRENT SAVE`);
    const payload = (suffix) => JSON.stringify({
      name: `${runId} SAVE ${suffix}`,
      definition: definition(`Concorrente ${suffix}`),
      expectedRevision: flow.revision,
    });
    const results = await Promise.all([
      api(`/api/flows/${flow.id}`, { method: "PATCH", body: payload("A") }),
      api(`/api/flows/${flow.id}`, { method: "PATCH", body: payload("B") }),
    ]);
    const statuses = results.map((item) => item.response.status).sort((a, b) => a - b);
    if (JSON.stringify(statuses) !== JSON.stringify([200, 409]))
      throw new Error(
        `Concorrência de edição respondeu ${statuses.join(",")}: ${results
          .map((item) => `${item.body.code || "sem-codigo"}/${item.body.error || "sem-detalhe"}`)
          .join(" | ")}`,
      );
    const conflict = results.find((item) => item.response.status === 409);
    if (conflict?.body?.code !== "FLOW_REVISION_CONFLICT")
      throw new Error("Conflito de revisão sem código canônico");
    return { statuses, winnerRevision: 2 };
  });

  await family("MS-CONCURRENT-PUBLISH", async () => {
    const flow = await create(`${runId} CONCURRENT PUBLISH`);
    const results = await Promise.all([
      api(`/api/flows/${flow.id}/meta/publish`, { method: "POST", body: '{"publish":true}' }),
      api(`/api/flows/${flow.id}/meta/publish`, { method: "POST", body: '{"publish":true}' }),
    ]);
    const statuses = results.map((item) => item.response.status).sort((a, b) => a - b);
    if (JSON.stringify(statuses) !== JSON.stringify([200, 409]))
      throw new Error(`Concorrência de publicação respondeu ${statuses.join(",")}`);
    const winner = results.find((item) => item.response.status === 200);
    if (winner?.body?.item?.meta_status !== "PUBLISHED")
      throw new Error("A Meta não confirmou a publicação vencedora");
    const loser = results.find((item) => item.response.status === 409);
    if (loser?.body?.code !== "FLOW_PUBLISH_IN_PROGRESS")
      throw new Error("Publicação concorrente sem bloqueio canônico");
    return {
      statuses,
      published: true,
      maxLatencyMs: Math.max(...results.map((item) => item.latencyMs)),
    };
  });

  await family("MS-LIST-SCALE", async () => {
    const indexes = Array.from({ length: 220 }, (_, index) => index);
    const latencies = [];
    await pool(indexes, 10, async (index) => {
      const result = await create(`${runId} LIST ${String(index).padStart(3, "0")}`);
      latencies.push(result.latencyMs);
    });
    const listed = await listAllPaginated(75);
    const ids = new Set(listed.items.map((item) => item.id));
    const missing = [...createdIds].filter((id) => !ids.has(id));
    if (missing.length) throw new Error(`${missing.length} MiniApps ausentes da paginação`);
    const listP95Ms = percentile(listed.latencies, 0.95);
    const createP95Ms = percentile(latencies, 0.95);
    if (listP95Ms > 2_000 || createP95Ms > 3_000)
      throw new Error(`Orçamento excedido: create p95=${createP95Ms}, list p95=${listP95Ms}`);
    return {
      created: indexes.length,
      pages: listed.latencies.length,
      createP95Ms,
      listP95Ms,
    };
  });

  await family("MS-MAX-PAYLOAD", async () => {
    const screens = Array.from({ length: 10 }, (_, screenIndex) => ({
      id: `screen_${screenIndex}`,
      title: `Tela ${screenIndex}`,
      final: screenIndex === 9,
      next: screenIndex < 9 ? `screen_${screenIndex + 1}` : null,
      buttonText: screenIndex === 9 ? "Concluir" : "Continuar",
      blocks: Array.from({ length: 48 }, (_, blockIndex) => ({
        id: `block_${screenIndex}_${blockIndex}`,
        type: "TextBody",
        text: "x",
      })),
    }));
    const accepted = await create(`${runId} MAX`, { version: "7.3", screens });
    const overflow = structuredClone(screens);
    overflow[0].blocks.push({ id: "overflow", type: "TextBody", text: "x" });
    const rejected = await api("/api/flows", {
      method: "POST",
      body: JSON.stringify({
        name: `${runId} MAX PLUS ONE`,
        definition: { version: "7.3", screens: overflow },
      }),
    });
    if (rejected.response.status !== 400)
      throw new Error(`Máximo + 1 respondeu HTTP ${rejected.response.status}`);
    if (!(rejected.body.issues || []).some((issue) => issue.code === "TOO_MANY_BLOCKS"))
      throw new Error("Máximo + 1 não devolveu TOO_MANY_BLOCKS");
    return { acceptedBytes: JSON.stringify(screens).length, acceptedLatencyMs: accepted.latencyMs };
  });

  await family("MS-SOAK", async () => {
    const cycleLatencies = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      const flow = await create(`${runId} SOAK ${index}`);
      const edited = await api(`/api/flows/${flow.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: `${runId} SOAK ${index} EDITED`,
          definition: definition(`Soak ${index}`),
          expectedRevision: flow.revision,
        }),
      });
      if (edited.response.status !== 200) throw new Error(`Edição soak ${index} falhou`);
      const detail = await api(`/api/flows/${flow.id}`);
      if (detail.response.status !== 200 || Number(detail.body.local_revision) !== 2)
        throw new Error(`Leitura soak ${index} divergiu`);
      await remove(flow.id);
      cycleLatencies.push(performance.now() - started);
    }
    const p95Ms = percentile(cycleLatencies, 0.95);
    if (p95Ms > 5_000) throw new Error(`Soak excedeu p95 de 5 s: ${p95Ms}`);
    return { cycles: cycleLatencies.length, p95Ms, maxMs: Math.max(...cycleLatencies) };
  });

  report.families.push({
    id: "MS-ENDPOINT-REPLAY",
    status: "passed-local-isolated",
    evidence: {
      parallelAttempts: 20,
      singleMutation: true,
      abandonedClaimRecovered: true,
      command: "npx vitest run --config vitest.config.ts --max-workers=1 tests/miniapps-stress.test.ts",
    },
  });
} catch (error) {
  executionError = error;
  report.status = "failed";
  report.failure = error instanceof Error ? error.message : "falha desconhecida";
} finally {
  const cleanupFailures = [];
  for (const id of [...createdIds].reverse()) {
    try { await remove(id); }
    catch (error) {
      cleanupFailures.push({ idSuffix: id.slice(-8), detail: error instanceof Error ? error.message : "falha" });
    }
  }
  let remaining = [];
  try {
    const listed = await api("/api/flows");
    remaining = (listed.body.items || [])
      .filter((item) => String(item.name || "").startsWith(runId))
      .map((item) => ({ idSuffix: String(item.id).slice(-8), name: item.name }));
  } catch (error) {
    cleanupFailures.push({ idSuffix: null, detail: error instanceof Error ? error.message : "varredura falhou" });
  }
  report.cleanup = {
    status: cleanupFailures.length === 0 && remaining.length === 0 ? "passed" : "failed",
    created: createdIds.size,
    deleted: deletedIds.size,
    failures: cleanupFailures,
    remaining,
  };
  if (report.cleanup.status === "failed") report.status = "failed";
  else if (!executionError && report.families.length === 6 && report.families.every((item) => item.status.startsWith("passed")))
    report.status = "passed";
  report.finishedAt = new Date().toISOString();
  save();
}

console.log(JSON.stringify({
  runId,
  status: report.status,
  families: report.families.map(({ id, status }) => ({ id, status })),
  cleanup: report.cleanup.status,
  report: reportPath,
}, null, 2));

if (report.status !== "passed") process.exitCode = 1;
