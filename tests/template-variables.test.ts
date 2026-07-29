import { describe, expect, it } from "vitest";
import {
  insertTemplateVariable,
  nextPositionalTemplateVariable,
  positionalTemplateVariables,
} from "../app/lib/template-variables";
import {
  templateBodyExample,
  validateMetaTemplateContent,
} from "../shared/template-validation";

describe("variáveis do editor de templates", () => {
  it("gera a primeira posição livre e não duplica variáveis", () => {
    expect(nextPositionalTemplateVariable("Olá {{1}}, pedido {{3}}"))
      .toBe("{{2}}");
  });

  it("insere no cursor e substitui a seleção", () => {
    expect(insertTemplateVariable("Olá nome!", 4, 8)).toEqual({
      value: "Olá {{1}}!",
      cursor: 9,
      variable: "{{1}}",
    });
  });

  it("lista posições únicas em ordem", () => {
    expect(positionalTemplateVariables("{{3}} {{1}} {{3}}"))
      .toEqual([1, 3]);
  });
});

describe("regras oficiais de conteúdo dos templates Meta", () => {
  it("bloqueia variável no início ou no fim", () => {
    expect(validateMetaTemplateContent("{{1}} oi ?")).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "variable_at_edge" })]),
    );
    expect(validateMetaTemplateContent("Olá {{1}}")).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "variable_at_edge" })]),
    );
  });

  it("exige numeração desde 1 e sem lacunas", () => {
    expect(validateMetaTemplateContent("Olá {{2}}, pedido {{3}} confirmado.")).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "variable_sequence" })]),
    );
    expect(validateMetaTemplateContent("Olá {{1}}, pedido {{3}} confirmado.")).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "variable_sequence" })]),
    );
  });

  it("aceita conteúdo válido e gera exemplos para todas as posições", () => {
    expect(validateMetaTemplateContent("Olá {{1}}, pedido {{2}} confirmado.")).toEqual([]);
    expect(templateBodyExample("Olá {{1}}, pedido {{2}} confirmado.")).toEqual({
      body_text: [["Exemplo 1", "Exemplo 2"]],
    });
  });
});
