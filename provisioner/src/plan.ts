import type { CreatedResource, InstallationNames, InstallPlan, PlanItem, SmartZapReleaseManifest } from "./types";
import { CloudflareApi } from "./cloudflare-api";

const PREFIX = /^smartzap-[a-f0-9]{8}$/;

export function deriveNames(prefix: string): InstallationNames {
  if (!PREFIX.test(prefix)) throw new Error("Prefixo inválido; gere um novo identificador no instalador");
  const rate = Number.parseInt(prefix.slice(-8), 16) % 2_147_483_647 || 1;
  return {
    prefix,
    worker: prefix,
    database: `${prefix}-db`,
    media: `${prefix}-media`,
    webhookQueue: `${prefix}-meta-webhooks`,
    automationQueue: `${prefix}-inbox-automation`,
    conversionQueue: `${prefix}-meta-conversions`,
    conversionDlq: `${prefix}-meta-conversions-dlq`,
    webhookDlq: `${prefix}-meta-webhooks-dlq`,
    automationDlq: `${prefix}-inbox-automation-dlq`,
    campaignWorkflow: `${prefix}-campaign-send`,
    setupWorkflow: `${prefix}-setup-health`,
    rateLimitNamespace: String(rate),
  };
}

export async function buildPlan(
  api: CloudflareApi,
  accountId: string,
  prefix: string,
  release: SmartZapReleaseManifest,
  owned: CreatedResource[] = [],
): Promise<InstallPlan> {
  const names = deriveNames(prefix);
  const [databases, buckets, queues, workers, workflows] = await Promise.all([
    api.listD1(), api.listR2(), api.listQueues(), api.listWorkers(), api.listWorkflows(),
  ]);
  const items: PlanItem[] = [];
  const add = (kind: PlanItem["kind"], name: string, existing?: { id?: string }) => items.push(existing
    ? owned.some((item) => item.kind === kind && item.name === name)
      ? { kind, name, action: "reuse", id: existing.id, reason: "Recurso criado e registrado nesta instalação; será reutilizado" }
      : { kind, name, action: "blocked", id: existing.id, reason: "Já existe na conta e não pertence a esta nova rodada" }
    : { kind, name, action: "create", reason: "Nome livre e derivado do prefixo da instalação" });
  add("worker", names.worker, workers.find((item) => item.id === names.worker));
  const database = databases.find((item) => item.name === names.database);
  add("d1", names.database, database ? { id: database.uuid } : undefined);
  const bucket = buckets.find((item) => item.name === names.media);
  add("r2", names.media, bucket ? {} : undefined);
  for (const name of queueNames(names)) {
    const existing = queues.find((item) => item.queue_name === name);
    add("queue", name, existing ? { id: existing.queue_id } : undefined);
  }
  for (const name of [names.campaignWorkflow, names.setupWorkflow]) {
    const existing = workflows.find((item) => item.name === name);
    add("workflow", name, existing);
  }
  return { safe: items.every((item) => item.action !== "blocked"), accountId, names, releaseVersion: release.version, items };
}

export function queueNames(names: InstallationNames): string[] {
  return [
    names.webhookQueue,
    names.automationQueue,
    names.conversionQueue,
    names.conversionDlq,
    names.webhookDlq,
    names.automationDlq,
  ];
}
