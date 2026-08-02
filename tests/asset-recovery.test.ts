import { describe, expect, it } from "vitest";
import {
  ASSET_RECOVERY_PARAM,
  buildAssetRecoveryUrl,
  isRecoverableAssetError,
  shouldAutoRecoverAssetError,
} from "../app/lib/assetRecovery";

describe("recuperação de assets após deploy", () => {
  it("reconhece falhas de chunk e não confunde erros comuns da aplicação", () => {
    expect(
      isRecoverableAssetError(
        new TypeError("Failed to fetch dynamically imported module: /assets/Dashboard.js"),
      ),
    ).toBe(true);
    expect(isRecoverableAssetError(new Error("Falha ao carregar contatos"))).toBe(false);
  });

  it("preserva rota, parâmetros e hash ao forçar uma única leitura nova do shell", () => {
    const recovered = new URL(
      buildAssetRecoveryUrl("https://smartzap.example/inbox/123?filtro=abertas#ultima", 42),
    );
    expect(recovered.pathname).toBe("/inbox/123");
    expect(recovered.searchParams.get("filtro")).toBe("abertas");
    expect(recovered.searchParams.get(ASSET_RECOVERY_PARAM)).toBe("42");
    expect(recovered.hash).toBe("#ultima");
  });

  it("recupera chunks somente em builds publicados", () => {
    const chunkError = new TypeError("Importing a module script failed.");
    expect(shouldAutoRecoverAssetError(chunkError, false)).toBe(true);
    expect(shouldAutoRecoverAssetError(chunkError, true)).toBe(false);
  });
});
