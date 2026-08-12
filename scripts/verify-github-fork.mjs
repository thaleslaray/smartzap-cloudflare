import { execFileSync } from "node:child_process";
import {
  assertForkBranches,
  assertIndependentForkOwner,
  assertTrueGitHubFork,
  githubForkTarget,
  mainBranchProtection,
  synchronizationRef,
} from "./lib/github-fork.mjs";

const ownerArgument = process.argv.find((argument) => argument.startsWith("--owner="))?.slice("--owner=".length);
const owner = assertIndependentForkOwner(ownerArgument || process.env.SMARTZAP_GITHUB_OWNER);
const prepare = process.argv.includes("--prepare");
const protectMain = process.argv.includes("--protect-main");
const target = githubForkTarget(owner);

function gh(args, options = {}) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
    stdio: options.visible ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
  }).trim();
}

function api(path, method = "GET", fields = []) {
  const args = ["api", path, "--method", method];
  for (const [key, value] of fields) args.push("-f", `${key}=${value}`);
  const output = gh(args);
  return output ? JSON.parse(output) : null;
}

function apiJson(path, method, body) {
  const output = execFileSync("gh", ["api", path, "--method", method, "--input", "-"], {
    encoding: "utf8",
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
    input: JSON.stringify(body),
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  return output ? JSON.parse(output) : null;
}

const repository = api(`repos/${target}`);
const verified = assertTrueGitHubFork(repository, owner);
let branches = api(`repos/${target}/branches?per_page=100`).map((branch) => branch.name);

if (!branches.includes("upstream-sync") && prepare) {
  const mainRef = api(`repos/${target}/git/ref/heads/main`);
  const ref = synchronizationRef(mainRef);
  api(`repos/${target}/git/refs`, "POST", [["ref", ref.ref], ["sha", ref.sha]]);
  branches = api(`repos/${target}/branches?per_page=100`).map((branch) => branch.name);
}

if (protectMain) {
  apiJson(`repos/${target}/branches/main/protection`, "PUT", mainBranchProtection());
}

const branchPolicy = assertForkBranches(branches);
process.stdout.write(`${JSON.stringify({
  kind: "smartzap-github-fork-verification",
  verified: true,
  repository: verified,
  branches: branchPolicy,
  prepared: prepare,
  mainProtected: protectMain,
}, null, 2)}\n`);
