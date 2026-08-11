import { describe, expect, it } from "vitest";
import {
  INSTALL_GUARD_TABLE,
  assessDatabaseSafety,
  assertIsolatedResourceNames,
  assertPreparedRuntimeResources,
  deriveRuntimeResourceNames,
  parseWranglerRows,
  prepareIsolatedDeploymentConfig,
  readWorkerName,
  stripJsonComments,
} from "../scripts/lib/deploy-safety.mjs";

function installationConfig(workerName = "smartzap-a1b2c3d4") {
  return {
    name: workerName,
    vars: { AI_GATEWAY_ID: "smartzap" },
    d1_databases: [{ binding: "DB", database_name: `${workerName}-db`, database_id: "auto-created" }],
    r2_buckets: [{ binding: "MEDIA", bucket_name: `${workerName}-media` }],
    queues: {
      producers: [
        { binding: "WEBHOOK_QUEUE", queue: `${workerName}-meta-webhooks` },
        { binding: "AUTOMATION_QUEUE", queue: `${workerName}-inbox-automation` },
        { binding: "CAPI_QUEUE", queue: `${workerName}-meta-conversions` },
        { binding: "CAPI_DLQ", queue: `${workerName}-meta-conversions-dlq` },
        { binding: "WEBHOOK_DLQ", queue: `${workerName}-meta-webhooks-dlq` },
        { binding: "AUTOMATION_DLQ", queue: `${workerName}-inbox-automation-dlq` },
      ],
      consumers: [
        { queue: `${workerName}-meta-webhooks`, dead_letter_queue: `${workerName}-meta-webhooks-dlq` },
        { queue: `${workerName}-inbox-automation`, dead_letter_queue: `${workerName}-inbox-automation-dlq` },
        { queue: `${workerName}-meta-conversions` },
      ],
    },
    workflows: [
      { binding: "CAMPAIGN_WF", name: "campaign-send", class_name: "CampaignSendWorkflow" },
      { binding: "SETUP_WF", name: "smartzap-setup-health", class_name: "SetupHealthWorkflow" },
    ],
    ratelimits: [{ name: "LOGIN_LIMITER", namespace_id: "1001", simple: { limit: 5, period: 60 } }],
  };
}

describe("proteção do deploy público", () => {
  it("remove comentários JSONC sem alterar barras dentro de strings", () => {
    const source = `{
      // comentário
      "name": "smartzap-seguro",
      "url": "https://example.com/a//b" /* comentário final */
    }`;
    expect(JSON.parse(stripJsonComments(source))).toEqual({
      name: "smartzap-seguro",
      url: "https://example.com/a//b",
    });
  });

  it("aceita somente nomes de Worker seguros", () => {
    expect(readWorkerName('{"name":"smartzap-a1b2c3d4"}')).toBe("smartzap-a1b2c3d4");
    expect(() => readWorkerName('{"name":"SmartZap produção"}')).toThrow(/letras minúsculas/);
    expect(() => readWorkerName('{"name":"-smartzap"}')).toThrow(/letras minúsculas/);
  });

  it("aceita somente D1, R2 e filas com o mesmo prefixo exclusivo", () => {
    const workerName = "smartzap-a1b2c3d4";
    const source = JSON.stringify({
      name: workerName,
      d1_databases: [{ binding: "DB", database_name: `${workerName}-db` }],
      r2_buckets: [{ binding: "MEDIA", bucket_name: `${workerName}-media` }],
      queues: {
        producers: [
          { binding: "WEBHOOK_QUEUE", queue: `${workerName}-meta-webhooks` },
          { binding: "AUTOMATION_QUEUE", queue: `${workerName}-inbox-automation` },
          { binding: "CAPI_QUEUE", queue: `${workerName}-meta-conversions` },
          { binding: "CAPI_DLQ", queue: `${workerName}-meta-conversions-dlq` },
          { binding: "WEBHOOK_DLQ", queue: `${workerName}-meta-webhooks-dlq` },
          { binding: "AUTOMATION_DLQ", queue: `${workerName}-inbox-automation-dlq` },
        ],
        consumers: [
          { queue: `${workerName}-meta-webhooks`, dead_letter_queue: `${workerName}-meta-webhooks-dlq` },
          { queue: `${workerName}-inbox-automation`, dead_letter_queue: `${workerName}-inbox-automation-dlq` },
          { queue: `${workerName}-meta-conversions` },
        ],
      },
    });
    expect(assertIsolatedResourceNames(source)).toMatchObject({ workerName });
  });

  it("bloqueia nomes padrão, recurso de outro prefixo e consumidor divergente", () => {
    const valid = {
      name: "smartzap-a1b2c3d4",
      d1_databases: [{ binding: "DB", database_name: "smartzap-a1b2c3d4-db" }],
      r2_buckets: [{ binding: "MEDIA", bucket_name: "smartzap-a1b2c3d4-media" }],
      queues: { producers: [
        { binding: "WEBHOOK_QUEUE", queue: "smartzap-a1b2c3d4-meta-webhooks" },
        { binding: "AUTOMATION_QUEUE", queue: "smartzap-a1b2c3d4-inbox-automation" },
        { binding: "CAPI_QUEUE", queue: "smartzap-a1b2c3d4-meta-conversions" },
        { binding: "CAPI_DLQ", queue: "smartzap-a1b2c3d4-meta-conversions-dlq" },
        { binding: "WEBHOOK_DLQ", queue: "smartzap-a1b2c3d4-meta-webhooks-dlq" },
        { binding: "AUTOMATION_DLQ", queue: "smartzap-a1b2c3d4-inbox-automation-dlq" },
      ], consumers: [] },
    };
    expect(() => assertIsolatedResourceNames(JSON.stringify({ ...valid, name: "smartzap" }))).toThrow(/nome exclusivo/);
    expect(() => assertIsolatedResourceNames(JSON.stringify({
      ...valid,
      r2_buckets: [{ binding: "MEDIA", bucket_name: "smartzap-antigo-media" }],
    }))).toThrow(/Bucket R2/);
    expect(() => assertIsolatedResourceNames(JSON.stringify({
      ...valid,
      queues: { ...valid.queues, consumers: [{ queue: "fila-estranha" }] },
    }))).toThrow(/consumidoras/);
  });

  it("deriva recursos internos exclusivos do mesmo prefixo", () => {
    const first = deriveRuntimeResourceNames("smartzap-a1b2c3d4");
    const second = deriveRuntimeResourceNames("smartzap-01020304");
    expect(first).toEqual({
      workerName: "smartzap-a1b2c3d4",
      workflows: {
        CAMPAIGN_WF: "smartzap-a1b2c3d4-campaign-send",
        SETUP_WF: "smartzap-a1b2c3d4-setup-health",
      },
      rateLimitNamespace: (BigInt("0xa1b2c3d4") + 1n).toString(10),
      aiGatewayId: "smartzap-a1b2c3d4",
    });
    expect(second.workflows.CAMPAIGN_WF).not.toBe(first.workflows.CAMPAIGN_WF);
    expect(second.workflows.SETUP_WF).not.toBe(first.workflows.SETUP_WF);
    expect(second.rateLimitNamespace).not.toBe(first.rateLimitNamespace);
    expect(second.aiGatewayId).not.toBe(first.aiGatewayId);
    expect(() => deriveRuntimeResourceNames("smartzap")).toThrow(/nome exclusivo/);
  });

  it("prepara Workflows, rate limit e AI Gateway antes do acesso remoto", () => {
    const original = installationConfig();
    const prepared = prepareIsolatedDeploymentConfig(JSON.stringify(original));
    const parsed = JSON.parse(prepared.source);

    expect(parsed.workflows).toEqual([
      { binding: "CAMPAIGN_WF", name: "smartzap-a1b2c3d4-campaign-send", class_name: "CampaignSendWorkflow" },
      { binding: "SETUP_WF", name: "smartzap-a1b2c3d4-setup-health", class_name: "SetupHealthWorkflow" },
    ]);
    expect(parsed.ratelimits[0].namespace_id).toBe((BigInt("0xa1b2c3d4") + 1n).toString(10));
    expect(parsed.vars.AI_GATEWAY_ID).toBe("smartzap-a1b2c3d4");
    expect(parsed.d1_databases).toEqual(original.d1_databases);
    expect(parsed.r2_buckets).toEqual(original.r2_buckets);
    expect(parsed.queues).toEqual(original.queues);
    expect(assertPreparedRuntimeResources(prepared.source)).toEqual({
      workerName: prepared.workerName,
      workflows: prepared.workflows,
      rateLimitNamespace: prepared.rateLimitNamespace,
      aiGatewayId: prepared.aiGatewayId,
    });
    expect(prepareIsolatedDeploymentConfig(prepared.source).source).toBe(prepared.source);
  });

  it("normaliza as referências de consumidores que o Deploy Button deixa com nomes padrão", () => {
    const generatedByCloudflare = installationConfig();
    generatedByCloudflare.queues.consumers = [
      { queue: "smartzap-meta-webhooks", dead_letter_queue: "smartzap-meta-webhooks-dlq" },
      { queue: "smartzap-inbox-automation", dead_letter_queue: "smartzap-inbox-automation-dlq" },
      { queue: "smartzap-meta-conversions" },
    ];

    const prepared = JSON.parse(prepareIsolatedDeploymentConfig(JSON.stringify(generatedByCloudflare)).source);
    expect(prepared.queues.consumers).toEqual(installationConfig().queues.consumers);
    expect(assertPreparedRuntimeResources(JSON.stringify(prepared))).toMatchObject({
      workerName: "smartzap-a1b2c3d4",
    });
  });

  it("recusa consumidor ou DLQ arbitrários em vez de normalizá-los", () => {
    const foreignQueue = installationConfig();
    foreignQueue.queues.consumers[0].queue = "fila-de-outra-instalacao";
    expect(() => prepareIsolatedDeploymentConfig(JSON.stringify(foreignQueue))).toThrow(/consumidora WEBHOOK está ausente/);

    const foreignDlq = installationConfig();
    foreignDlq.queues.consumers[0].dead_letter_queue = "dlq-de-outra-instalacao";
    expect(() => prepareIsolatedDeploymentConfig(JSON.stringify(foreignDlq))).toThrow(/DLQ consumidora WEBHOOK/);
  });

  it("recusa configuração interna fixa, ausente, duplicada ou divergente", () => {
    const fixed = installationConfig();
    expect(() => assertPreparedRuntimeResources(JSON.stringify(fixed))).toThrow(/Workflow CAMPAIGN_WF/);

    const missingWorkflow = installationConfig();
    missingWorkflow.workflows = missingWorkflow.workflows.filter((entry) => entry.binding !== "SETUP_WF");
    expect(() => prepareIsolatedDeploymentConfig(JSON.stringify(missingWorkflow))).toThrow(/SETUP_WF está ausente/);

    const duplicateWorkflow = installationConfig();
    duplicateWorkflow.workflows.push({ ...duplicateWorkflow.workflows[0] });
    expect(() => prepareIsolatedDeploymentConfig(JSON.stringify(duplicateWorkflow))).toThrow(/CAMPAIGN_WF aparece mais de uma vez/);

    const missingLimiter = installationConfig();
    missingLimiter.ratelimits = [];
    expect(() => prepareIsolatedDeploymentConfig(JSON.stringify(missingLimiter))).toThrow(/LOGIN_LIMITER está ausente/);

    const prepared = prepareIsolatedDeploymentConfig(JSON.stringify(installationConfig()));
    const divergent = JSON.parse(prepared.source);
    divergent.ratelimits[0].namespace_id = "1001";
    expect(() => assertPreparedRuntimeResources(JSON.stringify(divergent))).toThrow(/LOGIN_LIMITER não está isolado/);
  });

  it("interpreta a saída JSON do Wrangler", () => {
    const output = `Aviso não sensível\n${JSON.stringify([{ success: true, results: [{ name: "contacts" }] }])}`;
    expect(parseWranglerRows(output)).toEqual([{ name: "contacts" }]);
    expect(() => parseWranglerRows("sem json")).toThrow(/resultado JSON legível/);
    expect(() => parseWranglerRows(JSON.stringify([{ success: false }]))).toThrow(/recusada/);
  });

  it("reserva um D1 vazio ou apenas com a tabela de migrações", () => {
    expect(assessDatabaseSafety({ workerName: "smartzap-a1b2c3d4", tables: [], guardWorkerName: null })).toEqual({ action: "claim" });
    expect(assessDatabaseSafety({ workerName: "smartzap-a1b2c3d4", tables: ["d1_migrations"], guardWorkerName: null })).toEqual({ action: "claim" });
    expect(assessDatabaseSafety({ workerName: "smartzap-a1b2c3d4", tables: ["_cf_KV"], guardWorkerName: null })).toEqual({ action: "claim" });
  });

  it("permite retomar somente a mesma instalação", () => {
    expect(assessDatabaseSafety({
      workerName: "smartzap-a1b2c3d4",
      tables: [INSTALL_GUARD_TABLE, "contacts"],
      guardWorkerName: "smartzap-a1b2c3d4",
    })).toEqual({ action: "resume" });
  });

  it("bloqueia banco existente ou pertencente a outro Worker", () => {
    expect(() => assessDatabaseSafety({
      workerName: "smartzap-a1b2c3d4",
      tables: ["contacts"],
      guardWorkerName: null,
    })).toThrow(/já contém dados/);
    expect(() => assessDatabaseSafety({
      workerName: "smartzap-a1b2c3d4",
      tables: [INSTALL_GUARD_TABLE, "contacts"],
      guardWorkerName: "smartzap-outro",
    })).toThrow(/outra instalação/);
  });
});
