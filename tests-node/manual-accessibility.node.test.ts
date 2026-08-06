import { describe, expect, it } from "vitest";
// O helper é JavaScript executável pelo mesmo Node usado no artefato de QA.
// @ts-expect-error não há declaração separada para o módulo interno .mjs
import * as accessibility from "../scripts/lib/manual-accessibility.mjs";

const {
  buildManualAccessibilityReview,
  evaluateManualAccessibilityReview,
  MANUAL_ACCESSIBILITY_ATTESTATION,
  MANUAL_ACCESSIBILITY_CHECKS,
} = accessibility;

const release = {
  sourceCommit: "a".repeat(40),
  productionVersion: "11111111-2222-4333-8444-555555555555",
  productionUrl: "https://example.test",
};

function completedReview() {
  const review = buildManualAccessibilityReview({ release, createdAt: "2026-08-06T00:00:00.000Z" });
  review.reviewer = {
    name: "Pessoa Revisora",
    reviewedAt: "2026-08-06T01:00:00.000Z",
    attestation: MANUAL_ACCESSIBILITY_ATTESTATION,
  };
  review.environment = {
    screenReader: "VoiceOver",
    screenReaderVersion: "macOS 15",
    browser: "Safari",
    browserVersion: "18",
    operatingSystem: "macOS 15",
    device: "MacBook Pro",
    zoomPercent: 200,
  };
  for (const item of review.items) {
    item.verdict = "pass";
    item.observations = `O leitor anunciou corretamente o caso ${item.id}.`;
  }
  return review;
}

describe("homologação manual de acessibilidade", () => {
  it("prepara o plano completo e cobre todas as checagens exigidas", () => {
    const review = buildManualAccessibilityReview({ release });
    expect(review.items).toHaveLength(10);
    const checks = new Set(review.items.flatMap((item: { requiredChecks: string[] }) => item.requiredChecks));
    expect([...MANUAL_ACCESSIBILITY_CHECKS].every((check) => checks.has(check))).toBe(true);
  });

  it("aprova somente uma revisão integral, assinada e com observações", () => {
    const result = evaluateManualAccessibilityReview({ review: completedReview(), release });
    expect(result.status).toBe("passed");
    expect(result.metrics).toMatchObject({ totalCases: 10, passedCases: 10, failedCases: 0 });
    expect(Object.values(result.checks).every(Boolean)).toBe(true);
  });

  it("reprova o modelo intocado", () => {
    const review = buildManualAccessibilityReview({ release });
    const result = evaluateManualAccessibilityReview({ review, release });
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("nome do revisor humano ausente");
    expect(result.issues).toContain("zoom real deve ser 200%");
    expect(result.issues).toContain("veredito ausente: login-session");
  });

  it("reprova conteúdo alterado ou release divergente", () => {
    const review = completedReview();
    review.items[0].expected = "texto adulterado";
    const result = evaluateManualAccessibilityReview({
      review,
      release: { ...release, productionVersion: "99999999-2222-4333-8444-555555555555" },
    });
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("revisão pertence a outra release");
    expect(result.issues).toContain("conteúdo do caso foi alterado: login-session");
  });

  it("reprova caso falho ou sem observação concreta", () => {
    const review = completedReview();
    review.items[0].verdict = "fail";
    review.items[0].observations = "curta";
    review.items[0].notes = "";
    const result = evaluateManualAccessibilityReview({ review, release });
    expect(result.status).toBe("failed");
    expect(result.issues).toContain("observação concreta ausente: login-session");
    expect(result.issues).toContain("reprovação sem descrição: login-session");
    expect(Object.values(result.checks).every((value) => value === false)).toBe(true);
  });
});
