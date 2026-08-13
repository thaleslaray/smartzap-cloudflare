import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("contrato de credenciais do consolidador do soak", () => {
  it("separa o token GraphQL da autenticação operacional do Wrangler", () => {
    const source = readFileSync(resolve("scripts/qa-soak-finalize.mjs"), "utf8");
    expect(source).toContain("process.env.CLOUDFLARE_ANALYTICS_TOKEN");
    expect(source).not.toContain('process.env.CLOUDFLARE_API_TOKEN || ""');
    expect(source).toContain('"kv", "key", "list"');
    expect(source).toContain('"d1", "execute"');
  });
});
