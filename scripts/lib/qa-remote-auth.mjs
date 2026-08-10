export function resolveQaRemoteReadHeaders({ readOnlyKey, apiKey } = {}) {
  if (readOnlyKey) return { "x-qa-readonly-key": readOnlyKey };
  if (apiKey) return { "x-api-key": apiKey };
  throw new Error("QA_READONLY_API_KEY ou QA_API_KEY é obrigatória");
}
