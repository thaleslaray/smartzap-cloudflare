import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { classifyWorkersBuildBranch, expectedWorkerForAction, workersBuildCommandForBranch } from "../scripts/lib/workers-build-policy.mjs";

const build = (branch: string, connectedWorkerName: string) => workersBuildCommandForBranch(branch, {
  baseInstallId: "smartzap-12ab34cd",
  connectedWorkerName,
});

const temporaryDirectories: string[] = [];
afterEach(() => temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("política fail-closed do Workers Builds", () => {
  it("autoriza produção exclusivamente em main", () => {
    expect(build("main", "smartzap-12ab34cd")).toEqual({ branch: "main", action: "production", workerName: "smartzap-12ab34cd", args: [] });
  });

  it("autoriza recursos físicos de staging somente em staging/*", () => {
    expect(build("staging/rc-19", "smartzap-12ab34cd-staging")).toEqual({ branch: "staging/rc-19", action: "staging", workerName: "smartzap-12ab34cd-staging", args: ["--staging"] });
  });

  it("impede staging no token de produção e produção no token de staging", () => {
    expect(build("staging/rc-19", "smartzap-12ab34cd")).toEqual(expect.objectContaining({ action: "validate-only", args: null, reason: expect.stringContaining("smartzap-12ab34cd-staging") }));
    expect(build("main", "smartzap-12ab34cd-staging")).toEqual(expect.objectContaining({ action: "validate-only", args: null, reason: expect.stringContaining("smartzap-12ab34cd") }));
  });

  it("falha fechada sem identidade do Worker conectado", () => {
    expect(() => build("main", "")).toThrow(/WRANGLER_CI_OVERRIDE_NAME ausente/);
    expect(() => workersBuildCommandForBranch("main", { baseInstallId: "inválido", connectedWorkerName: "smartzap-12ab34cd" })).toThrow(/SMARTZAP_INSTALL_ID/);
    expect(expectedWorkerForAction("smartzap-12ab34cd", "staging")).toBe("smartzap-12ab34cd-staging");
  });

  it("uma proposta sync/* nunca recebe comando de deploy", () => {
    expect(build("sync/v1.0.0-rc.19", "smartzap-12ab34cd")).toEqual(expect.objectContaining({ action: "validate-only", args: null }));
  });

  it("customizações e branches desconhecidas validam sem deploy", () => {
    expect(classifyWorkersBuildBranch("customer/minha-marca").action).toBe("validate-only");
    expect(classifyWorkersBuildBranch("feature/teste").action).toBe("validate-only");
  });

  it("falha fechada quando a Cloudflare não informa a branch", () => {
    expect(() => classifyWorkersBuildBranch("")).toThrow(/WORKERS_CI_BRANCH ausente/);
  });

  it("branches sem deploy não dependem de secrets nem da identidade do Worker", () => {
    expect(workersBuildCommandForBranch("feature/read-only")).toEqual(expect.objectContaining({ action: "validate-only", args: null }));
  });

  it("neutraliza o override de nome do Workers Builds e exige a identidade pós-deploy", () => {
    const deploy = readFileSync(resolve("scripts/fork-deploy.mjs"), "utf8");
    expect(deploy).toContain("buildWranglerChildEnvironment");
    expect(deploy).toContain('"--name", workerName');
    expect(deploy).not.toContain('["--env", "staging"]');
    expect(deploy).toContain("WRANGLER_OUTPUT_FILE_PATH");
    expect(deploy).toContain("assertWranglerDeployIdentity");
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

  it("abre PR cruzado de uma ponte auditável sem tentar reescrever workflows no fork", () => {
    const workflow = readFileSync(resolve(".github/workflows/upstream-sync.yml"), "utf8");
    expect(workflow).toContain('branch="bridge/${VERSION}"');
    expect(workflow).toContain('git ls-remote upstream "refs/heads/${branch}"');
    expect(workflow).toContain('candidate_tree="$(git show -s --format=%T "$candidate_sha")"');
    expect(workflow).toContain('test "$bridge_tree" = "$candidate_tree"');
    expect(workflow).toContain('git merge-base --is-ancestor origin/main "$remote_sha"');
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
