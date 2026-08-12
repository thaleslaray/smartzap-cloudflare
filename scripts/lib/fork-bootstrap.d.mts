export const BASE_INSTALL_ID_PATTERN: RegExp;
export const DEPLOYMENT_ID_PATTERN: RegExp;

export interface ForkResourceNames {
  worker: string;
  database: string;
  media: string;
  webhookQueue: string;
  webhookDlq: string;
  automationQueue: string;
  automationDlq: string;
  conversionQueue: string;
  conversionDlq: string;
}

export function deploymentId(baseInstallId: unknown, staging?: boolean): string;
export function deploymentResourceNames(workerName: string): ForkResourceNames;
export function buildForkWrangler(source: string, input: {
  workerName: string;
  databaseId: string;
  migrationsDir: string;
  release: { version: string; commit: string; schemaVersion: string | number; channel: string };
}): string;
export function parseD1Databases(output: string): Array<{ id: string; name: string }>;
export function parseCreatedD1Id(output: string): string;
export function parseR2BucketNames(output: string): string[];
export function parseQueueNames(output: string): string[];
export function classifyForkResources(input: {
  database?: unknown;
  buckets: string[];
  queues: string[];
  names: ForkResourceNames;
}): { requiredQueues: string[]; collisions: string[]; canResume: boolean };
export function assertSecretInputs(env: Record<string, string | undefined>): string;
