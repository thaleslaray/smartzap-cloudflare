import { afterEach, describe, expect, it, vi } from "vitest";
import matrix from "../../qa/miniapps-functional-matrix.json";
import { FLOW_TEMPLATES } from "../../app/lib/flow-templates";
import {
  LOCAL_FLOW_BLOCK_TYPES,
  LOCAL_FLOW_BRANCH_OPERATORS,
  validateLocalFlowDefinition,
} from "../../src/domain/flow-definition";
import { validateFlowJson } from "../../src/domain/flow-validation";
import { dynamicBookingFlowJson } from "../../src/whatsapp/dynamic-booking";
import {
  buildMetaFlowJson,
  createMetaFlow,
  getMetaFlowDetails,
  MetaFlowApiError,
  publishMetaFlow,
  updateMetaFlow,
} from "../../src/whatsapp/flows";

type MatrixCase = {
  id: string;
  family: string;
  title: string;
  run: () => void | Promise<void>;
};

type LocalBlock = Record<string, unknown>;

const cases: MatrixCase[] = [];
const add = (family: string, title: string, run: MatrixCase["run"]) => {
  const familyCount = cases.filter((item) => item.family === family).length + 1;
  cases.push({ id: `${family}-${String(familyCount).padStart(3, "0")}`, family, title, run });
};

const options = (amount: number) =>
  Array.from({ length: amount }, (_, index) => ({
    id: `option_${index + 1}`,
    title: `Opção ${index + 1}`,
  }));

const blocks: Record<string, LocalBlock> = {
  TextHeading: { type: "TextHeading", text: "Título" },
  TextSubheading: { type: "TextSubheading", text: "Subtítulo" },
  TextBody: { type: "TextBody", text: "Texto" },
  TextCaption: { type: "TextCaption", text: "Legenda" },
  "TextInput:text": { type: "TextInput", name: "field", label: "Campo", inputType: "text" },
  "TextInput:email": { type: "TextInput", name: "field", label: "E-mail", inputType: "email" },
  "TextInput:phone": { type: "TextInput", name: "field", label: "Telefone", inputType: "phone" },
  "TextInput:number": { type: "TextInput", name: "field", label: "Número", inputType: "number" },
  TextArea: { type: "TextArea", name: "field", label: "Observações" },
  CalendarPicker: { type: "CalendarPicker", name: "field", label: "Data" },
  Dropdown: { type: "Dropdown", name: "field", label: "Lista", options: options(2) },
  RadioButtonsGroup: { type: "RadioButtonsGroup", name: "field", label: "Escolha", options: options(2) },
  CheckboxGroup: { type: "CheckboxGroup", name: "field", label: "Opções", options: options(2) },
  OptIn: { type: "OptIn", name: "field", text: "Aceito os termos" },
};

const definition = (screenBlocks: LocalBlock[] = [{ type: "TextBody", text: "Conteúdo" }]) => ({
  version: "7.3",
  screens: [
    {
      id: "START",
      title: "Início",
      final: true,
      next: null,
      buttonText: "Concluir",
      blocks: screenBlocks,
    },
  ],
});

const routedDefinition = (operator = "equals") => ({
  version: "7.3",
  screens: [
    {
      id: "START",
      title: "Início",
      final: false,
      next: "MIDDLE",
      buttonText: "Continuar",
      blocks: [
        {
          type: "RadioButtonsGroup",
          name: "choice",
          label: "Escolha",
          options: options(2),
        },
      ],
    },
    {
      id: "MIDDLE",
      title: "Meio",
      final: false,
      next: "FINAL",
      buttonText: "Avançar",
      blocks: [{ type: "TextBody", text: "Meio" }],
    },
    {
      id: "FINAL",
      title: "Final",
      final: true,
      next: null,
      buttonText: "Concluir",
      blocks: [{ type: "TextBody", text: "Fim" }],
    },
  ],
  branchesByScreen: {
    START: [{ field: "choice", op: operator, value: "option_1", next: "FINAL" }],
  },
});

const codes = (value: unknown, mapping: unknown = {}, requireScreens = false) =>
  validateLocalFlowDefinition(value, mapping, { requireScreens }).map((issue) => issue.code);
const expectLocalValid = (value: unknown, mapping: unknown = {}) =>
  expect(validateLocalFlowDefinition(value, mapping)).toEqual([]);
const expectFlowValid = (value: unknown) => {
  const flow = buildMetaFlowJson(value);
  expect(validateFlowJson(flow)).toEqual([]);
  return flow;
};
const fetchSequence = (...responses: Array<{ status?: number; body: Record<string, unknown> }>) => {
  const mock = vi.fn(async () => {
    const response = responses[mock.mock.calls.length - 1] ?? responses.at(-1)!;
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
};

afterEach(() => vi.unstubAllGlobals());

// MF-CONTRACT — 8
add("MF-CONTRACT", "os 14 blocos declarados atravessam o pipeline", () => {
  const all = Object.entries(blocks).map(([key, block], index) => ({
    ...structuredClone(block),
    name: "name" in block ? `field_${index}` : undefined,
  }));
  const flow = expectFlowValid(definition(all));
  const serialized = JSON.stringify(flow);
  for (const type of LOCAL_FLOW_BLOCK_TYPES) expect(serialized).toContain(type);
});
for (const type of ["DatePicker", "PhotoPicker", "DocumentPicker"]) {
  add("MF-CONTRACT", `${type} é bloqueado explicitamente`, () => {
    const value = definition([{ type, name: "field", label: "Campo" }]);
    expect(codes(value)).toContain("UNSUPPORTED_EDITOR_COMPONENT");
    expect(() => buildMetaFlowJson(value)).toThrow(/UNSUPPORTED_EDITOR_COMPONENT/);
    const rawFlow = {
      version: "7.3",
      screens: [{
        id: "START", title: "Início", terminal: true,
        layout: { type: "SingleColumnLayout", children: [{
          type: "Form", name: "form", children: [
            { type, name: "field", label: "Campo" },
            { type: "Footer", label: "Concluir", "on-click-action": { name: "complete", payload: {} } },
          ],
        }] },
      }],
    };
    expect(validateFlowJson(rawFlow).map((issue) => issue.code)).toContain("UNSUPPORTED_COMPONENT");
  });
}
for (const action of ["open_url", "update_data"]) {
  add("MF-CONTRACT", `${action} é bloqueada explicitamente`, () => {
    const value = definition([
      { type: "TextBody", text: "Texto", "on-click-action": { name: action } },
    ]);
    expect(codes(value)).toContain("UNSUPPORTED_LOCAL_ACTION");
    expect(() => buildMetaFlowJson(value)).toThrow(/UNSUPPORTED_LOCAL_ACTION/);
    const rawFlow = {
      version: "7.3",
      screens: [{
        id: "START", title: "Início", terminal: false,
        layout: { type: "SingleColumnLayout", children: [
          { type: "TextBody", text: "Texto" },
          { type: "Footer", label: "Abrir", "on-click-action": { name: action, url: "https://example.com" } },
        ] },
      }],
    };
    expect(validateFlowJson(rawFlow).map((issue) => issue.code)).toContain("INVALID_ACTION");
  });
}
add("MF-CONTRACT", "componente desconhecido falha fechado", () => {
  expect(codes(definition([{ type: "CustomWidget" }]))).toContain("UNKNOWN_EDITOR_COMPONENT");
});
add("MF-CONTRACT", "save e reopen preservam a semântica", () => {
  const source = routedDefinition();
  const reopened = JSON.parse(JSON.stringify(source));
  expect(reopened).toEqual(source);
  expect(buildMetaFlowJson(reopened)).toEqual(buildMetaFlowJson(source));
});

// MF-ENTRY — 8
add("MF-ENTRY", "rascunho em branco é persistível", () => expectLocalValid({}));
add("MF-ENTRY", "rascunho em branco não é publicável", () =>
  expect(() => buildMetaFlowJson({})).toThrow(/EMPTY_SCREENS/));
add("MF-ENTRY", "criação direta com uma tela", () => { expectFlowValid(definition()); });
add("MF-ENTRY", "modelo pronto mantém definition e mapping", () => {
  const template = FLOW_TEMPLATES[0];
  expectLocalValid(template.definition, template.mapping);
});
add("MF-ENTRY", "estrutura produzida pela IA é publicável", () => {
  const ai = {
    version: "7.3",
    screens: [{ id: "AI", title: "Gerada", text: "Conteúdo", buttonText: "Concluir", final: true, next: null }],
  };
  expectFlowValid(ai);
});
add("MF-ENTRY", "cancelar não altera a definição original", () => {
  const original = definition();
  const draft = structuredClone(original);
  draft.screens[0].title = "Alterado";
  expect(original.screens[0].title).toBe("Início");
});
add("MF-ENTRY", "título vazio é recusado", () => {
  const value = definition();
  value.screens[0].title = "";
  expect(codes(value)).toContain("MISSING_SCREEN_TITLE");
});
add("MF-ENTRY", "ID duplicado é recusado", () => {
  const value = routedDefinition();
  value.screens[1].id = "START";
  expect(codes(value)).toContain("DUPLICATE_SCREEN_ID");
});

// MF-TEMPLATES — 8
for (const template of FLOW_TEMPLATES) {
  add("MF-TEMPLATES", `${template.key} é íntegro e publicável`, () => {
    expect(matrix.declaredCapabilities.templates).toContain(template.key);
    expectLocalValid(template.definition, template.mapping);
    const flow = buildMetaFlowJson(template.definition) as Record<string, any>;
    expect(validateFlowJson(flow)).toEqual([]);
    if (!template.dynamic) {
      const footer = flow.screens[0].layout.children[0].children.at(-1);
      const expectedFields = template.definition.screens[0].blocks
        .map((block) => block.name)
        .filter(Boolean);
      for (const field of expectedFields)
        expect(footer["on-click-action"].payload[field!]).toBe(`\${form.${field}}`);
    }
  });
}

// MF-BLOCKS — 14
for (const blockKey of matrix.declaredCapabilities.editorBlocks) {
  add("MF-BLOCKS", `${blockKey} preserva contrato`, () => {
    const source = structuredClone(blocks[blockKey]);
    const flow = expectFlowValid(definition([source]));
    const serialized = JSON.stringify(flow);
    const expectedType = blockKey.split(":")[0];
    expect(serialized).toContain(`\"type\":\"${expectedType}\"`);
    if (blockKey.startsWith("TextInput:"))
      expect(serialized).toContain(`\"input-type\":\"${blockKey.split(":")[1]}\"`);
  });
}

// MF-BOUNDARIES — 28
for (const count of [1, 10]) {
  add("MF-BOUNDARIES", `${count} tela(s) é aceito`, () => {
    const screens = Array.from({ length: count }, (_, index) => ({
      id: `SCREEN_${index}`,
      title: `Tela ${index}`,
      final: index === count - 1,
      next: index < count - 1 ? `SCREEN_${index + 1}` : null,
      blocks: [{ type: "TextBody", text: "Texto" }],
    }));
    expectLocalValid({ screens });
  });
}
add("MF-BOUNDARIES", "11 telas é recusado", () => {
  const screens = Array.from({ length: 11 }, (_, index) => ({ id: `S_${index}`, title: "Tela", blocks: [] }));
  expect(codes({ screens })).toContain("TOO_MANY_SCREENS");
});
for (const count of [47, 48]) {
  add("MF-BOUNDARIES", `${count} blocos é aceito`, () =>
    expectLocalValid(definition(Array.from({ length: count }, () => ({ type: "TextBody", text: "x" })))));
}
add("MF-BOUNDARIES", "49 blocos é recusado", () =>
  expect(codes(definition(Array.from({ length: 49 }, () => ({ type: "TextBody", text: "x" }))))).toContain("TOO_MANY_BLOCKS"));
for (const count of [5, 6]) {
  add("MF-BOUNDARIES", `${count} OptIns respeitam o limite`, () => {
    const value = definition(Array.from({ length: count }, (_, index) => ({
      type: "OptIn", name: `optin_${index}`, text: "Aceito",
    })));
    expect(codes(value).includes("TOO_MANY_OPT_INS")).toBe(count > 5);
  });
}
for (const [type, limit] of Object.entries({ TextHeading: 80, TextSubheading: 80, TextBody: 4096, TextCaption: 409 })) {
  for (const delta of [0, 1]) {
    add("MF-BOUNDARIES", `${type} em ${limit + delta} caracteres`, () => {
      const value = definition([{ type, text: "x".repeat(limit + delta) }]);
      expect(codes(value).includes("TEXT_TOO_LONG")).toBe(delta === 1);
    });
  }
}
for (const delta of [0, 1]) {
  add("MF-BOUNDARIES", `OptIn em ${120 + delta} caracteres`, () => {
    const value = definition([{ type: "OptIn", name: "consent", text: "x".repeat(120 + delta) }]);
    expect(codes(value).includes("FIELD_LABEL_TOO_LONG")).toBe(delta === 1);
  });
  add("MF-BOUNDARIES", `título da tela em ${80 + delta} caracteres`, () => {
    const value = definition();
    value.screens[0].title = "x".repeat(80 + delta);
    expect(codes(value).includes("SCREEN_TITLE_TOO_LONG")).toBe(delta === 1);
  });
  add("MF-BOUNDARIES", `botão em ${35 + delta} caracteres`, () => {
    const value = definition();
    value.screens[0].buttonText = "x".repeat(35 + delta);
    expect(codes(value).includes("BUTTON_TEXT_TOO_LONG")).toBe(delta === 1);
  });
}
for (const [type, limit] of [["Dropdown", 200], ["RadioButtonsGroup", 20], ["CheckboxGroup", 20]] as const) {
  for (const delta of [0, 1]) {
    add("MF-BOUNDARIES", `${type} com ${limit + delta} opções`, () => {
      const value = definition([{ type, name: "choice", label: "Escolha", options: options(limit + delta) }]);
      expect(codes(value).includes("TOO_MANY_OPTIONS")).toBe(delta === 1);
    });
  }
}

// MF-SCREENS — 10
add("MF-SCREENS", "duas telas encadeadas", () => { expectFlowValid(routedDefinition()); });
add("MF-SCREENS", "dez telas encadeadas", () => {
  const screens = Array.from({ length: 10 }, (_, index) => ({
    id: `S_${index}`, title: "Tela", final: index === 9, next: index < 9 ? `S_${index + 1}` : null,
    blocks: [{ type: "TextBody", text: "Texto" }],
  }));
  expectFlowValid({ screens });
});
add("MF-SCREENS", "ID duplicado", () => {
  const value = routedDefinition(); value.screens[1].id = "START";
  expect(codes(value)).toContain("DUPLICATE_SCREEN_ID");
});
add("MF-SCREENS", "destino inexistente", () => {
  const value = routedDefinition(); value.screens[0].next = "UNKNOWN";
  expect(codes(value)).toContain("UNKNOWN_SCREEN_TARGET");
});
add("MF-SCREENS", "destino para trás", () => {
  const value = routedDefinition(); value.screens[1].next = "START";
  expect(codes(value)).toContain("BACKWARD_SCREEN_TARGET");
});
add("MF-SCREENS", "última tela terminal", () => { expectFlowValid(definition()); });
add("MF-SCREENS", "renomear atualiza referências", () => {
  const value = routedDefinition();
  value.screens[1].id = "RENAMED"; value.screens[0].next = "RENAMED"; value.screens[1].next = "FINAL";
  expectLocalValid(value);
});
add("MF-SCREENS", "ramificação para tela inexistente", () => {
  const value = routedDefinition(); value.branchesByScreen.START[0].next = "UNKNOWN";
  expect(codes(value)).toContain("UNKNOWN_BRANCH_TARGET");
});
add("MF-SCREENS", "mais de uma tela terminal", () => {
  const value = routedDefinition(); value.screens[1].final = true;
  expectLocalValid(value);
});
add("MF-SCREENS", "tela sem blocos usa texto de fallback", () => {
  const value = definition([]); (value.screens[0] as Record<string, unknown>).text = "Fallback explícito";
  expect(JSON.stringify(expectFlowValid(value))).toContain("Fallback explícito");
});

// MF-BRANCHES — 12
for (const operator of LOCAL_FLOW_BRANCH_OPERATORS) {
  add("MF-BRANCHES", `${operator} é aceito`, () => { expectFlowValid(routedDefinition(operator)); });
}
add("MF-BRANCHES", "a ordem das regras é preservada", () => {
  const value = routedDefinition();
  value.branchesByScreen.START.push({ field: "choice", op: "is_filled", value: "", next: "MIDDLE" });
  expectLocalValid(value);
  expect(value.branchesByScreen.START.map((rule) => rule.op)).toEqual(["equals", "is_filled"]);
});
add("MF-BRANCHES", "destino padrão é preservado", () => {
  const flow = expectFlowValid(routedDefinition()) as { routing_model: Record<string, string[]> };
  expect(flow.routing_model.SCREEN_A).toEqual(expect.arrayContaining(["SCREEN_B", "SCREEN_C"]));
});
add("MF-BRANCHES", "campo removido invalida a regra", () => {
  const value = routedDefinition(); value.screens[0].blocks = [{ type: "TextBody", text: "Sem campo" }];
  expect(codes(value)).toContain("UNKNOWN_BRANCH_FIELD");
});
add("MF-BRANCHES", "destino anterior é recusado", () => {
  const value = routedDefinition();
  (value.branchesByScreen as Record<string, Array<Record<string, unknown>>>).MIDDLE = [
    { field: "choice", op: "equals", value: "x", next: "START" },
  ];
  expect(codes(value)).toEqual(expect.arrayContaining(["UNKNOWN_BRANCH_FIELD", "BACKWARD_BRANCH_TARGET"]));
});

// MF-MAPPING — 10
add("MF-MAPPING", "mapeia nome", () => expectLocalValid(definition([{ ...blocks["TextInput:text"], name: "name" }]), { contact: { nameField: "name" } }));
add("MF-MAPPING", "mapeia e-mail", () => expectLocalValid(definition([{ ...blocks["TextInput:email"], name: "email" }]), { contact: { emailField: "email" } }));
add("MF-MAPPING", "mapeia campo personalizado", () => expectLocalValid(definition([{ ...blocks["TextInput:text"], name: "value" }]), { customFields: { custom: "value" } }));
add("MF-MAPPING", "mapeia múltiplos campos", () => expectLocalValid(definition([
  { ...blocks["TextInput:text"], name: "name" }, { ...blocks["TextInput:email"], name: "email" },
]), { contact: { nameField: "name", emailField: "email" } }));
add("MF-MAPPING", "campo opcional ausente não cria mapping", () => expectLocalValid(definition(), {}));
add("MF-MAPPING", "campo inexistente é recusado", () => expect(codes(definition(), { contact: { nameField: "missing" } })).toContain("UNKNOWN_MAPPING_FIELD"));
add("MF-MAPPING", "OptIn pode alimentar campo personalizado", () => expectLocalValid(definition([{ ...blocks.OptIn, name: "consent" }]), { customFields: { consent_id: "consent" } }));
add("MF-MAPPING", "o mesmo campo pode alimentar nome e e-mail quando explicitado", () => expectLocalValid(definition([{ ...blocks["TextInput:text"], name: "identity" }]), { contact: { nameField: "identity", emailField: "identity" } }));
add("MF-MAPPING", "confirmação aceita campos existentes", () => {
  const value = definition([{ ...blocks["TextInput:text"], name: "name" }]);
  Object.assign(value, { confirmation: { title: "Recebemos", fields: ["name"] } });
  expectLocalValid(value);
});
add("MF-MAPPING", "confirmação recusa campo inexistente", () => {
  const value = { ...definition(), confirmation: { fields: ["missing"] } };
  expect(codes(value)).toContain("UNKNOWN_CONFIRMATION_FIELD");
});

// MF-LIFECYCLE — 12
add("MF-LIFECYCLE", "rascunho local vazio", () => expectLocalValid({}));
add("MF-LIFECYCLE", "save/reopen por JSON", () => {
  const value = routedDefinition(); expect(JSON.parse(JSON.stringify(value))).toEqual(value);
});
add("MF-LIFECYCLE", "cria draft remoto", async () => {
  const mock = fetchSequence({ body: { id: "123", validation_errors: [] } });
  await expect(createMetaFlow({ token: "token", version: "v25.0", wabaId: "waba", name: "Flow", flowJson: expectFlowValid(definition()), publish: false })).resolves.toEqual({ id: "123", validationErrors: [] });
  expect(mock).toHaveBeenCalledTimes(1);
});
add("MF-LIFECYCLE", "consulta validação do draft", async () => {
  fetchSequence({ body: { id: "123", status: "DRAFT", validation_errors: [], data_api_version: "3.0" } });
  await expect(getMetaFlowDetails({ token: "token", version: "v25.0", flowId: "123" })).resolves.toMatchObject({ status: "DRAFT", validationErrors: [] });
});
add("MF-LIFECYCLE", "publica draft", async () => {
  const mock = fetchSequence({ body: { success: true } });
  await publishMetaFlow({ token: "token", version: "v25.0", flowId: "123" });
  expect(mock).toHaveBeenCalledTimes(1);
});
add("MF-LIFECYCLE", "atualiza metadata e asset do mesmo Flow", async () => {
  const mock = fetchSequence({ body: { success: true } }, { body: { validation_errors: [] } });
  await updateMetaFlow({ token: "token", version: "v25.0", flowId: "123", name: "Flow", flowJson: expectFlowValid(definition()) });
  expect(mock).toHaveBeenCalledTimes(2);
});
add("MF-LIFECYCLE", "Flow estático usa navegação", () => expect(expectFlowValid(definition())).not.toHaveProperty("data_api_version"));
add("MF-LIFECYCLE", "Flow ramificado usa data_exchange", () => expect(expectFlowValid(routedDefinition())).toHaveProperty("data_api_version", "3.0"));
add("MF-LIFECYCLE", "rejeição do provedor é preservada", async () => {
  fetchSequence({ status: 400, body: { error: { message: "rejeitado", code: 100 } } });
  await expect(createMetaFlow({ token: "token", version: "v25.0", wabaId: "waba", name: "Flow", flowJson: expectFlowValid(definition()), publish: false })).rejects.toMatchObject({ name: "MetaFlowApiError", code: 100 });
});
add("MF-LIFECYCLE", "versão Graph inválida falha antes da rede", async () => {
  const mock = vi.fn(); vi.stubGlobal("fetch", mock);
  await expect(publishMetaFlow({ token: "token", version: "latest", flowId: "123" })).rejects.toThrow(/Graph inválida/);
  expect(mock).not.toHaveBeenCalled();
});
add("MF-LIFECYCLE", "ID remoto ausente é recusado", async () => {
  fetchSequence({ body: { success: true } });
  await expect(createMetaFlow({ token: "token", version: "v25.0", wabaId: "waba", name: "Flow", flowJson: expectFlowValid(definition()), publish: false })).rejects.toThrow(/não devolveu o ID/);
});
add("MF-LIFECYCLE", "erro remoto não expõe payload bruto", async () => {
  fetchSequence({ status: 500, body: { error: { message: "Falha operacional", code: 2 } } });
  try {
    await publishMetaFlow({ token: "secret-token", version: "v25.0", flowId: "123" });
    throw new Error("deveria falhar");
  } catch (error) {
    expect(error).toBeInstanceOf(MetaFlowApiError);
    expect(String(error)).not.toContain("secret-token");
  }
});

// MF-DYNAMIC — 13
for (const version of ["3.0", "4.0"] as const) {
  add("MF-DYNAMIC", `Data API ${version} é válida`, () => expect(validateFlowJson(dynamicBookingFlowJson(version))).toEqual([]));
}
add("MF-DYNAMIC", "data_api_version ausente é recusada", () => {
  const flow = dynamicBookingFlowJson(); delete flow.data_api_version;
  expect(validateFlowJson(flow).map((issue) => issue.code)).toContain("INVALID_DATA_API_VERSION");
});
add("MF-DYNAMIC", "Data API 2.0 é recusada", () => {
  const flow = dynamicBookingFlowJson(); flow.data_api_version = "2.0";
  expect(validateFlowJson(flow).map((issue) => issue.code)).toContain("INVALID_DATA_API_VERSION");
});
add("MF-DYNAMIC", "routing_model ausente é recusado", () => {
  const flow = dynamicBookingFlowJson(); delete flow.routing_model;
  expect(validateFlowJson(flow).map((issue) => issue.code)).toContain("MISSING_ROUTING_MODEL");
});
add("MF-DYNAMIC", "origem de rota inexistente é recusada", () => {
  const flow = dynamicBookingFlowJson(); (flow.routing_model as Record<string, string[]>).UNKNOWN = [];
  expect(validateFlowJson(flow).map((issue) => issue.code)).toContain("UNKNOWN_ROUTE_SOURCE");
});
add("MF-DYNAMIC", "destino de rota inexistente é recusado", () => {
  const flow = dynamicBookingFlowJson(); (flow.routing_model as Record<string, string[]>).BOOKING_START.push("UNKNOWN");
  expect(validateFlowJson(flow).map((issue) => issue.code)).toContain("UNKNOWN_ROUTE_TARGET");
});
add("MF-DYNAMIC", "rota para si é recusada", () => {
  const flow = dynamicBookingFlowJson(); (flow.routing_model as Record<string, string[]>).BOOKING_START = ["BOOKING_START"];
  expect(validateFlowJson(flow).map((issue) => issue.code)).toContain("SELF_ROUTE");
});
add("MF-DYNAMIC", "rota para trás é recusada", () => {
  const flow = dynamicBookingFlowJson(); (flow.routing_model as Record<string, string[]>).SELECT_TIME = ["BOOKING_START"];
  expect(validateFlowJson(flow).map((issue) => issue.code)).toContain("BACKWARD_ROUTE");
});
add("MF-DYNAMIC", "binding data desconhecido é recusado", () => {
  const flow = dynamicBookingFlowJson();
  const first = (flow.screens as Array<Record<string, unknown>>)[0]; first.title = "${data.unknown}";
  expect(validateFlowJson(flow).map((issue) => issue.code)).toContain("UNKNOWN_DATA_BINDING");
});
add("MF-DYNAMIC", "binding form desconhecido é recusado", () => {
  const flow = dynamicBookingFlowJson();
  const first = (flow.screens as Array<any>)[0]; first.layout.children[0].children[0].text = "${form.unknown}";
  expect(validateFlowJson(flow).map((issue) => issue.code)).toContain("UNKNOWN_FORM_BINDING");
});
add("MF-DYNAMIC", "Flow com data_exchange mantém tela terminal compatível com a Meta", () => {
  const flow = dynamicBookingFlowJson() as Record<string, any>;
  expect(flow.screens.at(-1).terminal).toBe(true);
  expect(validateFlowJson(flow).map((issue) => issue.code)).not.toContain("MISSING_TERMINAL");
});
add("MF-DYNAMIC", "modelo dinâmico aceita campos gerados pelo endpoint", () => {
  const template = FLOW_TEMPLATES.find((item) => item.key === "agendamento_dinamico_v1")!;
  expectLocalValid(template.definition, template.mapping);
});

// MF-CROSS — 24 combinações pairwise determinísticas
for (let index = 0; index < 24; index += 1) {
  add("MF-CROSS", `combinação pairwise ${index + 1}`, () => {
    const blockKey = matrix.declaredCapabilities.editorBlocks[index % matrix.declaredCapabilities.editorBlocks.length];
    const secondKey = matrix.declaredCapabilities.editorBlocks[(index * 5 + 3) % matrix.declaredCapabilities.editorBlocks.length];
    const first = { ...structuredClone(blocks[blockKey]), ...(inputTypesForTest(blockKey) ? { name: `first_${index}` } : {}) };
    const second = { ...structuredClone(blocks[secondKey]), ...(inputTypesForTest(secondKey) ? { name: `second_${index}` } : {}) };
    const value = routedDefinition(matrix.declaredCapabilities.branchOperators[index % matrix.declaredCapabilities.branchOperators.length]);
    (value.screens[0].blocks as LocalBlock[]).push(first, second);
    expectLocalValid(value);
    expect(validateFlowJson(buildMetaFlowJson(value, index % 2 === 0 ? "3.0" : "4.0"))).toEqual([]);
  });
}

function inputTypesForTest(blockKey: string) {
  return ["TextInput", "TextArea", "CalendarPicker", "Dropdown", "RadioButtonsGroup", "CheckboxGroup", "OptIn"]
    .includes(blockKey.split(":")[0]);
}

const expectedByFamily = Object.fromEntries(
  matrix.testFamilies.map((family) => [family.id, family.expectedCases]),
);
const actualByFamily = Object.fromEntries(
  matrix.testFamilies.map((family) => [
    family.id,
    cases.filter((testCase) => testCase.family === family.id).length,
  ]),
);

if (cases.length !== 147 || JSON.stringify(actualByFamily) !== JSON.stringify(expectedByFamily)) {
  throw new Error(
    `Matriz materializada incorretamente: total=${cases.length}; famílias=${JSON.stringify(actualByFamily)}`,
  );
}

describe("MINI-FUNCTIONAL-V1 — 147 casos materializados", () => {
  for (const testCase of cases) {
    it(`${testCase.id} ${testCase.title}`, testCase.run);
  }
});
