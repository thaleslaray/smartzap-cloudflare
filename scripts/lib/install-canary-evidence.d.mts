export interface CanaryRelease {
  repository: string;
  commit: string;
  tag: string;
  deploySource?: string;
  snapshotSha256: string;
}

export interface InstallCanaryManifest {
  schemaVersion: 1;
  generatedAt: string;
  release: CanaryRelease & { deploySource: string };
  prefix: string;
  expectedSecrets: ["MASTER_PASSWORD", "SMARTZAP_VAULT_KEY"];
  resources: {
    worker: string;
    d1: string;
    r2: string;
    queues: string[];
    workflows: string[];
    durableObjects: string[];
  };
  runtime: {
    workflowBindings: { CAMPAIGN_WF: string; SETUP_WF: string };
    rateLimitNamespace: string;
    aiGatewayId: string;
    cron: string;
    baselineTarget: string;
  };
  cleanupPolicy: {
    exactPrefixOnly: true;
    preservePreexistingResources: true;
    requireEmptyBacklogBeforeDelete: true;
  };
  fingerprintSha256: string;
}

export interface CanarySnapshot {
  workers?: unknown[];
  d1?: unknown[];
  r2?: unknown[];
  queues?: unknown[];
  workflows?: unknown[];
  durableObjects?: unknown[];
  cronTriggers?: unknown[];
  runtime?: {
    workflowBindings?: { CAMPAIGN_WF?: string; SETUP_WF?: string };
    rateLimitNamespace?: string;
    aiGatewayId?: string;
  };
  d1State?: { installVersions?: string[] };
  app?: {
    reachable?: boolean;
    setupCompleted?: boolean;
    messageStates?: { sent?: boolean; delivered?: boolean; read?: boolean };
  };
  queuesState?: { backlogTotal?: number; dlqTotal?: number };
}

export interface CanaryCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface CanaryReport {
  phase: "baseline" | "provisioned" | "setup-complete" | "cleanup";
  passed: boolean;
  manifestFingerprint: string;
  checks: CanaryCheck[];
  failures: string[];
}

export function assertCanaryPrefix(prefix: unknown): string;
export function buildInstallCanaryManifest(input: { prefix: string; release: CanaryRelease; generatedAt?: string }): InstallCanaryManifest;
export function fingerprintManifest(manifest: InstallCanaryManifest | Record<string, unknown>): string;
export function assertManifestIntegrity(manifest: InstallCanaryManifest): InstallCanaryManifest;
export function assessInstallCanarySnapshot(input: { phase: CanaryReport["phase"]; snapshot: CanarySnapshot; manifest: InstallCanaryManifest }): CanaryReport;
export function assertInstallCanarySnapshot(input: { phase: CanaryReport["phase"]; snapshot: CanarySnapshot; manifest: InstallCanaryManifest }): CanaryReport;
