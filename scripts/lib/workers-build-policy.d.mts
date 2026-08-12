export interface WorkersBuildPolicy {
  branch: string;
  action: "production" | "staging" | "validate-only";
  reason?: string;
}
export function classifyWorkersBuildBranch(rawBranch: unknown): WorkersBuildPolicy;
export function workersBuildCommandForBranch(rawBranch: unknown): WorkersBuildPolicy & { args: string[] | null };
