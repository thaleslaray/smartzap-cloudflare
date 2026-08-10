export const INSTALL_GUARD_TABLE = "smartzap_install_guard";
const CLOUDFLARE_INTERNAL_D1_TABLES = new Set(["_cf_KV", "d1_migrations"]);

export function stripJsonComments(source) {
  let result = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") { lineComment = false; result += character; }
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") { blockComment = false; index += 1; }
      continue;
    }
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; result += character; continue; }
    if (character === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (character === "/" && next === "*") { blockComment = true; index += 1; continue; }
    result += character;
  }
  return result;
}

export function readWorkerName(source) {
  const parsed = JSON.parse(stripJsonComments(source));
  const name = String(parsed.name ?? "").trim();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) {
    throw new Error("O nome do projeto precisa usar somente letras minúsculas, números e hífens.");
  }
  return name;
}

export function assertIsolatedResourceNames(source) {
  const parsed = JSON.parse(stripJsonComments(source));
  const workerName = readWorkerName(source);
  if (!/^smartzap-[a-f0-9]{8}$/.test(workerName)) {
    throw new Error("Use em Projeto / Worker o nome exclusivo gerado em /install (smartzap- + 8 caracteres). Nenhum recurso foi alterado.");
  }

  const expected = new Map([
    ["Banco D1", `${workerName}-db`],
    ["Bucket R2", `${workerName}-media`],
    ["Fila WEBHOOK", `${workerName}-meta-webhooks`],
    ["Fila AUTOMATION", `${workerName}-inbox-automation`],
    ["Fila CAPI", `${workerName}-meta-conversions`],
    ["DLQ CAPI", `${workerName}-meta-conversions-dlq`],
    ["DLQ WEBHOOK", `${workerName}-meta-webhooks-dlq`],
    ["DLQ AUTOMATION", `${workerName}-inbox-automation-dlq`],
  ]);
  const actual = new Map();
  actual.set("Banco D1", parsed.d1_databases?.find((entry) => entry?.binding === "DB")?.database_name);
  actual.set("Bucket R2", parsed.r2_buckets?.find((entry) => entry?.binding === "MEDIA")?.bucket_name);
  const queueBindings = new Map((parsed.queues?.producers ?? []).map((entry) => [entry?.binding, entry?.queue]));
  actual.set("Fila WEBHOOK", queueBindings.get("WEBHOOK_QUEUE"));
  actual.set("Fila AUTOMATION", queueBindings.get("AUTOMATION_QUEUE"));
  actual.set("Fila CAPI", queueBindings.get("CAPI_QUEUE"));
  actual.set("DLQ CAPI", queueBindings.get("CAPI_DLQ"));
  actual.set("DLQ WEBHOOK", queueBindings.get("WEBHOOK_DLQ"));
  actual.set("DLQ AUTOMATION", queueBindings.get("AUTOMATION_DLQ"));

  const mismatches = [...expected].filter(([label, expectedName]) => actual.get(label) !== expectedName);
  if (mismatches.length > 0) {
    const details = mismatches.map(([label, expectedName]) => `${label}: use ${expectedName}`).join("; ");
    throw new Error(`Existem recursos ausentes, antigos ou de outra instalação. ${details}. Volte ao formulário da Cloudflare e use exatamente os nomes do arquivo de recuperação.`);
  }

  const consumerNames = new Set((parsed.queues?.consumers ?? []).flatMap((entry) => [entry?.queue, entry?.dead_letter_queue].filter(Boolean)));
  const producerNames = new Set(queueBindings.values());
  if ([...consumerNames].some((name) => !producerNames.has(name))) {
    throw new Error("As filas consumidoras não correspondem às filas exclusivas desta instalação. Nenhum recurso foi alterado.");
  }
  return { workerName, resources: Object.fromEntries(actual) };
}

export function parseWranglerRows(output) {
  const start = output.indexOf("[");
  if (start < 0) throw new Error("A Cloudflare não devolveu um resultado JSON legível para o D1.");
  const parsed = JSON.parse(output.slice(start));
  if (!Array.isArray(parsed) || parsed.some((entry) => entry?.success === false)) {
    throw new Error("A consulta de segurança do D1 foi recusada pela Cloudflare.");
  }
  return parsed.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : []);
}

export function assessDatabaseSafety({ workerName, tables, guardWorkerName }) {
  const applicationTables = tables.filter((table) => !CLOUDFLARE_INTERNAL_D1_TABLES.has(table));
  if (applicationTables.length === 0) return { action: "claim" };
  if (!applicationTables.includes(INSTALL_GUARD_TABLE)) {
    throw new Error("O D1 selecionado já contém dados e não pertence a esta instalação. Volte e escolha um banco novo com o nome exclusivo mostrado em /install.");
  }
  if (!guardWorkerName || guardWorkerName !== workerName) {
    throw new Error("O D1 selecionado pertence a outra instalação do SmartZap. Volte e crie um banco novo; nenhum dado foi alterado.");
  }
  return { action: "resume" };
}
