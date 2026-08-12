import { createHash } from "node:crypto";

export const RELEASE_MANIFEST_KIND = "smartzap-community-release";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function snapshotHash(files) {
  return sha256(files
    .map((file) => `${file.sha256}  ${file.path}`)
    .sort()
    .join("\n"));
}

export function buildReleaseManifest({ tag, version, commit, tree, repository, generatedAt, archive, files, migrations, node }) {
  if (tag !== `v${version}`) throw new Error("A versão do package.json não corresponde à tag.");
  if (!/^[0-9a-f]{40}$/.test(commit) || !/^[0-9a-f]{40}$/.test(tree))
    throw new Error("Commit ou árvore Git inválidos.");
  validateInventory(files);
  if (!archive || !isSafeAssetName(archive.name) || !/^[0-9a-f]{64}$/.test(archive.sha256 || "") || archive.size < 1)
    throw new Error("Pacote da release inválido.");
  return {
    schema: 1,
    kind: RELEASE_MANIFEST_KIND,
    generatedAt,
    release: {
      tag,
      version,
      channel: version.includes("-rc.") ? "rc" : version.includes("-beta.") ? "beta" : "stable",
      repository,
      commit,
      tree,
    },
    requirements: {
      node,
      cloudflare: ["Workers", "D1", "R2", "Queues", "Durable Objects", "Workflows", "Workers AI", "Cron Triggers"],
    },
    archive,
    source: {
      files: files.length,
      snapshotHash: snapshotHash(files),
      inventory: files,
    },
    migrations,
  };
}

export function parseSha256Sums(raw) {
  const entries = new Map();
  for (const line of String(raw).trim().split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})  ([^/][^\n]*)$/);
    if (!match || !isSafeAssetName(match[2])) throw new Error(`Linha SHA256SUMS inválida: ${line}`);
    if (entries.has(match[2])) throw new Error(`Artefato duplicado em SHA256SUMS: ${match[2]}`);
    entries.set(match[2], match[1]);
  }
  if (entries.size === 0) throw new Error("SHA256SUMS está vazio.");
  return entries;
}

export function validateReleaseManifest(manifest, expected = {}) {
  if (manifest?.schema !== 1 || manifest?.kind !== RELEASE_MANIFEST_KIND)
    throw new Error("Manifesto de release inválido.");
  if (expected.tag && manifest.release?.tag !== expected.tag) throw new Error("Tag divergente no manifesto.");
  if (expected.commit && manifest.release?.commit !== expected.commit) throw new Error("Commit divergente no manifesto.");
  if (manifest.release?.tag !== `v${manifest.release?.version}`) throw new Error("Versão divergente no manifesto.");
  if (!Array.isArray(manifest.source?.inventory) || manifest.source.inventory.length !== manifest.source.files)
    throw new Error("Inventário da release incompleto.");
  validateInventory(manifest.source.inventory);
  if (snapshotHash(manifest.source.inventory) !== manifest.source.snapshotHash)
    throw new Error("Checksum agregado do snapshot diverge.");
  if (!/^[0-9a-f]{64}$/.test(manifest.archive?.sha256 || "")) throw new Error("Checksum do pacote inválido.");
  return manifest;
}

function isSafeAssetName(name) {
  return typeof name === "string"
    && name.length > 0
    && name !== "."
    && name !== ".."
    && !name.includes("/")
    && !name.includes("\\")
    && !name.includes("\0");
}

function validateInventory(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error("A release não possui inventário de arquivos.");
  const paths = new Set();
  for (const file of files) {
    if (typeof file?.path !== "string" || !file.path || file.path.startsWith("/") || file.path.includes("\0") || file.path.split("/").includes(".."))
      throw new Error("Caminho inválido no inventário da release.");
    if (!/^[0-9a-f]{64}$/.test(file.sha256 || "")) throw new Error(`Checksum inválido no inventário: ${file.path}`);
    if (paths.has(file.path)) throw new Error(`Arquivo duplicado no inventário: ${file.path}`);
    paths.add(file.path);
  }
}
