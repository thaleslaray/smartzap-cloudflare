import { prepareIsolatedDeploymentConfig, stripJsonComments } from "./deploy-safety.mjs";

export const BASE_INSTALL_ID_PATTERN = /^smartzap-[a-f0-9]{8}$/;
export const DEPLOYMENT_ID_PATTERN = /^smartzap-[a-f0-9]{8}(?:-staging)?$/;

export function deploymentId(baseInstallId, staging = false) {
  const normalized = String(baseInstallId || "").trim().toLowerCase();
  if (!BASE_INSTALL_ID_PATTERN.test(normalized)) {
    throw new Error("SMARTZAP_INSTALL_ID deve ter o formato smartzap- seguido de 8 caracteres hexadecimais.");
  }
  return staging ? `${normalized}-staging` : normalized;
}

export function deploymentResourceNames(workerName) {
  if (!DEPLOYMENT_ID_PATTERN.test(workerName)) throw new Error("Identificador de deployment inválido.");
  return {
    worker: workerName,
    database: `${workerName}-db`,
    media: `${workerName}-media`,
    webhookQueue: `${workerName}-meta-webhooks`,
    webhookDlq: `${workerName}-meta-webhooks-dlq`,
    automationQueue: `${workerName}-inbox-automation`,
    automationDlq: `${workerName}-inbox-automation-dlq`,
    conversionQueue: `${workerName}-meta-conversions`,
    conversionDlq: `${workerName}-meta-conversions-dlq`,
  };
}

export function buildForkWrangler(source, { workerName, databaseId, migrationsDir, release }) {
  const parsed = JSON.parse(stripJsonComments(source));
  const names = deploymentResourceNames(workerName);
  const staging = workerName.endsWith("-staging");
  const baseWorkerName = staging ? workerName.slice(0, -"-staging".length) : workerName;
  parsed.name = workerName;
  delete parsed.ai_search_namespaces;
  parsed.d1_databases = [{ binding: "DB", database_name: names.database, database_id: databaseId, migrations_dir: migrationsDir }];
  parsed.r2_buckets = [{ binding: "MEDIA", bucket_name: names.media }];
  parsed.queues = {
    producers: [
      { binding: "WEBHOOK_QUEUE", queue: names.webhookQueue },
      { binding: "AUTOMATION_QUEUE", queue: names.automationQueue },
      { binding: "CAPI_QUEUE", queue: names.conversionQueue },
      { binding: "CAPI_DLQ", queue: names.conversionDlq },
      { binding: "WEBHOOK_DLQ", queue: names.webhookDlq },
      { binding: "AUTOMATION_DLQ", queue: names.automationDlq },
    ],
    consumers: [
      { queue: names.webhookQueue, max_batch_size: 50, max_batch_timeout: 2, max_retries: 5, dead_letter_queue: names.webhookDlq },
      { queue: names.automationQueue, max_batch_size: 10, max_batch_timeout: 2, max_retries: 3, dead_letter_queue: names.automationDlq },
      { queue: names.conversionQueue, max_batch_size: 10, max_batch_timeout: 2, max_retries: 5 },
    ],
  };
  parsed.vars = {
    ...(parsed.vars || {}),
    ENVIRONMENT: workerName.endsWith("-staging") ? "staging" : "production",
    SETUP_REQUIRED: "true",
    AUTOMATION_QUEUE_NAME: names.automationQueue,
    CAPI_QUEUE_NAME: names.conversionQueue,
    SMARTZAP_VERSION: release.version,
    SMARTZAP_COMMIT: release.commit,
    SMARTZAP_SCHEMA_VERSION: release.schemaVersion,
    SMARTZAP_RELEASE_CHANNEL: release.channel,
  };
  const isolated = JSON.parse(prepareIsolatedDeploymentConfig(`${JSON.stringify(parsed, null, 2)}\n`).source);
  if (staging) {
    isolated.name = baseWorkerName;
    const environment = structuredClone(isolated);
    delete environment.$schema;
    delete environment.name;
    delete environment.env;
    isolated.env = { staging: environment };
  } else {
    delete isolated.env;
  }
  return `${JSON.stringify(isolated, null, 2)}\n`;
}

export function parseD1Databases(output) {
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed)) throw new Error("A listagem D1 não retornou uma coleção.");
  return parsed.map((item) => ({ id: String(item.uuid || item.id || ""), name: String(item.name || "") }));
}

export function parseCreatedD1Id(output) {
  const normalized = String(output).replace(/\u001b\[[0-9;]*m/g, "");
  const match = normalized.match(/(?:database_id\s*[=:]\s*["']?|"uuid"\s*:\s*")([0-9a-f-]{36})/i);
  if (!match) throw new Error("O D1 foi criado, mas o UUID não pôde ser lido com segurança.");
  return match[1];
}

export function parseR2BucketNames(output) {
  return [...String(output).matchAll(/^name:\s+(.+)$/gm)].map((match) => match[1].trim());
}

export function parseQueueNames(output) {
  return String(output)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("│") && !line.includes(" name ") && !line.includes("──"))
    .map((line) => line.split("│").map((cell) => cell.trim()).filter(Boolean)[1])
    .filter(Boolean);
}

export function classifyForkResources({ database, buckets, queues, names }) {
  const requiredQueues = [
    names.webhookQueue,
    names.webhookDlq,
    names.automationQueue,
    names.automationDlq,
    names.conversionQueue,
    names.conversionDlq,
  ];
  const collisions = [
    buckets.includes(names.media) ? names.media : null,
    ...requiredQueues.filter((name) => queues.includes(name)),
  ].filter(Boolean);
  if (!database && collisions.length > 0) {
    throw new Error(`Há recursos com o mesmo identificador, mas sem o D1 reservado desta instalação: ${collisions.join(", ")}. Gere outro SMARTZAP_INSTALL_ID.`);
  }
  return { requiredQueues, collisions, canResume: Boolean(database) };
}

export function assertSecretInputs(env) {
  const installId = deploymentId(env.SMARTZAP_INSTALL_ID);
  if (String(env.MASTER_PASSWORD || "").length < 14) throw new Error("MASTER_PASSWORD precisa ter pelo menos 14 caracteres.");
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(env.SMARTZAP_VAULT_KEY || ""))) {
    throw new Error("SMARTZAP_VAULT_KEY precisa ser uma chave base64url de 256 bits gerada pelo instalador.");
  }
  return installId;
}
