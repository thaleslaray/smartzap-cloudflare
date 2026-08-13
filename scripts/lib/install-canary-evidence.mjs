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
      baselineTarget: "0001_fresh_install.sql",
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
    checks.push({
      id: "d1:baseline",
      passed: (snapshot?.d1State?.installVersions ?? []).includes(manifest.runtime.baselineTarget),
      detail: (snapshot?.d1State?.installVersions ?? []).includes(manifest.runtime.baselineTarget)
        ? `baseline final ${manifest.runtime.baselineTarget} aplicada`
        : `baseline final ${manifest.runtime.baselineTarget} ausente`,
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

function matrixCheck(checks, id, passed, detail) {
  checks.push({ id, passed: Boolean(passed), detail });
}

export function assessInstallHomologationMatrix(matrix) {
  const checks = [];
  const installs = Array.isArray(matrix?.installs) ? matrix.installs : [];
  matrixCheck(checks, "matrix:schema", matrix?.schemaVersion === 1, "Matriz de homologação no schema 1");
  matrixCheck(checks, "matrix:count", installs.length >= 3, `Pelo menos três instalações físicas; recebido ${installs.length}`);

  const accountFingerprints = installs.map((entry) => String(entry?.accountFingerprintSha256 ?? ""));
  matrixCheck(
    checks,
    "matrix:account-fingerprints",
    accountFingerprints.every((value) => /^[a-f0-9]{64}$/.test(value)),
    "Todas as contas identificadas somente por fingerprint SHA-256",
  );
  matrixCheck(
    checks,
    "matrix:distinct-accounts",
    new Set(accountFingerprints).size === installs.length,
    "Cada instalação pertence a uma conta Cloudflare distinta",
  );

  const freeCount = installs.filter((entry) => entry?.plan === "free").length;
  const paidCount = installs.filter((entry) => entry?.plan === "paid").length;
  matrixCheck(checks, "matrix:free", freeCount >= 2, `Duas contas gratuitas exigidas; recebido ${freeCount}`);
  matrixCheck(checks, "matrix:paid", paidCount >= 1, `Uma conta paga exigida; recebido ${paidCount}`);

  const releaseFingerprints = installs.map((entry) => String(entry?.manifestFingerprint ?? ""));
  matrixCheck(
    checks,
    "matrix:same-release",
    releaseFingerprints.length >= 3
      && releaseFingerprints.every((value) => /^[a-f0-9]{64}$/.test(value))
      && new Set(releaseFingerprints).size === 1,
    "As três instalações usam a mesma release imutável",
  );

  for (const [index, entry] of installs.entries()) {
    const label = `install:${index + 1}`;
    matrixCheck(checks, `${label}:physical`, entry?.physical === true, "Execução física pela interface real");
    matrixCheck(checks, `${label}:no-cli`, entry?.noCli === true, "Instalação sem CLI");
    matrixCheck(checks, `${label}:no-actions`, entry?.noGithubActions === true, "Instalação sem GitHub Actions");
    for (const phase of ["baseline", "provisioned", "setup-complete"]) {
      const report = entry?.reports?.[phase];
      matrixCheck(
        checks,
        `${label}:${phase}`,
        report?.phase === phase && report?.passed === true && report?.manifestFingerprint === entry?.manifestFingerprint,
        `${phase} aprovado e vinculado ao manifesto da instalação`,
      );
    }
  }

  const scenarios = matrix?.scenarios ?? {};
  matrixCheck(checks, "scenario:collision", scenarios.collision?.passed === true, "Colisão física bloqueada sem sobrescrever recurso");
  matrixCheck(checks, "scenario:resume", scenarios.interruptionResume?.passed === true, "Interrupção e retomada físicas sem duplicidade");
  matrixCheck(checks, "scenario:cleanup", scenarios.cleanup?.passed === true, "Cleanup físico sem recurso residual");
  matrixCheck(checks, "scenario:meta", scenarios.metaReal?.passed === true, "Meta real com sent → delivered → read");

  const failures = checks.filter((check) => !check.passed).map((check) => check.detail);
  return { schemaVersion: 1, passed: failures.length === 0, checks, failures };
}

export function assertInstallHomologationMatrix(matrix) {
  const report = assessInstallHomologationMatrix(matrix);
  if (!report.passed) throw new Error(`Matriz de homologação reprovada: ${report.failures.join("; ")}`);
  return report;
}
