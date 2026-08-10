import { describe, expect, it } from "vitest";
import {
  isSimpleTemplateCategory,
  isSimpleTemplateSendContract,
  isSimpleTemplateSendSupported,
  validateSimpleTemplateButtons,
} from "../shared/template-validation";

describe("categorias do editor simples de templates", () => {
  it.each(["MARKETING", "UTILITY"])("aceita %s", (category) => {
    expect(isSimpleTemplateCategory(category)).toBe(true);
  });

  it("não anuncia Autenticação sem um fluxo OTP próprio", () => {
    expect(isSimpleTemplateCategory("AUTHENTICATION")).toBe(false);
  });
});

describe("contrato de envio simples", () => {
  it("aceita texto, rodapé e os três tipos de botão representados", () => {
    const components = [
      { type: "HEADER", format: "TEXT", text: "Pedido {{1}}" },
      { type: "BODY", text: "Olá {{1}}" },
      { type: "FOOTER", text: "SmartZap" },
      { type: "BUTTONS", buttons: [
        { type: "QUICK_REPLY", text: "Confirmar" },
        { type: "URL", text: "Abrir", url: "https://example.com/{{1}}" },
        { type: "PHONE_NUMBER", text: "Ligar", phone_number: "+5511999999999" },
      ] },
    ];
    expect(isSimpleTemplateSendContract(components)).toBe(true);
    expect(isSimpleTemplateSendSupported("MARKETING", components)).toBe(true);
    expect(isSimpleTemplateSendSupported("UTILITY", components)).toBe(true);
  });

  it.each([
    [[{ type: "HEADER", format: "VIDEO" }, { type: "BODY", text: "Vídeo" }]],
    [[{ type: "CAROUSEL", cards: [] }, { type: "BODY", text: "Cards" }]],
    [[{ type: "BODY", text: "Código" }, { type: "BUTTONS", buttons: [{ type: "COPY_CODE" }] }]],
    [[{ type: "BODY", text: "Fluxo" }, { type: "BUTTONS", buttons: [{ type: "FLOW" }] }]],
  ])("recusa contrato dinâmico não representado: %j", (components) => {
    expect(isSimpleTemplateSendContract(components)).toBe(false);
  });

  it("recusa Autenticação mesmo quando os componentes parecem simples", () => {
    expect(isSimpleTemplateSendSupported("AUTHENTICATION", [
      { type: "BODY", text: "Código" },
    ])).toBe(false);
  });
});

describe("matriz completa dos botões suportados", () => {
  it("aceita resposta rápida, URL estática, URL dinâmica e telefone", () => {
    expect(validateSimpleTemplateButtons([
      { type: "QUICK_REPLY", text: "Confirmar" },
      { type: "QUICK_REPLY", text: "Cancelar" },
      { type: "URL", text: "Acompanhar", url: "https://example.com/pedido" },
      {
        type: "URL",
        text: "Abrir pedido",
        url: "https://example.com/pedido/{{1}}",
        example: ["pedido-123"],
      },
      { type: "PHONE_NUMBER", text: "Ligar", phone_number: "+5511999999999" },
    ])).toEqual([]);
  });

  it("aceita os grupos em ordem inversa sem intercalar", () => {
    expect(validateSimpleTemplateButtons([
      { type: "URL", text: "Site", url: "https://example.com" },
      { type: "PHONE_NUMBER", text: "Ligar", phone_number: "+5511999999999" },
      { type: "QUICK_REPLY", text: "Sim" },
      { type: "QUICK_REPLY", text: "Não" },
    ])).toEqual([]);
  });

  it("rejeita intercalar respostas rápidas e ações", () => {
    expect(validateSimpleTemplateButtons([
      { type: "QUICK_REPLY", text: "Sim" },
      { type: "URL", text: "Site", url: "https://example.com" },
      { type: "QUICK_REPLY", text: "Não" },
    ])).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid_button_grouping" }),
    ]));
  });

  it("rejeita URL dinâmica sem exemplo, fora do final ou com outra posição", () => {
    for (const url of [
      "https://example.com/{{1}}/detalhe",
      "https://example.com/{{2}}",
      "https://example.com/{{1}}/{{2}}",
    ]) {
      expect(validateSimpleTemplateButtons([
        { type: "URL", text: "Abrir", url, example: ["pedido-123"] },
      ])).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "invalid_url_variable" }),
      ]));
    }
    expect(validateSimpleTemplateButtons([
      { type: "URL", text: "Abrir", url: "https://example.com/{{1}}" },
    ])).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "url_example_required" }),
    ]));
  });

  it("rejeita limites, campos inválidos e tipos fora do editor", () => {
    const issues = validateSimpleTemplateButtons([
      { type: "URL", text: "URL 1", url: "http://inseguro.example" },
      { type: "URL", text: "URL 2", url: "https://example.com/2" },
      { type: "URL", text: "URL 3", url: "https://example.com/3" },
      { type: "PHONE_NUMBER", text: "Fone 1", phone_number: "123" },
      { type: "PHONE_NUMBER", text: "Fone 2", phone_number: "+5511999999999" },
      { type: "FLOW", text: "Abrir" },
      ...Array.from({ length: 5 }, (_, index) => ({
        type: "QUICK_REPLY",
        text: index === 0 ? "" : `Resposta ${index}`,
      })),
    ]);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "too_many_buttons" }),
      expect.objectContaining({ code: "too_many_urls" }),
      expect.objectContaining({ code: "too_many_phones" }),
      expect.objectContaining({ code: "invalid_url" }),
      expect.objectContaining({ code: "invalid_phone" }),
      expect.objectContaining({ code: "unsupported_button" }),
      expect.objectContaining({ code: "button_text_required" }),
    ]));
  });
});
