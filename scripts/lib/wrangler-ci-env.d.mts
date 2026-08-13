export function buildWranglerChildEnvironment(source?: NodeJS.ProcessEnv, extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export function parseWranglerDeployOutput(value: unknown): Record<string, unknown>;
export function assertWranglerDeployIdentity(output: Record<string, unknown>, expectedWorkerName: string): Record<string, unknown>;

