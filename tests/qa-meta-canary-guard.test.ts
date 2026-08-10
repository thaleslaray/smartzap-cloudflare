import { describe, expect, it } from "vitest";
import {
  assertMetaCanaryWindow,
  resolveMetaCanaryGuard,
} from "../scripts/lib/meta-canary-guard.mjs";

describe("guardrails do canário Meta", () => {
  it("mantém duas rodadas por padrão e aceita teto explícito de dez", () => {
    expect(resolveMetaCanaryGuard({})).toEqual({
      maxRunsPerDay: 2,
      outsideWindowAuthorized: false,
    });
    expect(resolveMetaCanaryGuard({ QA_META_MAX_RUNS_PER_DAY: "10" })).toEqual({
      maxRunsPerDay: 10,
      outsideWindowAuthorized: false,
    });
  });

  it("rejeita teto acima de dez", () => {
    expect(() =>
      resolveMetaCanaryGuard({ QA_META_MAX_RUNS_PER_DAY: "11" }),
    ).toThrow(/entre 1 e 10/);
  });

  it("só aceita execução noturna com autorização explícita", () => {
    expect(() => assertMetaCanaryWindow(21, false)).toThrow(/09:00 e 20:00/);
    expect(() => assertMetaCanaryWindow(21, true)).not.toThrow();
    expect(() => assertMetaCanaryWindow(15, false)).not.toThrow();
  });
});
