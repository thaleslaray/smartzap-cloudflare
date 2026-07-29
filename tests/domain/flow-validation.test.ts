import { describe, expect, it } from "vitest";
import { validateFlowJson } from "../../src/domain/flow-validation";
import { dynamicBookingFlowJson } from "../../src/whatsapp/dynamic-booking";

const staticFlow = () => ({
  version: "7.3",
  screens: [{
    id: "WELCOME",
    title: "Boas-vindas",
    terminal: true,
    sensitive: ["name"],
    layout: {
      type: "SingleColumnLayout",
      children: [{
        type: "Form",
        name: "form",
        children: [
          { type: "TextInput", name: "name", label: "Nome" },
          { type: "Footer", label: "Concluir", "on-click-action": { name: "complete", payload: { name: "${form.name}" } } },
        ],
      }],
    },
  }],
});

describe("validador completo de Flow JSON", () => {
  it("aceita Flow estático e agenda dinâmica corrigida", () => {
    expect(validateFlowJson(staticFlow())).toEqual([]);
    expect(validateFlowJson(dynamicBookingFlowJson())).toEqual([]);
    expect(validateFlowJson(dynamicBookingFlowJson("4.0"))).toEqual([]);
  });

  it("rejeita SUCCESS físico, binding desconhecido e ausência de terminal", () => {
    const flow = staticFlow() as Record<string, any>;
    flow.screens[0].id = "SUCCESS";
    flow.screens[0].terminal = false;
    flow.screens[0].layout.children[0].children[1]["on-click-action"].payload = {
      value: "${data.unknown}",
    };
    const codes = validateFlowJson(flow).map((issue) => issue.code);
    expect(codes).toContain("RESERVED_SCREEN_ID");
    expect(codes).toContain("UNKNOWN_DATA_BINDING");
    expect(codes).toContain("MISSING_TERMINAL");
  });

  it("rejeita rota reversa, destino inexistente e tela inalcançável", () => {
    const flow = dynamicBookingFlowJson() as Record<string, any>;
    flow.routing_model.SELECT_TIME.push("BOOKING_START", "MISSING");
    flow.screens.push({
      id: "ORPHAN",
      layout: { type: "SingleColumnLayout", children: [{ type: "Footer", label: "X", "on-click-action": { name: "complete", payload: {} } }] },
      terminal: true,
    });
    const codes = validateFlowJson(flow).map((issue) => issue.code);
    expect(codes).toContain("BACKWARD_ROUTE");
    expect(codes).toContain("UNKNOWN_ROUTE_TARGET");
    expect(codes).toContain("UNREACHABLE_SCREEN");
  });

  it("valida data_api_version e componentes", () => {
    const flow = dynamicBookingFlowJson() as Record<string, any>;
    flow.data_api_version = "2.0";
    flow.screens[0].layout.children.push({ type: "UnknownWidget" });
    const codes = validateFlowJson(flow).map((issue) => issue.code);
    expect(codes).toContain("INVALID_DATA_API_VERSION");
    expect(codes).toContain("UNSUPPORTED_COMPONENT");
  });

  it("mede o limite em bytes UTF-8, não em caracteres", () => {
    const flow = staticFlow() as Record<string, any>;
    flow.screens[0].layout.children[0].children[0].text = "💚".repeat(2_700_000);
    expect(validateFlowJson(flow).map((issue) => issue.code)).toContain("MAX_BYTES_EXCEEDED");
  });

  it("rejeita propriedades obrigatórias e limites de componente", () => {
    const flow = staticFlow() as Record<string, any>;
    flow.screens[0].title = "";
    flow.screens[0].layout.children[0].children[0].label = "";
    flow.screens[0].layout.children[0].children[1].label = "x".repeat(36);
    const codes = validateFlowJson(flow).map((issue) => issue.code);
    expect(codes).toContain("MISSING_SCREEN_TITLE");
    expect(codes).toContain("MISSING_FIELD_LABEL");
    expect(codes).toContain("FOOTER_LABEL_TOO_LONG");
  });
});
