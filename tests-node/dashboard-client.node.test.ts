import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDashboardData } from "../app/hooks/useDashboard";
import { ApiError, api } from "../app/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cliente do Dashboard", () => {
  it("rejeita corpo 200 interrompido em vez de materializar um objeto vazio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"sent30d":', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(api("/api/dashboard")).rejects.toMatchObject({
      status: 502,
      message: "o servidor retornou uma resposta incompleta; tente novamente",
    });
  });

  it("preserva cancelamento da navegação e encaminha o signal ao fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException("cancelado", "AbortError");
    });
    vi.stubGlobal("fetch", fetchMock);
    controller.abort();

    await expect(
      api("/api/dashboard", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejeita contrato parcial antes de o componente acessar coleções ausentes", () => {
    expect(() =>
      parseDashboardData({
        sent30d: 0,
        deliveryRate: 0,
        readRate: 0,
        failed30d: 0,
        activeCampaigns: 0,
        recentCampaigns: [],
      }),
    ).toThrowError(ApiError);
  });

  it("aceita o contrato completo e normaliza falha recente ausente", () => {
    expect(
      parseDashboardData({
        sent30d: 0,
        deliveryRate: 0,
        readRate: 0,
        failed30d: 0,
        activeCampaigns: 0,
        volume: [],
        recentCampaigns: [],
      }).latestFailure,
    ).toBeNull();
  });
});
