import { validateForkMigrationManifest } from "./lib/fork-migrations.mjs";

const metadata = validateForkMigrationManifest(process.cwd());
console.log(JSON.stringify({
  ok: true,
  schemaVersion: metadata.schemaVersion,
  migrations: metadata.migrations.map((migration) => ({ file: migration.file, sha256: migration.actualSha256 })),
}, null, 2));
