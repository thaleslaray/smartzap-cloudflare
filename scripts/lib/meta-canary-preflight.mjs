export function resolveMetaCallbackPreflight(health, baseUrl) {
  const expectedCallbackUrl = `${String(baseUrl).replace(/\/+$/, "")}/webhook`;
  const appCallbackUrl = health?.meta?.appWebhookCallbackUrl || null;
  const wabaCallbackUrl = health?.meta?.webhookCallbackUrl || null;
  const phoneCallbackUrl = health?.meta?.phoneWebhookCallbackUrl || null;
  const effectiveCallbackUrl =
    health?.meta?.effectiveWebhookCallbackUrl || null;

  return {
    expectedCallbackUrl,
    callbackUrl: phoneCallbackUrl,
    appCallbackUrl,
    wabaCallbackUrl,
    phoneCallbackUrl,
    effectiveCallbackUrl,
    callbackMatchesStaging:
      phoneCallbackUrl === expectedCallbackUrl &&
      effectiveCallbackUrl === expectedCallbackUrl,
  };
}
