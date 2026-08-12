import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { workersBuildCommandForBranch } from "./lib/workers-build-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const policy = workersBuildCommandForBranch(process.env.WORKERS_CI_BRANCH);

if (policy.action === "validate-only") {
  console.log(`Branch ${policy.branch}: ${policy.reason}. Build validado sem criar, migrar ou publicar recursos Cloudflare.`);
  process.exit(0);
}

const script = resolve(root, "scripts", "fork-deploy.mjs");
console.log(policy.action === "production"
  ? "Branch main confirmada: iniciando deploy de produção autogerenciado."
  : `Branch ${policy.branch} confirmada: iniciando staging físico isolado.`);
execFileSync(process.execPath, [script, ...policy.args], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
