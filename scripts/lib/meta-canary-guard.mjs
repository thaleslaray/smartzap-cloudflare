export function resolveMetaCanaryGuard(env = process.env) {
  const maxRunsPerDay = Number(env.QA_META_MAX_RUNS_PER_DAY || 2);
  if (
    !Number.isInteger(maxRunsPerDay) ||
    maxRunsPerDay < 1 ||
    maxRunsPerDay > 10
  )
    throw new Error("QA_META_MAX_RUNS_PER_DAY precisa estar entre 1 e 10.");

  return {
    maxRunsPerDay,
    outsideWindowAuthorized: env.QA_META_ALLOW_OUTSIDE_WINDOW === "1",
  };
}

export function assertMetaCanaryWindow(hour, outsideWindowAuthorized) {
  if (
    (!Number.isInteger(hour) || hour < 9 || hour >= 20) &&
    !outsideWindowAuthorized
  )
    throw new Error("Canário real permitido somente entre 09:00 e 20:00 BRT.");
}
