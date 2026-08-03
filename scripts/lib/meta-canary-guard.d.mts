export function resolveMetaCanaryGuard(env?: Record<string, string | undefined>): {
  maxRunsPerDay: number;
  outsideWindowAuthorized: boolean;
};

export function assertMetaCanaryWindow(
  hour: number,
  outsideWindowAuthorized: boolean,
): void;
