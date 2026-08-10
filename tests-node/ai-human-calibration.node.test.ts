import { describe, expect, it } from "vitest";
// O helper é JavaScript executável pelo mesmo Node usado nos artefatos de QA.
// @ts-expect-error não há declaração separada para o módulo interno .mjs
import * as calibration from "../scripts/lib/ai-human-calibration.mjs";

const {
  buildHumanCalibration,
  evaluateHumanCalibration,
  HUMAN_REVIEW_ATTESTATION,
} = calibration;

function evidence() {
  const scenarios = Array.from({ length: 28 }, (_, index) => ({
    id: `QA-${String(index + 1).padStart(2, "0")}`,
    group: "grupo",
    kind: "llm",
    messages: [{ role: "user", text: `Pergunta ${index + 1}` }],
    expected: { grounded: true },
  }));
  const traces = scenarios.flatMap((scenario) =>
    [1, 2, 3].map((attempt) => ({
      scenarioId: scenario.id,
      group: scenario.group,
      kind: scenario.kind,
      attempt,
      passed: true,
      issues: [],
      grounded: true,
      errorCode: null,
      response: `Resposta ${scenario.id}/${attempt}`,
    })),
  );
  return {
    dataset: { schemaVersion: 1, attempts: 3, scenarios },
    aiReport: {
      schemaVersion: 1,
      runId: "AUTOQA_AI_TEST",
      status: "passed",
      traces,
    },
  };
}

function completedReview() {
  const { aiReport, dataset } = evidence();
  const review = buildHumanCalibration({ aiReport, dataset });
  review.reviewer = {
    name: "Revisor Humano",
    reviewedAt: "2026-08-05T20:00:00.000Z",
    attestation: HUMAN_REVIEW_ATTESTATION,
  };
  for (const item of review.items) item.humanVerdict = "pass";
  return { aiReport, dataset, review };
}

describe("calibração humana do juiz de IA", () => {
  it("prepara exatamente 28 cenários por três tentativas", () => {
    const { aiReport, dataset } = evidence();
    const review = buildHumanCalibration({ aiReport, dataset });
    expect(review.items).toHaveLength(84);
    expect(new Set(review.items.map((item: { traceFingerprint: string }) => item.traceFingerprint)).size)
      .toBe(84);
  });

  it("aprova somente a revisão humana integral e concordante", () => {
    const { aiReport, dataset, review } = completedReview();
    const result = evaluateHumanCalibration({ review, aiReport, dataset });
    expect(result.status).toBe("passed");
    expect(result.metrics).toMatchObject({
      reviewed: 84,
      humanPassed: 84,
      disagreements: 0,
      completeness: 1,
      humanPassRate: 1,
      agreementRate: 1,
    });
  });

  it("reprova revisão incompleta", () => {
    const { aiReport, dataset, review } = completedReview();
    review.items[0].humanVerdict = null;
    const result = evaluateHumanCalibration({ review, aiReport, dataset });
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("veredito humano ausente: QA-01:1");
  });

  it("reprova divergência humana mesmo com automação verde", () => {
    const { aiReport, dataset, review } = completedReview();
    review.items[0].humanVerdict = "fail";
    review.items[0].notes = "Resposta humana considerada insuficiente.";
    const result = evaluateHumanCalibration({ review, aiReport, dataset });
    expect(result.status).toBe("failed");
    expect(result.disagreements).toContain("QA-01:1");
    expect(result.humanFailures).toContain("QA-01:1");
  });

  it("reprova evidência alterada depois da preparação", () => {
    const { aiReport, dataset, review } = completedReview();
    review.items[0].response = "Resposta adulterada";
    const result = evaluateHumanCalibration({ review, aiReport, dataset });
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("conteúdo da evidência foi alterado: QA-01:1");
  });

  it("reprova declaração humana ausente", () => {
    const { aiReport, dataset, review } = completedReview();
    review.reviewer.attestation = "";
    const result = evaluateHumanCalibration({ review, aiReport, dataset });
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("declaração de revisão humana ausente");
  });

  it("reprova alteração dos requisitos da revisão cega", () => {
    const { aiReport, dataset, review } = completedReview();
    review.requirements.blindReview = false;
    const result = evaluateHumanCalibration({ review, aiReport, dataset });
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("requisitos da revisão foram alterados");
  });
});
