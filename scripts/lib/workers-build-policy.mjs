const PRODUCTION_BRANCH = "main";
const STAGING_PATTERN = /^staging\/[a-z0-9][a-z0-9._/-]*$/i;
const UPDATE_PATTERN = /^sync\/v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function classifyWorkersBuildBranch(rawBranch) {
  const branch = String(rawBranch || "").trim();
  if (!branch) {
    throw new Error("WORKERS_CI_BRANCH ausente. O deploy foi interrompido para não publicar no ambiente errado.");
  }
  if (branch === PRODUCTION_BRANCH) return { branch, action: "production" };
  if (STAGING_PATTERN.test(branch)) return { branch, action: "staging" };
  if (UPDATE_PATTERN.test(branch)) return { branch, action: "validate-only", reason: "proposta de atualização" };
  return { branch, action: "validate-only", reason: "branch não autorizada para deploy" };
}

export function workersBuildCommandForBranch(rawBranch) {
  const policy = classifyWorkersBuildBranch(rawBranch);
  if (policy.action === "production") return { ...policy, args: [] };
  if (policy.action === "staging") return { ...policy, args: ["--staging"] };
  return { ...policy, args: null };
}
