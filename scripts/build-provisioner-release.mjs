import { execFileSync } from "node:child_process";
import { createHash as createSha256 } from "node:crypto";
import { readFile, readdir, rm, mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hash as blake3 } from "blake3-wasm";
import { unstable_splitSqlQuery } from "wrangler";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(repo, "tmp", "provisioner-release");
const workerOutput = path.join(output, "files", "worker");
const assetOutput = path.join(output, "files", "assets");

await rm(output, { recursive: true, force: true });
await mkdir(workerOutput, { recursive: true });
await mkdir(assetOutput, { recursive: true });

execFileSync("node", ["scripts/build-d1-baseline.mjs", "--check"], { cwd: repo, stdio: "inherit" });
execFileSync("npm", ["run", "build"], { cwd: repo, stdio: "inherit" });
execFileSync("npx", ["wrangler", "deploy", "--dry-run", "--outdir", workerOutput], { cwd: repo, stdio: "inherit" });

const mainSource = path.join(workerOutput, "index.js");
const main = await describeFile(mainSource, "files/worker/index.js");
const modules = [];
for (const relative of (await walk(workerOutput)).filter((name) => posix(name) !== "index.js" && !name.endsWith("README.md"))) {
  modules.push({
    ...await describeFile(path.join(workerOutput, relative), posix(relative)),
    sourcePath: `files/worker/${posix(relative)}`,
    contentType: "application/javascript+module",
  });
}
const assets = [];
for (const relative of await walk(path.join(repo, "dist", "client"))) {
  const source = path.join(repo, "dist", "client", relative);
  const destination = path.join(assetOutput, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  const described = await describeFile(destination, `/${posix(relative)}`);
  const bytes = await readFile(destination);
  const extension = path.extname(relative).slice(1);
  described.assetHash = blake3(`${bytes.toString("base64")}${extension}`).toString("hex").slice(0, 32);
  described.sourcePath = `files/assets/${posix(relative)}`;
  described.contentType = contentType(relative);
  assets.push(described);
}

const upgrades = [];
const upgradeDir = path.join(repo, "provisioner", "upgrades");
for (const name of (await readdir(upgradeDir)).filter((entry) => entry.endsWith(".sql")).sort()) {
  const sql = await readFile(path.join(upgradeDir, name), "utf8");
  const statements = unstable_splitSqlQuery(sql).map((statement) => statement.trim()).filter(Boolean);
  upgrades.push({
    name,
    sha256: digest(Buffer.from(sql)),
    statementsSha256: digest(Buffer.from(JSON.stringify(statements))),
    statements,
  });
}
const baselineSql = await readFile(path.join(repo, "provisioner", "baseline", "0001_fresh_install.sql"), "utf8");
const baseline = {
  name: "0001_fresh_install.sql",
  sha256: digest(Buffer.from(baselineSql)),
  statements: unstable_splitSqlQuery(baselineSql).map((statement) => statement.trim()).filter(Boolean),
};
baseline.statementsSha256 = digest(Buffer.from(JSON.stringify(baseline.statements)));

const pkg = JSON.parse(await readFile(path.join(repo, "package.json"), "utf8"));
const config = parseWrangler(await readFile(path.join(repo, "wrangler.jsonc"), "utf8"));
const migrationManifest = JSON.parse(await readFile(path.join(repo, "release", "migrations.json"), "utf8"));
const commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
const channel = pkg.version.includes("-rc.") ? "rc" : pkg.version.includes("-beta.") ? "beta" : "stable";
const manifest = {
  schemaVersion: 2,
  version: pkg.version,
  commitSha,
  channel,
  databaseSchemaVersion: migrationManifest.schemaVersion,
  createdAt: new Date().toISOString(),
  compatibilityDate: config.compatibility_date,
  compatibilityFlags: config.compatibility_flags || [],
  main,
  modules: modules.sort((a, b) => a.path.localeCompare(b.path)),
  assets: assets.sort((a, b) => a.path.localeCompare(b.path)),
  baseline,
  upgrades,
};
await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Release autocontida criada em ${output}`);
console.log(`${assets.length} assets, ${modules.length} módulos Worker, 1 baseline final, ${upgrades.length} upgrades, Worker ${main.size} bytes`);

async function describeFile(absolute, manifestPath) {
  const bytes = await readFile(absolute);
  return { path: manifestPath, sha256: digest(bytes), size: bytes.byteLength };
}

async function walk(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path.join(directory, entry.name), relative));
    else if (entry.isFile() && !entry.name.startsWith(".")) result.push(relative);
  }
  return result;
}

function digest(bytes) {
  return createSha256("sha256").update(bytes).digest("hex");
}

function posix(value) {
  return value.split(path.sep).join("/");
}

function contentType(name) {
  const extension = path.extname(name).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json",
  })[extension] || "application/octet-stream";
}

function parseWrangler(raw) {
  return JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""));
}
