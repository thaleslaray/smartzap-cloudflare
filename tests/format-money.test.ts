import { describe, expect, it } from "vitest";
import { formatCampaignMoney, formatCampaignUnit } from "../app/lib/format-money";

describe("formatação de valores de campanha", () => {
  it("mostra BRL como valor principal e mantém o valor Meta em USD", () => {
    expect(formatCampaignMoney(0.0625, "USD", 5.076579)).toEqual({
      primary: "R$ 0,32",
      secondary: "Valor Meta: US$ 0,0625",
    });
  });

  it("não coloca USD como valor principal quando a cotação está indisponível", () => {
    expect(formatCampaignMoney(0.0625, "USD", null)).toEqual({
      primary: "BRL indisponível",
      secondary: "Valor Meta: US$ 0,0625",
    });
  });

  it("converte a tarifa por mensagem para BRL", () => {
    expect(formatCampaignUnit(0.0625, "USD", 5.076579).primary).toBe("R$ 0,3173/msg");
  });
});
