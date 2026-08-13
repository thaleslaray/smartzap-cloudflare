import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { classifyWorkersBuildBranch, workersBuildCommandForBranch } from "../scripts/lib/workers-build-policy.mjs";

const temporaryDirectories: string[] = [];
afterEach(() => temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("política fail-closed do Workers Builds", () => {
  it("autoriza produção exclusivamente em main", () => {
    expect(workersBuildCommandForBranch("main")).toEqual({ branch: "main", action: "production", args: [] });
  });

  it("autoriza recursos físicos de staging somente em staging/*", () => {
    expect(workersBuildCommandForBranch("staging/rc-19")).toEqual({ branch: "staging/rc-19", action: "staging", args: ["--staging"] });
  });

  it("uma proposta sync/* nunca recebe comando de deploy", () => {
    expect(workersBuildCommandForBranch("sync/v1.0.0-rc.19")).toEqual(expect.objectContaining({ action: "validate-only", args: null }));
  });

  it("customizações e branches desconhecidas validam sem deploy", () => {
    expect(classifyWorkersBuildBranch("customer/minha-marca").action).toBe("validate-only");
    expect(classifyWorkersBuildBranch("feature/teste").action).toBe("validate-only");
  });

  it("falha fechada quando a Cloudflare não informa a branch", () => {
    expect(() => classifyWorkersBuildBranch("")).toThrow(/WORKERS_CI_BRANCH ausente/);
  });
});

describe("corpo auditável do PR de atualização", () => {
  it("congela a âncora aprovada no fork antes de buscar a atualização", () => {
    const workflow = readFileSync(resolve(".github/workflows/upstream-sync.yml"), "utf8");
    expect(workflow).toContain('cp release/allowed_signers "$allowed_signers"');
    expect(workflow).toMatch(/allowedSignersFile="\$allowed_signers"/);
    expect(workflow).not.toContain('git show "${VERSION}:release/allowed_signers"');
    expect(workflow.indexOf('cp release/allowed_signers "$allowed_signers"')).toBeLessThan(
      workflow.indexOf('git fetch --no-tags upstream'),
    );
  });

  it("abre PR cruzado da branch oficial sem tentar reescrever workflows no fork", () => {
    const workflow = readFileSync(resolve(".github/workflows/upstream-sync.yml"), "utf8");
    expect(workflow).toContain('branch="release/${VERSION}"');
    expect(workflow).toContain('git ls-remote upstream "refs/heads/${branch}"');
    expect(workflow).toContain('test "$remote_sha" = "$candidate_sha"');
    expect(workflow).toContain('SMARTZAP_UPDATE_HEAD=${UPSTREAM_OWNER}:${branch}');
    expect(workflow).toContain('--head "$SMARTZAP_UPDATE_HEAD"');
    expect(workflow).not.toMatch(/git push.*origin.*sync\//);
  });

  it("detecta stable diariamente, aceita tag manual e nunca publica no workflow", () => {
    const workflow = readFileSync(resolve(".github/workflows/upstream-sync.yml"), "utf8");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain('repos/${UPSTREAM_REPOSITORY}/releases/latest');
    expect(workflow).toContain("REQUESTED_VERSION:");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).not.toMatch(/wrangler\s+deploy|fork:deploy|merge\s+--auto|gh\s+pr\s+merge/);
  });

  it("mantém um check de pull request separado e sem credencial de escrita", () => {
    const workflow = readFileSync(resolve(".github/workflows/validate-fork.yml"), "utf8");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("name: validar");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).not.toMatch(/wrangler\s+deploy|fork:deploy|contents:\s*write/);
  });

  it("materializa changelog, migrations, incompatibilidades e checklist", () => {
    const directory = mkdtempSync(join(tmpdir(), "smartzap-update-pr-"));
    temporaryDirectories.push(directory);
    const output = join(directory, "body.md");
    execFileSync(process.execPath, [resolve("scripts/generate-update-pr-body.mjs"), "v1.0.0-rc.18", output], { cwd: resolve(".") });
    const body = readFileSync(output, "utf8");
    expect(body).toContain("Changelog desta versão");
    expect(body).toContain("0002_release_history.sql");
    expect(body).toContain("0003_repair_legacy_status_marker.sql");
    expect(body).toContain("Incompatibilidades e atenção");
    expect(body).toContain("staging físico");
    expect(body).toContain("Branches `sync/*` executam validação sem deploy");
    expect(body).not.toMatch(/merge automático|publica produção por conta própria/i);
  });

  it("também extrai corretamente a última seção do changelog", () => {
    const directory = mkdtempSync(join(tmpdir(), "smartzap-update-pr-last-"));
    temporaryDirectories.push(directory);
    const output = join(directory, "body.md");
    execFileSync(process.execPath, [resolve("scripts/generate-update-pr-body.mjs"), "v1.0.0", output], { cwd: resolve(".") });
    expect(readFileSync(output, "utf8")).toContain("Primeira release Community");
  });

  it("recusa tag não SemVer e versão ausente no changelog", () => {
    const script = resolve("scripts/generate-update-pr-body.mjs");
    expect(() => execFileSync(process.execPath, [script, "latest", "/tmp/nao-criar.md"], { cwd: resolve(".") })).toThrow();
    expect(() => execFileSync(process.execPath, [script, "v99.99.99", "/tmp/nao-criar.md"], { cwd: resolve(".") })).toThrow();
  });
});
