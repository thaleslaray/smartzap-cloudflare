import { describe, expect, it, vi } from "vitest";
import { generateFlowDefinition } from "../src/ai/flow-generator";

describe("geração de MiniApp com Workers AI", () => {
  it("valida e encadeia as telas retornadas pelo modelo pequeno", async () => {
    const run = vi.fn().mockResolvedValue({
      response: JSON.stringify({
        screens: [
          {
            title: "Cadastro",
            text: "Informe seus dados.",
            buttonText: "Continuar",
          },
          {
            title: "Interesse",
            text: "Escolha seu interesse.",
            buttonText: "Concluir",
          },
        ],
      }),
    });

    const definition = await generateFlowDefinition(
      {
        AI: { run },
        AI_ENABLED: "true",
        AI_MODEL: "@cf/meta/llama-3.2-3b-instruct",
        AI_GATEWAY_ID: "smartzap",
      },
      "Quero captar nome, telefone e interesse no curso.",
    );

    expect(definition.version).toBe("7.3");
    expect(definition.screens).toHaveLength(2);
    expect(definition.screens[0]).toEqual(
      expect.objectContaining({ title: "Cadastro", final: false }),
    );
    expect(definition.screens[0].next).toBe(definition.screens[1].id);
    expect(definition.screens[1]).toEqual(
      expect.objectContaining({ title: "Interesse", final: true, next: null }),
    );
    expect(run).toHaveBeenCalledWith(
      "@cf/meta/llama-3.2-3b-instruct",
      expect.objectContaining({ temperature: 0.2, max_tokens: 500 }),
      expect.objectContaining({
        gateway: expect.objectContaining({ collectLog: false }),
      }),
    );
  });

  it("recusa saída fora do contrato", async () => {
    await expect(
      generateFlowDefinition(
        {
          AI: { run: vi.fn().mockResolvedValue({ response: "texto livre" }) },
          AI_ENABLED: "true",
          AI_MODEL: "@cf/meta/llama-3.2-3b-instruct",
          AI_GATEWAY_ID: "smartzap",
        },
        "Crie um cadastro simples para os interessados.",
      ),
    ).rejects.toThrow("invalid_ai_output");
  });

  it("não devolve estrutura parcial quando o provedor fica indisponível", async () => {
    await expect(
      generateFlowDefinition(
        {
          AI: { run: vi.fn().mockRejectedValue(new Error("upstream timeout")) },
          AI_ENABLED: "true",
          AI_MODEL: "@cf/meta/llama-3.2-3b-instruct",
          AI_GATEWAY_ID: "smartzap",
        },
        "Crie uma pesquisa curta de satisfação para clientes.",
      ),
    ).rejects.toThrow("provider_error");
  });

  it("falha de forma explícita sem IA configurada", async () => {
    await expect(
      generateFlowDefinition(
        { AI_ENABLED: "false" },
        "Crie uma pesquisa curta de satisfação para clientes.",
      ),
    ).rejects.toThrow("ai_not_configured");
  });
});
