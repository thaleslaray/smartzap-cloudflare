export function resolveMetaCallbackPreflight(health, baseUrl) {
  const expectedCallbackUrl = `${String(baseUrl).replace(/\/+$/, "")}/webhook`;
  const appCallbackUrl = health?.meta?.appWebhookCallbackUrl || null;
  const phoneCallbackUrl = health?.meta?.effectiveWebhookCallbackUrl || null;

  return {
    expectedCallbackUrl,
    callbackUrl: appCallbackUrl,
    appCallbackUrl,
    phoneCallbackUrl,
    callbackMatchesStaging: appCallbackUrl === expectedCallbackUrl,
  };
}
