import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const reportArgument = process.argv.find((argument) => argument.startsWith("--report="))?.slice("--report=".length);
const reportPath = resolve(reportArgument || "qa/reports/fork-update-scenarios/report.json");
const workspace = mkdtempSync(resolve(tmpdir(), "smartzap-fork-update-"));
const upstream = resolve(workspace, "upstream");

function git(cwd, args, options = {}) {
  if (options.allowFailure) {
    return spawnSync("git", args, { cwd, encoding: "utf8" });
  }
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function configureRepository(cwd) {
  git(cwd, ["config", "user.name", "SmartZap QA"]);
  git(cwd, ["config", "user.email", "qa@invalid.example"]);
}

function commitAll(cwd, message) {
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-m", message]);
  return git(cwd, ["rev-parse", "HEAD"]);
}

function createUpstream() {
  mkdirSync(upstream, { recursive: true });
  git(upstream, ["init", "--initial-branch=main"]);
  configureRepository(upstream);
  mkdirSync(resolve(upstream, "app"), { recursive: true });
  mkdirSync(resolve(upstream, "docs"), { recursive: true });
  writeFileSync(resolve(upstream, "app/core.txt"), "core=1\n");
  writeFileSync(resolve(upstream, "docs/release.txt"), "release=1\n");
  const base = commitAll(upstream, "release: base");
  git(upstream, ["tag", "v1.0.0", base]);

  writeFileSync(resolve(upstream, "app/core.txt"), "core=2\n");
  writeFileSync(resolve(upstream, "docs/release.txt"), "release=2\n");
  const update = commitAll(upstream, "release: patch");
  git(upstream, ["tag", "v1.0.1", update]);
  return { base, update };
}

function cloneAtBase(name, base) {
  const target = resolve(workspace, name);
  git(workspace, ["clone", "--quiet", upstream, target]);
  configureRepository(target);
  git(target, ["checkout", "--quiet", "-B", "main", base]);
  return target;
}

function mergeUpdate(cwd, update) {
  return git(cwd, ["merge", "--no-edit", update], { allowFailure: true });
}

function runClean(base, update) {
  const cwd = cloneAtBase("patch-clean", base);
  const result = mergeUpdate(cwd, update);
  if (result.status !== 0 || readFileSync(resolve(cwd, "app/core.txt"), "utf8") !== "core=2\n") {
    throw new Error("A atualização patch limpa não chegou ao conteúdo oficial esperado.");
  }
  return { id: "patch-clean", status: "passed", mergeExitCode: result.status, head: git(cwd, ["rev-parse", "HEAD"]) };
}

function runCustomized(base, update) {
  const cwd = cloneAtBase("customization-no-conflict", base);
  mkdirSync(resolve(cwd, "customer"), { recursive: true });
  writeFileSync(resolve(cwd, "customer/branding.txt"), "brand=cliente\n");
  commitAll(cwd, "customer: branding");
  const result = mergeUpdate(cwd, update);
  const preserved = readFileSync(resolve(cwd, "customer/branding.txt"), "utf8") === "brand=cliente\n";
  const updated = readFileSync(resolve(cwd, "app/core.txt"), "utf8") === "core=2\n";
  if (result.status !== 0 || !preserved || !updated) {
    throw new Error("A atualização sem conflito não preservou a customização do proprietário.");
  }
  return { id: "customization-no-conflict", status: "passed", mergeExitCode: result.status, customizationPreserved: preserved };
}

function runIntentionalConflict(base, update) {
  const cwd = cloneAtBase("intentional-conflict", base);
  writeFileSync(resolve(cwd, "app/core.txt"), "core=cliente\n");
  const customerHead = commitAll(cwd, "customer: customize core");
  const result = mergeUpdate(cwd, update);
  const unresolved = git(cwd, ["diff", "--name-only", "--diff-filter=U"]).split(/\r?\n/).filter(Boolean);
  const conflictMarkersPresent = readFileSync(resolve(cwd, "app/core.txt"), "utf8").includes("<<<<<<< HEAD");
  if (result.status === 0 || !unresolved.includes("app/core.txt") || !conflictMarkersPresent) {
    throw new Error("O conflito intencional não interrompeu a atualização para decisão humana.");
  }
  git(cwd, ["merge", "--abort"]);
  const restored = git(cwd, ["rev-parse", "HEAD"]) === customerHead
    && readFileSync(resolve(cwd, "app/core.txt"), "utf8") === "core=cliente\n";
  if (!restored) throw new Error("O cancelamento do conflito não restaurou o fork anterior.");
  return {
    id: "intentional-conflict",
    status: "passed",
    mergeExitCode: result.status,
    unresolved,
    automaticResolution: false,
    previousForkRestored: restored,
  };
}

try {
  const refs = createUpstream();
  const scenarios = [runClean(refs.base, refs.update), runCustomized(refs.base, refs.update), runIntentionalConflict(refs.base, refs.update)];
  const report = {
    schema: 1,
    kind: "smartzap-fork-update-scenarios",
    status: "passed",
    isolation: "temporary-local-git-repositories",
    externalMutation: false,
    scenarios,
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Cenários de atualização aprovados: ${scenarios.length}/3. Relatório: ${reportPath}\n`);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
