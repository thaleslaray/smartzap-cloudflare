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

export function expectedWorkerForAction(baseInstallId, action) {
  const base = String(baseInstallId || "").trim().toLowerCase();
  if (!/^smartzap-[a-f0-9]{8}$/.test(base)) {
    throw new Error("SMARTZAP_INSTALL_ID ausente ou inválido no Workers Builds.");
  }
  return action === "staging" ? `${base}-staging` : base;
}

export function workersBuildCommandForBranch(rawBranch, options = {}) {
  const policy = classifyWorkersBuildBranch(rawBranch);
  if (policy.action === "production" || policy.action === "staging") {
    const expectedWorker = expectedWorkerForAction(options.baseInstallId, policy.action);
    const connectedWorker = String(options.connectedWorkerName || "").trim().toLowerCase();
    if (!connectedWorker) {
      throw new Error("WRANGLER_CI_OVERRIDE_NAME ausente. O build não está vinculado a um Worker Cloudflare identificável.");
    }
    if (connectedWorker !== expectedWorker) {
      return {
        ...policy,
        action: "validate-only",
        args: null,
        reason: `branch ${policy.branch} pertence a ${expectedWorker}, mas este build está conectado a ${connectedWorker}`,
      };
    }
    return { ...policy, workerName: expectedWorker, args: policy.action === "staging" ? ["--staging"] : [] };
  }
  return { ...policy, args: null };
}
