import { describe, expect, it } from "vitest";
import { resolveMetaCallbackPreflight } from "../scripts/lib/meta-canary-preflight.mjs";

describe("preflight do canário Meta", () => {
  it("valida o callback global do aplicativo, que é o alvo alterado pelo canário", () => {
    expect(
      resolveMetaCallbackPreflight(
        {
          meta: {
            appWebhookCallbackUrl:
              "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
            effectiveWebhookCallbackUrl:
              "https://smartzap-cf.thales2581.workers.dev/webhook",
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
        "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
      phoneCallbackUrl:
        "https://smartzap-cf.thales2581.workers.dev/webhook",
      callbackMatchesStaging: true,
    });
  });

  it("reprova quando o callback global do aplicativo ainda aponta para produção", () => {
    const result = resolveMetaCallbackPreflight(
      {
        meta: {
          appWebhookCallbackUrl:
            "https://smartzap-cf.thales2581.workers.dev/webhook",
          effectiveWebhookCallbackUrl:
            "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
        },
      },
      "https://smartzap-cf-staging.thales2581.workers.dev/",
    );

    expect(result.callbackMatchesStaging).toBe(false);
    expect(result.callbackUrl).toBe(
      "https://smartzap-cf.thales2581.workers.dev/webhook",
    );
  });
});
