import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const metadata = JSON.parse(readFileSync(resolve(root, "release", "migrations.json"), "utf8"));
if (!Number.isInteger(metadata.schemaVersion) || metadata.schemaVersion < 1) throw new Error("schemaVersion inválida");
if (!Array.isArray(metadata.migrations) || metadata.migrations.length === 0) throw new Error("A release não declara migrations");
let expected = 0;
const checksums = [];
for (const migration of metadata.migrations) {
  if (migration.fromSchema !== expected || migration.toSchema !== expected + 1) throw new Error(`Sequência de schema inválida em ${migration.file}`);
  if (typeof migration.compatibleWithPreviousCode !== "boolean" || typeof migration.downtimeRequired !== "boolean" || typeof migration.destructive !== "boolean") throw new Error(`Metadados incompletos em ${migration.file}`);
  if (!Array.isArray(migration.prechecks) || !migration.prechecks.length || !Array.isArray(migration.postchecks) || !migration.postchecks.length || !migration.recovery) throw new Error(`Precheck, postcheck ou recuperação ausente em ${migration.file}`);
  const path = migration.file === "0001_fresh_install.sql" ? resolve(root, metadata.baseline) : resolve(root, "fork-migrations", migration.file);
  if (!existsSync(path)) throw new Error(`Migration ausente: ${migration.file}`);
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(String(migration.sha256 || "")) || migration.sha256 !== sha256) throw new Error(`Checksum divergente em ${migration.file}`);
  checksums.push({ file: migration.file, sha256 });
  expected = migration.toSchema;
}
if (expected !== metadata.schemaVersion) throw new Error("schemaVersion não corresponde à última migration");
console.log(JSON.stringify({ ok: true, schemaVersion: expected, migrations: checksums }, null, 2));
