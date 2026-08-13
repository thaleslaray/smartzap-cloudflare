import type { CreatedResource, InstallationNames, OAuthTokens, ReleaseFile, SmartZapReleaseManifest } from "./types";
import { sha256 } from "./crypto";

const API = "https://api.cloudflare.com/client/v4";

interface CloudflareEnvelope<T> {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string } | string>;
}

export class CloudflareApiError extends Error {
  constructor(public readonly status: number, public readonly code: number | undefined, message: string) {
    super(message);
    this.name = "CloudflareApiError";
  }
}

export class CloudflareApi {
  constructor(
    private readonly accessToken: string,
    private readonly accountId?: string,
    private readonly releaseBucket?: R2Bucket,
  ) {}

  private account(path: string): string {
    if (!this.accountId) throw new Error("Account ID ainda não selecionado");
    return `/accounts/${this.accountId}${path}`;
  }

  async request<T>(path: string, init: RequestInit = {}, bearer = this.accessToken): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${bearer}`,
        ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const payload = await response.json().catch(() => null) as CloudflareEnvelope<T> | null;
    if (!response.ok || !payload?.success) {
      const first = payload?.errors?.[0];
      throw new CloudflareApiError(response.status, first?.code, first?.message || `Cloudflare respondeu HTTP ${response.status}`);
    }
    return payload.result;
  }

  async listAccounts(): Promise<Array<{ id: string; name: string }>> {
    const result = await this.request<Array<{ id: string; name: string }>>("/accounts?per_page=50");
    return result.map(({ id, name }) => ({ id, name }));
  }

  async validateAccount(): Promise<void> {
    await Promise.all([
      this.request(this.account("/d1/database?per_page=1")),
      this.request(this.account("/workers/scripts")),
    ]);
  }

  async listD1(): Promise<Array<{ uuid: string; name: string }>> {
    const result = await this.request<Array<{ uuid: string; name: string }>>(this.account("/d1/database?per_page=100"));
    return result || [];
  }

  async createD1(name: string): Promise<{ uuid: string; name: string }> {
    return this.request(this.account("/d1/database"), { method: "POST", body: JSON.stringify({ name }) });
  }

  async deleteD1(id: string): Promise<void> {
    await this.request(this.account(`/d1/database/${id}`), { method: "DELETE" });
  }

  async queryD1(databaseId: string, sql: string, params: unknown[] = []): Promise<unknown> {
    return this.request(this.account(`/d1/database/${databaseId}/query`), {
      method: "POST",
      body: JSON.stringify({ sql, params }),
    });
  }

  async batchD1(databaseId: string, statements: Array<{ sql: string; params?: unknown[] }>): Promise<unknown> {
    return this.request(this.account(`/d1/database/${databaseId}/query`), {
      method: "POST",
      body: JSON.stringify({
        batch: statements.map((statement) => ({ sql: statement.sql, params: statement.params || [] })),
      }),
    });
  }

  async listR2(): Promise<Array<{ name: string }>> {
    const result = await this.request<{ buckets?: Array<{ name: string }> }>(this.account("/r2/buckets?per_page=1000"));
    return result.buckets || [];
  }

  async createR2(name: string): Promise<{ name: string }> {
    return this.request(this.account("/r2/buckets"), { method: "POST", body: JSON.stringify({ name }) });
  }

  async deleteR2(name: string): Promise<void> {
    await this.request(this.account(`/r2/buckets/${encodeURIComponent(name)}`), { method: "DELETE" });
  }

  async listQueues(): Promise<Array<{ queue_id: string; queue_name: string }>> {
    const result = await this.request<Array<{ queue_id: string; queue_name: string }> | { queues?: Array<{ queue_id: string; queue_name: string }> }>(this.account("/queues?per_page=100"));
    return Array.isArray(result) ? result : result.queues || [];
  }

  async createQueue(name: string): Promise<{ queue_id: string; queue_name: string }> {
    return this.request(this.account("/queues"), { method: "POST", body: JSON.stringify({ queue_name: name }) });
  }

  async deleteQueue(id: string): Promise<void> {
    await this.request(this.account(`/queues/${id}`), { method: "DELETE" });
  }

  async createQueueConsumer(queueId: string, worker: string, deadLetterQueue?: string, settings?: Record<string, unknown>): Promise<void> {
    await this.request(this.account(`/queues/${queueId}/consumers`), {
      method: "POST",
      body: JSON.stringify({ type: "worker", script_name: worker, dead_letter_queue: deadLetterQueue, settings }),
    });
  }

  async listQueueConsumers(queueId: string): Promise<Array<{ consumer_id?: string; script_name?: string; script?: string; service?: string }>> {
    const result = await this.request<
      Array<{ consumer_id?: string; script_name?: string; script?: string; service?: string }>
      | { consumers?: Array<{ consumer_id?: string; script_name?: string; script?: string; service?: string }> }
    >(this.account(`/queues/${queueId}/consumers`));
    return Array.isArray(result) ? result : result.consumers || [];
  }

  async deleteQueueConsumer(queueId: string, consumerId: string): Promise<void> {
    await this.request(this.account(`/queues/${queueId}/consumers/${consumerId}`), { method: "DELETE" });
  }

  async listWorkers(): Promise<Array<{ id: string }>> {
    const result = await this.request<Array<{ id: string }> | { workers?: Array<{ id: string }> }>(this.account("/workers/scripts"));
    return Array.isArray(result) ? result : result.workers || [];
  }

  async deleteWorker(name: string): Promise<void> {
    await this.request(this.account(`/workers/scripts/${encodeURIComponent(name)}`), { method: "DELETE" });
  }

  async listWorkflows(): Promise<Array<{ id: string; name: string }>> {
    const result = await this.request<Array<{ id: string; name: string }> | { workflows?: Array<{ id: string; name: string }> }>(this.account("/workflows?per_page=100"));
    return Array.isArray(result) ? result : result.workflows || [];
  }

  async upsertWorkflow(name: string, worker: string, className: string): Promise<{ id: string; name: string }> {
    return this.request(this.account(`/workflows/${encodeURIComponent(name)}`), {
      method: "PUT",
      body: JSON.stringify({ script_name: worker, class_name: className }),
    });
  }

  async deleteWorkflow(name: string): Promise<void> {
    await this.request(this.account(`/workflows/${encodeURIComponent(name)}`), { method: "DELETE" });
  }

  async uploadAssets(worker: string, manifestUrl: URL, assets: ReleaseFile[]): Promise<string | undefined> {
    if (assets.length === 0) return undefined;
    const manifest = Object.fromEntries(assets.map((asset) => [asset.path, {
      hash: asset.assetHash,
      size: asset.size,
    }]));
    const session = await this.request<{ buckets: string[][]; jwt: string }>(
      this.account(`/workers/scripts/${encodeURIComponent(worker)}/assets-upload-session`),
      { method: "POST", body: JSON.stringify({ manifest }) },
    );
    let completionJwt = session.jwt;
    const byHash = new Map(assets.map((asset) => [asset.assetHash, asset]));
    for (const bucket of session.buckets || []) {
      if (bucket.length === 0) continue;
      const form = new FormData();
      for (const hash of bucket) {
        const asset = byHash.get(hash);
        if (!asset) throw new Error(`A Cloudflare pediu um asset desconhecido: ${hash}`);
        const bytes = new Uint8Array(await (await this.fetchRelease(new URL(asset.sourcePath || asset.path, manifestUrl), asset.sha256)).arrayBuffer());
        form.append(hash, new File([toBase64(bytes)], hash, { type: asset.contentType || "application/null" }), hash);
      }
      const response = await this.request<{ jwt?: string }>(
        this.account("/workers/assets/upload?base64=true"),
        { method: "POST", body: form },
        session.jwt,
      );
      if (response.jwt) completionJwt = response.jwt;
    }
    return completionJwt;
  }

  async uploadAndDeployWorker(input: {
    names: InstallationNames;
    release: SmartZapReleaseManifest;
    manifestUrl: URL;
    databaseId: string;
    secrets: { masterPassword: string; vaultKey: string };
    assetsJwt?: string;
  }): Promise<void> {
    const { names, release, manifestUrl, databaseId, secrets, assetsJwt } = input;
    const mainResponse = await this.fetchRelease(new URL(release.main.path, manifestUrl), release.main.sha256);
    const mainBytes = await mainResponse.arrayBuffer();
    const metadata = buildWorkerMetadata({ names, release, databaseId, secrets, assetsJwt });
    const form = new FormData();
    form.set("metadata", JSON.stringify(metadata));
    form.set("index.js", new File([mainBytes], "index.js", { type: "application/javascript+module" }), "index.js");
    for (const module of release.modules) {
      const response = await this.fetchRelease(new URL(module.sourcePath || module.path, manifestUrl), module.sha256);
      form.set(module.path, new File([await response.arrayBuffer()], module.path, { type: module.contentType || "application/javascript+module" }), module.path);
    }
    await this.request(this.account(`/workers/scripts/${encodeURIComponent(names.worker)}?bindings_inherit=strict`), {
      method: "PUT",
      body: form,
    });
  }

  async configureCron(worker: string): Promise<void> {
    await this.request(this.account(`/workers/scripts/${encodeURIComponent(worker)}/schedules`), {
      method: "PUT",
      body: JSON.stringify([{ cron: "*/15 * * * *" }]),
    });
  }

  async enableSubdomain(worker: string): Promise<void> {
    await this.request(this.account(`/workers/scripts/${encodeURIComponent(worker)}/subdomain`), {
      method: "POST",
      body: JSON.stringify({ enabled: true, previews_enabled: false }),
    });
  }

  async getWorkersSubdomain(): Promise<string | undefined> {
    const result = await this.request<{ subdomain?: string }>(this.account("/workers/subdomain"));
    return result.subdomain;
  }

  async rollback(resources: CreatedResource[]): Promise<CreatedResource[]> {
    const remaining: CreatedResource[] = [];
    const workerNames = new Set(resources.filter((item) => item.kind === "worker").map((item) => item.name));
    for (const queue of resources.filter((item) => item.kind === "queue" && item.id)) {
      try {
        const consumers = await this.listQueueConsumers(queue.id!);
        for (const consumer of consumers) {
          const worker = consumer.script_name || consumer.script || consumer.service;
          if (consumer.consumer_id && worker && workerNames.has(worker))
            await this.deleteQueueConsumer(queue.id!, consumer.consumer_id);
        }
      } catch {
        // A remoção individual abaixo ainda registra precisamente qualquer
        // recurso que não pôde ser limpo.
      }
    }
    for (const resource of [...resources].reverse()) {
      try {
        if (resource.kind === "workflow") await this.deleteWorkflow(resource.name);
        else if (resource.kind === "worker") await this.deleteWorker(resource.name);
        else if (resource.kind === "queue" && resource.id) await this.deleteQueue(resource.id);
        else if (resource.kind === "r2") await this.deleteR2(resource.name);
        else if (resource.kind === "d1" && resource.id) await this.deleteD1(resource.id);
      } catch {
        remaining.push(resource);
      }
    }
    return remaining.reverse();
  }

  private async fetchRelease(url: URL, expectedSha256: string): Promise<Response> {
    const key = releaseObjectKey(url);
    if (this.releaseBucket && key) {
      const object = await this.releaseBucket.get(key);
      if (!object) throw new Error(`Artefato indisponível: ${url.pathname}`);
      const bytes = new Uint8Array(await object.arrayBuffer());
      if (await sha256(bytes) !== expectedSha256) throw new Error(`Checksum inválido: ${url.pathname}`);
      return new Response(bytes);
    }
    return fetchVerified(url, expectedSha256);
  }
}

export function releaseObjectKey(url: URL): string | undefined {
  const marker = "/release/";
  const offset = url.pathname.indexOf(marker);
  if (offset < 0) return undefined;
  const encodedKey = url.pathname.slice(offset + marker.length);
  if (!encodedKey) return undefined;

  let key: string;
  try {
    key = decodeURIComponent(encodedKey);
  } catch {
    return undefined;
  }

  const segments = key.split("/");
  return !key.startsWith("files/")
    || !/^[A-Za-z0-9._/-]+$/.test(key)
    || segments.some((segment) => segment === "" || segment === "." || segment === "..")
    ? undefined
    : key;
}

export async function exchangeOAuthCode(input: {
  clientId: string;
  clientSecret?: string;
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.clientId,
    code: input.code,
    code_verifier: input.verifier,
    redirect_uri: input.redirectUri,
  });
  if (input.clientSecret) body.set("client_secret", input.clientSecret);
  const response = await fetch("https://dash.cloudflare.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "A Cloudflare recusou a troca do código OAuth");
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: payload.expires_in ? Date.now() + payload.expires_in * 1000 : undefined,
    scope: payload.scope,
  };
}

export async function revokeOAuthToken(token: string): Promise<void> {
  const response = await fetch("https://dash.cloudflare.com/oauth2/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  if (!response.ok) throw new Error(`Revogação OAuth recusada: HTTP ${response.status}`);
}

export async function fetchVerified(url: URL, expectedSha256: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Artefato indisponível: ${url.pathname}`);
  const bytes = new Uint8Array(await response.clone().arrayBuffer());
  if (await sha256(bytes) !== expectedSha256) throw new Error(`Checksum inválido: ${url.pathname}`);
  return response;
}

function toBase64(bytes: Uint8Array): string {
  let output = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    output += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(output);
}

export function buildWorkerMetadata(input: {
  names: InstallationNames;
  release: SmartZapReleaseManifest;
  databaseId: string;
  secrets: { masterPassword: string; vaultKey: string };
  assetsJwt?: string;
}): Record<string, unknown> {
  const { names, release, databaseId, secrets, assetsJwt } = input;
  return {
    main_module: "index.js",
    compatibility_date: release.compatibilityDate,
    compatibility_flags: release.compatibilityFlags,
    annotations: { "workers/message": `SmartZap ${release.version}`, "workers/tag": release.version },
    ...(assetsJwt ? { assets: { jwt: assetsJwt, config: { not_found_handling: "single-page-application", run_worker_first: ["/api/*", "/webhook"] } } } : {}),
    bindings: workerBindings(names, databaseId, secrets),
    migrations: {
      new_tag: "v1",
      new_sqlite_classes: ["RealtimeHub", "PhoneThrottle"],
    },
  };
}

function workerBindings(names: InstallationNames, databaseId: string, secrets: { masterPassword: string; vaultKey: string }): unknown[] {
  const vars: Record<string, string> = {
    ENVIRONMENT: "production",
    SETUP_REQUIRED: "true",
    META_GRAPH_VERSION: "v25.0",
    TURNSTILE_ENABLED: "false",
    AI_ENABLED: "false",
    AI_MODEL: "@cf/openai/gpt-oss-20b",
    AI_GATEWAY_ID: names.prefix,
    AI_PROVIDER_TIMEOUT_MS: "30000",
    AI_MAX_DRAFTS_PER_CONVERSATION_HOUR: "20",
    AI_MAX_DRAFTS_PER_DAY: "200",
    FLOW_DATA_API_VERSION: "3.0",
    INBOX_SEND_ENABLED: "true",
    INBOX_AUTOMATION_ENABLED: "false",
    AUTOMATION_QUEUE_NAME: names.automationQueue,
    CAPI_QUEUE_NAME: names.conversionQueue,
  };
  return [
    ...Object.entries(vars).map(([name, text]) => ({ name, type: "plain_text", text })),
    { name: "MASTER_PASSWORD", type: "secret_text", text: secrets.masterPassword },
    { name: "SMARTZAP_VAULT_KEY", type: "secret_text", text: secrets.vaultKey },
    { name: "DB", type: "d1", id: databaseId },
    { name: "MEDIA", type: "r2_bucket", bucket_name: names.media },
    { name: "WEBHOOK_QUEUE", type: "queue", queue_name: names.webhookQueue },
    { name: "AUTOMATION_QUEUE", type: "queue", queue_name: names.automationQueue },
    { name: "CAPI_QUEUE", type: "queue", queue_name: names.conversionQueue },
    { name: "CAPI_DLQ", type: "queue", queue_name: names.conversionDlq },
    { name: "WEBHOOK_DLQ", type: "queue", queue_name: names.webhookDlq },
    { name: "AUTOMATION_DLQ", type: "queue", queue_name: names.automationDlq },
    { name: "REALTIME", type: "durable_object_namespace", class_name: "RealtimeHub" },
    { name: "THROTTLE", type: "durable_object_namespace", class_name: "PhoneThrottle" },
    { name: "CAMPAIGN_WF", type: "workflow", workflow_name: names.campaignWorkflow, class_name: "CampaignSendWorkflow" },
    { name: "SETUP_WF", type: "workflow", workflow_name: names.setupWorkflow, class_name: "SetupHealthWorkflow" },
    { name: "LOGIN_LIMITER", type: "ratelimit", namespace_id: names.rateLimitNamespace, simple: { limit: 5, period: 60 } },
    { name: "AI", type: "ai" },
    { name: "CF_VERSION_METADATA", type: "version_metadata" },
  ];
}
