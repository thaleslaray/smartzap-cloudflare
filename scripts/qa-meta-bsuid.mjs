import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildStrictBsuidTemplatePayload,
  evaluateMetaBsuidHomologation,
  isOfficialUsernameOnlyCandidate,
  maskPhone,
} from "./lib/meta-bsuid-homologation.mjs";
import {
  assertMetaCanaryWindow,
  resolveMetaCanaryGuard,
} from "./lib/meta-canary-guard.mjs";
import { resolveQaStagingAuthHeaders } from "./lib/qa-staging-auth.mjs";

const root = resolve(import.meta.dirname, "..");
const command = process.argv[2] || "prepare";
const baseUrl = String(
  process.env.QA_BASE_URL ||
    "https://smartzap-cf-staging.thales2581.workers.dev",
).replace(/\/+$/, "");
const spec = readJson(resolve(root, "qa/production-certification.json"));
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const runId = String(
  process.env.QA_RUN_ID || `AUTOQA_META_BSUID_${stamp}_${randomUUID().slice(0, 8)}`,
).replace(/[^A-Za-z0-9_-]/g, "_");
const outputDir = resolve(
  root,
  option("output", process.env.QA_REPORT_DIR || `qa/reports/${runId}`),
);
const qaEnv = {
  ...readEnv(resolve(root, ".dev.vars")),
  ...readEnv(resolve(root, ".dev.vars.qa.local")),
  ...process.env,
};
const authHeaders = resolveQaStagingAuthHeaders({
  mutationKey: qaEnv.QA_STAGING_MUTATION_API_KEY,
  stagingApiKey: qaEnv.QA_STAGING_API_KEY,
  apiKey: qaEnv.QA_API_KEY || qaEnv.SMARTZAP_API_KEY,
});
const certifiedRuntimePaths = [
  "src/api/conversations.ts",
  "src/api/webhook.ts",
  "src/domain/meta-recipient.ts",
  "src/queue/webhook-consumer.ts",
  "src/whatsapp/client.ts",
];

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function requiredOption(name) {
  const value = option(name);
  if (!value) throw new Error(`Informe --${name} <caminho>.`);
  return value;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readEnv(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    )
      value = value.slice(1, -1);
    values[key] = value.replaceAll("\\n", "\n");
  }
  return values;
}

function redact(value) {
  return String(value ?? "")
    .replace(/\b(?:\+?55)?\d{10,11}\b/g, "[TELEFONE_MASCARADO]")
    .replace(/\b[A-Z]{2}(?:\.ENT)?\.[A-Za-z0-9._-]{6,}\b/g, "[BSUID_MASCARADO]")
    .replace(
      /\b(?:token|secret|password|api[_ -]?key)\s*[:=]\s*\S+/gi,
      "[SEGREDO_REDACTED]",
    )
    .slice(0, 2_000);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sha256Value(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function persist(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function boundedSeconds(name, fallback, maximum) {
  const value = Number(option(name, String(fallback)));
  if (!Number.isInteger(value) || value < 1 || value > maximum)
    throw new Error(`--${name} precisa estar entre 1 e ${maximum} segundos.`);
  return value;
}

function brtParts(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    label: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} BRT`,
  };
}

function metaGuard() {
  return resolveMetaCanaryGuard({
    ...qaEnv,
    QA_META_MAX_RUNS_PER_DAY:
      qaEnv.QA_META_MAX_RUNS_PER_DAY || "10",
  });
}

function assertCertifiedRuntimeUnchanged() {
  const result = spawnSync(
    "git",
    ["diff", "--quiet", spec.release.sourceCommit, "--", ...certifiedRuntimePaths],
    { cwd: root, stdio: "ignore" },
  );
  if (result.status !== 0)
    throw new Error(
      "O runtime Meta/Inbox divergiu da release certificada; publique e recertifique antes da homologação.",
    );
}

function graphConfig() {
  const token = String(qaEnv.WHATSAPP_TOKEN || "").trim();
  const version = String(qaEnv.META_GRAPH_VERSION || "v25.0").trim();
  if (!token) throw new Error("WHATSAPP_TOKEN privado não está disponível para o executor.");
  if (!/^v\d+\.\d+$/.test(version))
    throw new Error("META_GRAPH_VERSION inválida para o executor.");
  return { token, version };
}

function executionOutputDir(statePath) {
  return resolve(root, option("output", dirname(statePath)));
}

function relative(path) {
  return path.slice(root.length + 1);
}

function d1(sql) {
  const result = spawnSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "smartzap-staging",
      "--config",
      "config/wrangler.staging.jsonc",
      "--remote",
      "--json",
      "--command",
      sql,
    ],
    {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.status !== 0)
    throw new Error(`D1 staging falhou: ${redact(result.stderr || result.stdout)}`);
  return JSON.parse(result.stdout || "[]").flatMap((entry) => entry.results || []);
}

async function api(path, init = {}, accepted = [200]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...authHeaders,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("json")
      ? await response.json()
      : await response.text();
    if (!accepted.includes(response.status))
      throw new Error(
        `${init.method || "GET"} ${path}: HTTP ${response.status} ${redact(JSON.stringify(body))}`,
      );
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function switchCallback(target, reportDir) {
  const result = spawnSync(
    process.execPath,
    ["scripts/qa-meta-app-callback-switch.mjs"],
    {
      cwd: root,
      env: {
        ...process.env,
        QA_STAGING_MUTATION_API_KEY: qaEnv.QA_STAGING_MUTATION_API_KEY || "",
        QA_STAGING_API_KEY: qaEnv.QA_STAGING_API_KEY || "",
        QA_API_KEY: qaEnv.QA_API_KEY || qaEnv.SMARTZAP_API_KEY || "",
        QA_META_CALLBACK_TARGET: target,
        QA_REPORT_DIR: reportDir,
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 180_000,
    },
  );
  if (result.status !== 0)
    throw new Error(
      `Callback ${target} falhou: ${redact(result.stderr || result.stdout)}`,
    );
  return resolve(reportDir, "meta-app-callback-switch.json");
}

function runContractGate(reportDir) {
  mkdirSync(reportDir, { recursive: true });
  const logPath = resolve(reportDir, "meta-bsuid-contract-gate.log");
  const reportPath = resolve(reportDir, "meta-bsuid-contract-gate.json");
  const testFiles = [
    "tests/conversation-send.test.ts",
    "tests/whatsapp.test.ts",
    "tests/webhook.test.ts",
    "tests/reconcile-status-events.test.ts",
  ];
  const result = spawnSync(
    "npx",
    [
      "vitest",
      "run",
      ...testFiles,
      "--reporter=default",
    ],
    {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  writeFileSync(
    logPath,
    `${redact(combined)}\n`,
    { mode: 0o600 },
  );
  chmodSync(logPath, 0o600);
  if (result.status !== 0)
    throw new Error("O contrato local Meta/Inbox/BSUID reprovou antes do envio real.");
  const passedMatch = combined.match(/Tests\s+(\d+) passed/);
  if (!passedMatch || Number(passedMatch[1]) < 1)
    throw new Error("O contrato local terminou sem uma contagem verificável de testes.");
  persist(reportPath, {
    schemaVersion: 1,
    kind: "smartzap-meta-bsuid-contract-gate",
    status: "passed",
    performedAt: new Date().toISOString(),
    release: spec.release,
    testFiles,
    passedTests: Number(passedMatch[1]),
    runtimePaths: certifiedRuntimePaths,
    runtimeMatchesCertifiedRelease: true,
    log: { path: relative(logPath), sha256: sha256File(logPath) },
  });
  return reportPath;
}

function reservePilotAttempt(state, statePath) {
  const guard = metaGuard();
  const nowBrt = brtParts();
  assertMetaCanaryWindow(nowBrt.hour, guard.outsideWindowAuthorized);
  const active = d1(
    "SELECT id FROM pilot_runs WHERE status='active' ORDER BY created_at LIMIT 2",
  );
  if (active.length)
    throw new Error("Já existe uma rodada Meta ativa no staging.");
  const daily = d1(
    "SELECT COUNT(*) AS n FROM pilot_runs WHERE date(created_at, '-3 hours')=date('now', '-3 hours')",
  );
  if (Number(daily[0]?.n || 0) >= guard.maxRunsPerDay)
    throw new Error(`Limite de ${guard.maxRunsPerDay} rodadas Meta por dia atingido.`);

  const pilotRunId = randomUUID();
  const pilotLedgerId = randomUUID();
  const campaignId = `meta-bsuid:${state.runId}`;
  d1(
    `INSERT INTO pilot_runs(id,label,status,max_attempts)
     VALUES (${sqlString(pilotRunId)},${sqlString(`${state.runId} BSUID`)},'active',1)`,
  );
  try {
    d1(
      `INSERT INTO pilot_send_ledger
         (id,campaign_id,contact_id,phone_hash,status,pilot_run_id)
       VALUES (${sqlString(pilotLedgerId)},${sqlString(campaignId)},${sqlString(state.authorizedRecipient.contactId)},${sqlString(state.authorizedRecipient.phoneHash)},'reserved',${sqlString(pilotRunId)})`,
    );
  } catch (error) {
    d1(
      `UPDATE pilot_runs SET status='closed',closed_at=datetime('now')
        WHERE id=${sqlString(pilotRunId)} AND status='active'`,
    );
    throw error;
  }
  Object.assign(state.artifacts, { pilotRunId, pilotLedgerId });
  state.pilot = {
    startedAt: new Date().toISOString(),
    startedAtBrt: nowBrt.label,
    maxRunsPerDay: guard.maxRunsPerDay,
  };
  persist(statePath, state);
  return { pilotRunId, pilotLedgerId };
}

function finishPilotAttempt(state, status, messageId = null, errorCode = null) {
  const id = state.artifacts?.pilotLedgerId;
  if (!id) return;
  d1(
    `UPDATE pilot_send_ledger
        SET status=${sqlString(status)},message_id=${messageId ? sqlString(messageId) : "NULL"},
            error_code=${errorCode ? sqlString(String(errorCode).slice(0, 64)) : "NULL"},
            updated_at=datetime('now')
      WHERE id=${sqlString(id)} AND status='reserved'`,
  );
  const row = d1(
    `SELECT status,message_id FROM pilot_send_ledger WHERE id=${sqlString(id)} LIMIT 1`,
  )[0];
  if (!row || row.status !== status || (messageId && row.message_id !== messageId))
    throw new Error("Não foi possível consolidar a tentativa BSUID no ledger.");
}

function closePilotRun(state) {
  const id = state.artifacts?.pilotRunId;
  if (!id) return;
  d1(
    `UPDATE pilot_runs SET status='closed',closed_at=datetime('now')
      WHERE id=${sqlString(id)} AND status='active'`,
  );
  const row = d1(
    `SELECT status FROM pilot_runs WHERE id=${sqlString(id)} LIMIT 1`,
  )[0];
  if (!row || row.status !== "closed")
    throw new Error("A rodada BSUID não foi encerrada no ledger.");
}

function allowedRecipients() {
  const configured = String(
    qaEnv.QA_META_ALLOWLIST || qaEnv.PILOT_RECIPIENT_ALLOWLIST || "",
  )
    .split(",")
    .map((value) => value.replace(/\D/g, ""))
    .filter(Boolean);
  if (!configured.length || configured.some((value) => !/^[1-9]\d{9,14}$/.test(value)))
    throw new Error("A allowlist privada de destinatários Meta está ausente ou inválida.");
  return [...new Set(configured)];
}

function prepare() {
  if (new URL(baseUrl).hostname !== "smartzap-cf-staging.thales2581.workers.dev")
    throw new Error("META-01 só pode ser preparado no staging canônico.");
  assertCertifiedRuntimeUnchanged();
  graphConfig();
  const allowlist = allowedRecipients();
  const explicit = String(qaEnv.QA_META_BSUID_RECIPIENT || "").replace(/\D/g, "");
  if (explicit && !allowlist.includes(explicit))
    throw new Error("QA_META_BSUID_RECIPIENT precisa pertencer à allowlist privada.");
  const rows = d1(
    `SELECT c.id,c.phone,c.user_id,c.parent_user_id,c.status,
            v.id AS conversation_id,v.status AS conversation_status,
            (SELECT m.phone_number_id FROM conversation_messages m
              WHERE m.conversation_id=v.id AND m.direction='inbound'
              ORDER BY m.meta_timestamp DESC,m.id DESC LIMIT 1) AS phone_number_id
       FROM contacts c LEFT JOIN conversations v ON v.contact_id=c.id
      WHERE replace(c.phone,'+','') IN (${allowlist.map(sqlString).join(",")})`,
  );
  const targetPhone = explicit || allowlist.find((phone) => {
    const row = rows.find((candidate) => String(candidate.phone).replace(/\D/g, "") === phone);
    return row?.user_id && row?.conversation_id;
  });
  const target = rows.find(
    (row) => String(row.phone).replace(/\D/g, "") === targetPhone,
  );
  if (
    !target?.user_id ||
    !target?.conversation_id ||
    target.conversation_status !== "open" ||
    !target.phone_number_id
  )
    throw new Error(
      "Nenhum destinatário autorizado possui BSUID, conversa aberta e inbound compatível no staging.",
    );

  const template = d1(
    `SELECT name,language,status,category,components
       FROM templates
      WHERE name='hello_world' AND language='en_US' LIMIT 1`,
  )[0];
  if (
    !template ||
    String(template.status).toUpperCase() !== "APPROVED" ||
    String(template.category).toUpperCase() !== "UTILITY"
  )
    throw new Error("O template canônico hello_world/en_US não está aprovado como Utilidade.");
  const existingUsernameOnly = d1(
    "SELECT id FROM contacts WHERE phone LIKE 'bsuid:%' ORDER BY id",
  ).map((row) => row.id);

  mkdirSync(outputDir, { recursive: true });
  const statePath = resolve(outputDir, "meta-bsuid-state.json");
  const preparedAt = new Date().toISOString();
  const state = {
    schemaVersion: 1,
    kind: "smartzap-meta-bsuid-homologation-state",
    runId,
    status: "prepared",
    preparedAt,
    release: spec.release,
    environment: {
      name: "staging",
      baseUrl,
    },
    authorizedRecipient: {
      contactId: target.id,
      conversationId: target.conversation_id,
      phoneMasked: maskPhone(target.phone),
      phoneHash: sha256Value(String(target.phone).replace(/\D/g, "")),
      bsuidHash: sha256Value(target.user_id),
      originalStatus: target.status,
      conversationOpen: true,
      inboundPhoneNumberIdPresent: true,
    },
    template: { name: template.name, language: template.language },
    baseline: { usernameOnlyContactIds: existingUsernameOnly },
    artifacts: {
      officialContactId: null,
      officialConversationId: null,
      officialInboundMessageId: null,
      outboundMessageId: null,
      pilotRunId: null,
      pilotLedgerId: null,
    },
  };
  persist(statePath, state);
  const instructionsPath = resolve(outputDir, "operator-instructions.txt");
  writeFileSync(
    instructionsPath,
    [
      "Homologação META-01 — passo humano oficial",
      "",
      "1. Inicie o comando run indicado abaixo.",
      "2. Quando o executor confirmar que o callback está em staging, abra:",
      "   App Dashboard > Use cases > Connect with customers through WhatsApp > Customize > Configuration.",
      "3. Ao lado do webhook messages, clique Test.",
      "4. Selecione: User has adopted a username and phone number is unavailable.",
      "5. Dispare uma única vez e deixe o executor terminar; ele restaurará produção no finally.",
      "",
      `Estado: ${relative(statePath)}`,
      `Comando: QA_ALLOW_REAL_META=1 npm run qa:meta:bsuid -- run --state ${relative(statePath)}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  console.log(`META-01 preparada para ${state.authorizedRecipient.phoneMasked}.`);
  console.log(`Instruções: ${instructionsPath}`);
  console.log(`Estado: ${statePath}`);
}

function loadState({ allowExpired = false } = {}) {
  const statePath = resolve(root, requiredOption("state"));
  const state = readJson(statePath);
  if (
    state?.schemaVersion !== 1 ||
    state?.kind !== "smartzap-meta-bsuid-homologation-state" ||
    state?.release?.sourceCommit !== spec.release.sourceCommit ||
    state?.release?.productionVersion !== spec.release.productionVersion
  )
    throw new Error("Estado META-01 inválido ou pertencente a outra release.");
  if (!allowExpired && Date.now() - Date.parse(state.preparedAt) > 24 * 60 * 60 * 1_000)
    throw new Error("A preparação META-01 expirou; gere uma nova baseline.");
  return { state, statePath };
}

function findOfficialCandidate(state) {
  const candidates = d1(
    `SELECT c.id,c.phone,c.user_id,c.parent_user_id,c.username,c.created_at,
            v.id AS conversation_id,
            (SELECT m.id FROM conversation_messages m
              WHERE m.conversation_id=v.id AND m.direction='inbound'
              ORDER BY m.meta_timestamp DESC,m.id DESC LIMIT 1) AS inbound_message_id
       FROM contacts c JOIN conversations v ON v.contact_id=c.id
      WHERE c.phone LIKE 'bsuid:%'
        AND c.created_at >= datetime(${sqlString(state.preparedAt)})
      ORDER BY c.created_at DESC`,
  );
  const baseline = new Set(state.baseline.usernameOnlyContactIds || []);
  return candidates.find(
    (candidate) =>
      !baseline.has(candidate.id) &&
      candidate.inbound_message_id &&
      isOfficialUsernameOnlyCandidate(candidate, state.preparedAt),
  ) || null;
}

async function observeOfficialCandidate(state, statePath, waitSeconds) {
  const deadline = Date.now() + waitSeconds * 1_000;
  while (Date.now() < deadline) {
    const candidate = findOfficialCandidate(state);
    if (candidate) {
      Object.assign(state.artifacts, {
        officialContactId: candidate.id,
        officialConversationId: candidate.conversation_id,
        officialInboundMessageId: candidate.inbound_message_id,
      });
      state.status = "official-webhook-observed";
      state.officialObservedAt = new Date().toISOString();
      persist(statePath, state);
      return candidate;
    }
    await sleep(5_000);
  }
  throw new Error(
    `O cenário oficial sem telefone não chegou ao staging em ${waitSeconds}s.`,
  );
}

async function sendStrictBsuid(state, statePath) {
  const target = d1(
    `SELECT c.phone,c.user_id,
            (SELECT m.phone_number_id FROM conversation_messages m
              WHERE m.conversation_id=v.id AND m.direction='inbound'
              ORDER BY m.meta_timestamp DESC,m.id DESC LIMIT 1) AS phone_number_id
       FROM contacts c JOIN conversations v ON v.contact_id=c.id
      WHERE c.id=${sqlString(state.authorizedRecipient.contactId)}
        AND v.id=${sqlString(state.authorizedRecipient.conversationId)} LIMIT 1`,
  )[0];
  if (
    !target?.user_id ||
    !target?.phone_number_id ||
    sha256Value(target.user_id) !== state.authorizedRecipient.bsuidHash ||
    sha256Value(String(target.phone).replace(/\D/g, "")) !== state.authorizedRecipient.phoneHash
  )
    throw new Error("O destinatário autorizado mudou depois da preparação.");

  reservePilotAttempt(state, statePath);
  const payload = buildStrictBsuidTemplatePayload({
    recipient: target.user_id,
    templateName: state.template.name,
    language: state.template.language,
    opaqueId: state.artifacts.pilotLedgerId,
  });
  const graph = graphConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let response;
  let rawBody = "";
  try {
    response = await fetch(
      `https://graph.facebook.com/${graph.version}/${encodeURIComponent(target.phone_number_id)}/messages`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${graph.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    rawBody = await response.text();
  } catch (error) {
    finishPilotAttempt(state, "ambiguous", null, "NETWORK_AMBIGUOUS");
    throw new Error(`Envio Meta ficou ambíguo: ${redact(error.message)}`);
  } finally {
    clearTimeout(timeout);
  }
  let body = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const ambiguous = response.status >= 500 && !body?.error?.code;
    finishPilotAttempt(
      state,
      ambiguous ? "ambiguous" : "rejected",
      null,
      body?.error?.code || `HTTP_${response.status}`,
    );
    throw new Error(
      `Meta rejeitou o BSUID: HTTP ${response.status} ${redact(body?.error?.message || rawBody)}`,
    );
  }
  const messageId = String(body?.messages?.[0]?.id || "").trim();
  if (!messageId) {
    finishPilotAttempt(state, "ambiguous", null, "MISSING_MESSAGE_ID");
    throw new Error("A Meta aceitou a requisição sem devolver message_id.");
  }
  finishPilotAttempt(state, "accepted", messageId);
  state.artifacts.outboundMessageId = messageId;
  state.outboundAcceptedAt = new Date().toISOString();
  persist(statePath, state);
  return {
    recipientMode: "bsuid",
    phoneFieldOmitted: !Object.hasOwn(payload, "to"),
    providerCallCount: 1,
    accepted: true,
    messageId,
  };
}

async function waitForOutboundStatus(state, waitSeconds) {
  const deadline = Date.now() + waitSeconds * 1_000;
  let row = null;
  while (Date.now() < deadline) {
    row = d1(
      `SELECT status,received_at FROM status_events
        WHERE message_id=${sqlString(state.artifacts.outboundMessageId)}
          AND event_kind='message_status'
        ORDER BY CASE status
          WHEN 'read' THEN 5 WHEN 'delivered' THEN 4 WHEN 'failed' THEN 3
          WHEN 'sent' THEN 2 WHEN 'accepted' THEN 1 ELSE 0 END DESC,
          received_at DESC LIMIT 1`,
    )[0] || null;
    if (["delivered", "read", "failed"].includes(row?.status)) return row;
    await sleep(5_000);
  }
  return row;
}

function evidenceSnapshot(state, official, send, outboundStatus, operationalContractPassed) {
  const officialRows = d1(
    `SELECT
       (SELECT COUNT(*) FROM contacts WHERE id=${sqlString(official.id)} AND user_id IS NOT NULL) AS contact_rows,
       (SELECT COUNT(*) FROM conversations WHERE id=${sqlString(official.conversation_id)} AND contact_id=${sqlString(official.id)}) AS conversation_rows,
       (SELECT COUNT(*) FROM conversation_messages WHERE id=${sqlString(official.inbound_message_id)} AND conversation_id=${sqlString(official.conversation_id)} AND direction='inbound') AS inbound_rows,
       (SELECT COUNT(*) FROM status_events WHERE message_id=${sqlString(official.inbound_message_id)} AND event_kind='inbound_message') AS inbound_event_rows`,
  )[0] || {};
  const outboundRows = d1(
    `SELECT
       (SELECT COUNT(*) FROM pilot_send_ledger WHERE id=${sqlString(state.artifacts.pilotLedgerId)}) AS ledger_rows,
       (SELECT COUNT(*) FROM pilot_runs WHERE id=${sqlString(state.artifacts.pilotRunId)}) AS pilot_run_rows,
       (SELECT COUNT(*) FROM status_events WHERE message_id=${sqlString(state.artifacts.outboundMessageId)} AND event_kind='message_status') AS status_rows`,
  )[0] || {};
  return {
    official: {
      observed: true,
      usernamePresent: Boolean(official.username),
      userIdPresent: Boolean(official.user_id),
      phoneOmitted: String(official.phone).startsWith("bsuid:"),
      storedPhoneKind: String(official.phone).startsWith("bsuid:")
        ? "bsuid-placeholder"
        : "phone",
      contactRows: Number(officialRows.contact_rows || 0),
      conversationRows: Number(officialRows.conversation_rows || 0),
      inboundMessageRows: Number(officialRows.inbound_rows || 0),
      inboundEventRows: Number(officialRows.inbound_event_rows || 0),
      contactId: official.id,
      conversationId: official.conversation_id,
      messageId: official.inbound_message_id,
      bsuidHash: sha256Value(official.user_id),
      usernameHash: sha256Value(official.username),
    },
    outbound: {
      recipientMode: send.recipientMode,
      phoneFieldOmitted: send.phoneFieldOmitted,
      providerCallCount: send.providerCallCount,
      accepted: send.accepted,
      messageId: send.messageId,
      status: outboundStatus?.status || "accepted",
      statusEventRows: Number(outboundRows.status_rows || 0),
      operationalContractPassed,
      ledgerRows: Number(outboundRows.ledger_rows || 0),
      pilotRunRows: Number(outboundRows.pilot_run_rows || 0),
    },
  };
}

async function cleanupArtifacts(state) {
  const errors = [];
  const a = state.artifacts || {};
  if (a.pilotLedgerId) {
    try {
      const ledger = d1(
        `SELECT status FROM pilot_send_ledger WHERE id=${sqlString(a.pilotLedgerId)} LIMIT 1`,
      )[0];
      if (ledger?.status === "reserved")
        finishPilotAttempt(state, "ambiguous", null, "INTERRUPTED_BEFORE_RESULT");
    } catch (error) {
      errors.push(`ledger: ${redact(error.message)}`);
    }
  }
  if (a.pilotRunId) {
    try {
      closePilotRun(state);
    } catch (error) {
      errors.push(`rodada: ${redact(error.message)}`);
    }
  }
  if (a.officialContactId) {
    try {
      await api(
        `/api/contacts/${encodeURIComponent(a.officialContactId)}`,
        { method: "DELETE" },
        [200, 404],
      );
    } catch (error) {
      errors.push(redact(error.message));
    }
  }
  try {
    const statements = [];
    if (a.officialInboundMessageId)
      statements.push(
        `DELETE FROM status_events WHERE message_id=${sqlString(a.officialInboundMessageId)}`,
      );
    if (a.outboundMessageId) {
      statements.push(
        `DELETE FROM status_events WHERE message_id=${sqlString(a.outboundMessageId)}`,
      );
    }
    for (const statement of statements) d1(statement);
  } catch (error) {
    errors.push(redact(error.message));
  }
  return errors;
}

function cleanupSnapshot(state, callbackRestored) {
  const a = state.artifacts || {};
  const row = d1(
    `SELECT
       (SELECT COUNT(*) FROM contacts WHERE id=${sqlString(a.officialContactId || "missing")}) AS official_contact_rows,
       (SELECT COUNT(*) FROM conversations WHERE id=${sqlString(a.officialConversationId || "missing")}) AS official_conversation_rows,
       (SELECT COUNT(*) FROM conversation_messages WHERE id=${sqlString(a.officialInboundMessageId || "missing")}) AS official_inbound_rows,
       (SELECT COUNT(*) FROM status_events WHERE message_id IN (${[
         a.officialInboundMessageId || "missing-official",
         a.outboundMessageId || "missing-outbound",
       ].map(sqlString).join(",")})) AS outbound_status_rows,
       (SELECT COUNT(*) FROM pilot_runs WHERE id=${sqlString(a.pilotRunId || "missing")} AND status='active') AS pilot_run_active_rows,
       (SELECT COUNT(*) FROM pilot_send_ledger WHERE id=${sqlString(a.pilotLedgerId || "missing")}) AS pilot_ledger_retained_rows`,
  )[0] || {};
  return {
    callbackRestored,
    officialContactRows: Number(row.official_contact_rows || 0),
    officialConversationRows: Number(row.official_conversation_rows || 0),
    officialInboundMessageRows: Number(row.official_inbound_rows || 0),
    outboundStatusRows: Number(row.outbound_status_rows || 0),
    pilotRunActiveRows: Number(row.pilot_run_active_rows || 0),
    pilotLedgerRetainedRows: Number(row.pilot_ledger_retained_rows || 0),
  };
}

async function run() {
  if (process.env.QA_ALLOW_REAL_META !== "1")
    throw new Error("Defina QA_ALLOW_REAL_META=1 para autorizar o envio real estritamente por BSUID.");
  const { state, statePath } = loadState();
  if (state.status !== "prepared")
    throw new Error("Este estado META-01 já foi iniciado; use cleanup e prepare uma nova rodada.");
  assertCertifiedRuntimeUnchanged();
  graphConfig();
  const runOutputDir = executionOutputDir(statePath);
  mkdirSync(runOutputDir, { recursive: true });
  const runtimeIssues = [];
  let official = null;
  let send = null;
  let outboundStatus = null;
  let snapshot = null;
  let callbackRestored = false;
  const callbackArtifacts = [];
  let contractArtifact = null;
  const restoreOnSignal = () => {
    try {
      try {
        const ledger = state.artifacts?.pilotLedgerId
          ? d1(`SELECT status FROM pilot_send_ledger WHERE id=${sqlString(state.artifacts.pilotLedgerId)} LIMIT 1`)[0]
          : null;
        if (ledger?.status === "reserved")
          finishPilotAttempt(state, "ambiguous", null, "PROCESS_SIGNAL");
        if (state.artifacts?.pilotRunId) closePilotRun(state);
      } catch {
        // O comando cleanup fará a recuperação exata usando o estado persistido.
      }
      switchCallback("production", resolve(runOutputDir, "callback-signal-recovery"));
    } finally {
      process.exit(130);
    }
  };
  process.once("SIGINT", restoreOnSignal);
  process.once("SIGTERM", restoreOnSignal);
  try {
    contractArtifact = runContractGate(resolve(runOutputDir, "contract"));
    callbackArtifacts.push(
      switchCallback("staging", resolve(runOutputDir, "callback-staging")),
    );
    state.status = "waiting-official-webhook";
    state.callbackStagingAt = new Date().toISOString();
    persist(statePath, state);
    console.log(
      "Callback em staging. Dispare agora o cenário oficial 'User has adopted a username and phone number is unavailable'.",
    );
    official = await observeOfficialCandidate(
      state,
      statePath,
      boundedSeconds("wait-seconds", 900, 1_800),
    );
    send = await sendStrictBsuid(state, statePath);
    outboundStatus = await waitForOutboundStatus(
      state,
      boundedSeconds("status-wait-seconds", 600, 1_800),
    );
    snapshot = evidenceSnapshot(state, official, send, outboundStatus, true);
  } catch (error) {
    runtimeIssues.push(redact(error.message));
  } finally {
    runtimeIssues.push(...(await cleanupArtifacts(state)));
    try {
      callbackArtifacts.push(
        switchCallback("production", resolve(runOutputDir, "callback-production")),
      );
      callbackRestored = true;
    } catch (error) {
      runtimeIssues.push(redact(error.message));
    }
    process.removeListener("SIGINT", restoreOnSignal);
    process.removeListener("SIGTERM", restoreOnSignal);
  }

  const cleanup = cleanupSnapshot(state, callbackRestored);
  const evaluation = evaluateMetaBsuidHomologation({
    official: snapshot?.official,
    outbound: snapshot?.outbound,
    cleanup,
  });
  const issues = [...new Set([...runtimeIssues, ...evaluation.issues])];
  const status = issues.length ? "failed" : "passed";
  const performedAt = new Date().toISOString();
  const detailsPath = resolve(runOutputDir, "meta-bsuid-details.json");
  const details = {
    schemaVersion: 1,
    kind: "smartzap-meta-bsuid-homologation",
    status,
    runId: state.runId,
    performedAt,
    release: spec.release,
    environment: state.environment,
    authorizedRecipient: state.authorizedRecipient,
    official: snapshot?.official || null,
    outbound: snapshot?.outbound || null,
    cleanup,
    checks: evaluation.checks,
    issues,
  };
  persist(detailsPath, details);
  const artifacts = [detailsPath, contractArtifact, ...callbackArtifacts]
    .filter((path) => existsSync(path))
    .map((path) => ({ path: relative(path), sha256: sha256File(path) }));
  const attestationPath = resolve(runOutputDir, "meta-bsuid-attestation.json");
  persist(attestationPath, {
    schemaVersion: 1,
    kind: "smartzap-certification-attestation",
    evidenceId: "meta-bsuid",
    status,
    release: spec.release,
    performedBy: "Codex QA autônomo + operador autenticado no App Dashboard da Meta",
    performedAt,
    checks: evaluation.checks,
    artifacts,
    issues,
  });
  state.status = status;
  state.completedAt = performedAt;
  persist(statePath, state);
  console.log(`META-01: ${status}. Atestado: ${attestationPath}`);
  if (status !== "passed") process.exitCode = 1;
}

async function cleanupOnly() {
  const { state, statePath } = loadState({ allowExpired: true });
  const runOutputDir = executionOutputDir(statePath);
  const issues = await cleanupArtifacts(state);
  let callbackRestored = false;
  try {
    switchCallback("production", resolve(runOutputDir, "callback-production-cleanup"));
    callbackRestored = true;
  } catch (error) {
    issues.push(redact(error.message));
  }
  const cleanup = cleanupSnapshot(state, callbackRestored);
  const expectedLedgerRows = state.artifacts?.pilotLedgerId ? 1 : 0;
  if (
    !cleanup.callbackRestored ||
    cleanup.officialContactRows !== 0 ||
    cleanup.officialConversationRows !== 0 ||
    cleanup.officialInboundMessageRows !== 0 ||
    cleanup.outboundStatusRows !== 0 ||
    cleanup.pilotRunActiveRows !== 0 ||
    cleanup.pilotLedgerRetainedRows !== expectedLedgerRows
  )
    issues.push("A limpeza de recuperação ainda possui resíduos.");
  state.status = issues.length ? "cleanup-failed" : "cleaned";
  state.cleanup = cleanup;
  state.cleanupIssues = issues;
  persist(statePath, state);
  console.log(`Cleanup META-01: ${state.status}.`);
  if (issues.length) process.exitCode = 1;
}

if (command === "prepare") prepare();
else if (command === "run") await run();
else if (command === "cleanup") await cleanupOnly();
else throw new Error("Comando esperado: prepare, run ou cleanup.");
