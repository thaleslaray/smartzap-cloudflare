import { describe, expect, it } from "vitest";
import { buildReleaseManifest, parseSha256Sums, sha256, snapshotHash, validateReleaseManifest } from "../scripts/lib/release-assets.mjs";

const files = [
  { path: "b.txt", sha256: sha256("b") },
  { path: "a.txt", sha256: sha256("a") },
];

function manifestInput() {
  return {
    tag: "v1.2.3-rc.1",
    version: "1.2.3-rc.1",
    commit: "a".repeat(40),
    tree: "b".repeat(40),
    repository: "https://github.com/example/project",
    generatedAt: "2026-08-12T00:00:00Z",
    archive: { name: "project.tar.gz", sha256: "c".repeat(64), size: 42 },
    files,
    migrations: { schemaVersion: 1, migrations: [] },
    node: ">=22",
  };
}

function manifest() {
  return buildReleaseManifest(manifestInput());
}

describe("assets imutáveis da release", () => {
  it("vincula tag, commit, inventário e checksum agregado", () => {
    const value = manifest();
    expect(value.release).toEqual(expect.objectContaining({ tag: "v1.2.3-rc.1", commit: "a".repeat(40), channel: "rc" }));
    expect(value.source.snapshotHash).toBe(snapshotHash(files));
    expect(validateReleaseManifest(value, { tag: "v1.2.3-rc.1", commit: "a".repeat(40) })).toBe(value);
  });

  it("recusa versão, commit e inventário divergentes", () => {
    expect(() => buildReleaseManifest({ ...manifestInput(), tag: "v1.2.4" })).toThrow(/versão/);
    const value = manifest();
    value.source.inventory[0].sha256 = "0".repeat(64);
    expect(() => validateReleaseManifest(value)).toThrow(/snapshot/);
  });

  it("aceita somente SHA256SUMS sem caminhos absolutos ou duplicados", () => {
    expect(parseSha256Sums(`${"a".repeat(64)}  a.tar.gz\n${"b".repeat(64)}  manifest.json\n`).size).toBe(2);
    expect(() => parseSha256Sums(`${"a".repeat(64)}  /tmp/a\n`)).toThrow();
    expect(() => parseSha256Sums(`${"a".repeat(64)}  ../a\n`)).toThrow();
    expect(() => parseSha256Sums(`${"a".repeat(64)}  a\n${"b".repeat(64)}  a\n`)).toThrow(/duplicado/);
  });
});
