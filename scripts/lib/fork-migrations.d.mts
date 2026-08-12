export interface ForkMigration {
  file: string;
  sha256: string;
  fromSchema: number;
  toSchema: number;
  compatibleWithPreviousCode: boolean;
  downtimeRequired: boolean;
  destructive: boolean;
  prechecks: string[];
  postchecks: string[];
  recovery: string;
  path: string;
  actualSha256: string;
}

export interface ForkMigrationManifest {
  schemaVersion: number;
  baseline: string;
  migrations: ForkMigration[];
}

export function validateForkMigrationManifest(root: string): ForkMigrationManifest;
export function assertSchemaTransition(input: {
  currentSchema: number;
  targetSchema: number;
  manifest: ForkMigrationManifest;
}): ForkMigration[];
