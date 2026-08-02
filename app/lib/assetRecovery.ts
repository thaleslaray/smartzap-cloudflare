export const ASSET_RECOVERY_PARAM = "__sz_asset_recovery";

const chunkLoadPatterns = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk [^ ]+ failed/i,
  /chunkloaderror/i,
];

export function isRecoverableAssetError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : "";
  return chunkLoadPatterns.some((pattern) => pattern.test(message));
}

export function buildAssetRecoveryUrl(
  currentUrl: string,
  nonce = Date.now(),
): string {
  const url = new URL(currentUrl);
  url.searchParams.set(ASSET_RECOVERY_PARAM, String(nonce));
  return url.toString();
}
