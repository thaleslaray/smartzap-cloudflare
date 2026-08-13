export interface RollbackCheckpoint {
  schema: 1;
  workerName: string;
  databaseName: string;
  bookmark: string;
  versionId: string;
  fromRelease: unknown;
  toRelease: unknown;
  createdAt: string;
}

export function parseTimeTravelBookmark(output: string): string;
export function parseActiveDeploymentVersion(output: string): string;
export function isMissingWorkerError(error: unknown): boolean;
export function buildRollbackCheckpoint(input: {
  workerName: string;
  databaseName: string;
  bookmark: string;
  versionId: string;
  fromRelease?: unknown;
  toRelease?: unknown;
}): RollbackCheckpoint;
export function assertRollbackCheckpoint(value: RollbackCheckpoint, expectedWorkerName: string): RollbackCheckpoint;
