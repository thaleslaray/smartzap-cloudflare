import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSafeDeployArtifact, findForbiddenBuildFiles } from "../scripts/lib/artifact-safety.mjs";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

function artifact() {
  const directory = mkdtempSync(join(tmpdir(), "smartzap-artifact-"));
  directories.push(directory);
  mkdirSync(join(directory, "client"), { recursive: true });
  writeFileSync(join(directory, "client", "index.html"), "ok");
  return directory;
}

describe("segurança do artefato público", () => {
  it("aceita somente artefato com client e sem .dev.vars", () => {
    expect(assertSafeDeployArtifact(artifact())).toBe(true);
  });

  it("localiza .dev.vars em qualquer diretório e recusa o deploy", () => {
    const directory = artifact();
    mkdirSync(join(directory, "smartzap"), { recursive: true });
    writeFileSync(join(directory, "smartzap", ".dev.vars"), "SEGREDO=nao-publicar");
    expect(findForbiddenBuildFiles(directory)).toEqual(["smartzap/.dev.vars"]);
    expect(() => assertSafeDeployArtifact(directory)).toThrow(/Deploy recusado/);
  });

  it("recusa deploy sem build do cliente", () => {
    const directory = mkdtempSync(join(tmpdir(), "smartzap-artifact-"));
    directories.push(directory);
    expect(() => assertSafeDeployArtifact(directory)).toThrow(/dist\/client não existe/);
  });
});
