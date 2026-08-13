import type { CreatedResource, InstallationRecord, InstallPlan, ProvisionerEnv } from "./types";

export class InstallationRepository {
  constructor(private readonly env: ProvisionerEnv) {}

  async find(accountId: string, prefix: string): Promise<InstallationRecord | null> {
    return this.env.PROVISIONER_DB.prepare(`
      SELECT * FROM provisioner_installations WHERE account_id = ? AND prefix = ?
    `).bind(accountId, prefix).first<InstallationRecord>();
  }

  async create(sessionId: string, plan: InstallPlan): Promise<InstallationRecord> {
    const id = crypto.randomUUID();
    await this.env.PROVISIONER_DB.prepare(`
      INSERT INTO provisioner_installations
        (id, session_id, account_id, prefix, release_version, status, plan_json, progress_json)
      VALUES (?, ?, ?, ?, ?, 'planned', ?, '[]')
    `).bind(id, sessionId, plan.accountId, plan.names.prefix, plan.releaseVersion, JSON.stringify(plan)).run();
    const created = await this.byId(id);
    if (!created) throw new Error("Não foi possível registrar a instalação");
    return created;
  }

  async byId(id: string): Promise<InstallationRecord | null> {
    return this.env.PROVISIONER_DB.prepare(`
      SELECT * FROM provisioner_installations WHERE id = ?
    `).bind(id).first<InstallationRecord>();
  }

  async start(id: string, sessionId: string, plan: InstallPlan): Promise<string> {
    const leaseToken = crypto.randomUUID();
    const result = await this.env.PROVISIONER_DB.prepare(`
      UPDATE provisioner_installations
      SET session_id = ?, status = 'running', plan_json = ?, error_code = NULL, error_detail = NULL,
          lease_token = ?, lease_expires_at = datetime('now', '+30 minutes'), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND (lease_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP)
    `).bind(sessionId, JSON.stringify(plan), leaseToken, id).run();
    if (changes(result) !== 1) throw new Error("Esta instalação já está sendo executada. Aguarde a tentativa atual terminar.");
    await this.event(id, "info", "INSTALL_STARTED", `Release ${plan.releaseVersion}`);
    return leaseToken;
  }

  async addResource(id: string, leaseToken: string, resource: CreatedResource): Promise<void> {
    const record = await this.byId(id);
    if (!record) throw new Error("Instalação não encontrada");
    const progress = parseProgress(record.progress_json);
    if (!progress.some((item) => item.kind === resource.kind && item.name === resource.name)) progress.push(resource);
    const result = await this.env.PROVISIONER_DB.prepare(`
      UPDATE provisioner_installations
      SET progress_json = ?, lease_expires_at = datetime('now', '+30 minutes'), updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND lease_token = ?
    `).bind(JSON.stringify(progress), id, leaseToken).run();
    if (changes(result) !== 1) throw new Error("A posse segura da instalação expirou");
    await this.event(id, "info", "RESOURCE_READY", `${resource.kind}:${resource.name}`);
  }

  async complete(id: string, leaseToken: string): Promise<void> {
    const result = await this.env.PROVISIONER_DB.prepare(`
      UPDATE provisioner_installations
      SET status = 'complete', lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND lease_token = ?
    `).bind(id, leaseToken).run();
    if (changes(result) !== 1) throw new Error("A posse segura da instalação expirou antes da conclusão");
    await this.event(id, "info", "INSTALL_COMPLETE", "Provisionamento concluído");
  }

  async fail(id: string, leaseToken: string, error: unknown, rolledBack: boolean, remaining: CreatedResource[]): Promise<void> {
    const detail = safeError(error);
    await this.env.PROVISIONER_DB.prepare(`
      UPDATE provisioner_installations
      SET status = ?, progress_json = ?, error_code = 'PROVISION_FAILED', error_detail = ?,
          lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND lease_token = ?
    `).bind(rolledBack ? "rolled_back" : "failed", JSON.stringify(remaining), detail, id, leaseToken).run();
    await this.event(id, "error", "PROVISION_FAILED", detail);
  }

  async event(id: string, level: "info" | "warning" | "error", code: string, detail: string): Promise<void> {
    await this.env.PROVISIONER_DB.prepare(`
      INSERT INTO provisioner_events (installation_id, level, code, detail) VALUES (?, ?, ?, ?)
    `).bind(id, level, code, detail.slice(0, 1000)).run();
  }
}

function changes(result: D1Result<unknown>): number {
  return Number(result.meta?.changes ?? 0);
}

export function parseProgress(value: string): CreatedResource[] {
  try {
    const parsed = JSON.parse(value) as CreatedResource[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Falha inesperada";
  return message.replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]").slice(0, 1000);
}
