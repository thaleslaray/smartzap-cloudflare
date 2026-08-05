import { describe, expect, it, vi } from "vitest";
import { generateTemplateFactory } from "../src/ai/template-factory";

const source = "Fonte aprovada para a campanha com informações suficientes para gerar mensagens oficiais.";
const generated = (overrides: Record<string, unknown> = {}) => ({
  name: "lembrete_aula",
  content: "Olá {{1}}, sua aula começa amanhã.",
  variables: { "1": "Cliente" },
  ...overrides,
});
const makeEnv = (payload: unknown, enabled = "true") => ({
  DB: { prepare: vi.fn(() => ({ first: vi.fn(async () => null) })) },
  AI: { run: vi.fn().mockResolvedValue(payload) },
  AI_ENABLED: enabled,
  AI_MODEL: "@cf/meta/llama-3.2-3b-instruct",
  AI_GATEWAY_ID: "smartzap",
}) as unknown as Env;
const response = (templates: unknown[], fenced = false) => {
  const json = JSON.stringify({ templates });
  return { choices: [{ message: { content: fenced ? `\`\`\`json\n${json}\n\`\`\`` : json } }] };
};
const input = (overrides: Partial<Parameters<typeof generateTemplateFactory>[1]> = {}) => ({
  content: source,
  prompt: "Crie uma variação.",
  strategy: "utility" as const,
  quantity: 1,
  language: "pt_BR",
  ...overrides,
});

describe("fábrica de templates com Workers AI", () => {
  it("preserva respostas JSON maiores que 700 caracteres", async () => {
    const templates = Array.from({ length: 3 }, (_, index) => ({
      name: `campanha_${index + 1}`,
      content: `Olá {{1}}. ${"Contexto útil e revisável. ".repeat(14)}`,
      variables: { "1": "Cliente" },
    }));
    const serialized = JSON.stringify({ templates });
    expect(serialized.length).toBeGreaterThan(700);
    const run = vi.fn().mockResolvedValue({
      choices: [{ message: { content: serialized } }],
    });
    const db = {
      prepare: vi.fn(() => ({
        first: vi.fn(async () => null),
      })),
    };

    const result = await generateTemplateFactory({
      DB: db,
      AI: { run },
      AI_ENABLED: "true",
      AI_MODEL: "@cf/meta/llama-3.2-3b-instruct",
      AI_GATEWAY_ID: "smartzap",
    } as unknown as Env, {
      content: "Fonte aprovada para a campanha.",
      prompt: "Crie três variações.",
      strategy: "utility",
      quantity: 3,
      language: "pt_BR",
    });

    expect(result).toHaveLength(3);
    expect(result.at(-1)).toMatchObject({
      name: "campanha_3",
      category: "UTILITY",
      variables: { "1": "Cliente" },
    });
  });

  it.each([
    ["utility", "UTILITY"],
    ["marketing", "MARKETING"],
  ] as const)("mapeia estratégia %s para categoria %s", async (strategy, category) => {
    const result = await generateTemplateFactory(makeEnv(response([generated()])), input({ strategy }));
    expect(result[0].category).toBe(category);
  });

  it.each(["pt_BR", "en_US", "es_ES"])("preserva o idioma %s", async (language) => {
    const result = await generateTemplateFactory(makeEnv(response([generated()])), input({ language }));
    expect(result[0].language).toBe(language);
  });

  it("normaliza placeholder nomeado e conserva o exemplo", async () => {
    const result = await generateTemplateFactory(
      makeEnv(response([generated({ content: "Olá {nome}, sua aula começa amanhã.", variables: { nome: "Ana" } })])),
      input(),
    );
    expect(result[0]).toMatchObject({ content: "Olá {{1}}, sua aula começa amanhã.", variables: { "1": "Ana" } });
  });

  it("desambigua nomes repetidos sem exceder o limite", async () => {
    const result = await generateTemplateFactory(
      makeEnv(response([generated(), generated()])),
      input({ quantity: 2 }),
    );
    expect(result.map((item) => item.name)).toEqual(["lembrete_aula", "lembrete_aula_2"]);
  });

  it.each([
    ["quantidade menor", [generated()], 2],
    ["quantidade maior", [generated(), generated()], 1],
    ["lista ausente", null, 1],
  ])("rejeita %s", async (_label, templates, quantity) => {
    const payload = templates === null ? { choices: [{ message: { content: "{}" } }] } : response(templates);
    await expect(generateTemplateFactory(makeEnv(payload), input({ quantity }))).rejects.toThrow("invalid_ai_response");
  });

  it.each([
    ["JSON inválido", { choices: [{ message: { content: "não é json" } }] }],
    ["conteúdo vazio", response([generated({ content: "" })])],
    ["corpo acima de 1024", response([generated({ content: `Olá {{1}}, ${"x".repeat(1100)}` })])],
    ["variável no início", response([generated({ content: "{{1}} recebe a confirmação agora." })])],
    ["variável no fim", response([generated({ content: "Confirmação enviada para {{1}}" })])],
    ["lacuna de variável", response([generated({ content: "Olá {{2}}, confirmação disponível.", variables: { "2": "Ana" } })])],
    ["exemplo ausente", response([generated({ variables: {} })])],
  ])("rejeita resposta com %s", async (_label, payload) => {
    await expect(generateTemplateFactory(makeEnv(payload), input())).rejects.toThrow("invalid_ai_response");
  });

  it("rejeita provedor indisponível", async () => {
    const env = makeEnv(response([generated()])) as Env & { AI: { run: ReturnType<typeof vi.fn> } };
    env.AI.run.mockRejectedValue(new Error("timeout"));
    await expect(generateTemplateFactory(env, input())).rejects.toThrow("provider_error");
  });

  it("rejeita IA desabilitada", async () => {
    await expect(generateTemplateFactory(makeEnv(response([generated()]), "false"), input())).rejects.toThrow("ai_not_configured");
  });

  it("aceita JSON cercado por bloco de código", async () => {
    const result = await generateTemplateFactory(makeEnv(response([generated()], true)), input());
    expect(result).toHaveLength(1);
  });

  it("refaz uma saída inválida antes de falhar a geração", async () => {
    const env = makeEnv(response([generated()])) as Env & { AI: { run: ReturnType<typeof vi.fn> } };
    env.AI.run
      .mockResolvedValueOnce({ response: "texto fora do formato" })
      .mockResolvedValueOnce(response([generated()]));
    const result = await generateTemplateFactory(env, input());
    expect(result).toHaveLength(1);
    expect(env.AI.run).toHaveBeenCalledTimes(2);
  });
});
