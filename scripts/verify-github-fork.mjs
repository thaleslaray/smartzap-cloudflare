import { execFileSync } from "node:child_process";
import {
  assertForkBranches,
  assertTrueGitHubFork,
  githubForkTarget,
  normalizeGitHubOwner,
  synchronizationRef,
} from "./lib/github-fork.mjs";

const ownerArgument = process.argv.find((argument) => argument.startsWith("--owner="))?.slice("--owner=".length);
const owner = normalizeGitHubOwner(ownerArgument || process.env.SMARTZAP_GITHUB_OWNER);
const prepare = process.argv.includes("--prepare");
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

const authenticatedOwner = gh(["api", "user", "--jq", ".login"]);
if (authenticatedOwner.toLowerCase() === owner.toLowerCase()) {
  throw new Error("O fork precisa pertencer a outra conta ou organização; a origem já pertence ao usuário autenticado.");
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

const branchPolicy = assertForkBranches(branches);
process.stdout.write(`${JSON.stringify({
  kind: "smartzap-github-fork-verification",
  verified: true,
  repository: verified,
  branches: branchPolicy,
  prepared: prepare,
}, null, 2)}\n`);
