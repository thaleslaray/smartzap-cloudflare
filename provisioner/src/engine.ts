import { CloudflareApi } from "./cloudflare-api";
import { buildPlan, queueNames } from "./plan";
import { InstallationRepository, parseProgress } from "./repository";
import type {
  CreatedResource,
  InstallationRecord,
  InstallPlan,
  InstallSecrets,
  ProvisionerEnv,
  SmartZapReleaseManifest,
} from "./types";

export interface InstallResult {
  installationId: string;
  status: InstallationRecord["status"];
  url?: string;
  resumed: boolean;
}

export async function planInstallation(input: {
  env: ProvisionerEnv;
  api: CloudflareApi;
  accountId: string;
  prefix: string;
  release: SmartZapReleaseManifest;
}): Promise<InstallPlan> {
  const installation = await new InstallationRepository(input.env).find(input.accountId, input.prefix);
  const previousProgress = installation ? parseProgress(installation.progress_json) : [];
  return buildPlan(input.api, input.accountId, input.prefix, input.release, previousProgress);
}

export async function executeInstallation(input: {
  env: ProvisionerEnv;
  sessionId: string;
  accountId: string;
  accessToken: string;
  prefix: string;
  release: SmartZapReleaseManifest;
  manifestUrl: URL;
  secrets: InstallSecrets;
}): Promise<InstallResult> {
  validateSecrets(input.secrets);
  const repository = new InstallationRepository(input.env);
  const api = new CloudflareApi(input.accessToken, input.accountId, input.env.RELEASES);
  let installation = await repository.find(input.accountId, input.prefix);
  if (installation?.status === "complete") return completedResult(api, installation, true);

  const previousProgress = installation ? parseProgress(installation.progress_json) : [];
  const plan = await buildPlan(api, input.accountId, input.prefix, input.release, previousProgress);
  if (!plan.safe) throw new Error(`Instalação bloqueada por colisão: ${blockedNames(plan).join(", ")}`);
  if (!installation) installation = await repository.create(input.sessionId, plan);

  const resumed = previousProgress.length > 0;
  const leaseToken = await repository.start(installation.id, input.sessionId, plan);
  const createdThisAttempt: CreatedResource[] = [];
  try {
    const databaseId = await ensureD1(api, repository, installation.id, leaseToken, plan, previousProgress, createdThisAttempt);
    await ensureR2(api, repository, installation.id, leaseToken, plan, previousProgress, createdThisAttempt);
    const queues = await ensureQueues(api, repository, installation.id, leaseToken, plan, previousProgress, createdThisAttempt);
    await initializeDatabase(api, databaseId, input.release);

    const assetsJwt = await api.uploadAssets(plan.names.worker, input.manifestUrl, input.release.assets);
    const workerWasOwned = previousProgress.some((item) => item.kind === "worker" && item.name === plan.names.worker);
    await api.uploadAndDeployWorker({
      names: plan.names,
      release: input.release,
      manifestUrl: input.manifestUrl,
      databaseId,
      secrets: input.secrets,
      assetsJwt,
    });
    if (!workerWasOwned) await record(repository, installation.id, leaseToken, { kind: "worker", name: plan.names.worker }, createdThisAttempt);

    await ensureWorkflows(api, repository, installation.id, leaseToken, plan, previousProgress, createdThisAttempt);
    await configureConsumers(api, plan, queues);
    await api.configureCron(plan.names.worker);
    await api.queryD1(databaseId, `
      INSERT INTO setup_checks(id,status,detail,checked_at)
      VALUES('cron_config','passed','Cron */15 * * * * confirmado pela API Cloudflare',CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,detail=excluded.detail,checked_at=excluded.checked_at
    `);
    await api.enableSubdomain(plan.names.worker);
    await repository.complete(installation.id, leaseToken);
    return completedResult(api, { ...installation, status: "complete" }, resumed);
  } catch (error) {
    const remainingFromAttempt = await api.rollback(createdThisAttempt);
    const remaining = [...previousProgress, ...remainingFromAttempt];
    await repository.fail(
      installation.id,
      leaseToken,
      error,
      previousProgress.length === 0 && createdThisAttempt.length > 0 && remainingFromAttempt.length === 0,
      remaining,
    );
    throw error;
  }
}

async function ensureD1(
  api: CloudflareApi,
  repository: InstallationRepository,
  installationId: string,
  leaseToken: string,
  plan: InstallPlan,
  previous: CreatedResource[],
  attempt: CreatedResource[],
): Promise<string> {
  const owned = previous.find((item) => item.kind === "d1" && item.name === plan.names.database);
  if (owned?.id) return owned.id;
  const created = await api.createD1(plan.names.database);
  await record(repository, installationId, leaseToken, { kind: "d1", name: plan.names.database, id: created.uuid }, attempt);
  return created.uuid;
}

async function ensureR2(
  api: CloudflareApi,
  repository: InstallationRepository,
  installationId: string,
  leaseToken: string,
  plan: InstallPlan,
  previous: CreatedResource[],
  attempt: CreatedResource[],
): Promise<void> {
  if (previous.some((item) => item.kind === "r2" && item.name === plan.names.media)) return;
  await api.createR2(plan.names.media);
  await record(repository, installationId, leaseToken, { kind: "r2", name: plan.names.media }, attempt);
}

async function ensureQueues(
  api: CloudflareApi,
  repository: InstallationRepository,
  installationId: string,
  leaseToken: string,
  plan: InstallPlan,
  previous: CreatedResource[],
  attempt: CreatedResource[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const name of queueNames(plan.names)) {
    const owned = previous.find((item) => item.kind === "queue" && item.name === name);
    if (owned?.id) {
      ids.set(name, owned.id);
      continue;
    }
    const created = await api.createQueue(name);
    ids.set(name, created.queue_id);
    await record(repository, installationId, leaseToken, { kind: "queue", name, id: created.queue_id }, attempt);
  }
  return ids;
}

async function ensureWorkflows(
  api: CloudflareApi,
  repository: InstallationRepository,
  installationId: string,
  leaseToken: string,
  plan: InstallPlan,
  previous: CreatedResource[],
  attempt: CreatedResource[],
): Promise<void> {
  const definitions = [
    [plan.names.campaignWorkflow, "CampaignSendWorkflow"],
    [plan.names.setupWorkflow, "SetupHealthWorkflow"],
  ] as const;
  for (const [name, className] of definitions) {
    await api.upsertWorkflow(name, plan.names.worker, className);
    if (!previous.some((item) => item.kind === "workflow" && item.name === name))
      await record(repository, installationId, leaseToken, { kind: "workflow", name }, attempt);
  }
}

async function configureConsumers(api: CloudflareApi, plan: InstallPlan, queues: Map<string, string>): Promise<void> {
  const consumers = [
    [plan.names.webhookQueue, plan.names.webhookDlq, { batch_size: 10, max_retries: 5, max_wait_time_ms: 1000 }],
    [plan.names.automationQueue, plan.names.automationDlq, { batch_size: 10, max_retries: 5, max_wait_time_ms: 1000 }],
    [plan.names.conversionQueue, plan.names.conversionDlq, { batch_size: 10, max_retries: 5, max_wait_time_ms: 1000 }],
  ] as const;
  for (const [queue, dlq, settings] of consumers) {
    const id = queues.get(queue);
    if (!id) throw new Error(`Queue sem ID no ledger: ${queue}`);
    const existing = await api.listQueueConsumers(id);
    const matching = existing.filter((consumer) => [consumer.script_name, consumer.script, consumer.service].includes(plan.names.worker));
    if (matching.length > 0) continue;
    if (existing.length > 0) throw new Error(`Queue ${queue} já possui consumidor diferente do SmartZap`);
    await api.createQueueConsumer(id, plan.names.worker, dlq, settings);
  }
}

export async function initializeDatabase(api: CloudflareApi, databaseId: string, release: SmartZapReleaseManifest): Promise<void> {
  const ledgerExists = extractFirstNumber(
    await api.queryD1(databaseId, "SELECT COUNT(*) total FROM sqlite_master WHERE type='table' AND name='smartzap_install_migrations'"),
    "total",
  ) === 1;
  if (!ledgerExists) {
    await api.batchD1(databaseId, [
      { sql: `CREATE TABLE smartzap_install_migrations (
        name TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )` },
      ...release.baseline.statements.map((sql) => ({ sql })),
      {
        sql: "INSERT INTO smartzap_install_migrations(name,sha256) VALUES (?, ?)",
        params: [release.baseline.name, release.baseline.statementsSha256],
      },
    ]);
  } else {
    const existing = await api.queryD1(
      databaseId,
      "SELECT sha256 FROM smartzap_install_migrations WHERE name = ?",
      [release.baseline.name],
    );
    const checksum = extractFirstString(existing, "sha256");
    if (!checksum) throw new Error("D1 contém um bootstrap parcial ou incompatível; instalação interrompida sem sobrescrever dados");
    if (checksum !== release.baseline.statementsSha256) throw new Error("O baseline D1 mudou após ser aplicado");
  }
  for (const migration of release.upgrades) {
    const existing = await api.queryD1(databaseId, "SELECT sha256 FROM smartzap_install_migrations WHERE name = ?", [migration.name]);
    const checksum = extractFirstString(existing, "sha256");
    if (checksum) {
      if (checksum !== migration.statementsSha256) throw new Error(`Migração ${migration.name} mudou após ser aplicada`);
      continue;
    }
    await api.batchD1(databaseId, [
      ...migration.statements.map((sql) => ({ sql })),
      { sql: "INSERT INTO smartzap_install_migrations (name, sha256) VALUES (?, ?)", params: [migration.name, migration.statementsSha256] },
    ]);
  }
}

function extractFirstNumber(value: unknown, key: string): number {
  const raw = extractFirstValue(value, key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractFirstValue(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractFirstValue(item, key);
      if (found !== undefined) return found;
    }
  } else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (key in object) return object[key];
    for (const nested of Object.values(object)) {
      const found = extractFirstValue(nested, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function extractFirstString(value: unknown, key: string): string | undefined {
  const walk = (candidate: unknown): string | undefined => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const found = walk(item);
        if (found) return found;
      }
    } else if (candidate && typeof candidate === "object") {
      const object = candidate as Record<string, unknown>;
      if (typeof object[key] === "string") return object[key] as string;
      for (const nested of Object.values(object)) {
        const found = walk(nested);
        if (found) return found;
      }
    }
    return undefined;
  };
  return walk(value);
}

async function record(
  repository: InstallationRepository,
  installationId: string,
  leaseToken: string,
  resource: CreatedResource,
  attempt: CreatedResource[],
): Promise<void> {
  attempt.push(resource);
  await repository.addResource(installationId, leaseToken, resource);
}

async function completedResult(api: CloudflareApi, installation: InstallationRecord, resumed: boolean): Promise<InstallResult> {
  const subdomain = await api.getWorkersSubdomain().catch(() => undefined);
  return {
    installationId: installation.id,
    status: "complete",
    resumed,
    ...(subdomain ? { url: `https://${installation.prefix}.${subdomain}.workers.dev/setup` } : {}),
  };
}

function blockedNames(plan: InstallPlan): string[] {
  return plan.items.filter((item) => item.action === "blocked").map((item) => item.name);
}

function validateSecrets(secrets: InstallSecrets): void {
  if (secrets.masterPassword.length < 14) throw new Error("A senha administrativa precisa ter pelo menos 14 caracteres");
  if (!/^[A-Za-z0-9_-]{43}$/.test(secrets.vaultKey)) throw new Error("A VAULT_KEY precisa conter 32 bytes em base64url");
}
