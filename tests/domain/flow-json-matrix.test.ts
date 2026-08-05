import { describe, expect, it } from "vitest";
import { validateFlowJson } from "../../src/domain/flow-validation";
import { buildMetaFlowJson } from "../../src/whatsapp/flows";

const options = (amount: number) =>
  Array.from({ length: amount }, (_, index) => ({
    id: `opcao_${index + 1}`,
    title: `Opção ${index + 1}`,
  }));

const everySupportedBlock = [
  { type: "TextHeading", text: "Título" },
  { type: "TextSubheading", text: "Subtítulo" },
  { type: "TextBody", text: "Texto principal" },
  { type: "TextCaption", text: "Legenda" },
  { type: "TextInput", name: "nome", label: "Nome", required: true, inputType: "text" },
  { type: "TextInput", name: "email", label: "E-mail", required: true, inputType: "email" },
  { type: "TextInput", name: "telefone", label: "Telefone", inputType: "phone" },
  { type: "TextInput", name: "numero", label: "Número", inputType: "number" },
  { type: "TextArea", name: "observacoes", label: "Observações" },
  { type: "CalendarPicker", name: "data", label: "Data" },
  { type: "Dropdown", name: "lista", label: "Lista", options: options(3) },
  { type: "RadioButtonsGroup", name: "unica", label: "Escolha única", options: options(3) },
  { type: "CheckboxGroup", name: "multipla", label: "Múltipla escolha", options: options(3) },
  { type: "OptIn", name: "aceite", text: "Aceito os termos", required: true },
];

const twoScreenDefinition = () => ({
  screens: [
    {
      id: "inicio",
      title: "Dados",
      final: false,
      next: "fim",
      buttonText: "Continuar",
      blocks: everySupportedBlock,
    },
    {
      id: "fim",
      title: "Conclusão",
      final: true,
      next: null,
      buttonText: "Concluir",
      blocks: [{ type: "TextBody", text: "Tudo certo" }],
    },
  ],
});

describe("matriz completa do gerador de MiniApps", () => {
  it("gera JSON válido com todos os componentes suportados e duas telas", () => {
    const flow = buildMetaFlowJson(twoScreenDefinition()) as {
      screens: Array<{
        layout: { children: Array<{ children: Array<Record<string, unknown>> }> };
      }>;
    };

    expect(validateFlowJson(flow)).toEqual([]);
    expect(flow.screens).toHaveLength(2);
    expect(JSON.stringify(flow)).toContain("CheckboxGroup");
    expect(JSON.stringify(flow)).toContain("CalendarPicker");
    expect(JSON.stringify(flow)).toContain("OptIn");
    const optIn = flow.screens[0].layout.children[0].children.find(
      (component: Record<string, unknown>) => component.type === "OptIn",
    ) as Record<string, unknown>;
    expect(optIn.label).toBe("Aceito os termos");
    expect(optIn.required).toBe(true);
    expect(optIn).not.toHaveProperty("text");
  });

  it("gera navegação condicional e routing_model válidos", () => {
    const definition = {
      screens: [
        {
          id: "pergunta",
          title: "Pergunta",
          next: "padrao",
          buttonText: "Continuar",
          blocks: [{ type: "RadioButtonsGroup", name: "rota", label: "Escolha", options: options(2) }],
        },
        { id: "especial", title: "Especial", final: true, blocks: [{ type: "TextBody", text: "Rota especial" }] },
        { id: "padrao", title: "Padrão", final: true, blocks: [{ type: "TextBody", text: "Rota padrão" }] },
      ],
      branchesByScreen: {
        pergunta: [{ field: "rota", op: "equals", value: "opcao_1", next: "especial" }],
      },
    };

    const flow = buildMetaFlowJson(definition);
    expect(validateFlowJson(flow)).toEqual([]);
    expect(flow).toHaveProperty("routing_model");
    expect(JSON.stringify(flow)).toContain("data_exchange");
  });

  it("aceita opções no máximo e recusa máximo mais um sem truncar", () => {
    const definition = twoScreenDefinition();
    definition.screens[0].blocks = [
      { type: "Dropdown", name: "lista", label: "Lista", options: options(200) },
      { type: "RadioButtonsGroup", name: "radio", label: "Escolha", options: options(20) },
      { type: "CheckboxGroup", name: "checks", label: "Opções", options: options(20) },
    ];
    const flow = buildMetaFlowJson(definition) as Record<string, any>;
    const components = flow.screens[0].layout.children[0].children;

    expect(components.find((item: any) => item.type === "Dropdown")["data-source"]).toHaveLength(200);
    expect(components.find((item: any) => item.type === "RadioButtonsGroup")["data-source"]).toHaveLength(20);
    expect(components.find((item: any) => item.type === "CheckboxGroup")["data-source"]).toHaveLength(20);
    expect(validateFlowJson(flow)).toEqual([]);

    const excessive = twoScreenDefinition();
    excessive.screens[0].blocks = [
      { type: "Dropdown", name: "lista", label: "Lista", options: options(201) },
    ];
    expect(() => buildMetaFlowJson(excessive)).toThrow(/TOO_MANY_OPTIONS/);
  });

  it("aceita dez telas e bloqueia a décima primeira", () => {
    const screens = Array.from({ length: 10 }, (_, index) => ({
      id: `local_${index}`,
      title: `Tela ${index + 1}`,
      final: index === 9,
      next: index < 9 ? `local_${index + 1}` : null,
      buttonText: index === 9 ? "Concluir" : "Continuar",
      blocks: [{ type: "TextBody", text: `Conteúdo ${index + 1}` }],
    }));

    expect(validateFlowJson(buildMetaFlowJson({ screens }))).toEqual([]);
    expect(() =>
      buildMetaFlowJson({
        screens: [...screens, { ...screens[9], id: "extra", title: "Extra" }],
      }),
    ).toThrow(/máximo 10 telas/i);
  });
});
