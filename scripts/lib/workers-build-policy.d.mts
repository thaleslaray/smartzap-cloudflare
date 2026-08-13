export interface WorkersBuildPolicy {
  branch: string;
  action: "production" | "staging" | "validate-only";
  reason?: string;
  workerName?: string;
}
export function classifyWorkersBuildBranch(rawBranch: unknown): WorkersBuildPolicy;
export function expectedWorkerForAction(baseInstallId: unknown, action: unknown): string;
export function workersBuildCommandForBranch(rawBranch: unknown, options?: {
  baseInstallId?: unknown;
  connectedWorkerName?: unknown;
}): WorkersBuildPolicy & { args: string[] | null };
