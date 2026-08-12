import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function validateForkMigrationManifest(root) {
  const manifestPath = resolve(root, "release", "migrations.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) throw new Error("schemaVersion inválida");
  if (!Array.isArray(manifest.migrations) || manifest.migrations.length === 0) throw new Error("A release não declara migrations");

  let expectedSchema = 0;
  const migrations = manifest.migrations.map((migration, index) => {
    if (migration.fromSchema !== expectedSchema || migration.toSchema !== expectedSchema + 1) {
      throw new Error(`Sequência de schema inválida em ${migration.file}`);
    }
    if (typeof migration.compatibleWithPreviousCode !== "boolean" || typeof migration.downtimeRequired !== "boolean" || typeof migration.destructive !== "boolean") {
      throw new Error(`Metadados incompletos em ${migration.file}`);
    }
    if (!Array.isArray(migration.prechecks) || migration.prechecks.length === 0 || !Array.isArray(migration.postchecks) || migration.postchecks.length === 0 || !migration.recovery) {
      throw new Error(`Precheck, postcheck ou recuperação ausente em ${migration.file}`);
    }
    const path = index === 0 ? resolve(root, manifest.baseline) : resolve(root, "fork-migrations", migration.file);
    if (!existsSync(path)) throw new Error(`Migration declarada e ausente: ${migration.file}`);
    const actualSha256 = sha256(path);
    if (!/^[a-f0-9]{64}$/.test(String(migration.sha256 || "")) || migration.sha256 !== actualSha256) {
      throw new Error(`Checksum divergente em ${migration.file}`);
    }
    expectedSchema = migration.toSchema;
    return { ...migration, path, actualSha256 };
  });

  if (expectedSchema !== manifest.schemaVersion) throw new Error("schemaVersion não corresponde à última migration");
  return { ...manifest, migrations };
}

export function assertSchemaTransition({ currentSchema, targetSchema, manifest }) {
  if (!Number.isInteger(currentSchema) || currentSchema < 0) throw new Error("Schema atual inválido");
  if (targetSchema !== manifest.schemaVersion) throw new Error("Schema alvo não corresponde ao manifesto validado");
  if (currentSchema > targetSchema) throw new Error(`Downgrade de schema não suportado: ${currentSchema} → ${targetSchema}`);
  if (currentSchema === targetSchema) return [];
  const pending = manifest.migrations.filter((migration) => migration.toSchema > currentSchema);
  if (pending[0]?.fromSchema !== currentSchema) throw new Error(`Não existe caminho de migration para o schema ${currentSchema}`);
  return pending;
}
