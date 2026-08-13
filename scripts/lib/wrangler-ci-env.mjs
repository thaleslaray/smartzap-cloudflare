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
  const text = String(value || "").replace(/\u001b\[[0-9;]*m/g, "").trim();
  if (!text) throw new Error("O Wrangler não registrou a identidade estruturada do deploy.");
  const values = parseJsonValues(text);
  const candidates = values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value) => value && typeof value === "object" && value.type === "deploy");
  if (candidates.length !== 1) {
    throw new Error(candidates.length === 0
      ? "A identidade estruturada devolvida pelo Wrangler não contém um deploy JSON válido."
      : "A identidade estruturada devolvida pelo Wrangler contém mais de um deploy e foi recusada por ambiguidade.");
  }
  const output = candidates[0];
  if (!output || typeof output !== "object") throw new Error("A identidade estruturada do deploy é inválida.");
  return output;
}

function parseJsonValues(text) {
  try {
    return [JSON.parse(text)];
  } catch {
    // Wrangler 4 pode gravar mensagens de diagnóstico junto do JSON no arquivo
    // configurado por WRANGLER_OUTPUT_FILE_PATH. Extraímos somente valores JSON
    // completos e ainda exigimos uma única identidade de deploy abaixo.
  }
  const values = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{" && text[start] !== "[") continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let cursor = start; cursor < text.length; cursor += 1) {
      const char = text[cursor];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === "{" || char === "[") depth += 1;
      else if (char === "}" || char === "]") depth -= 1;
      if (depth !== 0) continue;
      try {
        values.push(JSON.parse(text.slice(start, cursor + 1)));
        start = cursor;
      } catch {
        // Um bloco semelhante a JSON não é identidade estruturada; continuamos
        // procurando outro valor completo sem aceitar conteúdo parcial.
      }
      break;
    }
  }
  return values;
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
