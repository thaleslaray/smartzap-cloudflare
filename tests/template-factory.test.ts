import { describe, expect, it, vi } from "vitest";
import { generateTemplateFactory } from "../src/ai/template-factory";

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
});
