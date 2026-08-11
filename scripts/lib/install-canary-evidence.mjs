import { createHash } from "node:crypto";

const PREFIX_PATTERN = /^smartzap-[a-f0-9]{8}$/;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function namesOf(entries, keys = ["name"]) {
  return unique((entries ?? []).map((entry) => {
    if (typeof entry === "string") return entry;
    for (const key of keys) {
      if (typeof entry?.[key] === "string") return entry[key];
    }
    return null;
  }));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function assertCanaryPrefix(prefix) {
  const normalized = String(prefix ?? "").trim();
  if (!PREFIX_PATTERN.test(normalized)) {
    throw new Error("O canário precisa usar um prefixo isolado no formato smartzap- + 8 caracteres hexadecimais.");
  }
  return normalized;
}

export function buildInstallCanaryManifest({ prefix, release, generatedAt = new Date().toISOString() }) {
  const worker = assertCanaryPrefix(prefix);
  const suffix = worker.slice("smartzap-".length);
  const repository = String(release?.repository ?? "").replace(/\/$/, "");
  const tag = String(release?.tag ?? "");
  const manifest = {
    schemaVersion: 1,
    generatedAt,
    release: {
      repository,
      commit: String(release?.commit ?? ""),
      tag,
      deploySource: `${repository}/tree/${tag}`,
      snapshotSha256: String(release?.snapshotSha256 ?? ""),
    },
    prefix: worker,
    expectedSecrets: ["MASTER_PASSWORD", "SMARTZAP_VAULT_KEY"],
    resources: {
      worker,
      d1: `${worker}-db`,
      r2: `${worker}-media`,
      queues: [
        `${worker}-meta-webhooks`,
        `${worker}-meta-webhooks-dlq`,
        `${worker}-inbox-automation`,
        `${worker}-inbox-automation-dlq`,
        `${worker}-meta-conversions`,
        `${worker}-meta-conversions-dlq`,
      ],
      workflows: [
        `${worker}-campaign-send`,
        `${worker}-setup-health`,
      ],
      durableObjects: [
        `${worker}_RealtimeHub`,
        `${worker}_PhoneThrottle`,
      ],
    },
    runtime: {
      workflowBindings: {
        CAMPAIGN_WF: `${worker}-campaign-send`,
        SETUP_WF: `${worker}-setup-health`,
      },
      rateLimitNamespace: (BigInt(`0x${suffix}`) + 1n).toString(10),
      aiGatewayId: worker,
      cron: "*/15 * * * *",
      migrationTarget: "0051_vault_rotation_recovery.sql",
    },
    cleanupPolicy: {
      exactPrefixOnly: true,
      preservePreexistingResources: true,
      requireEmptyBacklogBeforeDelete: true,
    },
  };
  return { ...manifest, fingerprintSha256: fingerprintManifest(manifest) };
}

export function fingerprintManifest(manifest) {
  const clean = { ...manifest };
  delete clean.fingerprintSha256;
  return createHash("sha256").update(JSON.stringify(canonicalize(clean))).digest("hex");
}

export function assertManifestIntegrity(manifest) {
  assertCanaryPrefix(manifest?.prefix);
  if (manifest?.schemaVersion !== 1) throw new Error("Versão de manifesto de canário não suportada.");
  const actual = fingerprintManifest(manifest);
  if (actual !== manifest?.fingerprintSha256) throw new Error("O manifesto do canário foi alterado depois de gerado.");
  if (!/^[a-f0-9]{40}$/.test(manifest?.release?.commit ?? "")) throw new Error("O manifesto não aponta para um commit Git imutável.");
  if (!/^v\d+\.\d+\.\d+-rc\.\d+$/.test(manifest?.release?.tag ?? "")) throw new Error("O manifesto não aponta para uma tag RC válida.");
  const expectedDeploySource = `${String(manifest?.release?.repository ?? "").replace(/\/$/, "")}/tree/${manifest?.release?.tag ?? ""}`;
  if (manifest?.release?.deploySource !== expectedDeploySource) throw new Error("A origem do Deploy Button não está fixada na tag candidata.");
  if (!/^[a-f0-9]{64}$/.test(manifest?.release?.snapshotSha256 ?? "")) throw new Error("O manifesto não contém o hash do snapshot publicado.");
  if (manifest?.expectedSecrets?.join(",") !== "MASTER_PASSWORD,SMARTZAP_VAULT_KEY") {
    throw new Error("O canário deve solicitar exatamente os dois secrets previstos.");
  }
  return manifest;
}

function checkPresence(checks, label, expected, actual, shouldExist) {
  const count = actual.filter((value) => value === expected).length;
  const passed = shouldExist ? count === 1 : count === 0;
  checks.push({
    id: label,
    passed,
    detail: shouldExist
      ? (passed ? `${expected} presente uma única vez` : `${expected} deveria existir uma única vez; encontrado ${count}`)
      : (passed ? `${expected} ausente` : `${expected} ainda existe`),
  });
}

function baseResourceChecks(snapshot, manifest, shouldExist) {
  const checks = [];
  checkPresence(checks, "worker", manifest.resources.worker, namesOf(snapshot?.workers, ["name", "id"]), shouldExist);
  checkPresence(checks, "d1", manifest.resources.d1, namesOf(snapshot?.d1, ["name"]), shouldExist);
  checkPresence(checks, "r2", manifest.resources.r2, namesOf(snapshot?.r2, ["name"]), shouldExist);
  const queueNames = namesOf(snapshot?.queues, ["name", "queue_name"]);
  for (const queue of manifest.resources.queues) checkPresence(checks, `queue:${queue}`, queue, queueNames, shouldExist);
  const workflowNames = namesOf(snapshot?.workflows, ["name"]);
  for (const workflow of manifest.resources.workflows) checkPresence(checks, `workflow:${workflow}`, workflow, workflowNames, shouldExist);
  const durableNames = namesOf(snapshot?.durableObjects, ["name"]);
  for (const durable of manifest.resources.durableObjects) checkPresence(checks, `durable:${durable}`, durable, durableNames, shouldExist);
  return checks;
}

function exactCheck(checks, id, actual, expected, message) {
  checks.push({ id, passed: actual === expected, detail: actual === expected ? message : `${message}: esperado ${expected}; recebido ${String(actual)}` });
}

export function assessInstallCanarySnapshot({ phase, snapshot, manifest }) {
  assertManifestIntegrity(manifest);
  const allowed = new Set(["baseline", "provisioned", "setup-complete", "cleanup"]);
  if (!allowed.has(phase)) throw new Error(`Fase de canário inválida: ${phase}`);

  const checks = baseResourceChecks(snapshot, manifest, phase === "provisioned" || phase === "setup-complete");
  if (phase === "provisioned" || phase === "setup-complete") {
    exactCheck(checks, "runtime:campaign-workflow", snapshot?.runtime?.workflowBindings?.CAMPAIGN_WF, manifest.runtime.workflowBindings.CAMPAIGN_WF, "Workflow de campanhas isolado");
    exactCheck(checks, "runtime:setup-workflow", snapshot?.runtime?.workflowBindings?.SETUP_WF, manifest.runtime.workflowBindings.SETUP_WF, "Workflow de diagnóstico isolado");
    exactCheck(checks, "runtime:rate-limit", String(snapshot?.runtime?.rateLimitNamespace ?? ""), manifest.runtime.rateLimitNamespace, "Limitador de login isolado");
    exactCheck(checks, "runtime:ai-gateway", snapshot?.runtime?.aiGatewayId, manifest.runtime.aiGatewayId, "Identificador opcional de AI Gateway isolado");
    const cronTriggers = namesOf(snapshot?.cronTriggers, ["cron"]);
    checkPresence(checks, "runtime:cron", manifest.runtime.cron, cronTriggers, true);
    exactCheck(checks, "d1:guard", snapshot?.d1State?.guardWorkerName, manifest.resources.worker, "D1 reservado pelo mesmo Worker");
    checks.push({
      id: "d1:migrations",
      passed: (snapshot?.d1State?.migrations ?? []).includes(manifest.runtime.migrationTarget),
      detail: (snapshot?.d1State?.migrations ?? []).includes(manifest.runtime.migrationTarget)
        ? `migração ${manifest.runtime.migrationTarget} aplicada`
        : `migração ${manifest.runtime.migrationTarget} ausente`,
    });
  }

  if (phase === "setup-complete") {
    exactCheck(checks, "app:reachable", snapshot?.app?.reachable, true, "Worker acessível");
    exactCheck(checks, "app:setup", snapshot?.app?.setupCompleted, true, "Assistente de configuração concluído");
    exactCheck(checks, "app:sent", snapshot?.app?.messageStates?.sent, true, "Mensagem enviada");
    exactCheck(checks, "app:delivered", snapshot?.app?.messageStates?.delivered, true, "Mensagem entregue");
    exactCheck(checks, "app:read", snapshot?.app?.messageStates?.read, true, "Mensagem lida");
    exactCheck(checks, "queue:backlog", Number(snapshot?.queuesState?.backlogTotal ?? -1), 0, "Filas sem backlog");
    exactCheck(checks, "queue:dlq", Number(snapshot?.queuesState?.dlqTotal ?? -1), 0, "DLQs vazias");
  }

  const failed = checks.filter((check) => !check.passed);
  return {
    phase,
    passed: failed.length === 0,
    manifestFingerprint: manifest.fingerprintSha256,
    checks,
    failures: failed.map((check) => check.detail),
  };
}

export function assertInstallCanarySnapshot(input) {
  const report = assessInstallCanarySnapshot(input);
  if (!report.passed) throw new Error(`Canário ${report.phase} reprovado: ${report.failures.join("; ")}`);
  return report;
}
