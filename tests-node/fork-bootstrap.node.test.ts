import { describe, expect, it } from "vitest";
import { buildForkWrangler, classifyForkResources, deploymentId, deploymentResourceNames, parseCreatedD1Id, parseD1Databases, parseQueueNames, parseR2BucketNames } from "../scripts/lib/fork-bootstrap.mjs";
import { assertRollbackCheckpoint, buildRollbackCheckpoint, isMissingWorkerError, parseActiveDeploymentVersion, parseTimeTravelBookmark } from "../scripts/lib/fork-release.mjs";
import { assertSchemaTransition, validateForkMigrationManifest } from "../scripts/lib/fork-migrations.mjs";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const template = `{
  "name":"smartzap",
  "main":"src/index.ts",
  "vars":{"SETUP_REQUIRED":"true"},
  "d1_databases":[{"binding":"DB","database_name":"smartzap"}],
  "r2_buckets":[{"binding":"MEDIA","bucket_name":"smartzap-media"}],
  "queues":{"producers":[
    {"binding":"WEBHOOK_QUEUE","queue":"meta-webhooks"},{"binding":"AUTOMATION_QUEUE","queue":"inbox-automation"},{"binding":"CAPI_QUEUE","queue":"meta-conversions"},{"binding":"CAPI_DLQ","queue":"meta-conversions-dlq"},{"binding":"WEBHOOK_DLQ","queue":"meta-webhooks-dlq"},{"binding":"AUTOMATION_DLQ","queue":"inbox-automation-dlq"}
  ],"consumers":[
    {"queue":"meta-webhooks","dead_letter_queue":"meta-webhooks-dlq"},{"queue":"inbox-automation","dead_letter_queue":"inbox-automation-dlq"},{"queue":"meta-conversions"}
  ]},
  "workflows":[{"binding":"CAMPAIGN_WF","name":"campaign-send","class_name":"CampaignSendWorkflow"},{"binding":"SETUP_WF","name":"setup-health","class_name":"SetupHealthWorkflow"}],
  "ratelimits":[{"name":"LOGIN_LIMITER","namespace_id":"1","simple":{"limit":5,"period":60}}]
}`;

describe("bootstrap fork-first", () => {
  it("deriva produção e staging físicos do mesmo identificador", () => {
    expect(deploymentId("smartzap-12ab34cd")).toBe("smartzap-12ab34cd");
    expect(deploymentId("smartzap-12ab34cd", true)).toBe("smartzap-12ab34cd-staging");
    expect(() => deploymentId("smartzap-livre")).toThrow(/formato/);
  });

  it("isola todos os recursos e registra versão, commit e schema", () => {
    const source = buildForkWrangler(template, {
      workerName: "smartzap-12ab34cd-staging",
      databaseId: "11111111-1111-4111-8111-111111111111",
      migrationsDir: ".smartzap/migrations/staging",
      release: { version: "1.2.3-rc.1", commit: "abc123", schemaVersion: "7", channel: "rc" },
    });
    const parsed = JSON.parse(source);
    expect(parsed.name).toBe("smartzap-12ab34cd-staging");
    expect(parsed.d1_databases[0]).toEqual(expect.objectContaining({ database_name: "smartzap-12ab34cd-staging-db", database_id: expect.any(String) }));
    expect(parsed.r2_buckets[0].bucket_name).toBe("smartzap-12ab34cd-staging-media");
    expect(parsed.workflows.map((item: { name: string }) => item.name)).toEqual(["smartzap-12ab34cd-staging-campaign-send", "smartzap-12ab34cd-staging-setup-health"]);
    expect(parsed.vars).toEqual(expect.objectContaining({ ENVIRONMENT: "staging", SMARTZAP_VERSION: "1.2.3-rc.1", SMARTZAP_COMMIT: "abc123", SMARTZAP_SCHEMA_VERSION: "7" }));
  });

  it("lê respostas D1 sem depender de IDs fixos", () => {
    expect(parseD1Databases('[{"uuid":"11111111-1111-4111-8111-111111111111","name":"smartzap-12ab34cd-db"}]')).toEqual([{ id: "11111111-1111-4111-8111-111111111111", name: "smartzap-12ab34cd-db" }]);
    expect(parseCreatedD1Id('database_id = "22222222-2222-4222-8222-222222222222"')).toBe("22222222-2222-4222-8222-222222222222");
    expect(parseCreatedD1Id('database_id = \u001b[32m"33333333-3333-4333-8333-333333333333"\u001b[0m')).toBe("33333333-3333-4333-8333-333333333333");
    expect(deploymentResourceNames("smartzap-12ab34cd").conversionDlq).toBe("smartzap-12ab34cd-meta-conversions-dlq");
  });

  it("lê os formatos reais de R2 e Queues do Wrangler 4", () => {
    expect(parseR2BucketNames("Listing buckets...\nname:           smartzap-12ab34cd-media\ncreation_date:  2026-08-12T00:00:00Z\n")).toEqual(["smartzap-12ab34cd-media"]);
    const table = [
      "┌────┬────────────────────────────────────┬────┐",
      "│ id │ name                               │ x  │",
      "├────┼────────────────────────────────────┼────┤",
      "│ 01 │ smartzap-12ab34cd-meta-webhooks   │ 0  │",
      "├────┼────────────────────────────────────┼────┤",
      "│ 02 │ smartzap-12ab34cd-meta-conversions│ 0  │",
      "└────┴────────────────────────────────────┴────┘",
    ].join("\n");
    expect(parseQueueNames(table)).toEqual(["smartzap-12ab34cd-meta-webhooks", "smartzap-12ab34cd-meta-conversions"]);
  });

  it("bloqueia R2 ou Queue órfã antes de criar um D1", () => {
    const names = deploymentResourceNames("smartzap-12ab34cd");
    expect(() => classifyForkResources({ database: null, buckets: [names.media], queues: [], names })).toThrow(/sem o D1 reservado/);
    expect(classifyForkResources({ database: { id: "db", name: names.database }, buckets: [names.media], queues: [names.webhookQueue], names })).toEqual(expect.objectContaining({ canResume: true, collisions: [names.media, names.webhookQueue] }));
  });

  it("captura e valida checkpoint de Worker e D1 sem secrets", () => {
    const bookmark = "0000268c-00000000-000050c5-f64155b31f92e9ae15c065f00205e9cf";
    const versionId = "8c64633b-f6af-4b00-9b00-66e4cb3b2cb7";
    expect(parseTimeTravelBookmark(JSON.stringify({ bookmark }))).toBe(bookmark);
    expect(parseActiveDeploymentVersion(JSON.stringify([
      { created_on: "2026-08-11T00:00:00Z", versions: [{ version_id: versionId, percentage: 100 }] },
    ]))).toBe(versionId);
    const checkpoint = buildRollbackCheckpoint({ workerName: "smartzap-12ab34cd", databaseName: "smartzap-12ab34cd-db", bookmark, versionId, fromRelease: { version: "1.0.0" }, toRelease: { version: "1.0.1" } });
    expect(assertRollbackCheckpoint(checkpoint, "smartzap-12ab34cd")).toEqual(expect.objectContaining({ bookmark, versionId }));
    expect(JSON.stringify(checkpoint)).not.toMatch(/password|vault|token/i);
    expect(() => assertRollbackCheckpoint(checkpoint, "smartzap-deadbeef")).toThrow(/não pertence/);
  });

  it("distingue uma instalação retomável sem Worker de falhas reais da Cloudflare", () => {
    expect(isMissingWorkerError({
      stderr: "Worker does not exist [code: 10007]",
      message: "Command failed: wrangler deployments list",
    })).toBe(true);
    expect(isMissingWorkerError({ stderr: "Worker does not exist" })).toBe(false);
    expect(isMissingWorkerError({ stderr: "Authentication error [code: 10000]" })).toBe(false);
    expect(isMissingWorkerError(new Error("network timeout"))).toBe(false);
  });

  it("valida a cadeia real de migration e bloqueia checksum divergente antes do deploy", () => {
    const manifest = validateForkMigrationManifest(resolve(import.meta.dirname, ".."));
    expect(manifest.schemaVersion).toBe(3);
    expect(assertSchemaTransition({ currentSchema: 1, targetSchema: 3, manifest }).map((migration) => migration.file)).toEqual(["0002_release_history.sql", "0003_repair_legacy_status_marker.sql"]);
    expect(assertSchemaTransition({ currentSchema: 2, targetSchema: 3, manifest }).map((migration) => migration.file)).toEqual(["0003_repair_legacy_status_marker.sql"]);
    expect(assertSchemaTransition({ currentSchema: 3, targetSchema: 3, manifest })).toEqual([]);

    const root = mkdtempSync(join(tmpdir(), "smartzap-migration-"));
    mkdirSync(join(root, "release"), { recursive: true });
    mkdirSync(join(root, "provisioner", "baseline"), { recursive: true });
    writeFileSync(join(root, "provisioner", "baseline", "0001_fresh_install.sql"), "CREATE TABLE sample(id TEXT);\n");
    const hash = createHash("sha256").update(readFileSync(join(root, "provisioner", "baseline", "0001_fresh_install.sql"))).digest("hex");
    writeFileSync(join(root, "release", "migrations.json"), JSON.stringify({
      schemaVersion: 1,
      baseline: "provisioner/baseline/0001_fresh_install.sql",
      migrations: [{ file: "0001_fresh_install.sql", sha256: hash.replace(/^./, hash[0] === "0" ? "1" : "0"), fromSchema: 0, toSchema: 1, compatibleWithPreviousCode: false, downtimeRequired: false, destructive: false, prechecks: ["vazio"], postchecks: ["criado"], recovery: "excluir" }],
    }));
    expect(() => validateForkMigrationManifest(root)).toThrow(/Checksum divergente/);
  });
});
