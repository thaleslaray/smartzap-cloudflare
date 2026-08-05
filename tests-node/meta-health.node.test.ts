import { describe, expect, it } from "vitest";
import {
  metaConnectionPresentation,
  metaFactPresentation,
  metaVerificationUnavailableMessage,
} from "../app/lib/meta-health";

const rateLimit = {
  verificationStatus: "unavailable" as const,
  retryable: true,
  code: 4,
  error: "(#4) Application request limit reached",
};

describe("apresentação da saúde Meta", () => {
  it("trata o limite do aplicativo como verificação indisponível, não token inválido", () => {
    expect(metaConnectionPresentation({
      metaConfigured: true,
      metaLive: false,
      meta: rateLimit,
    })).toMatchObject({
      title: "Verificação indisponível",
      tone: "warning",
    });
    const message = metaVerificationUnavailableMessage(rateLimit);
    expect(message).toContain("limite de consultas da Meta");
    expect(message).toContain("Nenhuma credencial foi declarada inválida");
    expect(message).not.toContain("Corrija o token");
    expect(metaFactPresentation(null, rateLimit, "válido", "inválido")).toEqual({
      status: "warn",
      message,
    });
  });

  it("mantém falha explícita quando a Meta confirma credencial rejeitada", () => {
    const invalid = {
      verificationStatus: "credential_invalid" as const,
      retryable: false,
      code: 190,
      error: "Invalid OAuth access token",
    };
    expect(metaConnectionPresentation({
      metaConfigured: true,
      metaLive: false,
      meta: invalid,
    })).toMatchObject({
      title: "Credencial rejeitada",
      tone: "danger",
    });
    expect(metaFactPresentation(false, invalid, "válido", "inválido")).toEqual({
      status: "fail",
      message: "inválido",
    });
  });

  it("mantém sucesso somente quando o provedor foi confirmado", () => {
    const complete = {
      verificationStatus: "complete" as const,
      retryable: false,
      code: null,
      error: null,
    };
    expect(metaFactPresentation(true, complete, "confirmado", "ausente")).toEqual({
      status: "pass",
      message: "confirmado",
    });
    expect(metaFactPresentation(false, complete, "confirmado", "ausente")).toEqual({
      status: "fail",
      message: "ausente",
    });
  });
});
