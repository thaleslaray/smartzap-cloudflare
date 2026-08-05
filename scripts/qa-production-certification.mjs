import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildCertificationManifest,
  evaluateProductionCertification,
} from "./lib/production-certification.mjs";

const root = resolve(import.meta.dirname, "..");
const command = process.argv[2];

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writePrivate(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function commandJson(executable, args) {
  return JSON.parse(execFileSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: "0" },
  }));
}

function cloudflareSnapshot(versionId) {
  return {
    version: commandJson("npx", ["wrangler", "versions", "view", versionId, "--json"]),
    deployments: commandJson("npx", ["wrangler", "deployments", "list", "--json"]),
  };
}

function changedFiles(sourceCommit) {
  return execFileSync("git", ["diff", "--name-only", `${sourceCommit}..HEAD`], {
    cwd: root,
    encoding: "utf8",
  }).split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
}

function runtimeDrift(sourceCommit) {
  const runtimePrefixes = ["app/", "src/", "shared/", "migrations/", "public/"];
  const runtimeFiles = new Set([
    "wrangler.jsonc",
    "vite.config.ts",
    "package-lock.json",
    "config/wrangler.production.jsonc",
  ]);
  return changedFiles(sourceCommit).filter((file) =>
    runtimeFiles.has(file) || runtimePrefixes.some((prefix) => file.startsWith(prefix)),
  );
}

function resolveFromRoot(path) {
  return resolve(root, path);
}

if (!["prepare", "verify"].includes(command))
  throw new Error("Use prepare ou verify.");

const specPath = resolveFromRoot(option("spec", "qa/production-certification.json"));
const spec = readJson(specPath);
const catalogPath = resolveFromRoot(spec.catalog || "jornada.md");
const journeyMarkdown = readFileSync(catalogPath, "utf8");

if (command === "prepare") {
  const outputPath = resolveFromRoot(option(
    "output",
    `qa/reports/AUTOQA_CERT_${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z")}/manifest.json`,
  ));
  const cloudflare = cloudflareSnapshot(spec.release.productionVersion);
  const manifest = buildCertificationManifest({
    root,
    spec,
    journeyMarkdown,
    cloudflareVersion: cloudflare.version,
    cloudflareDeployments: cloudflare.deployments,
    runtimeDrift: runtimeDrift(spec.release.sourceCommit),
  });
  writePrivate(outputPath, manifest);
  const missing = manifest.evidence.filter((entry) => !entry.present).map((entry) => entry.id);
  console.log(`Manifesto preparado com ${manifest.evidence.length - missing.length}/${manifest.evidence.length} evidências presentes.`);
  if (missing.length) console.log(`Pendentes: ${missing.join(", ")}`);
  console.log(`Manifesto: ${outputPath}`);
} else {
  const manifestPath = resolveFromRoot(option("manifest", ""));
  if (!option("manifest")) throw new Error("Informe --manifest <caminho>.");
  const manifest = readJson(manifestPath);
  const outputPath = resolveFromRoot(option(
    "output",
    `${dirname(manifestPath)}/certification-result.json`,
  ));
  const cloudflare = cloudflareSnapshot(manifest.release.productionVersion);
  const result = evaluateProductionCertification({
    root,
    manifest,
    journeyMarkdown,
    liveCloudflare: cloudflare,
    currentRuntimeDrift: runtimeDrift(manifest.release.sourceCommit),
  });
  writePrivate(outputPath, result);
  console.log(`Certificação de produção: ${result.status}.`);
  console.log(`Jornadas ativas aprovadas: ${result.catalog.approvedActive}/${result.catalog.active}.`);
  console.log(`Evidências presentes: ${result.evidence.present}/${result.evidence.required}.`);
  console.log(`Relatório: ${outputPath}`);
  if (result.status !== "passed") process.exitCode = 1;
}
