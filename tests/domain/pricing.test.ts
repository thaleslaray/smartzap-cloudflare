import { describe, expect, it } from "vitest";
import {
  countryFromE164,
  estimateCampaignCost,
  normalizePricingCategory,
  parseMetaRateCardCsv,
  parseMetaVolumeTierCsv,
  type PricingRateCard,
} from "../../src/domain/pricing";

const card = (overrides: Partial<PricingRateCard> = {}): PricingRateCard => ({
  source: "https://developers.facebook.com/pricing",
  checksum: "abc",
  effectiveFrom: "2026-07-01",
  effectiveTo: null,
  currency: "BRL",
  market: "Brazil",
  countryIso: "BR",
  category: "MARKETING",
  tierFrom: 0,
  tierTo: null,
  unitPrice: 0.3217,
  ...overrides,
});

describe("Pricing V2", () => {
  it("deriva país e mercado pelo E.164", () => {
    expect(countryFromE164("+5521982219966")).toEqual({ countryIso: "BR", market: "Brazil" });
    expect(countryFromE164("telefone-inválido")).toBeNull();
  });

  it("não transforma categoria desconhecida em marketing", () => {
    expect(normalizePricingCategory("qualquer")).toBeNull();
    const result = estimateCampaignCost({
      category: "qualquer",
      phones: ["+5521982219966"],
      rateCards: [card()],
    });
    expect(result.state).toBe("unavailable");
    expect(result.amount).toBeNull();
  });

  it("calcula por país usando rate card vigente", () => {
    const result = estimateCampaignCost({
      category: "MARKETING",
      phones: ["+5521982219966", "+5521999999999"],
      rateCards: [card()],
      at: "2026-07-16",
      monthlyVolumeByMarket: { Brazil: 0 },
    });
    expect(result.state).toBe("estimated");
    expect(result.amount).toBeCloseTo(0.6434);
    expect(result.currency).toBe("BRL");
    expect(result.breakdown[0]).toMatchObject({ market: "Brazil", recipients: 2 });
  });

  it("fica indisponível para rate card ausente, expirado ou futuro", () => {
    for (const rateCards of [
      [],
      [card({ effectiveFrom: "2026-10-01" })],
      [card({ effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" })],
    ]) {
      const result = estimateCampaignCost({
        category: "MARKETING",
        phones: ["+5521982219966"],
        rateCards,
        at: "2026-07-16",
      });
      expect(result.state).toBe("unavailable");
      expect(result.amount).toBeNull();
    }
  });

  it("utility dentro da janela e free entry point resultam em zero", () => {
    expect(estimateCampaignCost({
      category: "UTILITY",
      phones: ["+5521982219966"],
      rateCards: [card({ category: "UTILITY", unitPrice: 0.035 })],
      at: "2026-07-16",
      serviceWindowOpen: true,
    }).amount).toBe(0);
    expect(estimateCampaignCost({
      category: "MARKETING",
      phones: ["+5521982219966"],
      rateCards: [card()],
      freeEntryPointOpen: true,
    }).amount).toBe(0);
  });

  it("passa a cobrar utility e service na janela a partir de 01/10/2026", () => {
    for (const category of ["UTILITY", "SERVICE"] as const) {
      const result = estimateCampaignCost({
        category,
        phones: ["+5521982219966"],
        rateCards: [card({
          category,
          effectiveFrom: "2026-10-01",
          unitPrice: 0.0068,
        })],
        at: "2026-10-01",
        serviceWindowOpen: true,
        monthlyVolumeByMarket: { Brazil: 0 },
      });
      expect(result.amount).toBe(0.0068);
    }
  });

  it("mantém a janela gratuita de 72 horas após 01/10/2026", () => {
    const result = estimateCampaignCost({
      category: "SERVICE",
      phones: ["+5521982219966"],
      rateCards: [card({
        category: "SERVICE",
        effectiveFrom: "2026-10-01",
        unitPrice: 0.0068,
      })],
      at: "2026-10-01",
      freeEntryPointOpen: true,
    });
    expect(result.amount).toBe(0);
  });

  it("não mistura moedas em uma única estimativa", () => {
    const result = estimateCampaignCost({
      category: "MARKETING",
      phones: ["+5521982219966", "+14155552671"],
      rateCards: [
        card(),
        card({ market: "Other", countryIso: "US", currency: "USD", unitPrice: 0.025 }),
      ],
    });
    expect(result.state).toBe("unavailable");
    expect(result.unavailableReasons.join(" ")).toContain("moedas diferentes");
  });

  it("seleciona tier compatível com volume mensal", () => {
    const result = estimateCampaignCost({
      category: "UTILITY",
      phones: ["+5521982219966"],
      rateCards: [
        card({ category: "UTILITY", unitPrice: 0.035, tierFrom: 0, tierTo: 999 }),
        card({ category: "UTILITY", unitPrice: 0.03, tierFrom: 1000 }),
      ],
      monthlyVolumeByMarket: { Brazil: 1_500 },
    });
    expect(result.amount).toBe(0.03);
    expect(result.confidence).toBe("high");
  });

  it("marca confiança baixa quando tier ainda não foi confirmado", () => {
    const result = estimateCampaignCost({
      category: "MARKETING",
      phones: ["+5521982219966"],
      rateCards: [card()],
    });
    expect(result.confidence).toBe("low");
    expect(result.assumptions).toHaveLength(1);
  });
});

describe("parser oficial de rate card", () => {
  const csv = `"Cost per message in BRL",,,,,\nMarket,Currency,Marketing,Utility,Authentication,"Authentication-\nInternational",Service\nBrazil,BRL,0.3217,0.0350,0.0350,n/a,n/a\nArgentina,BRL,0.3181,0.1338,0.1338,n/a,n/a\n`;

  it("ignora o preâmbulo e materializa categorias oficiais", () => {
    const rows = parseMetaRateCardCsv(csv, {
      source: "https://meta.example/rates.csv",
      checksum: "checksum",
      effectiveFrom: "2026-07-01",
      currency: "BRL",
    });
    expect(rows).toHaveLength(6);
    expect(rows.find((row) => row.market === "Brazil" && row.category === "MARKETING"))
      .toMatchObject({ unitPrice: 0.3217, countryIso: "BR" });
  });

  it("rejeita cabeçalho ausente e moeda divergente", () => {
    expect(() => parseMetaRateCardCsv("foo,bar\n1,2", {
      source: "https://meta.example/rates.csv", checksum: "x", effectiveFrom: "2026-07-01", currency: "BRL",
    })).toThrow("Cabeçalho Market");
    expect(() => parseMetaRateCardCsv(csv.replaceAll("BRL", "USD"), {
      source: "https://meta.example/rates.csv", checksum: "x", effectiveFrom: "2026-07-01", currency: "BRL",
    })).toThrow("Moeda inesperada");
  });

  it("materializa as faixas do CSV oficial de volume tiers", () => {
    const tiers = `Título,,,,,,,,,,,,,,,,\nMercado,,Utility,,,,,Authentication,,,,,Authentication-International,,,,\n,,Mensagens,,,,,Mensagens,,,,,Mensagens,,,,\n,Currency,From,To,Rate type,Rate,vs. List rate,From,To,Rate type,Rate,vs. List rate,From,To,Rate type,Rate,vs. List rate\nBrazil,BRL,0,"250,000",List rate,0.0350,0%,0,"500,000",List rate,0.0350,0%,n/a,n/a,n/a,n/a,n/a\n,BRL,"250,001","2,000,000",Tier rate,0.0333,-5%,"500,001","3,000,000",Tier rate,0.0333,-5%,n/a,n/a,n/a,n/a,n/a\n,BRL,"70,000,001",--,Tier rate,0.0263,-25%,"20,000,001",--,Tier rate,0.0263,-25%,n/a,n/a,n/a,n/a,n/a\n`;
    const rows = parseMetaVolumeTierCsv(tiers, {
      source: "https://meta.example/tiers.csv", checksum: "tiers", effectiveFrom: "2026-07-01", currency: "BRL",
    });
    expect(rows).toHaveLength(6);
    expect(rows.find((row) => row.category === "UTILITY" && row.tierFrom === 250001))
      .toMatchObject({ market: "Brazil", tierTo: 2_000_000, unitPrice: 0.0333 });
    expect(rows.find((row) => row.category === "AUTHENTICATION" && row.tierFrom === 20_000_001))
      .toMatchObject({ tierTo: null, unitPrice: 0.0263 });
  });
});
