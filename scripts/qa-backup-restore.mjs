import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const spec = JSON.parse(readFileSync(resolve(root, "qa/production-certification.json"), "utf8"));
const backupPath = resolve(root, requiredOption("backup"));
const outputDir = resolve(root, option("output", "qa/reports/AUTOQA_BACKUP_RESTORE_20260805"));
const expectedMigrations = readdirSync(resolve(root, "migrations"))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();
const expectedLatestMigration = expectedMigrations.at(-1);

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function requiredOption(name) {
  const value = option(name);
  if (!value) throw new Error(`Informe --${name} <caminho>.`);
  return value;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sqlite(database, sql, input) {
  const args = ["-json", database];
  if (sql) args.push(sql);
  const result = spawnSync("sqlite3", args, {
    cwd: root,
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || "sqlite3 falhou");
  return result.stdout.trim() ? JSON.parse(result.stdout) : [];
}

if (!existsSync(backupPath) || statSync(backupPath).size < 1)
  throw new Error("Backup SQL ausente ou vazio.");
const backup = readFileSync(backupPath, "utf8");
if (!backup.includes('CREATE TABLE IF NOT EXISTS "d1_migrations"') || !backup.includes(expectedLatestMigration))
  throw new Error(`Exportação não contém o catálogo D1 esperado até ${expectedLatestMigration}.`);

mkdirSync(outputDir, { recursive: true });
const tempRoot = mkdtempSync(join(tmpdir(), "smartzap-d1-restore-"));
const restoredDb = join(tempRoot, "restored.sqlite");
let details;
try {
  sqlite(restoredDb, "", backup);
  const integrity = sqlite(restoredDb, "PRAGMA integrity_check;");
  const foreignKeys = sqlite(restoredDb, "PRAGMA foreign_key_check;");
  const schema = sqlite(restoredDb, `
    SELECT COUNT(*) AS table_count,
           GROUP_CONCAT(name, '|') AS table_names
      FROM (SELECT name FROM sqlite_schema
             WHERE type='table' AND name NOT LIKE 'sqlite_%'
             ORDER BY name);
  `)[0];
  const migrations = sqlite(restoredDb, `
    SELECT COUNT(*) AS migration_count,
           MAX(id) AS latest_migration_id
      FROM d1_migrations;
  `)[0];
  const latest = sqlite(restoredDb, "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1;")[0];
  const schemaHash = createHash("sha256").update(schema.table_names || "").digest("hex");
  const passed = integrity.length === 1 && integrity[0].integrity_check === "ok"
    && foreignKeys.length === 0
    && Number(schema.table_count) > 0
    && Number(migrations.migration_count) === expectedMigrations.length
    && latest?.name === expectedLatestMigration;
  details = {
    schemaVersion: 1,
    kind: "smartzap-d1-backup-restore",
    status: passed ? "passed" : "failed",
    performedAt: new Date().toISOString(),
    release: spec.release,
    source: {
      database: "smartzap",
      exportType: "Cloudflare D1 remote SQL export",
      file: basename(backupPath),
      bytes: statSync(backupPath).size,
      sha256: sha256(backupPath),
    },
    restore: {
      isolation: "banco SQLite temporário local",
      integrityCheck: integrity[0]?.integrity_check || null,
      foreignKeyViolations: foreignKeys.length,
      tableCount: Number(schema.table_count),
      schemaHash,
      migrationCount: Number(migrations.migration_count),
      expectedMigrationCount: expectedMigrations.length,
      latestMigration: latest?.name || null,
      expectedLatestMigration,
    },
    cleanup: { status: "pending" },
    issues: passed ? [] : ["A restauração não satisfez todos os invariantes."],
  };
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
details.cleanup = { status: existsSync(tempRoot) ? "failed" : "passed" };
if (details.cleanup.status !== "passed") {
  details.status = "failed";
  details.issues.push("Ambiente temporário não foi removido.");
}

const detailsPath = resolve(outputDir, "backup-restore-details.json");
const attestationPath = resolve(outputDir, "backup-restore-attestation.json");
writeFileSync(detailsPath, `${JSON.stringify(details, null, 2)}\n`, { mode: 0o600 });
const checks = {
  backupCreated: true,
  hashVerified: Boolean(details.source.sha256),
  restoredInIsolation: details.restore.isolation === "banco SQLite temporário local",
  integrityVerified: details.status === "passed",
  cleanupPassed: details.cleanup.status === "passed",
};
const artifacts = [backupPath, detailsPath].map((path) => ({
  path: path.slice(root.length + 1),
  sha256: sha256(path),
}));
const attestation = {
  schemaVersion: 1,
  kind: "smartzap-certification-attestation",
  evidenceId: "backup-restore",
  status: details.status,
  release: spec.release,
  performedBy: "Codex QA autônomo",
  performedAt: details.performedAt,
  checks,
  artifacts,
  issues: details.issues,
};
writeFileSync(attestationPath, `${JSON.stringify(attestation, null, 2)}\n`, { mode: 0o600 });
console.log(`Restauração D1: ${details.status}; ${details.restore.tableCount} tabelas; ${details.restore.migrationCount} migrações.`);
console.log(`Atestado: ${attestationPath}`);
if (details.status !== "passed") process.exitCode = 1;
