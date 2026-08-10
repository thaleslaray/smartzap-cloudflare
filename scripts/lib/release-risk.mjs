import { createHash } from "node:crypto";
import { hashJson, parseJourneyCatalog } from "./production-certification.mjs";

export const RELEASE_RISK_REVIEW_KIND = "smartzap-release-risk-review";
export const RELEASE_RISK_ATTESTATION =
  "Revisei o escopo, as exclusões, as evidências e os riscos residuais desta versão e aceito a decisão registrada.";

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function sameRelease(left, right) {
  return (
    left?.sourceCommit === right?.sourceCommit &&
    left?.productionVersion === right?.productionVersion &&
    left?.productionUrl === right?.productionUrl
  );
}

function issueIsExpectedBeforeSignoff(issue) {
  return (
    issue === "QA-06: jornada ativa está em teste" ||
    issue === "release-risk: evidência obrigatória ausente"
  );
}

export function releaseRiskPreconditions({ release, catalogMarkdown, certification }) {
  const journeys = parseJourneyCatalog(catalogMarkdown);
  const nonActive = new Set(["fora do escopo", "descontinuada"]);
  const active = journeys.filter((journey) => !nonActive.has(journey.state));
  const qa06 = journeys.find((journey) => journey.id === "QA-06");
  const otherActive = active.filter((journey) => journey.id !== "QA-06");
  const unexpectedIssues = (certification?.issues || []).filter(
    (issue) => !issueIsExpectedBeforeSignoff(issue),
  );
  const checks = {
    releaseMatches: sameRelease(release, certification?.release),
    evidenceReady:
      certification?.evidence?.required === 23 &&
      certification?.evidence?.present === 22 &&
      certification?.evidence?.passed === 22,
    productiveJourneysReady:
      qa06?.state === "em teste" &&
      otherActive.length > 0 &&
      otherActive.every((journey) => journey.state === "aprovada"),
    onlyExpectedIssuesRemain:
      unexpectedIssues.length === 0 &&
      (certification?.issues || []).some(
        (issue) => issue === "release-risk: evidência obrigatória ausente",
      ),
  };
  const blockingIssues = [];
  if (!checks.releaseMatches) blockingIssues.push("certificação pertence a outra release");
  if (!checks.evidenceReady) blockingIssues.push("as outras 22 evidências ainda não estão aprovadas");
  if (!checks.productiveJourneysReady)
    blockingIssues.push("há jornada produtiva aberta além de QA-06");
  if (!checks.onlyExpectedIssuesRemain)
    blockingIssues.push(...unexpectedIssues.length ? unexpectedIssues : ["resultado de certificação incompatível"]);
  return {
    checks,
    blockingIssues: [...new Set(blockingIssues)],
    journeys: {
      total: journeys.length,
      active: active.length,
      approvedBeforeSignoff: otherActive.filter((journey) => journey.state === "aprovada").length,
      pending: active.filter((journey) => journey.state !== "aprovada"),
      exclusions: journeys.filter((journey) => nonActive.has(journey.state)),
    },
  };
}

export function buildReleaseRiskReview({ release, catalogMarkdown, certification }) {
  const preconditions = releaseRiskPreconditions({ release, catalogMarkdown, certification });
  return {
    schemaVersion: 1,
    kind: RELEASE_RISK_REVIEW_KIND,
    generatedAt: new Date().toISOString(),
    release,
    sourceCatalogHash: sha256(catalogMarkdown),
    sourceCertificationHash: hashJson(certification),
    readyForDecision: Object.values(preconditions.checks).every(Boolean),
    preconditions,
    evidence: certification?.evidence || null,
    decision: {
      reviewer: "",
      reviewedAt: "",
      attestation: "",
      checks: {
        scopeAccepted: false,
        exclusionsAccepted: false,
        zeroKnownP0P1: false,
        evidenceReviewed: false,
      },
      notes: "",
    },
  };
}

export function evaluateReleaseRiskReview({
  review,
  release,
  catalogMarkdown,
  certification,
}) {
  const issues = [];
  const preconditions = releaseRiskPreconditions({ release, catalogMarkdown, certification });
  if (review?.schemaVersion !== 1 || review?.kind !== RELEASE_RISK_REVIEW_KIND)
    issues.push("revisão de risco com contrato inválido");
  if (!sameRelease(review?.release, release)) issues.push("revisão pertence a outra release");
  if (review?.sourceCatalogHash !== sha256(catalogMarkdown))
    issues.push("catálogo mudou após a preparação");
  if (review?.sourceCertificationHash !== hashJson(certification))
    issues.push("resultado de certificação mudou após a preparação");
  if (!review?.readyForDecision || !Object.values(preconditions.checks).every(Boolean))
    issues.push(...preconditions.blockingIssues, "pré-condições do aceite não estão aprovadas");
  const decision = review?.decision || {};
  const requiredChecks = [
    "scopeAccepted",
    "exclusionsAccepted",
    "zeroKnownP0P1",
    "evidenceReviewed",
  ];
  for (const check of requiredChecks)
    if (decision?.checks?.[check] !== true) issues.push(`aceite ausente: ${check}`);
  if (!String(decision.reviewer || "").trim()) issues.push("responsável pelo aceite ausente");
  if (!Number.isFinite(Date.parse(decision.reviewedAt || ""))) issues.push("data do aceite ausente ou inválida");
  if (decision.attestation !== RELEASE_RISK_ATTESTATION)
    issues.push("declaração de aceite divergente");
  return {
    schemaVersion: 1,
    kind: "smartzap-release-risk-result",
    status: issues.length ? "failed" : "passed",
    release,
    reviewer: String(decision.reviewer || "").trim(),
    performedAt: decision.reviewedAt || null,
    checks: Object.fromEntries(
      requiredChecks.map((check) => [check, decision?.checks?.[check] === true]),
    ),
    notes: String(decision.notes || "").trim(),
    preconditions,
    issues: [...new Set(issues)],
  };
}
