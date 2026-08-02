export function resolveMetaCallbackPreflight(health, baseUrl) {
  const expectedCallbackUrl = `${String(baseUrl).replace(/\/+$/, "")}/webhook`;
  const appCallbackUrl = health?.meta?.appWebhookCallbackUrl || null;
  const wabaCallbackUrl = health?.meta?.webhookCallbackUrl || null;
  const effectiveCallbackUrl =
    health?.meta?.effectiveWebhookCallbackUrl || null;

  return {
    expectedCallbackUrl,
    callbackUrl: wabaCallbackUrl,
    appCallbackUrl,
    wabaCallbackUrl,
    effectiveCallbackUrl,
    callbackMatchesStaging:
      wabaCallbackUrl === expectedCallbackUrl &&
      effectiveCallbackUrl === expectedCallbackUrl,
  };
}
