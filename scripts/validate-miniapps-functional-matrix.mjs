import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const matrixPath = resolve(root, "qa/miniapps-functional-matrix.json");
const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
const errors = [];
const allowedPriorities = new Set(["P0", "P1", "P2"]);
const allowedStatuses = new Set(["planned", "partial", "covered", "blocked", "excluded"]);

const unique = (values) => new Set(values).size === values.length;
const families = Array.isArray(matrix.testFamilies) ? matrix.testFamilies : [];

if (matrix.schemaVersion !== 1) errors.push("schemaVersion precisa ser 1");
if (matrix.matrixId !== "MINI-FUNCTIONAL-V1") errors.push("matrixId inesperado");
if (!families.length) errors.push("testFamilies está vazio");
if (!unique(families.map((family) => family.id))) errors.push("IDs duplicados em testFamilies");

for (const family of families) {
  if (!/^MF-[A-Z]+$/.test(String(family.id ?? ""))) errors.push(`${family.id}: ID inválido`);
  if (!/^MINI-\d+$/.test(String(family.journey ?? ""))) errors.push(`${family.id}: jornada inválida`);
  if (!allowedPriorities.has(family.priority)) errors.push(`${family.id}: prioridade inválida`);
  if (!allowedStatuses.has(family.status)) errors.push(`${family.id}: status inválido`);
  if (!Array.isArray(family.partitions) || family.partitions.length === 0)
    errors.push(`${family.id}: sem partições`);
  if (!Number.isInteger(family.expectedCases) || family.expectedCases < family.partitions?.length)
    errors.push(`${family.id}: expectedCases menor que as partições declaradas`);
  if (!Array.isArray(family.targetTests) || family.targetTests.length === 0)
    errors.push(`${family.id}: sem arquivo-alvo de teste`);
  else for (const target of family.targetTests)
    if (!existsSync(resolve(root, target))) errors.push(`${family.id}: arquivo-alvo ausente ${target}`);
  if (!Array.isArray(family.evidence) || family.evidence.length === 0)
    errors.push(`${family.id}: sem evidência exigida`);
}

const decisions = Array.isArray(matrix.contractDecisionsRequired)
  ? matrix.contractDecisionsRequired
  : [];
for (const item of decisions) {
  if (!item.capability || !["implement-or-block", "implemented", "blocked", "excluded"].includes(item.decision))
    errors.push(`decisão de contrato inválida para ${item.capability ?? "capacidade desconhecida"}`);
  if (!allowedPriorities.has(item.risk)) errors.push(`${item.capability}: risco inválido`);
}
if (decisions.some((item) => item.decision === "implement-or-block"))
  errors.push("há decisões implement-or-block ainda abertas");

const requirePartitions = (familyId, required) => {
  const family = families.find((candidate) => candidate.id === familyId);
  if (!family) {
    errors.push(`família obrigatória ausente: ${familyId}`);
    return;
  }
  const actual = new Set(family.partitions);
  for (const item of required) if (!actual.has(item)) errors.push(`${familyId}: partição ausente ${item}`);
};

requirePartitions("MF-TEMPLATES", matrix.declaredCapabilities?.templates ?? []);
requirePartitions("MF-BLOCKS", matrix.declaredCapabilities?.editorBlocks ?? []);
requirePartitions("MF-BRANCHES", matrix.declaredCapabilities?.branchOperators ?? []);

const closure = matrix.gates?.functionalClosure;
const stress = matrix.gates?.stress;
if (!closure?.journeys?.includes("MINI-08") || !closure?.journeys?.includes("MINI-09"))
  errors.push("gate funcional não inclui MINI-08 e MINI-09");
if (stress?.journey !== "MINI-10") errors.push("gate de estresse não aponta para MINI-10");
if (!stress?.blockedUntil?.includes("MINI-08") || !stress?.blockedUntil?.includes("MINI-09"))
  errors.push("estresse não está bloqueado por MINI-08 e MINI-09");

const summary = {
  ok: errors.length === 0,
  matrixId: matrix.matrixId,
  families: families.length,
  plannedCases: families.reduce((total, family) => total + family.expectedCases, 0),
  byStatus: Object.fromEntries(
    [...allowedStatuses].map((status) => [status, families.filter((family) => family.status === status).length]),
  ),
  contractDecisionsRequired: decisions.filter((item) => item.decision === "implement-or-block").length,
  deferredStressFamilies: matrix.deferredStressFamilies?.length ?? 0,
};

if (errors.length) {
  for (const error of errors) console.error(`MINI_MATRIX_ERROR ${error}`);
  process.exit(1);
}

console.log(JSON.stringify(summary, null, 2));
