export const INSTALL_GUARD_TABLE: string;

export function stripJsonComments(source: string): string;
export function readWorkerName(source: string): string;
export function assertIsolatedResourceNames(source: string): {
  workerName: string;
  resources: Record<string, string>;
};
export function parseWranglerRows(output: string): Array<Record<string, unknown>>;
export function assessDatabaseSafety(input: {
  workerName: string;
  tables: string[];
  guardWorkerName: string | null;
}): { action: "claim" | "resume" };
