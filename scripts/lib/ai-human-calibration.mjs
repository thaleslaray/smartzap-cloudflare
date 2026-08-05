import { createHash } from "node:crypto";

export const HUMAN_REVIEW_ATTESTATION =
  "Revisei pessoalmente todas as respostas apresentadas sem consultar o veredito automático e registrei meu julgamento com base nos critérios exibidos.";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

export function hashJson(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function scenarioMap(dataset) {
  return new Map((dataset.scenarios || []).map((scenario) => [scenario.id, scenario]));
}

function traceIdentity(trace, scenario) {
  return {
    scenarioId: trace.scenarioId,
    attempt: trace.attempt,
    group: trace.group,
    kind: trace.kind,
    response: trace.response ?? "",
    automatedPassed: trace.passed === true,
    automatedIssues: trace.issues || [],
    grounded: trace.grounded ?? null,
    errorCode: trace.errorCode ?? null,
    messages: scenario.messages,
    expected: scenario.expected || {},
  };
}

function reviewItemIdentity(item) {
  return {
    scenarioId: item.scenarioId,
    attempt: item.attempt,
    group: item.group,
    kind: item.kind,
    response: item.response ?? "",
    automatedPassed: item.automatedPassed === true,
    automatedIssues: item.automatedIssues || [],
    grounded: item.grounded ?? null,
    errorCode: item.errorCode ?? null,
    messages: item.messages,
    expected: item.expected || {},
  };
}

export function validateAiEvidence(aiReport, dataset) {
  const issues = [];
  if (aiReport?.schemaVersion !== 1) issues.push("relatório de IA com schemaVersion inválido");
  if (aiReport?.status !== "passed") issues.push("relatório de IA não está aprovado");
  if (dataset?.schemaVersion !== 1) issues.push("dataset com schemaVersion inválido");
  if (dataset?.attempts !== 3) issues.push("dataset precisa exigir três tentativas");
  if (!Array.isArray(dataset?.scenarios) || dataset.scenarios.length !== 28)
    issues.push("dataset precisa conter exatamente 28 cenários");
  if (!Array.isArray(aiReport?.traces)) issues.push("relatório sem traces");

  const scenarios = scenarioMap(dataset || {});
  const expectedKeys = new Set();
  for (const scenario of dataset?.scenarios || [])
    for (let attempt = 1; attempt <= dataset.attempts; attempt += 1)
      expectedKeys.add(`${scenario.id}:${attempt}`);

  const observedKeys = new Set();
  for (const trace of aiReport?.traces || []) {
    const key = `${trace.scenarioId}:${trace.attempt}`;
    if (observedKeys.has(key)) issues.push(`trace duplicado: ${key}`);
    observedKeys.add(key);
    if (!scenarios.has(trace.scenarioId)) issues.push(`cenário desconhecido: ${trace.scenarioId}`);
    if (!Number.isInteger(trace.attempt) || trace.attempt < 1 || trace.attempt > 3)
      issues.push(`tentativa inválida: ${key}`);
  }
  for (const key of expectedKeys)
    if (!observedKeys.has(key)) issues.push(`trace ausente: ${key}`);
  for (const key of observedKeys)
    if (!expectedKeys.has(key)) issues.push(`trace inesperado: ${key}`);

  return { issues, scenarios };
}

export function buildHumanCalibration({ aiReport, dataset, createdAt = new Date().toISOString() }) {
  const validation = validateAiEvidence(aiReport, dataset);
  if (validation.issues.length) throw new Error(validation.issues.join("\n"));

  const items = aiReport.traces
    .map((trace) => {
      const scenario = validation.scenarios.get(trace.scenarioId);
      const identity = traceIdentity(trace, scenario);
      return {
        ...identity,
        traceFingerprint: hashJson(identity),
        humanVerdict: null,
        humanIssues: [],
        notes: "",
      };
    })
    .sort((a, b) =>
      a.scenarioId.localeCompare(b.scenarioId) || a.attempt - b.attempt,
    );

  return {
    schemaVersion: 1,
    kind: "smartzap-ai-human-calibration",
    sourceRunId: aiReport.runId,
    sourceEvidenceHash: hashJson({ aiReport, dataset }),
    createdAt,
    reviewer: {
      name: "",
      reviewedAt: "",
      attestation: "",
    },
    requirements: {
      scenarios: 28,
      attemptsPerScenario: 3,
      totalResponses: 84,
      blindReview: true,
      requiredHumanPassRate: 1,
      requiredAgreementRate: 1,
      attestation: HUMAN_REVIEW_ATTESTATION,
    },
    items,
  };
}

export function evaluateHumanCalibration({ review, aiReport, dataset }) {
  const sourceValidation = validateAiEvidence(aiReport, dataset);
  const issues = [...sourceValidation.issues];
  let expected;
  try {
    expected = buildHumanCalibration({
      aiReport,
      dataset,
      createdAt: review?.createdAt || new Date(0).toISOString(),
    });
  } catch (error) {
    return { status: "failed", issues: [String(error.message || error)] };
  }

  if (review?.schemaVersion !== 1 || review?.kind !== expected.kind)
    issues.push("arquivo de revisão com contrato inválido");
  if (review?.sourceRunId !== expected.sourceRunId)
    issues.push("revisão pertence a outra execução de IA");
  if (review?.sourceEvidenceHash !== expected.sourceEvidenceHash)
    issues.push("hash da evidência de origem diverge");
  if (hashJson(review?.requirements) !== hashJson(expected.requirements))
    issues.push("requisitos da revisão foram alterados");
  if (!Number.isFinite(Date.parse(review?.createdAt || "")))
    issues.push("data de preparação da revisão ausente ou inválida");

  const reviewerName = String(review?.reviewer?.name || "").trim();
  if (reviewerName.length < 2) issues.push("nome do revisor humano ausente");
  const reviewedAt = Date.parse(review?.reviewer?.reviewedAt || "");
  if (!Number.isFinite(reviewedAt)) issues.push("data da revisão humana ausente ou inválida");
  if (review?.reviewer?.attestation !== HUMAN_REVIEW_ATTESTATION)
    issues.push("declaração de revisão humana ausente");

  if (!Array.isArray(review?.items) || review.items.length !== expected.items.length)
    issues.push(`a revisão precisa conter ${expected.items.length} respostas`);

  const expectedItems = new Map(
    expected.items.map((item) => [`${item.scenarioId}:${item.attempt}`, item]),
  );
  const seen = new Set();
  let reviewed = 0;
  let humanPassed = 0;
  let agreements = 0;
  const disagreements = [];
  const humanFailures = [];

  for (const item of review?.items || []) {
    const key = `${item.scenarioId}:${item.attempt}`;
    if (seen.has(key)) {
      issues.push(`item duplicado: ${key}`);
      continue;
    }
    seen.add(key);
    const source = expectedItems.get(key);
    if (!source) {
      issues.push(`item inesperado: ${key}`);
      continue;
    }
    if (
      item.traceFingerprint !== source.traceFingerprint ||
      hashJson(reviewItemIdentity(item)) !== source.traceFingerprint
    )
      issues.push(`conteúdo da evidência foi alterado: ${key}`);
    if (!['pass', 'fail'].includes(item.humanVerdict)) {
      issues.push(`veredito humano ausente: ${key}`);
      continue;
    }
    reviewed += 1;
    const passed = item.humanVerdict === "pass";
    if (passed) humanPassed += 1;
    else {
      humanFailures.push(key);
      if (!String(item.notes || "").trim() && !(item.humanIssues || []).length)
        issues.push(`reprovação humana sem justificativa: ${key}`);
    }
    if (passed === source.automatedPassed) agreements += 1;
    else disagreements.push(key);
  }
  for (const key of expectedItems.keys())
    if (!seen.has(key)) issues.push(`item ausente: ${key}`);

  const total = expected.items.length;
  const metrics = {
    total,
    reviewed,
    humanPassed,
    humanFailed: humanFailures.length,
    agreements,
    disagreements: disagreements.length,
    completeness: total ? reviewed / total : 0,
    humanPassRate: total ? humanPassed / total : 0,
    agreementRate: total ? agreements / total : 0,
  };
  const passed =
    issues.length === 0 &&
    metrics.completeness === 1 &&
    metrics.humanPassRate === 1 &&
    metrics.agreementRate === 1;

  return {
    schemaVersion: 1,
    kind: "smartzap-ai-human-calibration-result",
    sourceRunId: expected.sourceRunId,
    status: passed ? "passed" : "failed",
    reviewer: reviewerName || null,
    reviewedAt: Number.isFinite(reviewedAt) ? new Date(reviewedAt).toISOString() : null,
    metrics,
    disagreements,
    humanFailures,
    issues,
  };
}
