import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertInstallCanarySnapshot,
  assertInstallHomologationMatrix,
  assertManifestIntegrity,
  buildInstallCanaryManifest,
} from "./lib/install-canary-evidence.mjs";

function value(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name) {
  const found = value(name);
  if (!found) throw new Error(`Parâmetro obrigatório ausente: ${name}`);
  return found;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

const command = process.argv[2];
if (command === "manifest") {
  const manifest = buildInstallCanaryManifest({
    prefix: required("--prefix"),
    release: {
      repository: required("--repository"),
      commit: required("--commit"),
      tag: required("--tag"),
      snapshotSha256: required("--snapshot-sha256"),
    },
  });
  const output = resolve(required("--output"));
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  console.log(`Manifesto sem segredos gravado em ${output}`);
  console.log(`Fingerprint SHA-256: ${manifest.fingerprintSha256}`);
} else if (command === "check") {
  const manifest = assertManifestIntegrity(readJson(required("--manifest")));
  const report = assertInstallCanarySnapshot({
    phase: required("--phase"),
    snapshot: readJson(required("--snapshot")),
    manifest,
  });
  const output = value("--output");
  if (output) writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(`Canário ${report.phase}: ${report.checks.length}/${report.checks.length} verificações aprovadas.`);
} else if (command === "matrix") {
  const report = assertInstallHomologationMatrix(readJson(required("--input")));
  const output = value("--output");
  if (output) writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(`Matriz física: ${report.checks.length}/${report.checks.length} verificações aprovadas.`);
} else {
  throw new Error("Uso: qa-install-canary-evidence.mjs manifest|check|matrix [parâmetros]");
}
