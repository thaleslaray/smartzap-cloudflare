import { describe, expect, it } from "vitest";
import {
  META_PRODUCTION_CALLBACK_URL,
  META_STAGING_CALLBACK_URL,
  resolveQaMetaCallbackUrl,
} from "../src/domain/meta-callback";

describe("troca controlada do callback Meta", () => {
  it("mantém o callback configurado quando não há alvo de QA", () => {
    expect(resolveQaMetaCallbackUrl("staging", undefined, "https://custom/webhook")).toEqual({
      ok: true,
      url: "https://custom/webhook",
      target: null,
    });
  });

  it("aceita somente os Workers canônicos no staging", () => {
    expect(resolveQaMetaCallbackUrl("staging", "staging", "https://custom/webhook")).toEqual({
      ok: true,
      url: META_STAGING_CALLBACK_URL,
      target: "staging",
    });
    expect(resolveQaMetaCallbackUrl("staging", "production", "https://custom/webhook")).toEqual({
      ok: true,
      url: META_PRODUCTION_CALLBACK_URL,
      target: "production",
    });
  });

  it("recusa troca fora do staging e URL arbitrária", () => {
    expect(resolveQaMetaCallbackUrl("production", "staging", "https://custom/webhook")).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(resolveQaMetaCallbackUrl("staging", "https://evil.example/webhook", "https://custom/webhook")).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});
