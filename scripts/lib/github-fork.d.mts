export const SMARTZAP_UPSTREAM: string;
export const SMARTZAP_UPSTREAM_OWNER: string;
export const SMARTZAP_REPOSITORY: string;
export function normalizeGitHubOwner(value: unknown): string;
export function githubForkTarget(owner: unknown): string;
export function assertIndependentForkOwner(value: unknown): string;
export function assertTrueGitHubFork(repository: Record<string, any>, expectedOwner: string): {
  fullName: string; owner: string; upstream: string; defaultBranch: "main"; url: string;
};
export function assertForkBranches(branchNames: unknown[]): { production: "main"; synchronization: "upstream-sync" };
export function synchronizationRef(mainRef: { object?: { sha?: string } }): { ref: "refs/heads/upstream-sync"; sha: string };
export function mainBranchProtection(): Record<string, unknown>;
