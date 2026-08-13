import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { resolveQaStagingAuthHeaders } from "./lib/qa-staging-auth.mjs";

const root = resolve(import.meta.dirname, "..");
const reportDir = resolve(
  root,
  process.env.QA_REPORT_DIR || "qa/reports/cleanup-standalone",
);
const stagingMode =
  process.env.QA_CLEANUP_MODE === "staging" ||
  existsSync(resolve(reportDir, "meta-canary.json")) ||
  (() => {
    try {
      return (
        JSON.parse(readFileSync(resolve(reportDir, "ai-eval.json"), "utf8"))
          .mode === "cloudflare-staging"
      );
    } catch {
      return false;
    }
  })();
mkdirSync(reportDir, { recursive: true });

function readEnv(path) {
  const values = {};
  if (!existsSync(path)) return values;
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
    values[key] = value;
  }
  return values;
}

function redact(value) {
  return String(value ?? "")
    .replace(/\b(?:\+?55)?\d{10,11}\b/g, "[TELEFONE_MASCARADO]")
    .replace(
      /\b(?:token|secret|password|api[_ -]?key)\s*[:=]\s*\S+/gi,
      "[SEGREDO_REDACTED]",
    )
    .slice(0, 2_000);
}

function uuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

async function d1(sql) {
  const child = spawn(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "smartzap-staging",
      "--config",
      "config/wrangler.staging.jsonc",
      "--remote",
      "--json",
      "--command",
      sql,
    ],
    { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise((resolveExit) => {
    child.on("close", (exitCode) => resolveExit(exitCode ?? 1));
    child.on("error", () => resolveExit(1));
  });
  if (code !== 0)
    throw new Error(`D1 remoto falhou: ${redact(stderr || stdout)}`);
  return JSON.parse(stdout).flatMap((entry) => entry.results || []);
}

function walkJson(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walkJson(path));
    else if (entry.endsWith(".json")) files.push(path);
  }
  return files;
}

const report = {
  schemaVersion: 1,
  mode: stagingMode ? "cloudflare-staging" : "local",
  startedAt: new Date().toISOString(),
  finishedAt: null,
  status: "running",
  actions: [],
  errors: [],
  residue: {},
};

const stateRoot = resolve(root, "qa/.state");
if (existsSync(stateRoot)) {
  const currentRun = process.env.QA_RUN_ID
    ?.replace(/[^A-Za-z0-9_-]/g, "_");
  if (currentRun) {
    for (const stateEntry of readdirSync(stateRoot)) {
      if (!stateEntry.startsWith(`${currentRun}-`)) continue;
      const statePath = resolve(stateRoot, stateEntry);
      if (!statePath.startsWith(`${stateRoot}/`))
        throw new Error("Caminho de cleanup fora de qa/.state");
      rmSync(statePath, { recursive: true, force: true });
      report.actions.push({
        type: "local_state_removed",
        path: `qa/.state/${stateEntry}`,
      });
    }
  } else {
    rmSync(stateRoot, { recursive: true, force: true });
    report.actions.push({ type: "local_state_sweep", path: "qa/.state" });
  }
}
mkdirSync(stateRoot, { recursive: true });

if (stagingMode) {
  const runtime = readEnv(resolve(root, ".dev.vars"));
  const qaRuntime = readEnv(resolve(root, ".dev.vars.qa.local"));
  const authHeaders = resolveQaStagingAuthHeaders({
    mutationKey:
      process.env.QA_STAGING_MUTATION_API_KEY ||
      qaRuntime.QA_STAGING_MUTATION_API_KEY,
    stagingApiKey:
      process.env.QA_STAGING_API_KEY || qaRuntime.QA_STAGING_API_KEY,
    apiKey: process.env.QA_API_KEY || runtime.SMARTZAP_API_KEY,
  });
  const baseUrl = (
    process.env.QA_BASE_URL ||
    "https://smartzap-cf-staging.thales2581.workers.dev"
  ).replace(/\/+$/, "");
  if (
    new URL(baseUrl).hostname !== "smartzap-cf-staging.thales2581.workers.dev"
  )
    throw new Error("Cleanup mutante só pode apontar para o staging.");
  async function api(path, init = {}, accepted = [200]) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("json")
      ? await response.json()
      : await response.text();
    if (!accepted.includes(response.status))
      throw new Error(
        `${init.method || "GET"} ${path}: HTTP ${response.status} ${redact(JSON.stringify(body))}`,
      );
    return { status: response.status, body };
  }

  const sources =
    process.env.QA_CLEANUP_SWEEP === "1"
      ? walkJson(resolve(root, "qa/reports"))
      : walkJson(reportDir);
  const artifacts = {
    agents: new Set(),
    documents: new Set(),
    campaigns: new Set(),
    contacts: new Set(),
    tags: new Set(),
  };
  for (const path of sources) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    for (const id of parsed.artifacts?.agents || [])
      if (uuid(id)) artifacts.agents.add(id);
    for (const id of parsed.artifacts?.documents || [])
      if (uuid(id)) artifacts.documents.add(id);
    if (uuid(parsed.documentId)) artifacts.documents.add(parsed.documentId);
    for (const item of parsed.artifacts?.campaigns || [])
      if (item?.created && uuid(item.id)) artifacts.campaigns.add(item.id);
    for (const item of parsed.artifacts?.contacts || [])
      if (item?.created && uuid(item.id)) artifacts.contacts.add(item.id);
    const tag = parsed.artifacts?.tag;
    if (tag?.created && uuid(tag.id)) artifacts.tags.add(tag.id);
  }
  if (process.env.QA_CLEANUP_SWEEP === "1") {
    try {
      const [agents, documents, campaigns, contacts, tags] = await Promise.all([
        d1("SELECT id FROM ai_agents WHERE name LIKE 'AUTOQA%';"),
        d1("SELECT id FROM knowledge_documents WHERE name LIKE 'AUTOQA%' AND status <> 'deleted';"),
        d1("SELECT id FROM campaigns WHERE name LIKE '[PILOT REAL] AUTOQA%';"),
        d1("SELECT id FROM contacts WHERE name LIKE 'AUTOQA%';"),
        d1("SELECT id FROM tags WHERE name LIKE 'AUTOQA %';"),
      ]);
      for (const row of agents)
        if (uuid(row.id)) artifacts.agents.add(row.id);
      for (const row of documents)
        if (uuid(row.id)) artifacts.documents.add(row.id);
      for (const row of campaigns)
        if (uuid(row.id)) artifacts.campaigns.add(row.id);
      for (const row of contacts)
        if (uuid(row.id)) artifacts.contacts.add(row.id);
      for (const row of tags)
        if (uuid(row.id)) artifacts.tags.add(row.id);
      report.actions.push({
        type: "orphan_sweep_discovery",
        counts: {
          agents: agents.length,
          documents: documents.length,
          campaigns: campaigns.length,
          contacts: contacts.length,
          tags: tags.length,
        },
      });
    } catch (error) {
      report.errors.push(redact(error.message));
    }
  }

  for (const id of artifacts.agents) {
    try {
      await api(`/api/agents/${id}`, { method: "DELETE" }, [200, 404]);
      report.actions.push({ type: "agent_removed", id });
    } catch (error) {
      report.errors.push(redact(error.message));
    }
  }
  for (const id of artifacts.documents) {
    try {
      await api(`/api/knowledge/documents/${id}`, { method: "DELETE" }, [200, 404]);
      report.actions.push({ type: "document_removed", id });
    } catch (error) {
      report.errors.push(redact(error.message));
    }
  }
  for (const id of artifacts.campaigns) {
    try {
      const current = await api(`/api/campaigns/${id}`, {}, [200, 404]);
      if (
        current.status === 200 &&
        ["scheduled", "sending", "paused"].includes(current.body.status)
      )
        await api(
          `/api/campaigns/${id}/cancel`,
          { method: "POST", body: "{}" },
          [200, 409],
        );
      await api(`/api/campaigns/${id}`, { method: "DELETE" }, [200, 404]);
      report.actions.push({ type: "campaign_removed", id });
    } catch (error) {
      report.errors.push(redact(error.message));
    }
  }
  if (artifacts.contacts.size) {
    try {
      await api("/api/contacts/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: [...artifacts.contacts] }),
      });
      report.actions.push({
        type: "contacts_removed",
        count: artifacts.contacts.size,
      });
    } catch (error) {
      report.errors.push(redact(error.message));
    }
  }
  for (const id of artifacts.tags) {
    try {
      await api(`/api/contacts/tags/${id}`, { method: "DELETE" }, [200, 404]);
      report.actions.push({ type: "tag_removed", id });
    } catch (error) {
      report.errors.push(redact(error.message));
    }
  }

  if (artifacts.documents.size) {
    const ids = [...artifacts.documents].map((id) => `'${id}'`).join(",");
    try {
      const rows = await d1(
        `DELETE FROM knowledge_documents WHERE id IN (${ids}) AND status='deleted' RETURNING id;`,
      );
      report.actions.push({
        type: "deleted_document_tombstones_removed",
        count: rows.length,
      });
    } catch (error) {
      report.errors.push(redact(error.message));
    }
  }

  try {
    const [agents, documents, contacts, campaigns, tags] = await Promise.all([
      d1("SELECT COUNT(*) AS n FROM ai_agents WHERE name LIKE 'AUTOQA%';"),
      d1("SELECT COUNT(*) AS n FROM knowledge_documents WHERE name LIKE 'AUTOQA%' AND status <> 'deleted';"),
      d1("SELECT COUNT(*) AS n FROM contacts WHERE name LIKE 'AUTOQA%';"),
      d1("SELECT COUNT(*) AS n FROM campaigns WHERE name LIKE '[PILOT REAL] AUTOQA%';"),
      d1("SELECT COUNT(*) AS n FROM tags WHERE name LIKE 'AUTOQA %';"),
    ]);
    report.residue = {
      activeAgents: Number(agents[0]?.n || 0),
      activeDocuments: Number(documents[0]?.n || 0),
      contacts: Number(contacts[0]?.n || 0),
      campaigns: Number(campaigns[0]?.n || 0),
      tags: Number(tags[0]?.n || 0),
    };
    if (Object.values(report.residue).some((count) => count !== 0))
      report.errors.push("Ainda existem artefatos AUTOQA ativos no staging.");
  } catch (error) {
    report.errors.push(redact(error.message));
  }
}

report.status = report.errors.length ? "failed" : "passed";
report.finishedAt = new Date().toISOString();
const outputPath = resolve(reportDir, "cleanup.json");
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
chmodSync(outputPath, 0o600);
if (report.status !== "passed") {
  console.error(`Cleanup reprovado. Relatório: ${outputPath}`);
  process.exit(1);
}
console.log(
  `Cleanup aprovado (${report.mode}); ${report.actions.length} ações registradas.`,
);
