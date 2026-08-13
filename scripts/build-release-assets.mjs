import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { buildReleaseManifest, sha256 } from "./lib/release-assets.mjs";

const tag = String(process.argv[2] || "").trim();
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) throw new Error("Informe uma tag SemVer exata.");
const outputArg = process.argv.find((argument) => argument.startsWith("--output="))?.slice("--output=".length);
const output = resolve(outputArg || `tmp/release-assets/${tag}`);
const allowedOutputRoot = resolve("tmp/release-assets");
const outputRelative = relative(allowedOutputRoot, output);
if (!outputRelative || outputRelative.startsWith("..") || isAbsolute(outputRelative)) {
  throw new Error("A saída deve ser um subdiretório de tmp/release-assets.");
}
const signingKey = process.argv.find((argument) => argument.startsWith("--signing-key="))?.slice("--signing-key=".length)
  || git(["config", "--get", "user.signingkey"]);
if (!signingKey) throw new Error("Chave privada de assinatura não configurada.");

execFileSync("node", ["scripts/verify-release-tag.mjs", tag], { stdio: "inherit" });
const commit = git(["rev-list", "-n", "1", tag]);
const tree = git(["rev-parse", `${tag}^{tree}`]);
const packageJson = JSON.parse(gitBytes(["show", `${tag}:package.json`]).toString("utf8"));
const migrations = JSON.parse(gitBytes(["show", `${tag}:release/migrations.json`]).toString("utf8"));
const generatedAt = git(["show", "-s", "--format=%cI", commit]);
const repository = packageJson.repository?.url || "https://github.com/thaleslaray/smartzap-cloudflare";
const files = git(["ls-tree", "-r", "--name-only", "-z", tag])
  .split("\0")
  .filter(Boolean)
  .map((path) => ({ path, sha256: sha256(gitBytes(["show", `${tag}:${path}`])) }));

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const archiveName = `smartzap-cloudflare-${tag}.tar.gz`;
const archive = gitBytes(["archive", "--format=tar.gz", `--prefix=smartzap-cloudflare-${tag}/`, tag]);
writeFileSync(resolve(output, archiveName), archive);

const manifest = buildReleaseManifest({
  tag,
  version: packageJson.version,
  commit,
  tree,
  repository,
  generatedAt,
  archive: { name: archiveName, sha256: sha256(archive), size: archive.byteLength },
  files,
  migrations,
  node: packageJson.engines?.node || null,
});
const manifestName = `smartzap-cloudflare-${tag}.manifest.json`;
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(resolve(output, manifestName), manifestBytes);

const checksums = [
  `${sha256(archive)}  ${archiveName}`,
  `${sha256(manifestBytes)}  ${manifestName}`,
].join("\n") + "\n";
const sumsPath = resolve(output, "SHA256SUMS");
writeFileSync(sumsPath, checksums);
const signed = spawnSync("ssh-keygen", ["-Y", "sign", "-f", resolve(signingKey), "-n", "file", sumsPath], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (signed.status !== 0) throw new Error(`Falha ao assinar SHA256SUMS: ${signed.stderr || signed.stdout}`);
console.log(JSON.stringify({
  ok: true,
  tag,
  commit,
  tree,
  output,
  artifacts: [archiveName, manifestName, "SHA256SUMS", "SHA256SUMS.sig"],
}, null, 2));

function git(args) {
  return gitBytes(args).toString("utf8").trim();
}

function gitBytes(args) {
  return execFileSync("git", args, { encoding: null, maxBuffer: 256 * 1024 * 1024 });
}
