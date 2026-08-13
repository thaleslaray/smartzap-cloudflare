import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(repo, "migrations");
const baselinePath = path.join(repo, "provisioner", "baseline", "0001_fresh_install.sql");
const checkOnly = process.argv.includes("--check");
const temporary = mkdtempSync(path.join(tmpdir(), "smartzap-baseline-"));
const migratedDb = path.join(temporary, "migrated.sqlite");
const baselineDb = path.join(temporary, "baseline.sqlite");

try {
  const migrationNames = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrationNames) applySql(migratedDb, readFileSync(path.join(migrationsDir, name), "utf8"));

  const schema = queryJson(migratedDb, `
    SELECT type,name,sql
    FROM sqlite_master
    WHERE sql IS NOT NULL
      AND name NOT LIKE 'sqlite_%'
    ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 WHEN 'view' THEN 3 ELSE 4 END, name
  `);
  assertKnownSeedTables(migratedDb, schema);
  const generated = [
    "-- SmartZap fresh-install baseline. Generated; do not edit by hand.",
    "-- Source: migrations/0001 through migrations/0051.",
    "PRAGMA foreign_keys = ON;",
    ...schema.map((entry) => `${entry.sql};`),
    "INSERT INTO settings(key,value) VALUES('ai_global_enabled','true');",
    `INSERT INTO ai_agents(id,name,description,instructions,active,is_default)
     VALUES('agent_commercial','Agente Comercial','Respondendo automaticamente',
       'Atenda com objetividade, use apenas a base de conhecimento e encaminhe para uma pessoa quando faltar informação.',1,1);`,
    "INSERT INTO vault_control(id,status,active_key_version) VALUES(1,'idle',1);",
    "INSERT INTO setup_installation(id,status,last_step,revision) VALUES(1,'configuring','infrastructure',1);",
    "",
  ].join("\n");

  if (checkOnly) {
    const committed = readFileSync(baselinePath, "utf8");
    if (committed !== generated) throw new Error("Baseline D1 desatualizado. Execute npm run provisioner:baseline.");
  } else {
    mkdirSync(path.dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, generated);
  }

  applySql(baselineDb, generated);
  const migratedSignature = databaseSignature(migratedDb);
  const baselineSignature = databaseSignature(baselineDb);
  if (migratedSignature !== baselineSignature)
    throw new Error("O baseline não reproduz exatamente o schema e os dados iniciais das migrações históricas.");

  console.log(`Baseline D1 verificado: ${schema.filter((entry) => entry.type === "table").length} tabelas, ${migrationNames.length} migrações incorporadas, sha256 ${digest(generated).slice(0, 12)}…`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function applySql(database, sql) {
  execFileSync("sqlite3", [database], { input: sql, stdio: ["pipe", "pipe", "inherit"] });
}

function queryJson(database, sql) {
  const raw = execFileSync("sqlite3", ["-json", database, sql], { encoding: "utf8" }).trim();
  return raw ? JSON.parse(raw) : [];
}

function databaseSignature(database) {
  const schema = queryJson(database, `
    SELECT type,name,replace(replace(sql,char(10),' '),char(13),' ') sql
    FROM sqlite_master
    WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
    ORDER BY type,name
  `);
  const seeds = {
    settings: queryJson(database, "SELECT key,value FROM settings ORDER BY key"),
    aiAgents: queryJson(database, `SELECT id,name,description,instructions,active,is_default,temperature,max_tokens,debounce_ms,
      rag_similarity_threshold,rag_max_results,handoff_enabled,handoff_instructions FROM ai_agents ORDER BY id`),
    vaultControl: queryJson(database, "SELECT id,status,active_key_version,rotation_id FROM vault_control ORDER BY id"),
    setupInstallation: queryJson(database, "SELECT id,status,last_step,last_error,revision FROM setup_installation ORDER BY id"),
  };
  return JSON.stringify({ schema, seeds });
}

function assertKnownSeedTables(database, schema) {
  const expected = new Set(["settings", "ai_agents", "vault_control", "setup_installation"]);
  const unexpected = [];
  for (const entry of schema.filter((candidate) => candidate.type === "table")) {
    const identifier = `"${String(entry.name).replaceAll('"', '""')}"`;
    const count = Number(queryJson(database, `SELECT COUNT(*) count FROM ${identifier}`)[0]?.count || 0);
    if (count > 0 && !expected.has(entry.name)) unexpected.push(`${entry.name} (${count})`);
  }
  if (unexpected.length > 0)
    throw new Error(`Novos dados iniciais precisam ser declarados no baseline: ${unexpected.join(", ")}`);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
