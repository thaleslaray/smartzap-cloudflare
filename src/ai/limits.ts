export function positiveAiLimit(
  value: string | undefined,
  fallback: number,
  ceiling: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, ceiling)
    : fallback;
}

export function aiUsageLimits(env: Env) {
  return {
    hourly: positiveAiLimit(
      env.AI_MAX_DRAFTS_PER_CONVERSATION_HOUR,
      20,
      100,
    ),
    daily: positiveAiLimit(env.AI_MAX_DRAFTS_PER_DAY, 200, 10_000),
  };
}
