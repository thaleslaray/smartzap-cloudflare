import { describe, expect, it } from "vitest";
import { resolveQaStagingAuthHeaders } from "../scripts/lib/qa-staging-auth.mjs";

describe("credencial mutável isolada do staging", () => {
  it("prefere a credencial isolada", () => {
    expect(
      resolveQaStagingAuthHeaders({
        mutationKey: "mutation-secret",
        apiKey: "legacy-secret",
      }),
    ).toEqual({ "x-qa-mutation-key": "mutation-secret" });
  });

  it("preserva o fallback operacional legado", () => {
    expect(resolveQaStagingAuthHeaders({ apiKey: "legacy-secret" })).toEqual({
      "x-api-key": "legacy-secret",
    });
  });

  it("falha fechada sem credencial", () => {
    expect(() => resolveQaStagingAuthHeaders()).toThrow(
      /QA_STAGING_MUTATION_API_KEY ou QA_API_KEY/,
    );
  });
});
