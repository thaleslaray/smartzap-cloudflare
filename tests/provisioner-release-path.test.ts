import { describe, expect, it } from "vitest";
import { releaseObjectKey } from "../provisioner/src/cloudflare-api";

describe("artefatos do provisionador", () => {
  it("resolve o objeto R2 quando o instalador vive em uma subrota", () => {
    expect(releaseObjectKey(new URL(
      "https://instalar.example.com/smartzap/release/files/assets/assets/app.js",
    ))).toBe("files/assets/assets/app.js");
  });

  it("mantém compatibilidade com uma rota de release na raiz", () => {
    expect(releaseObjectKey(new URL(
      "https://instalar.example.com/release/files/worker/index.js",
    ))).toBe("files/worker/index.js");
  });

  it("não transforma uma URL externa comum em chave do bucket", () => {
    expect(releaseObjectKey(new URL("https://cdn.example.com/files/app.js"))).toBeUndefined();
  });

  it.each([
    "https://instalar.example.com/smartzap/release/files/../private.txt",
    "https://instalar.example.com/smartzap/release/files/%252e%252e/private.txt",
    "https://instalar.example.com/smartzap/release/files/%5Cprivate.txt",
  ])("recusa segmentos de caminho inseguros: %s", (url) => {
    expect(releaseObjectKey(new URL(url))).toBeUndefined();
  });
});
