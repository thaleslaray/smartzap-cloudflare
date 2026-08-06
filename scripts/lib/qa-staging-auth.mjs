export function resolveQaStagingAuthHeaders({
  mutationKey,
  stagingApiKey,
  apiKey,
} = {}) {
  const isolated = String(mutationKey || "").trim();
  if (isolated) return { "x-qa-mutation-key": isolated };

  const dedicated = String(stagingApiKey || "").trim();
  if (dedicated) return { "x-api-key": dedicated };

  const legacy = String(apiKey || "").trim();
  if (legacy) return { "x-api-key": legacy };

  throw new Error(
    "QA_STAGING_MUTATION_API_KEY, QA_STAGING_API_KEY ou QA_API_KEY precisa estar configurada.",
  );
}
