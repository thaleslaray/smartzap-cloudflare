import { describe, expect, it } from "vitest";
// O helper é JavaScript executável pelo mesmo Node usado nos monitores.
// @ts-expect-error não há declaração separada para o módulo interno .mjs
import { resolveQaRemoteReadHeaders } from "../scripts/lib/qa-remote-auth.mjs";

describe("credencial remota somente-leitura", () => {
  it("prefere a credencial somente-leitura", () => {
    expect(
      resolveQaRemoteReadHeaders({
        readOnlyKey: "readonly-secret",
        apiKey: "admin-secret",
      }),
    ).toEqual({ "x-qa-readonly-key": "readonly-secret" });
  });

  it("preserva o fallback administrativo legado", () => {
    expect(resolveQaRemoteReadHeaders({ apiKey: "admin-secret" })).toEqual({
      "x-api-key": "admin-secret",
    });
  });

  it("falha fechada sem credencial", () => {
    expect(() => resolveQaRemoteReadHeaders()).toThrow(
      /QA_READONLY_API_KEY ou QA_API_KEY/,
    );
  });
});
