import { describe, expect, it } from "vitest";
import { getCampaignDisplayStatus } from "../app/lib/campaign-status";

describe("getCampaignDisplayStatus", () => {
  it("não pinta de verde uma campanha concluída com falhas", () => {
    expect(getCampaignDisplayStatus("completed", 1)).toMatchObject({
      label: "Concluída com falhas",
      className: expect.stringContaining("red"),
    });
  });

  it("mantém concluída verde quando não há falhas", () => {
    expect(getCampaignDisplayStatus("completed", 0)).toMatchObject({
      label: "Concluído",
      className: expect.stringContaining("emerald"),
    });
  });
});
