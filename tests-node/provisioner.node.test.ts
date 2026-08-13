import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWorkerMetadata, CloudflareApi, CloudflareApiError, exchangeOAuthCode, fetchVerified, revokeOAuthToken } from "../provisioner/src/cloudflare-api";
import { decryptJson, encryptJson, randomBase64Url, sha256 } from "../provisioner/src/crypto";
import { buildPlan, deriveNames } from "../provisioner/src/plan";
import { loadRelease } from "../provisioner/src/release";
import type { ProvisionerEnv, SmartZapReleaseManifest } from "../provisioner/src/types";
import { forkInstallerHtml, installationChooserHtml } from "../provisioner/src/fork-ui";
import { installerHtml } from "../provisioner/src/ui";
import provisionerWorker, { publicError } from "../provisioner/src/index";
import { initializeDatabase, planInstallation } from "../provisioner/src/engine";
import { cleanupExpiredOAuthSessions, clearSessionCookie, sessionCookie } from "../provisioner/src/session";

const release: SmartZapReleaseManifest = {
  schemaVersion: 2,
  version: "test",
  commitSha: "a".repeat(40),
  channel: "rc",
  databaseSchemaVersion: 3,
  createdAt: "2026-08-11T00:00:00Z",
  compatibilityDate: "2026-08-11",
  compatibilityFlags: ["nodejs_compat"],
  main: { path: "files/worker/index.js", sha256: "a".repeat(64), size: 1 },
  modules: [],
  assets: [],
  baseline: {
    name: "0001_fresh_install.sql",
    sha256: "b".repeat(64),
    statementsSha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    statements: [],
  },
  upgrades: [],
};

afterEach(() => vi.unstubAllGlobals());

describe("cofre do provisionador", () => {
  it("cifra e decifra tokens apenas com a chave e AAD corretos", async () => {
    const key = randomBase64Url(32);
    const encrypted = await encryptJson({ accessToken: "segredo" }, key, "sessao-1");
    expect(encrypted).not.toContain("segredo");
    await expect(decryptJson(encrypted, key, "sessao-errada")).rejects.toThrow();
    expect(await decryptJson(encrypted, key, "sessao-1")).toEqual({ accessToken: "segredo" });
  });

  it("revoga e apaga localmente tokens de sessões abandonadas depois do TTL", async () => {
    const key = randomBase64Url(32);
    const tokenCiphertext = await encryptJson({ accessToken: "oauth-expirado" }, key, "smartzap:oauth-token:sessao-expirada");
    const updates: unknown[][] = [];
    const env = {
      PROVISIONER_TOKEN_KEY: key,
      PROVISIONER_DB: {
        prepare: (sql: string) => sql.includes("SELECT id, token_ciphertext")
          ? { all: async () => ({ results: [{ id: "sessao-expirada", token_ciphertext: tokenCiphertext }] }) }
          : { bind: (...values: unknown[]) => ({ run: async () => { updates.push(values); return { meta: { changes: 1 } }; } }) },
      },
    } as unknown as ProvisionerEnv;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    await expect(cleanupExpiredOAuthSessions(env)).resolves.toEqual({ found: 1, remotelyRevoked: 1, locallyCleared: 1 });
    expect(updates).toEqual([["sessao-expirada"]]);
  });

  it("apaga o token local mesmo quando a revogação remota já não responde", async () => {
    const key = randomBase64Url(32);
    const tokenCiphertext = await encryptJson({ accessToken: "oauth-ja-invalido" }, key, "smartzap:oauth-token:sessao-antiga");
    const updates: unknown[][] = [];
    const env = {
      PROVISIONER_TOKEN_KEY: key,
      PROVISIONER_DB: {
        prepare: (sql: string) => sql.includes("SELECT id, token_ciphertext")
          ? { all: async () => ({ results: [{ id: "sessao-antiga", token_ciphertext: tokenCiphertext }] }) }
          : { bind: (...values: unknown[]) => ({ run: async () => { updates.push(values); return { meta: { changes: 1 } }; } }) },
      },
    } as unknown as ProvisionerEnv;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("indisponível", { status: 503 })));
    await expect(cleanupExpiredOAuthSessions(env)).resolves.toEqual({ found: 1, remotelyRevoked: 0, locallyCleared: 1 });
    expect(updates).toEqual([["sessao-antiga"]]);
  });
});

describe("plano idempotente", () => {
  it("deriva todos os nomes de um prefixo aleatório e rejeita nomes livres", () => {
    const names = deriveNames("smartzap-12ab34cd");
    expect(names.worker).toBe("smartzap-12ab34cd");
    expect(names.conversionDlq).toBe("smartzap-12ab34cd-meta-conversions-dlq");
    expect(() => deriveNames("smartzap-producao")).toThrow(/Prefixo inválido/);
  });

  it("usa o ledger da mesma conta no plano de retomada sem liberar colisão alheia", async () => {
    const first = vi.fn(async () => ({
      progress_json: JSON.stringify([{ kind: "d1", name: "smartzap-12ab34cd-db", id: "db-1" }]),
    }));
    const env = {
      PROVISIONER_DB: { prepare: () => ({ bind: () => ({ first }) }) },
    } as unknown as ProvisionerEnv;
    const api = {
      listD1: async () => [{ uuid: "db-1", name: "smartzap-12ab34cd-db" }],
      listR2: async () => [],
      listQueues: async () => [],
      listWorkers: async () => [],
      listWorkflows: async () => [],
    } as unknown as CloudflareApi;
    const plan = await planInstallation({ env, api, accountId: "account", prefix: "smartzap-12ab34cd", release });
    expect(first).toHaveBeenCalled();
    expect(plan.safe).toBe(true);
    expect(plan.items.find((item) => item.kind === "d1")?.action).toBe("reuse");
  });

  it("bloqueia recurso preexistente e permite somente recurso registrado na mesma instalação", async () => {
    const fake = {
      listD1: async () => [{ uuid: "db-1", name: "smartzap-12ab34cd-db" }],
      listR2: async () => [],
      listQueues: async () => [],
      listWorkers: async () => [],
      listWorkflows: async () => [],
    };
    const blocked = await buildPlan(fake as unknown as CloudflareApi, "account", "smartzap-12ab34cd", release);
    expect(blocked.safe).toBe(false);
    expect(blocked.items.find((item) => item.kind === "d1")?.action).toBe("blocked");
    const resumed = await buildPlan(fake as unknown as CloudflareApi, "account", "smartzap-12ab34cd", release, [
      { kind: "d1", name: "smartzap-12ab34cd-db", id: "db-1" },
    ]);
    expect(resumed.safe).toBe(true);
    expect(resumed.items.find((item) => item.kind === "d1")?.action).toBe("reuse");
  });
});

describe("cliente Cloudflare", () => {
  it("valida o Account ID manual somente por leituras de D1 e Workers", async () => {
    const requests: Array<{ url: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), method: String(init?.method || "GET") });
      return Response.json({ success: true, result: [] });
    }));
    const api = new CloudflareApi("oauth", "a".repeat(32));
    await api.validateAccount();
    expect(requests).toEqual([
      { url: expect.stringContaining("/d1/database?per_page=1"), method: "GET" },
      { url: expect.stringContaining("/workers/scripts"), method: "GET" },
    ]);
  });

  it("troca o código de um cliente público usando PKCE sem client_secret", async () => {
    const mocked = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("client_id")).toBe("cliente-publico");
      expect(body.get("code_verifier")).toBe("verificador");
      expect(body.has("client_secret")).toBe(false);
      return new Response(JSON.stringify({ access_token: "oauth-publico", expires_in: 900 }), { status: 200 });
    });
    vi.stubGlobal("fetch", mocked);
    await expect(exchangeOAuthCode({
      clientId: "cliente-publico",
      code: "codigo",
      verifier: "verificador",
      redirectUri: "https://instalador.example/oauth/callback",
    })).resolves.toEqual(expect.objectContaining({ accessToken: "oauth-publico" }));
  });

  it("usa Bearer apenas no request e não o expõe no erro", async () => {
    const mocked = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token-super-secreto");
      return new Response(JSON.stringify({ success: false, errors: [{ code: 9109, message: "Token inválido" }] }), { status: 403 });
    });
    vi.stubGlobal("fetch", mocked);
    const api = new CloudflareApi("token-super-secreto", "a".repeat(32));
    await expect(api.listD1()).rejects.toEqual(expect.objectContaining<Partial<CloudflareApiError>>({ status: 403, code: 9109 }));
    await expect(api.listD1()).rejects.not.toThrow(/token-super-secreto/);
  });

  it("só confirma a revogação OAuth quando a Cloudflare aceita", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("recusado", { status: 503 })));
    await expect(revokeOAuthToken("token-efemero")).rejects.toThrow(/HTTP 503/);
  });

  it("usa o contrato atual { batch } da API REST do D1", async () => {
    const mocked = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ batch: [{ sql: "CREATE TABLE t (id INTEGER)", params: [] }] });
      return new Response(JSON.stringify({ success: true, result: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", mocked);
    const api = new CloudflareApi("oauth", "a".repeat(32));
    await api.batchD1("database", [{ sql: "CREATE TABLE t (id INTEGER)" }]);
  });

  it("envia migrações de Durable Objects como etapa única, não como lista", () => {
    const metadata = buildWorkerMetadata({
      names: deriveNames("smartzap-12ab34cd"),
      release,
      databaseId: "database",
      secrets: { masterPassword: "senha", vaultKey: "chave" },
    });
    expect(metadata.migrations).toEqual({
      new_tag: "v1",
      new_sqlite_classes: ["RealtimeHub", "PhoneThrottle"],
    });
    expect(Array.isArray(metadata.migrations)).toBe(false);
    expect(metadata.bindings).toEqual(expect.arrayContaining([
      { name: "SMARTZAP_VERSION", type: "plain_text", text: "test" },
      { name: "SMARTZAP_COMMIT", type: "plain_text", text: "a".repeat(40) },
      { name: "SMARTZAP_SCHEMA_VERSION", type: "plain_text", text: "3" },
      { name: "SMARTZAP_RELEASE_CHANNEL", type: "plain_text", text: "rc" },
    ]));
  });

  it("faz o bootstrap dos Durable Objects por deploy não versionado", async () => {
    const workerBytes = new TextEncoder().encode("export default { fetch() { return new Response('ok') } }");
    const workerSha = await sha256(workerBytes);
    const get = vi.fn(async (key: string) => key === "files/worker/index.js" ? ({ arrayBuffer: async () => workerBytes.buffer }) : null);
    const mocked = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("/workers/scripts/smartzap-12ab34cd?bindings_inherit=strict");
      expect(String(input)).not.toContain("/versions");
      expect(init?.method).toBe("PUT");
      expect(init?.body).toBeInstanceOf(FormData);
      return new Response(JSON.stringify({ success: true, result: { id: "smartzap-12ab34cd" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", mocked);
    const api = new CloudflareApi("oauth", "a".repeat(32), { get } as unknown as R2Bucket);
    await api.uploadAndDeployWorker({
      names: deriveNames("smartzap-12ab34cd"),
      release: { ...release, main: { ...release.main, sha256: workerSha, size: workerBytes.byteLength } },
      manifestUrl: new URL("https://provisioner.example/release/manifest.json"),
      databaseId: "database",
      secrets: { masterPassword: "senha-segura-123", vaultKey: "a".repeat(43) },
    });
  });

  it("remove consumidores antes do Worker e das Queues durante rollback", async () => {
    const calls: Array<{ path: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const method = String(init?.method || "GET");
      calls.push({ path, method });
      if (method === "GET" && path.endsWith("/queues/queue-1/consumers"))
        return Response.json({ success: true, result: [{ consumer_id: "consumer-1", script_name: "smartzap-12ab34cd" }] });
      return Response.json({ success: true, result: {} });
    }));
    const api = new CloudflareApi("oauth", "a".repeat(32));
    await expect(api.rollback([
      { kind: "d1", name: "smartzap-12ab34cd-db", id: "db-1" },
      { kind: "r2", name: "smartzap-12ab34cd-media" },
      { kind: "queue", name: "smartzap-12ab34cd-meta-webhooks", id: "queue-1" },
      { kind: "worker", name: "smartzap-12ab34cd" },
      { kind: "workflow", name: "smartzap-12ab34cd-setup-health" },
    ])).resolves.toEqual([]);
    const consumerDelete = calls.findIndex((call) => call.method === "DELETE" && call.path.endsWith("/queues/queue-1/consumers/consumer-1"));
    const workerDelete = calls.findIndex((call) => call.method === "DELETE" && call.path.endsWith("/workers/scripts/smartzap-12ab34cd"));
    const queueDelete = calls.findIndex((call) => call.method === "DELETE" && call.path.endsWith("/queues/queue-1"));
    expect(consumerDelete).toBeGreaterThanOrEqual(0);
    expect(workerDelete).toBeGreaterThan(consumerDelete);
    expect(queueDelete).toBeGreaterThan(workerDelete);
  });

  it("recusa artefato cujo SHA-256 não confere", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("worker")));
    await expect(fetchVerified(new URL("https://release.invalid/index.js"), "0".repeat(64))).rejects.toThrow(/Checksum inválido/);
    await expect(fetchVerified(new URL("https://release.invalid/index.js"), await sha256("worker"))).resolves.toBeInstanceOf(Response);
  });
});

describe("distribuição da release", () => {
  it("lê o manifesto diretamente do R2 e evita self-fetch do Worker", async () => {
    const get = vi.fn(async (key: string) => key === "manifest.json" ? ({ text: async () => JSON.stringify(release) }) : null);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("self-fetch não deveria acontecer"); }));
    const loaded = await loadRelease({
      RELEASES: { get } as unknown as R2Bucket,
      SMARTZAP_RELEASE_MANIFEST_URL: "https://provisioner.example/release/manifest.json",
    } as ProvisionerEnv);
    expect(get).toHaveBeenCalledWith("manifest.json");
    expect(loaded.manifest.version).toBe("test");
  });

  it("recusa comandos SQL alterados mesmo quando o manifesto conserva o hash declarado", async () => {
    const tampered = { ...release, baseline: { ...release.baseline, statements: ["DROP TABLE contacts"] } };
    const get = vi.fn(async () => ({ text: async () => JSON.stringify(tampered) }));
    await expect(loadRelease({
      RELEASES: { get } as unknown as R2Bucket,
      SMARTZAP_RELEASE_MANIFEST_URL: "https://provisioner.example/release/manifest.json",
    } as ProvisionerEnv)).rejects.toThrow(/Checksum dos comandos SQL/);
  });
});

describe("baseline final do D1", () => {
  it("instala apenas o baseline e registra uma única versão no banco novo", async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    const batches: Array<Array<{ sql: string; params?: unknown[] }>> = [];
    const api = {
      queryD1: vi.fn(async (_databaseId: string, sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes("COUNT(*) total")) return [{ results: [{ total: 0 }] }];
        return [];
      }),
      batchD1: vi.fn(async (_databaseId: string, statements: Array<{ sql: string; params?: unknown[] }>) => {
        batches.push(statements);
        return [];
      }),
    };
    await initializeDatabase(api as unknown as CloudflareApi, "db", {
      ...release,
      baseline: {
        name: "0001_fresh_install.sql",
        sha256: "c".repeat(64),
        statementsSha256: "d".repeat(64),
        statements: ["CREATE TABLE contacts(id TEXT PRIMARY KEY)", "CREATE TABLE settings(key TEXT PRIMARY KEY)"],
      },
    });
    expect(batches).toEqual([[
      { sql: expect.stringContaining("CREATE TABLE smartzap_install_migrations") },
      { sql: "CREATE TABLE contacts(id TEXT PRIMARY KEY)" },
      { sql: "CREATE TABLE settings(key TEXT PRIMARY KEY)" },
      {
        sql: "INSERT INTO smartzap_install_migrations(name,sha256) VALUES (?, ?)",
        params: ["0001_fresh_install.sql", "d".repeat(64)],
      },
      { sql: expect.stringContaining("CREATE TABLE IF NOT EXISTS smartzap_release_metadata") },
      {
        sql: expect.stringContaining("INSERT INTO smartzap_release_metadata"),
        params: ["test", "a".repeat(40), "3", "rc", "c".repeat(64)],
      },
    ]]);
    expect(queries).toHaveLength(1);
  });

  it("recusa banco com ledger sem baseline em vez de assumir conclusão", async () => {
    const api = {
      queryD1: vi.fn(async (_databaseId: string, sql: string) => {
        if (sql.includes("sqlite_master")) return [{ results: [{ total: 1 }] }];
        return [{ results: [] }];
      }),
      batchD1: vi.fn(),
    };
    await expect(initializeDatabase(api as unknown as CloudflareApi, "db", release))
      .rejects.toThrow(/bootstrap parcial/);
    expect(api.batchD1).not.toHaveBeenCalled();
  });
});

describe("interface de instalação", () => {
  it("publica o guia canônico no domínio raiz em Markdown puro", async () => {
    const env = { PUBLIC_ORIGIN: "https://instalar.escoladeautomacao.com/smartzap" } as ProvisionerEnv;
    const response = await provisionerWorker.fetch(new Request("https://instalar.escoladeautomacao.com/guia.md"), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('inline; filename="guia.md"');
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(response.text()).resolves.toContain("# Guia completo: instalar sistemas na Cloudflare");

    const head = await provisionerWorker.fetch(new Request("https://instalar.escoladeautomacao.com/guia.md", { method: "HEAD" }), env);
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    await expect(head.text()).resolves.toBe("");
  });

  it("gera os segredos no navegador e só envia no clique final", () => {
    const html = installerHtml();
    expect(html).toContain("crypto.getRandomValues");
    expect(html).toContain("Baixar recuperação");
    expect(html).toContain('fetch(url');
    expect(html).not.toContain("MASTER_PASSWORD=");
    expect(html).not.toContain("SMARTZAP_VAULT_KEY=");
  });

  it("permite retomar pelo arquivo e invalida o plano quando o identificador muda", () => {
    const html = installerHtml();
    expect(html).toContain('id="prefix" pattern="smartzap-[a-f0-9]{8}"');
    expect(html).not.toContain('id="prefix" readonly');
    expect(html).toContain("Retomar pelo arquivo");
    expect(html).toContain('$("prefix").addEventListener("input",invalidatePlan)');
    expect(html).toContain("currentPlan.requestedPrefix!==selectedPrefix");
    expect(html).toContain("Identificador alterado. Confira o plano novamente antes de instalar.");
  });

  it("oferece Account ID validado quando a listagem OAuth não retorna contas", () => {
    const html = installerHtml();
    expect(html).toContain('option.value="manual"');
    expect(html).toContain('option.textContent="Informar Account ID"');
    expect(html).toContain('id="account-id" maxlength="32"');
    expect(html).toContain('await json(API_BASE+"api/account"');
  });

  it("mantém OAuth, APIs e sessão dentro da rota do produto", () => {
    const html = installerHtml();
    expect(html).toContain('href="./oauth/start"');
    expect(html).toContain('json(API_BASE+"api/session")');
    expect(html).toContain('json(API_BASE+"api/plan"');
    expect(html).toContain('json(API_BASE+"api/install"');
    expect(sessionCookie("sessao", true, "/smartzap")).toContain("Path=/smartzap;");
    expect(clearSessionCookie(true, "/smartzap")).toContain("Path=/smartzap;");
  });

  it("explica a ativação obrigatória do R2 e oferece retomada na conta correta", () => {
    const response = publicError(new CloudflareApiError(403, 10042, "Please enable R2 through the Cloudflare Dashboard."));
    expect(response).toEqual(expect.objectContaining({ code: "R2_SUBSCRIPTION_REQUIRED" }));
    expect(response.error).toContain("meio de pagamento");
    expect(response.error).not.toContain("Please enable R2");
    const html = installerHtml();
    expect(html).toContain("Ativar R2 na Cloudflare");
    expect(html).toContain('"https://dash.cloudflare.com/"+session.accountId+"/r2/overview"');
    expect(html).toContain('error.code=data.code');
  });

  it("separa o fork recomendado da instalação OAuth fixa sem remover o motor atual", async () => {
    const chooser = installationChooserHtml();
    expect(chooser).toContain('href="./fork/"');
    expect(chooser).toContain('href="./quick/"');
    expect(chooser.indexOf("Meu próprio código")).toBeLessThan(chooser.indexOf("Instalação rápida"));

    const fork = forkInstallerHtml();
    expect(fork).toContain("/smartzap-cloudflare/fork");
    expect(fork).toContain("npm run fork:deploy");
    expect(fork).toContain("SMARTZAP_INSTALL_ID");
    expect(fork).toContain("crypto.getRandomValues");
    expect(fork).not.toContain("localStorage");

    const env = { PUBLIC_ORIGIN: "https://instalar.escoladeautomacao.com/smartzap" } as ProvisionerEnv;
    const root = await provisionerWorker.fetch(new Request("https://instalar.escoladeautomacao.com/smartzap/"), env);
    expect(await root.text()).toContain("Meu próprio código");
    const quick = await provisionerWorker.fetch(new Request("https://instalar.escoladeautomacao.com/smartzap/quick/"), env);
    expect(await quick.text()).toContain("instalação rápida");
    const forkRoute = await provisionerWorker.fetch(new Request("https://instalar.escoladeautomacao.com/smartzap/fork/"), env);
    expect(await forkRoute.text()).toContain("O SmartZap passa a ser seu");
  });
});
