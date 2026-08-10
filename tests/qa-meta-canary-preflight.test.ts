import { describe, expect, it } from "vitest";
import { resolveMetaCallbackPreflight } from "../scripts/lib/meta-canary-preflight.mjs";

describe("preflight do canário Meta", () => {
  it("valida o override do número e o callback efetivo alterados pelo canário", () => {
    expect(
      resolveMetaCallbackPreflight(
        {
          meta: {
            appWebhookCallbackUrl:
              "https://smartzap.example.workers.dev/webhook",
            webhookCallbackUrl:
              "https://smartzap-staging.example.workers.dev/webhook",
            phoneWebhookCallbackUrl:
              "https://smartzap-staging.example.workers.dev/webhook",
            effectiveWebhookCallbackUrl:
              "https://smartzap-staging.example.workers.dev/webhook",
          },
        },
        "https://smartzap-staging.example.workers.dev",
      ),
    ).toEqual({
      expectedCallbackUrl:
        "https://smartzap-staging.example.workers.dev/webhook",
      callbackUrl:
        "https://smartzap-staging.example.workers.dev/webhook",
      appCallbackUrl:
        "https://smartzap.example.workers.dev/webhook",
      wabaCallbackUrl:
        "https://smartzap-staging.example.workers.dev/webhook",
      phoneCallbackUrl:
        "https://smartzap-staging.example.workers.dev/webhook",
      effectiveCallbackUrl:
        "https://smartzap-staging.example.workers.dev/webhook",
      callbackMatchesStaging: true,
    });
  });

  it("reprova quando o fallback da WABA não acompanha o override do número", () => {
    const result = resolveMetaCallbackPreflight(
      {
        meta: {
          appWebhookCallbackUrl:
            "https://smartzap.example.workers.dev/webhook",
          webhookCallbackUrl:
            "https://smartzap.example.workers.dev/webhook",
          phoneWebhookCallbackUrl:
            "https://smartzap-staging.example.workers.dev/webhook",
          effectiveWebhookCallbackUrl:
            "https://smartzap-staging.example.workers.dev/webhook",
        },
      },
      "https://smartzap-staging.example.workers.dev/",
    );

    expect(result.callbackMatchesStaging).toBe(false);
    expect(result.callbackUrl).toBe(
      "https://smartzap-staging.example.workers.dev/webhook",
    );
  });
});
