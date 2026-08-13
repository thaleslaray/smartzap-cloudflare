export interface ReleaseInventoryEntry { path: string; sha256: string }
export interface ReleaseManifest {
  schema: 1;
  kind: string;
  release: { tag: string; version: string; channel: "stable" | "rc" | "beta"; repository: string; commit: string; tree: string };
  archive: { name: string; sha256: string; size: number };
  source: { files: number; snapshotHash: string; inventory: ReleaseInventoryEntry[] };
  migrations: unknown;
}
export const RELEASE_MANIFEST_KIND: string;
export function sha256(value: string | Uint8Array): string;
export function snapshotHash(files: ReleaseInventoryEntry[]): string;
export function buildReleaseManifest(input: Record<string, any>): ReleaseManifest;
export function parseSha256Sums(raw: string): Map<string, string>;
export function validateReleaseManifest(manifest: any, expected?: { tag?: string; commit?: string }): ReleaseManifest;
