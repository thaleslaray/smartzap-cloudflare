import { describe, expect, it } from "vitest";
import {
  assertExistingMetaCanaryContact,
  selectMetaCanaryRecipients,
} from "../scripts/lib/meta-canary-recipients.mjs";

describe("destinatários do canário Meta", () => {
  it("muta somente a quantidade selecionada da allowlist", () => {
    expect(selectMetaCanaryRecipients(["9966", "4524", "8242", "9285"], 1)).toEqual([
      "9966",
    ]);
  });

  it("preserva contato real existente quando há opt-in", () => {
    expect(() =>
      assertExistingMetaCanaryContact(
        { name: "Contato real", status: "opt_in" },
        "+5521 *****-9966",
      ),
    ).not.toThrow();
  });

  it("bloqueia contato existente sem opt-in", () => {
    expect(() =>
      assertExistingMetaCanaryContact(
        { name: "Contato real", status: "opt_out" },
        "+5521 *****-9966",
      ),
    ).toThrow(/sem opt-in comprovado/);
  });

  it("rejeita quantidade maior que a allowlist", () => {
    expect(() => selectMetaCanaryRecipients(["9966"], 2)).toThrow(
      /excede os destinatários autorizados/,
    );
  });
});
