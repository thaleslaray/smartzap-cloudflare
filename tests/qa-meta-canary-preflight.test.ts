import { describe, expect, it } from "vitest";
import { resolveMetaCallbackPreflight } from "../scripts/lib/meta-canary-preflight.mjs";

describe("preflight do canário Meta", () => {
  it("valida o override do número e o callback efetivo alterados pelo canário", () => {
    expect(
      resolveMetaCallbackPreflight(
        {
          meta: {
            appWebhookCallbackUrl:
              "https://smartzap-cf.thales2581.workers.dev/webhook",
            webhookCallbackUrl:
              "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
            phoneWebhookCallbackUrl:
              "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
            effectiveWebhookCallbackUrl:
              "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
          },
        },
        "https://smartzap-cf-staging.thales2581.workers.dev",
      ),
    ).toEqual({
      expectedCallbackUrl:
        "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
      callbackUrl:
        "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
      appCallbackUrl:
        "https://smartzap-cf.thales2581.workers.dev/webhook",
      wabaCallbackUrl:
        "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
      phoneCallbackUrl:
        "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
      effectiveCallbackUrl:
        "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
      callbackMatchesStaging: true,
    });
  });

  it("reprova quando o fallback da WABA não acompanha o override do número", () => {
    const result = resolveMetaCallbackPreflight(
      {
        meta: {
          appWebhookCallbackUrl:
            "https://smartzap-cf.thales2581.workers.dev/webhook",
          webhookCallbackUrl:
            "https://smartzap-cf.thales2581.workers.dev/webhook",
          phoneWebhookCallbackUrl:
            "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
          effectiveWebhookCallbackUrl:
            "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
        },
      },
      "https://smartzap-cf-staging.thales2581.workers.dev/",
    );

    expect(result.callbackMatchesStaging).toBe(false);
    expect(result.callbackUrl).toBe(
      "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
    );
  });
});
