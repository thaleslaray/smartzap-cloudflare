import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSha256Sums, sha256, validateReleaseManifest } from "./lib/release-assets.mjs";

const tag = String(process.argv[2] || "").trim();
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) throw new Error("Informe uma tag SemVer exata.");
const directoryArg = process.argv.find((argument) => argument.startsWith("--directory="))?.slice("--directory=".length);
const directory = resolve(directoryArg || `tmp/release-assets/${tag}`);
execFileSync("node", ["scripts/verify-release-tag.mjs", tag], { stdio: "inherit" });
const commit = execFileSync("git", ["rev-list", "-n", "1", tag], { encoding: "utf8" }).trim();
const sumsPath = resolve(directory, "SHA256SUMS");
const sumsBytes = readFileSync(sumsPath);
const signature = resolve(directory, "SHA256SUMS.sig");
const verified = spawnSync("ssh-keygen", [
  "-Y", "verify",
  "-f", resolve("release/allowed_signers"),
  "-I", "smartzap-release-signing",
  "-n", "file",
  "-s", signature,
], { input: sumsBytes, encoding: "utf8" });
if (verified.status !== 0) throw new Error(`Assinatura dos checksums inválida: ${verified.stderr || verified.stdout}`);

const checksums = parseSha256Sums(sumsBytes.toString("utf8"));
for (const [name, expected] of checksums) {
  const actual = sha256(readFileSync(resolve(directory, name)));
  if (actual !== expected) throw new Error(`Checksum divergente: ${name}`);
}
const manifestName = [...checksums.keys()].find((name) => name.endsWith(".manifest.json"));
if (!manifestName) throw new Error("Manifesto ausente em SHA256SUMS.");
const manifest = validateReleaseManifest(JSON.parse(readFileSync(resolve(directory, manifestName), "utf8")), { tag, commit });
const archiveChecksum = checksums.get(manifest.archive.name);
if (archiveChecksum !== manifest.archive.sha256) throw new Error("Pacote e manifesto divergem.");
console.log(JSON.stringify({ ok: true, tag, commit, artifacts: checksums.size, signature: "verified", snapshotFiles: manifest.source.files }, null, 2));
