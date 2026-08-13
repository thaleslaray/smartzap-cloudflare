import { describe, expect, it } from "vitest";
import {
  assertWranglerDeployIdentity,
  buildWranglerChildEnvironment,
  parseWranglerDeployOutput,
} from "../scripts/lib/wrangler-ci-env.mjs";

describe("isolamento do nome do Worker no Workers Builds", () => {
  it("remove o override de nome injetado pela Cloudflare antes de chamar o Wrangler", () => {
    const environment = buildWranglerChildEnvironment({
      WRANGLER_CI_OVERRIDE_NAME: "smartzap-producao",
      WORKERS_CI_BRANCH: "staging/rc.27-physical",
    });
    expect(environment.WRANGLER_CI_OVERRIDE_NAME).toBeUndefined();
    expect(environment.WORKERS_CI_BRANCH).toBe("staging/rc.27-physical");
    expect(environment.CI).toBe("1");
  });

  it("preserva o output estruturado definido pelo instalador", () => {
    const environment = buildWranglerChildEnvironment(
      { WRANGLER_CI_OVERRIDE_NAME: "smartzap-producao" },
      { WRANGLER_OUTPUT_FILE_PATH: "/tmp/deploy.json" },
    );
    expect(environment.WRANGLER_OUTPUT_FILE_PATH).toBe("/tmp/deploy.json");
  });

  it("não permite que opções internas reintroduzam o override de nome", () => {
    expect(() => buildWranglerChildEnvironment({}, { WRANGLER_CI_OVERRIDE_NAME: "outro-worker" })).toThrow(/não permite reintroduzir/);
  });

  it("aceita apenas a identidade exata do Worker autorizado", () => {
    const output = parseWranglerDeployOutput(JSON.stringify({
      type: "deploy",
      version: 1,
      worker_name: "smartzap-12ab34cd-staging",
      worker_name_overridden: false,
      version_id: "11111111-1111-1111-1111-111111111111",
      targets: ["https://smartzap-12ab34cd-staging.example.workers.dev"],
    }));
    expect(assertWranglerDeployIdentity(output, "smartzap-12ab34cd-staging").worker_name).toBe("smartzap-12ab34cd-staging");
  });

  it("aceita o JSON único quando o Wrangler mistura diagnóstico no arquivo estruturado", () => {
    const identity = {
      type: "deploy",
      version: 1,
      worker_name: "smartzap-12ab34cd-staging",
      worker_name_overridden: false,
      version_id: "11111111-1111-1111-1111-111111111111",
      targets: ["https://example.workers.dev"],
    };
    const output = parseWranglerDeployOutput(`Wrangler diagnostic {not-json}\n${JSON.stringify(identity)}\ntelemetry finished`);
    expect(output).toEqual(identity);
  });

  it("recusa saída sem deploy ou com duas identidades possíveis", () => {
    const identity = {
      type: "deploy",
      version: 1,
      worker_name: "smartzap-12ab34cd-staging",
      worker_name_overridden: false,
      version_id: "11111111-1111-1111-1111-111111111111",
      targets: ["https://example.workers.dev"],
    };
    expect(() => parseWranglerDeployOutput('{"type":"telemetry"}')).toThrow(/não contém um deploy JSON válido/);
    expect(() => parseWranglerDeployOutput(`${JSON.stringify(identity)}\n${JSON.stringify(identity)}`)).toThrow(/ambiguidade/);
  });

  it("reprova nome divergente, override e resposta incompleta", () => {
    const valid = {
      type: "deploy",
      version: 1,
      worker_name: "smartzap-12ab34cd-staging",
      worker_name_overridden: false,
      version_id: "11111111-1111-1111-1111-111111111111",
      targets: ["https://example.workers.dev"],
    };
    expect(() => assertWranglerDeployIdentity({ ...valid, worker_name: "smartzap-producao" }, valid.worker_name)).toThrow(/publicou smartzap-producao/);
    expect(() => assertWranglerDeployIdentity({ ...valid, worker_name_overridden: true }, valid.worker_name)).toThrow(/sobrescreveu/);
    expect(() => assertWranglerDeployIdentity({ ...valid, targets: [] }, valid.worker_name)).toThrow(/versão e destino/);
    expect(() => parseWranglerDeployOutput("não-json")).toThrow(/não contém um deploy JSON válido/);
  });
});
