import { describe, expect, it } from "vitest";
import {
  buildReleaseRiskReview,
  evaluateReleaseRiskReview,
  RELEASE_RISK_ATTESTATION,
// @ts-expect-error módulo interno executado pelo runner Node
} from "../scripts/lib/release-risk.mjs";

const release = {
  sourceCommit: "a".repeat(40),
  productionVersion: "11111111-1111-4111-8111-111111111111",
  productionUrl: "https://example.workers.dev",
};
const catalog = [
  "| ID | Área | Jornada | Superfície | Estado |",
  "|---|---|---|---|---|",
  "| APP-01 | App | Fluxo produtivo | / | aprovada |",
  "| QA-06 | QA | Certificação integral | produção | em teste |",
  "| EXP-01 | Experimental | Recurso retirado | laboratório | fora do escopo |",
].join("\n");
const certification = {
  release,
  evidence: { required: 23, present: 22, passed: 22 },
  issues: [
    "QA-06: jornada ativa está em teste",
    "release-risk: evidência obrigatória ausente",
  ],
};

function signedReview() {
  const review = buildReleaseRiskReview({ release, catalogMarkdown: catalog, certification });
  review.decision = {
    reviewer: "Responsável QA",
    reviewedAt: "2026-08-13T03:00:00.000Z",
    attestation: RELEASE_RISK_ATTESTATION,
    checks: {
      scopeAccepted: true,
      exclusionsAccepted: true,
      zeroKnownP0P1: true,
      evidenceReviewed: true,
    },
    notes: "",
  };
  return review;
}

describe("aceite final de risco", () => {
  it("fica pronto somente quando restam QA-06 e o próprio aceite", () => {
    const review = buildReleaseRiskReview({ release, catalogMarkdown: catalog, certification });
    expect(review.readyForDecision).toBe(true);
    expect(review.preconditions.journeys.pending).toEqual([
      { id: "QA-06", area: "QA", state: "em teste" },
    ]);
  });

  it("aprova uma decisão humana íntegra e vinculada à evidência", () => {
    const result = evaluateReleaseRiskReview({
      review: signedReview(),
      release,
      catalogMarkdown: catalog,
      certification,
    });
    expect(result.status).toBe("passed");
    expect(result.checks).toEqual({
      scopeAccepted: true,
      exclusionsAccepted: true,
      zeroKnownP0P1: true,
      evidenceReviewed: true,
    });
  });

  it("bloqueia enquanto faltar outra evidência", () => {
    const incomplete = { ...certification, evidence: { required: 23, present: 21, passed: 21 } };
    const review = buildReleaseRiskReview({ release, catalogMarkdown: catalog, certification: incomplete });
    expect(review.readyForDecision).toBe(false);
    expect(review.preconditions.blockingIssues).toContain("as outras 22 evidências ainda não estão aprovadas");
  });

  it("bloqueia jornada produtiva adicional ou problema conhecido", () => {
    const changedCatalog = catalog.replace("| APP-01 | App | Fluxo produtivo | / | aprovada |", "| APP-01 | App | Fluxo produtivo | / | falhou |");
    const changedCertification = { ...certification, issues: [...certification.issues, "APP-01: jornada ativa está falhou"] };
    const review = buildReleaseRiskReview({ release, catalogMarkdown: changedCatalog, certification: changedCertification });
    expect(review.readyForDecision).toBe(false);
    expect(review.preconditions.blockingIssues).toContain("há jornada produtiva aberta além de QA-06");
  });

  it("reprova adulteração, declaração ou checkbox incompleto", () => {
    const review = signedReview();
    review.decision.checks.evidenceReviewed = false;
    review.sourceCertificationHash = "adulterado";
    const result = evaluateReleaseRiskReview({ review, release, catalogMarkdown: catalog, certification });
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("resultado de certificação mudou após a preparação");
    expect(result.issues).toContain("aceite ausente: evidenceReviewed");
  });
});
