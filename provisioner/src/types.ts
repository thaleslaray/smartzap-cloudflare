export interface ProvisionerEnv {
  PROVISIONER_DB: D1Database;
  RELEASES?: R2Bucket;
  CF_OAUTH_CLIENT_ID: string;
  CF_OAUTH_CLIENT_SECRET?: string;
  CF_OAUTH_SCOPES: string;
  PROVISIONER_TOKEN_KEY: string;
  PUBLIC_ORIGIN: string;
  SMARTZAP_RELEASE_MANIFEST_URL: string;
  SMARTZAP_RELEASE_MANIFEST_SHA256?: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

export interface SessionRecord {
  id: string;
  state_hash: string;
  pkce_verifier_ciphertext: string;
  token_ciphertext: string | null;
  account_id: string | null;
  account_name: string | null;
  status: "authorizing" | "authorized" | "account_selected" | "revoked";
  created_at: string;
  expires_at: string;
}

export interface InstallationRecord {
  id: string;
  session_id: string;
  account_id: string;
  prefix: string;
  release_version: string;
  status: "planned" | "running" | "failed" | "rolled_back" | "complete";
  plan_json: string;
  progress_json: string;
  error_code: string | null;
  error_detail: string | null;
  created_at: string;
  updated_at: string;
  lease_token: string | null;
  lease_expires_at: string | null;
}

export interface InstallationNames {
  prefix: string;
  worker: string;
  database: string;
  media: string;
  webhookQueue: string;
  automationQueue: string;
  conversionQueue: string;
  conversionDlq: string;
  webhookDlq: string;
  automationDlq: string;
  campaignWorkflow: string;
  setupWorkflow: string;
  rateLimitNamespace: string;
}

export interface ReleaseFile {
  path: string;
  sourcePath?: string;
  sha256: string;
  size: number;
  contentType?: string;
  assetHash?: string;
}

export interface ReleaseMigration {
  name: string;
  sha256: string;
  statementsSha256: string;
  statements: string[];
}

export interface ReleaseBaseline {
  name: string;
  sha256: string;
  statementsSha256: string;
  statements: string[];
}

export interface SmartZapReleaseManifest {
  schemaVersion: 2;
  version: string;
  createdAt: string;
  compatibilityDate: string;
  compatibilityFlags: string[];
  main: ReleaseFile;
  modules: ReleaseFile[];
  assets: ReleaseFile[];
  baseline: ReleaseBaseline;
  upgrades: ReleaseMigration[];
}

export type PlanAction = "create" | "reuse" | "blocked";

export interface PlanItem {
  kind: "worker" | "d1" | "r2" | "queue" | "workflow";
  name: string;
  action: PlanAction;
  id?: string;
  reason: string;
}

export interface InstallPlan {
  safe: boolean;
  accountId: string;
  names: InstallationNames;
  releaseVersion: string;
  items: PlanItem[];
}

export interface InstallSecrets {
  masterPassword: string;
  vaultKey: string;
}

export interface CreatedResource {
  kind: PlanItem["kind"];
  name: string;
  id?: string;
}
