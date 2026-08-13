import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const accountId = process.env.SMARTZAP_TEST_ACCOUNT_ID;
if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId))
  throw new Error("Defina SMARTZAP_TEST_ACCOUNT_ID com a conta descartável autorizada.");

const tokenOutput = execFileSync("npx", ["wrangler", "auth", "token"], {
  cwd: repo,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
  stdio: ["ignore", "pipe", "ignore"],
});
const token = tokenOutput.trim().split(/\r?\n/).at(-1)?.trim();
if (!token || token.length < 20) throw new Error("Wrangler não forneceu autorização Cloudflare válida.");

const manifest = JSON.parse(readFileSync(path.join(repo, "tmp", "provisioner-release", "manifest.json"), "utf8"));
if (manifest.schemaVersion !== 2 || manifest.baseline?.name !== "0001_fresh_install.sql" || manifest.upgrades?.length !== 0)
  throw new Error("A release de teste não contém somente o baseline final esperado.");

const name = `smartzap-baseline-autoqa-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex")}`;
let databaseId;
try {
  const created = await api(`/accounts/${accountId}/d1/database`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  databaseId = created.uuid;
  const ledger = `CREATE TABLE smartzap_install_migrations (
    name TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`;
  let atomicFailureObserved = false;
  try {
    await api(`/accounts/${accountId}/d1/database/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify({ batch: [
        { sql: ledger, params: [] },
        ...manifest.baseline.statements.slice(0, 3).map((sql) => ({ sql, params: [] })),
        { sql: "SQL_INVALIDO_PARA_PROVAR_ROLLBACK", params: [] },
      ] }),
    });
  } catch {
    atomicFailureObserved = true;
  }
  const afterFailure = findEvidenceRow(await query(`SELECT
    (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='smartzap_install_migrations') ledger_count,
    (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%') table_count`));
  if (!atomicFailureObserved || Number(afterFailure?.ledger_count) !== 0 || Number(afterFailure?.table_count) !== 0)
    throw new Error(`D1 não comprovou rollback atômico: ${JSON.stringify(afterFailure)}`);

  await api(`/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify({ batch: [
      { sql: ledger, params: [] },
      ...manifest.baseline.statements.map((sql) => ({ sql, params: [] })),
      {
        sql: "INSERT INTO smartzap_install_migrations(name,sha256) VALUES (?, ?)",
        params: [manifest.baseline.name, manifest.baseline.statementsSha256],
      },
    ] }),
  });
  const evidence = await query(`SELECT
    (SELECT COUNT(*) FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations') table_count,
    (SELECT COUNT(*) FROM smartzap_install_migrations) version_count,
    (SELECT name FROM smartzap_install_migrations LIMIT 1) version_name,
    (SELECT COUNT(*) FROM ai_agents) agent_seed_count,
    (SELECT COUNT(*) FROM setup_installation) setup_seed_count`);
  const row = findEvidenceRow(evidence);
  if (Number(row?.table_count) !== 69 || Number(row?.version_count) !== 1
    || row?.version_name !== manifest.baseline.name || Number(row?.agent_seed_count) !== 1
    || Number(row?.setup_seed_count) !== 1)
    throw new Error(`D1 remoto divergiu do baseline final: ${JSON.stringify(row)}`);
  console.log(JSON.stringify({
    status: "passed",
    database: name,
    applicationTables: 68,
    installerLedgerEntries: 1,
    version: row.version_name,
    upgrades: manifest.upgrades.length,
    atomicRollback: "passed",
    cleanup: "pending",
  }, null, 2));
} finally {
  if (databaseId) {
    await api(`/accounts/${accountId}/d1/database/${databaseId}`, { method: "DELETE" });
    console.log(`Cleanup confirmado: D1 descartável ${name} removido.`);
  }
}

async function query(sql, params = []) {
  return api(`/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify({ sql, params }),
  });
}

async function api(route, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${route}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success)
    throw new Error(payload.errors?.[0]?.message || `Cloudflare respondeu HTTP ${response.status}`);
  return payload.result;
}

function findEvidenceRow(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEvidenceRow(item);
      if (found) return found;
    }
  } else if (value && typeof value === "object") {
    if ("table_count" in value) return value;
    for (const nested of Object.values(value)) {
      const found = findEvidenceRow(nested);
      if (found) return found;
    }
  }
  return null;
}
