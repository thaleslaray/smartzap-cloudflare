import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
const AUTH = { "x-api-key": "dev-api-key" };

describe("workflows descontinuados", () => {
  it("responde 410 e não expõe mais CRUD", async () => {
    const response = await SELF.fetch("https://smartzap.test/api/workflows", { headers: AUTH });
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ code: "WORKFLOWS_RETIRED" });
  });
});
