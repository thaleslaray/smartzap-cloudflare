import { describe, expect, it } from "vitest";
import { shouldStopMetaCampaignPolling } from "../scripts/lib/meta-canary-lifecycle.mjs";

describe("polling do ciclo Meta", () => {
  it("não encerra o ciclo completo somente porque a campanha foi concluída", () => {
    expect(
      shouldStopMetaCampaignPolling({
        transportOnly: false,
        campaignStatus: "completed",
        contacts: [{ status: "sent" }],
      }),
    ).toBe(false);
  });

  it("encerra quando todos os contatos chegaram a delivered/read", () => {
    expect(
      shouldStopMetaCampaignPolling({
        transportOnly: false,
        campaignStatus: "completed",
        contacts: [{ status: "delivered" }, { status: "read" }],
      }),
    ).toBe(true);
  });

  it("mantém o encerramento imediato no modo somente transporte", () => {
    expect(
      shouldStopMetaCampaignPolling({
        transportOnly: true,
        campaignStatus: "completed",
        contacts: [{ status: "sent" }],
      }),
    ).toBe(true);
  });
});
