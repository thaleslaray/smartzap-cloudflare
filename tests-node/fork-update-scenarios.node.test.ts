import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("homologação isolada de atualização do fork", () => {
  it("prova patch limpo, customização preservada e conflito sem resolução automática", () => {
    const root = mkdtempSync(join(tmpdir(), "smartzap-update-report-"));
    roots.push(root);
    const reportPath = join(root, "report.json");
    execFileSync(process.execPath, [resolve("scripts/qa-fork-update-scenarios.mjs"), `--report=${reportPath}`], {
      cwd: resolve("."),
      stdio: "pipe",
    });
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(report).toMatchObject({ status: "passed", externalMutation: false });
    expect(report.scenarios.map((scenario: { id: string }) => scenario.id)).toEqual([
      "patch-clean",
      "customization-no-conflict",
      "intentional-conflict",
    ]);
    expect(report.scenarios[1].customizationPreserved).toBe(true);
    expect(report.scenarios[2]).toMatchObject({ automaticResolution: false, previousForkRestored: true });
    expect(report.scenarios[2].unresolved).toContain("app/core.txt");
  });
});
