const CLOUDFLARE_WORKER_NAME_OVERRIDE = "WRANGLER_CI_OVERRIDE_NAME";

export function buildWranglerChildEnvironment(source = process.env, extra = {}) {
  const environment = { ...source, ...extra, CI: "1" };
  delete environment[CLOUDFLARE_WORKER_NAME_OVERRIDE];
  if (extra.WRANGLER_CI_OVERRIDE_NAME !== undefined) {
    throw new Error("O instalador não permite reintroduzir WRANGLER_CI_OVERRIDE_NAME no subprocesso do Wrangler.");
  }
  return environment;
}

export function parseWranglerDeployOutput(value) {
  const text = String(value || "").trim();
  if (!text) throw new Error("O Wrangler não registrou a identidade estruturada do deploy.");
  let output;
  try {
    output = JSON.parse(text);
  } catch {
    throw new Error("A identidade estruturada devolvida pelo Wrangler não é JSON válido.");
  }
  if (Array.isArray(output)) output = output.at(-1);
  if (!output || typeof output !== "object") throw new Error("A identidade estruturada do deploy é inválida.");
  return output;
}

export function assertWranglerDeployIdentity(output, expectedWorkerName) {
  if (output.type !== "deploy" || Number(output.version) !== 1) {
    throw new Error("O Wrangler não confirmou um deploy estruturado compatível.");
  }
  if (output.worker_name !== expectedWorkerName) {
    throw new Error(`Deploy recusado: o Wrangler publicou ${output.worker_name || "um Worker sem nome"}, mas o alvo autorizado era ${expectedWorkerName}.`);
  }
  if (output.worker_name_overridden !== false) {
    throw new Error("Deploy recusado: a Cloudflare ou outra camada sobrescreveu o nome autorizado do Worker.");
  }
  if (!output.version_id || !Array.isArray(output.targets) || output.targets.length === 0) {
    throw new Error("O Wrangler não confirmou versão e destino do Worker publicado.");
  }
  return output;
}
