import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessDatabaseSafety, assertIsolatedResourceNames, INSTALL_GUARD_TABLE, parseWranglerRows } from "./lib/deploy-safety.mjs";

const wranglerPath = resolve(process.cwd(), "wrangler.jsonc");
const { workerName } = assertIsolatedResourceNames(readFileSync(wranglerPath, "utf8"));

function query(command) {
  const output = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["wrangler", "d1", "execute", "DB", "--remote", "--command", command, "--json"],
    { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, CI: "1" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  return parseWranglerRows(output);
}

const tables = query("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;").map((row) => String(row.name));
let guardWorkerName = null;
if (tables.includes(INSTALL_GUARD_TABLE)) {
  guardWorkerName = query(`SELECT worker_name FROM ${INSTALL_GUARD_TABLE} WHERE id='singleton' LIMIT 1;`)[0]?.worker_name ?? null;
}

const assessment = assessDatabaseSafety({ workerName, tables, guardWorkerName });
if (assessment.action === "claim") {
  query(`CREATE TABLE ${INSTALL_GUARD_TABLE} (id TEXT PRIMARY KEY, worker_name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT INTO ${INSTALL_GUARD_TABLE} (id, worker_name) VALUES ('singleton', '${workerName}');`);
  const claimedBy = query(`SELECT worker_name FROM ${INSTALL_GUARD_TABLE} WHERE id='singleton' LIMIT 1;`)[0]?.worker_name;
  if (claimedBy !== workerName) throw new Error("Não foi possível reservar o D1 para esta instalação.");
  console.log("D1 novo reservado com segurança para esta instalação.");
} else {
  console.log("Retomada segura confirmada para o mesmo projeto e D1.");
}
