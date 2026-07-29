import { describe, expect, it } from "vitest";
import { buildFlowConfirmation, flowFieldCatalog } from "../../src/domain/flow-response";

describe("resposta de MiniApp", () => {
  it("monta confirmação com rótulos, opções e seleção de campos", () => {
    const definition = {
      screens: [{
        blocks: [
          { name: "interesse", label: "Seu interesse", options: [{ id: "curso", title: "Curso completo" }] },
          { name: "nome", label: "Nome completo" },
        ],
      }],
    };
    const catalog = flowFieldCatalog(definition);
    expect(buildFlowConfirmation({
      response: { flow_token: "t", interesse: "curso", nome: "Ana" },
      confirmation: { title: "Recebemos ✅", fields: ["interesse"] },
      fieldLabels: catalog.labels,
      optionLabels: catalog.options,
    })).toBe(
      "Recebemos ✅\n\nSeu interesse: Curso completo\n\nQualquer ajuste, responda esta mensagem.",
    );
  });

  it("respeita a desativação da confirmação", () => {
    expect(buildFlowConfirmation({
      response: { nome: "Ana" },
      confirmation: { enabled: false },
    })).toBeNull();
  });
});
