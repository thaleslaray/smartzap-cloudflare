import { describe, expect, it } from "vitest";
import {
  metaCanaryStatusRestorationSteps,
  resolveExistingMetaCanaryContact,
  selectMetaCanaryRecipients,
// O helper é JavaScript executável pelo mesmo Node usado no runner.
// @ts-expect-error não há declaração separada para o módulo interno .mjs
} from "../scripts/lib/meta-canary-recipients.mjs";

describe("destinatários do canário Meta", () => {
  it("muta somente a quantidade selecionada da allowlist", () => {
    expect(selectMetaCanaryRecipients(["9966", "4524", "8242", "9285"], 1)).toEqual([
      "9966",
    ]);
  });

  it("preserva contato real existente quando há opt-in", () => {
    expect(
      resolveExistingMetaCanaryContact(
        { name: "Contato real", status: "opt_in" },
        "+5511 *****-9999",
        false,
      ),
    ).toEqual({ temporaryOptInRequired: false, originalStatus: "opt_in" });
  });

  it("bloqueia contato existente sem opt-in e sem autorização temporária", () => {
    expect(() =>
      resolveExistingMetaCanaryContact(
        { name: "Contato real", status: "opt_out" },
        "+5511 *****-9999",
        false,
      ),
    ).toThrow(/sem opt-in comprovado/);
  });

  it.each(["unknown", "opt_out"])(
    "prepara opt-in temporário autorizado preservando status %s",
    (status) => {
      expect(
        resolveExistingMetaCanaryContact(
          { name: "Contato real", status },
          "+5511 *****-9999",
          true,
        ),
      ).toEqual({ temporaryOptInRequired: true, originalStatus: status });
    },
  );

  it("nunca permite remover supressão pelo canário", () => {
    expect(() =>
      resolveExistingMetaCanaryContact(
        { name: "Contato real", status: "suppressed" },
        "+5511 *****-9999",
        true,
      ),
    ).toThrow(/suprimido/);
  });

  it("revoga a evidência temporária antes de restaurar unknown", () => {
    expect(metaCanaryStatusRestorationSteps("unknown")).toEqual([
      "opt_out",
      "unknown",
    ]);
    expect(metaCanaryStatusRestorationSteps("opt_out")).toEqual(["opt_out"]);
    expect(metaCanaryStatusRestorationSteps("opt_in")).toEqual([]);
  });

  it("rejeita quantidade maior que a allowlist", () => {
    expect(() => selectMetaCanaryRecipients(["9966"], 2)).toThrow(
      /excede os destinatários autorizados/,
    );
  });
});
