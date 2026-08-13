import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, "jornada.md");
const manifestPath = resolve(root, "qa/journeys.yml");

function fail(messages) {
  for (const message of messages) console.error(`QA_MANIFEST_ERROR ${message}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const catalog = readFileSync(catalogPath, "utf8");
const rows = catalog
  .split(/\r?\n/)
  .filter((line) => /^\| [A-Z0-9]+-\d+ \|/.test(line))
  .map((line) => {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    return { id: cells[0], area: cells[1], state: cells[4] };
  });

const allowedStates = new Set([
  "não testada",
  "em teste",
  "aprovada",
  "falhou",
  "corrigida — reteste pendente",
  "bloqueada",
  "fora do escopo",
  "descontinuada",
]);
const errors = [];
const resolved = [];

function changedFiles() {
  const base = process.env.QA_BASE_SHA?.trim();
  try {
    const output =
      base && !/^0+$/.test(base)
        ? execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
            cwd: root,
            encoding: "utf8",
          })
        : execFileSync(
            "git",
            ["status", "--porcelain", "--untracked-files=all"],
            { cwd: root, encoding: "utf8" },
          )
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => line.slice(3).split(" -> ").at(-1))
            .join("\n");
    return [...new Set(output.split(/\r?\n/).map((file) => file.trim()).filter(Boolean))].sort();
  } catch {
    return [];
  }
}

function invalidates(file, rule) {
  return file === rule || file.startsWith(`${rule.replace(/\/+$/, "")}/`);
}

for (const row of rows) {
  const prefix = row.id.split("-")[0];
  const mapping = manifest.areas[prefix];
  if (!mapping) {
    errors.push(`${row.id}: prefixo ${prefix} não possui mapeamento`);
    continue;
  }
  if (!manifest.policy[mapping.risk]) {
    errors.push(`${row.id}: risco inválido ${mapping.risk}`);
  }
  if (!allowedStates.has(row.state)) {
    errors.push(`${row.id}: estado inválido ${row.state}`);
  }
  if (!mapping.owners?.length) errors.push(`${row.id}: sem owner`);
  if (!mapping.tests?.length) errors.push(`${row.id}: sem teste`);
  if (!mapping.evidence?.length) errors.push(`${row.id}: sem evidência`);
  if (!mapping.invalidatedBy?.length)
    errors.push(`${row.id}: sem regra de invalidação`);
  for (const testPath of mapping.tests ?? []) {
    if (!existsSync(resolve(root, testPath)))
      errors.push(`${row.id}: teste inexistente ${testPath}`);
  }
  resolved.push({
    id: row.id,
    state: row.state,
    risk: mapping.risk,
    tests: mapping.tests,
    evidence: mapping.evidence,
    invalidatedBy: mapping.invalidatedBy,
  });
}

if (!rows.length) errors.push("nenhuma jornada encontrada em jornada.md");
if (errors.length) fail(errors);

const counts = resolved.reduce(
  (acc, item) => {
    acc.total += 1;
    acc[item.risk] += 1;
    acc.states[item.state] = (acc.states[item.state] ?? 0) + 1;
    return acc;
  },
  { total: 0, P0: 0, P1: 0, P2: 0, states: {} },
);
const changed = changedFiles();
const impactedJourneys = resolved
  .filter((journey) =>
    changed.some((file) =>
      journey.invalidatedBy.some((rule) => invalidates(file, rule)),
    ),
  )
  .map(({ id, risk, state, tests, evidence }) => ({
    id,
    risk,
    state,
    tests,
    evidence,
  }));

const report = {
  ok: true,
  schemaVersion: manifest.schemaVersion,
  catalog: manifest.catalog,
  counts,
  changes: {
    files: changed,
    impactedJourneys,
  },
  ...(process.argv.includes("--full") ? { journeys: resolved } : {}),
};
console.log(JSON.stringify(report, null, 2));
