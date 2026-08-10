import { describe, expect, it } from "vitest";
import {
  INSTALL_GUARD_TABLE,
  assessDatabaseSafety,
  assertIsolatedResourceNames,
  parseWranglerRows,
  readWorkerName,
  stripJsonComments,
} from "../scripts/lib/deploy-safety.mjs";

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
