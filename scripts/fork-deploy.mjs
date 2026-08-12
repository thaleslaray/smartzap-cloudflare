import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assertSecretInputs,
  buildForkWrangler,
  classifyForkResources,
  deploymentId,
  deploymentResourceNames,
  parseCreatedD1Id,
  parseD1Databases,
  parseQueueNames,
  parseR2BucketNames,
} from "./lib/fork-bootstrap.mjs";
import { buildRollbackCheckpoint, parseActiveDeploymentVersion, parseTimeTravelBookmark } from "./lib/fork-release.mjs";
import { INSTALL_GUARD_TABLE, parseWranglerRows } from "./lib/deploy-safety.mjs";

const root = process.cwd();
const staging = process.argv.includes("--staging");
const baseInstallId = assertSecretInputs(process.env);
const workerName = deploymentId(baseInstallId, staging);
const names = deploymentResourceNames(workerName);
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = String(packageJson.version || "0.0.0");
const commit = gitCommit();
const channel = /-(?:beta)/.test(version) ? "beta" : /-(?:rc)/.test(version) ? "rc" : "stable";
const schemaVersion = releaseSchemaVersion();
const release = { version, commit, channel, schemaVersion };
const workDirectory = resolve(root, ".smartzap");
const configPath = resolve(root, "wrangler.fork.generated.json");
const migrationsDirectory = resolve(workDirectory, "migrations", workerName);
const checkpointsDirectory = resolve(workDirectory, "checkpoints");

mkdirSync(migrationsDirectory, { recursive: true });

function runWrangler(args, options = {}) {
  return execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
    stdio: options.visible ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
  });
}

function gitCommit() {
  return String(process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" })).trim();
}

function releaseSchemaVersion() {
  const manifestPath = resolve(root, "release", "migrations.json");
  if (!existsSync(manifestPath)) return "1";
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return String(manifest.schemaVersion || "1");
}

function ensureD1() {
  const existing = parseD1Databases(runWrangler(["d1", "list", "--json"])).find((database) => database.name === names.database);
  if (existing) return { id: existing.id, created: false };
  const output = runWrangler(["d1", "create", names.database]);
  return { id: parseCreatedD1Id(output), created: true };
}

function listAllQueueNames() {
  const names = [];
  for (let page = 1; page <= 100; page += 1) {
    const output = runWrangler(["queues", "list", "--page", String(page)]);
    const current = parseQueueNames(output);
    if (current.length === 0) break;
    names.push(...current);
  }
  return names;
}

function inspectResourceNames(database) {
  const buckets = parseR2BucketNames(runWrangler(["r2", "bucket", "list"]));
  const queues = listAllQueueNames();
  return classifyForkResources({ database, buckets, queues, names });
}

function queryD1(sql) {
  const output = runWrangler(["d1", "execute", "DB", "--config", configPath, "--remote", "--command", sql, "--json"]);
  return parseWranglerRows(output);
}

function assertOrPrepareDatabase(created) {
  const tables = queryD1("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;").map((row) => String(row.name));
  if (tables.length === 0) {
    if (!created) throw new Error(`O banco ${names.database} já existia, mas não possui o ledger desta instalação. O deploy foi interrompido sem adotá-lo.`);
    queryD1(`CREATE TABLE ${INSTALL_GUARD_TABLE} (id TEXT PRIMARY KEY, worker_name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT INTO ${INSTALL_GUARD_TABLE}(id, worker_name) VALUES ('singleton', '${workerName}');`);
    return;
  }
  if (!tables.includes(INSTALL_GUARD_TABLE)) {
    throw new Error(`O banco ${names.database} já contém dados e não possui o ledger do instalador. O deploy foi interrompido sem alterar o banco.`);
  }
  const owner = queryD1(`SELECT worker_name FROM ${INSTALL_GUARD_TABLE} WHERE id='singleton' LIMIT 1;`)[0]?.worker_name;
  if (owner !== workerName) throw new Error(`O banco ${names.database} pertence a outro Worker. O deploy foi interrompido.`);
  if (created) throw new Error("O D1 recém-criado apresentou conteúdo inesperado. O deploy foi interrompido.");
}

function ensureR2AndQueues(inventory) {
  const existingBuckets = new Set(parseR2BucketNames(runWrangler(["r2", "bucket", "list"])));
  const existingQueues = new Set(listAllQueueNames());
  if (!existingBuckets.has(names.media)) runWrangler(["r2", "bucket", "create", names.media], { visible: true });
  for (const queue of inventory.requiredQueues) if (!existingQueues.has(queue)) runWrangler(["queues", "create", queue], { visible: true });
}

function writeMigrationSet() {
  const baseline = readFileSync(resolve(root, "provisioner", "baseline", "0001_fresh_install.sql"), "utf8");
  const baselineHash = createHash("sha256").update(baseline).digest("hex");
  const escaped = (value) => String(value).replaceAll("'", "''");
  const preamble = [
    `CREATE TABLE IF NOT EXISTS ${INSTALL_GUARD_TABLE} (id TEXT PRIMARY KEY, worker_name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));`,
    `INSERT OR IGNORE INTO ${INSTALL_GUARD_TABLE}(id, worker_name) VALUES ('singleton', '${escaped(workerName)}');`,
    "CREATE TABLE smartzap_release_metadata (id TEXT PRIMARY KEY, version TEXT NOT NULL, commit_sha TEXT NOT NULL, schema_version TEXT NOT NULL, channel TEXT NOT NULL, baseline_sha256 TEXT NOT NULL, installed_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));",
    `INSERT INTO smartzap_release_metadata(id,version,commit_sha,schema_version,channel,baseline_sha256) VALUES ('current','bootstrap','bootstrap','1','bootstrap','${baselineHash}');`,
  ].join("\n");
  writeFileSync(join(migrationsDirectory, "0001_fresh_install.sql"), `${preamble}\n${baseline.trim()}\n`);
  const upgradesDirectory = resolve(root, "fork-migrations");
  if (existsSync(upgradesDirectory)) {
    for (const name of JSON.parse(readFileSync(resolve(root, "release", "migrations.json"), "utf8")).migrations || []) {
      if (name.file === "0001_fresh_install.sql") continue;
      const source = resolve(upgradesDirectory, name.file);
      if (!existsSync(source)) throw new Error(`Migration declarada e ausente: ${name.file}`);
      writeFileSync(join(migrationsDirectory, name.file), readFileSync(source));
    }
  }
}

function captureRollbackCheckpoint(d1Created) {
  if (d1Created) return null;
  const metadataTable = queryD1("SELECT name FROM sqlite_schema WHERE type='table' AND name='smartzap_release_metadata' LIMIT 1;")[0];
  if (!metadataTable) return null;
  const current = queryD1("SELECT version, commit_sha AS commit, schema_version AS schemaVersion, channel FROM smartzap_release_metadata WHERE id='current' LIMIT 1;")[0];
  if (!current || current.version === version && current.commit === commit && String(current.schemaVersion) === schemaVersion) return null;
  const bookmark = parseTimeTravelBookmark(runWrangler(["d1", "time-travel", "info", names.database, "--json"]));
  const versionId = parseActiveDeploymentVersion(runWrangler(["deployments", "list", "--name", workerName, "--json"]));
  const checkpoint = buildRollbackCheckpoint({ workerName, databaseName: names.database, bookmark, versionId, fromRelease: current, toRelease: release });
  mkdirSync(checkpointsDirectory, { recursive: true });
  const checkpointPath = join(checkpointsDirectory, `${workerName}-${Date.now()}.json`);
  writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, { mode: 0o600 });
  console.log(`Checkpoint de rollback salvo em ${checkpointPath}.`);
  return checkpointPath;
}

function applyMigrations() {
  runWrangler(["d1", "migrations", "apply", "DB", "--config", configPath, "--remote"], { visible: true });
  const escaped = (value) => String(value).replaceAll("'", "''");
  queryD1(`UPDATE smartzap_release_metadata SET version='${escaped(version)}', commit_sha='${escaped(commit)}', schema_version='${escaped(schemaVersion)}', channel='${escaped(channel)}', updated_at=datetime('now') WHERE id='current';`);
}

function deploy() {
  const secretPath = join(tmpdir(), `smartzap-secrets-${crypto.randomUUID()}.json`);
  try {
    const secretValues = Object.fromEntries(
      ["MASTER_PASSWORD", "SMARTZAP_VAULT_KEY"].map((name) => [name, process.env[name]]),
    );
    writeFileSync(secretPath, JSON.stringify(secretValues), { mode: 0o600 });
    runWrangler(["deploy", "--config", configPath, "--secrets-file", secretPath, "--keep-vars", "--message", `SmartZap ${version} (${commit.slice(0, 12)})`, "--tag", version.replace(/[^a-zA-Z0-9_-]/g, "-")], { visible: true });
  } finally {
    rmSync(secretPath, { force: true });
  }
}

try {
  const existingDatabase = parseD1Databases(runWrangler(["d1", "list", "--json"])).find((database) => database.name === names.database);
  const inventory = inspectResourceNames(existingDatabase);
  const d1 = ensureD1();
  const template = readFileSync(resolve(root, "wrangler.jsonc"), "utf8");
  writeMigrationSet();
  writeFileSync(configPath, buildForkWrangler(template, { workerName, databaseId: d1.id, migrationsDir: `.smartzap/migrations/${workerName}`, release }));
  assertOrPrepareDatabase(d1.created);
  ensureR2AndQueues(inventory);
  captureRollbackCheckpoint(d1.created);
  applyMigrations();
  deploy();
  console.log(`SmartZap ${version} publicado como ${workerName}. Abra a URL do Worker e conclua /setup.`);
} catch (error) {
  console.error(`Instalação interrompida com segurança: ${error instanceof Error ? error.message : String(error)}`);
  console.error("Os recursos já criados foram preservados para retomada com o mesmo SMARTZAP_INSTALL_ID.");
  process.exitCode = 1;
} finally {
  rmSync(configPath, { force: true });
}
