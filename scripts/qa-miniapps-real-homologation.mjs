import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { FLOW_TEMPLATES } from "../app/lib/flow-templates.ts";

const root = resolve(import.meta.dirname, "..");
const baseUrl = String(
  process.env.QA_BASE_URL || "https://smartzap-cf-staging.thales2581.workers.dev",
).replace(/\/+$/, "");
const action = process.argv[2] || "start";

function readEnv(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    let value = trimmed.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) value = value.slice(1, -1);
    values[trimmed.slice(0, separator).trim()] = value.replaceAll("\\n", "\n");
  }
  return values;
}

const privateQa = readEnv(resolve(root, ".dev.vars.qa.local"));
const apiKey = process.env.QA_API_KEY || privateQa.QA_STAGING_API_KEY;
const allowlist = (process.env.QA_META_ALLOWLIST || privateQa.QA_META_ALLOWLIST || "")
  .split(",")
  .map((value) => value.replace(/\D/g, ""))
  .filter(Boolean);
const recipients = (process.env.QA_META_RECIPIENTS || process.env.QA_META_RECIPIENT || allowlist[0] || "")
  .split(",")
  .map((value) => value.replace(/\D/g, ""))
  .filter(Boolean);
const templateKeys = (process.env.QA_MINIAPP_TEMPLATES || FLOW_TEMPLATES.map((item) => item.key).join(","))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const templates = templateKeys.map((key) => {
  const template = FLOW_TEMPLATES.find((item) => item.key === key);
  if (!template) throw new Error(`Modelo desconhecido: ${key}`);
  return template;
});
const maxSends = Number(process.env.QA_MAX_SENDS || 10);
const requestedSends = recipients.length * templates.length;
const bulkAuthorized = process.env.QA_ALLOW_BULK_REAL_OWNED_RECIPIENTS === "true";
const matrixCapacity = allowlist.length * FLOW_TEMPLATES.length;
const reportDir = resolve(
  root,
  process.env.QA_REPORT_DIR || `qa/reports/miniapps-real-${Date.now()}`,
);
const reportPath = resolve(reportDir, "miniapps-real-homologation.json");

if (!apiKey) throw new Error("QA_STAGING_API_KEY ausente");
if (new URL(baseUrl).hostname !== "smartzap-cf-staging.thales2581.workers.dev")
  throw new Error("A homologação real só pode operar no Worker de staging");
if (!recipients.length || recipients.some((phone) => !allowlist.includes(phone)))
  throw new Error("Todos os destinatários precisam pertencer à allowlist privada de QA");
if (!Number.isInteger(maxSends) || maxSends < 1 || maxSends > matrixCapacity)
  throw new Error(`QA_MAX_SENDS precisa estar entre 1 e ${matrixCapacity}`);
if (maxSends > 10 && !bulkAuthorized)
  throw new Error(
    "Mais de 10 envios exigem QA_ALLOW_BULK_REAL_OWNED_RECIPIENTS=true e destinatários na allowlist",
  );
if (requestedSends > maxSends)
  throw new Error(`A rodada pede ${requestedSends} envios e excede o teto ${maxSends}`);

function maskPhone(value) {
  return value.length > 6
    ? `+${value.slice(0, 4)} ${"*".repeat(value.length - 6)}-${value.slice(-2)}`
    : "[mascarado]";
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

async function api(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      "cache-control": "no-cache",
      ...(init.body ? { "content-type": "application/json", origin: baseUrl } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(45_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      `${init.method || "GET"} ${path} respondeu HTTP ${response.status}: ${body.error || "erro sem detalhe"}`,
    );
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function save(report) {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

function load() {
  if (!existsSync(reportPath)) throw new Error(`Relatório não encontrado: ${reportPath}`);
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function queryD1(sql) {
  const output = execFileSync(
    resolve(root, "node_modules/.bin/wrangler"),
    [
      "d1", "execute", "smartzap-staging",
      "--config", "config/wrangler.staging.jsonc",
      "--remote", "--json", "--command", sql,
    ],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(output);
  return parsed.flatMap((entry) => entry.results || []);
}

async function executeBatch({ resume = false } = {}) {
  const health = await api("/api/health");
  if (health.ok !== true) throw new Error("Health de staging não confirmou prontidão");
  const existing = await api("/api/flows");
  const allowConcurrent = process.env.QA_ALLOW_CONCURRENT_RUN === "true";
  if (!resume && !allowConcurrent && (existing.items || []).some((item) => String(item.name || "").startsWith("AUTOQA_MINI_REAL_")))
    throw new Error("Há uma homologação real AUTOQA já aberta em staging; reconcilie ou limpe antes de iniciar outra");

  const runId = (process.env.QA_RUN_ID || `AUTOQA_MINI_REAL_${Date.now()}_${randomUUID().slice(0, 8)}`)
    .replace(/[^A-Za-z0-9_-]/g, "_");
  const report = resume
    ? load()
    : {
        schemaVersion: 1,
        journey: "MINI-11",
        runId,
        status: "running",
        environment: baseUrl,
        startedAt: new Date().toISOString(),
        recipients: recipients.map((phone) => ({ masked: maskPhone(phone), hash: hash(phone) })),
        templateKeys,
        requestedSends,
        authorization: {
          bulkAuthorized,
          allowlistedRecipients: recipients.length,
          matrixCapacity,
        },
        items: [],
        cleanup: { status: "deferred-until-reconciliation" },
      };
  if (resume && report.runId !== runId)
    throw new Error(`QA_RUN_ID ${runId} não corresponde ao relatório ${report.runId}`);
  report.status = "running";
  delete report.failure;
  save(report);

  try {
    for (const template of templates) {
      let item = report.items.find((entry) => entry.templateKey === template.key);
      if (!item) {
        const created = await api("/api/flows", {
          method: "POST",
          body: JSON.stringify({
            name: `${runId} ${template.name}`.slice(0, 160),
            definition: template.definition,
            mapping: template.mapping,
          }),
        });
        const flowLocalId = String(created.id || "");
        if (!flowLocalId) throw new Error(`A API não devolveu o ID local para ${template.key}`);
        item = {
          templateKey: template.key,
          templateName: template.name,
          dynamic: template.dynamic === true,
          flowLocalId,
          flowLocalIdHash: hash(flowLocalId),
          status: "local-created",
          sends: [],
        };
        report.items.push(item);
        save(report);
      }

      if (item.status === "local-created") {
        const published = await api(`/api/flows/${encodeURIComponent(item.flowLocalId)}/meta/publish`, {
          method: "POST",
          body: JSON.stringify({ publish: true }),
        });
        const metaStatus = published?.item?.meta_status ?? published?.item?.metaStatus;
        const metaFlowId = String(published?.item?.meta_id ?? published?.item?.metaId ?? "");
        if (metaStatus !== "PUBLISHED" || !metaFlowId)
          throw new Error(`A Meta não confirmou PUBLISHED para ${template.key}`);
        item.metaFlowId = metaFlowId;
        item.status = "published";
        save(report);
      }

      for (const recipient of recipients) {
        if (item.sends.some((send) => send.recipientHash === hash(recipient))) continue;
        const sent = await api(`/api/flows/${encodeURIComponent(item.flowLocalId)}/send`, {
          method: "POST",
          body: JSON.stringify({
            to: recipient,
            mode: "published",
            body: `Homologação real: ${template.name}`,
            ctaText: "Abrir MiniApp",
            footer: `${runId} · ${template.key}`.slice(0, 60),
          }),
        });
        if (!sent.ok || !sent.messageId || !sent.submissionId)
          throw new Error(`A Meta não aceitou ${template.key} para ${maskPhone(recipient)}`);
        item.sends.push({
          recipient: maskPhone(recipient),
          recipientHash: hash(recipient),
          messageId: String(sent.messageId),
          submissionId: String(sent.submissionId),
          status: "accepted",
        });
        item.status = "sent";
        save(report);
      }
    }
  } catch (error) {
    report.status = "failed-partial";
    report.failure = {
      at: new Date().toISOString(),
      detail: error instanceof Error ? error.message : "Falha desconhecida",
    };
    save(report);
    throw error;
  }
  report.status = "awaiting-real-submissions";
  report.sentAt = new Date().toISOString();
  save(report);
  return report;
}

async function reconcile() {
  const report = load();
  const submissionIds = report.items.flatMap((item) => item.sends).map((send) => send.submissionId);
  const outboundIds = report.items.flatMap((item) => item.sends).map((send) => send.messageId);
  if ([...submissionIds, ...outboundIds].some((value) => typeof value !== "string" || !value.length))
    throw new Error("Relatório incompleto para reconciliação");
  const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;
  const submissions = queryD1(
    `SELECT id,status,completed_at,mapped_at,confirmation_status,confirmation_message_id,` +
    `COALESCE(json_extract(response_json,'$.extension_message_response.params.event_id'),` +
    `json_extract(response_json,'$.event_id')) event_id ` +
    `FROM flow_submissions WHERE id IN (${submissionIds.map(sqlString).join(",")}) ORDER BY created_at`,
  );
  const events = queryD1(
    `SELECT message_id,status,received_at,error_code,error_detail FROM status_events ` +
    `WHERE message_id IN (${outboundIds.map(sqlString).join(",")}) ORDER BY received_at,event_key`,
  );
  for (const item of report.items) {
    for (const send of item.sends) {
      const submissionRow = submissions.find((row) => row.id === send.submissionId) || null;
      const eventId = String(submissionRow?.event_id ?? "");
      send.submission = submissionRow
        ? {
            id: submissionRow.id,
            status: submissionRow.status,
            completed_at: submissionRow.completed_at,
            mapped_at: submissionRow.mapped_at,
            confirmation_status: submissionRow.confirmation_status,
            confirmation_message_id: submissionRow.confirmation_message_id,
          }
        : null;
      send.deliveryEvents = events.filter((row) => row.message_id === send.messageId);
      const statuses = new Set(send.deliveryEvents.map((event) => event.status));
      const failedEvents = send.deliveryEvents.filter((event) => event.status === "failed");
      send.evidence = {
        sent: statuses.has("sent"),
        delivered: statuses.has("delivered"),
        read: statuses.has("read"),
        failed: failedEvents.length > 0,
        failures: failedEvents.map((event) => ({
          code: event.error_code ?? null,
          detail: event.error_detail ?? null,
        })),
        completed: send.submission?.status === "completed",
        mapped: Boolean(send.submission?.mapped_at),
        mappingRequired: item.dynamic !== true,
        confirmation: send.submission?.confirmation_status ?? null,
        calendarEventCreated: item.dynamic === true ? /^[a-f0-9]{64}$/.test(eventId) : null,
      };
      send.evidence.verified = send.evidence.completed &&
        (!send.evidence.mappingRequired || send.evidence.mapped) &&
        (item.dynamic !== true || (
          send.evidence.calendarEventCreated && send.evidence.confirmation === "sent"
        ));
      send.status = send.evidence.failed
        ? "failed"
        : send.evidence.verified
        ? "verified"
        : send.evidence.completed
          ? "completed-without-required-mapping"
        : send.evidence.delivered
          ? "delivered-awaiting-submission"
          : send.evidence.sent
            ? "sent-awaiting-delivery"
            : "accepted-awaiting-webhook";
    }
    item.status = item.sends.some((send) => send.evidence.failed)
      ? "failed"
      : item.sends.every((send) => send.evidence.verified)
      ? "verified"
      : item.sends.every((send) => send.evidence.completed)
        ? "completed-with-functional-defects"
        : "awaiting-submission";
  }
  const sends = report.items.flatMap((item) => item.sends);
  report.reconciledAt = new Date().toISOString();
  report.summary = {
    total: sends.length,
    sent: sends.filter((send) => send.evidence.sent).length,
    delivered: sends.filter((send) => send.evidence.delivered).length,
    read: sends.filter((send) => send.evidence.read).length,
    completed: sends.filter((send) => send.evidence.completed).length,
    mapped: sends.filter((send) => send.evidence.mapped).length,
    failed: sends.filter((send) => send.evidence.failed).length,
    verified: sends.filter((send) => send.evidence.verified).length,
  };
  report.status = report.summary.failed > 0
    ? "failed"
    : report.summary.verified === report.summary.total
    ? "ready-for-cleanup"
    : report.summary.completed === report.summary.total
      ? "completed-with-functional-defects"
    : "awaiting-real-submissions";
  save(report);
  return report;
}

async function cleanup() {
  const report = await reconcile();
  const force = process.env.QA_FORCE_CLEANUP === "true";
  if (report.status !== "ready-for-cleanup" && !force)
    throw new Error("Cleanup recusado: ainda existem submissões reais pendentes");
  const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;
  const dynamicSubmissionIds = report.items
    .filter((item) => item.dynamic === true)
    .flatMap((item) => item.sends.map((send) => send.submissionId));
  const dynamicEvents = dynamicSubmissionIds.length
    ? queryD1(
        `SELECT id,COALESCE(json_extract(response_json,'$.extension_message_response.params.event_id'),` +
        `json_extract(response_json,'$.event_id')) event_id FROM flow_submissions ` +
        `WHERE id IN (${dynamicSubmissionIds.map(sqlString).join(",")})`,
      )
    : [];
  const calendarResults = [];
  for (const submissionId of dynamicSubmissionIds) {
    const eventId = String(dynamicEvents.find((row) => row.id === submissionId)?.event_id ?? "");
    if (!/^[a-f0-9]{64}$/.test(eventId)) {
      const send = report.items
        .flatMap((item) => item.sends)
        .find((entry) => entry.submissionId === submissionId);
      calendarResults.push({
        submissionIdHash: hash(submissionId),
        status: send?.evidence?.completed ? "event-id-missing" : "not-created",
      });
      continue;
    }
    try {
      await api(`/api/google-calendar/qa-events/${encodeURIComponent(eventId)}`, {
        method: "DELETE",
        body: "{}",
      });
      calendarResults.push({ submissionIdHash: hash(submissionId), status: "deleted" });
    } catch (error) {
      calendarResults.push({
        submissionIdHash: hash(submissionId),
        status: "failed",
        detail: error instanceof Error ? error.message : "Falha desconhecida",
      });
    }
  }
  const results = [];
  for (const item of report.items) {
    try {
      await api(`/api/flows/${encodeURIComponent(item.flowLocalId)}`, { method: "DELETE", body: "{}" });
      results.push({ templateKey: item.templateKey, status: "deleted-and-deprecated" });
    } catch (error) {
      results.push({
        templateKey: item.templateKey,
        status: "failed",
        detail: error instanceof Error ? error.message : "Falha desconhecida",
      });
    }
  }
  report.cleanup = { at: new Date().toISOString(), calendarResults, results };
  const calendarPassed = calendarResults.every((item) => ["deleted", "not-created"].includes(item.status));
  report.status = calendarPassed && results.every((item) => item.status === "deleted-and-deprecated")
    ? report.summary.verified === report.summary.total
      ? "passed"
      : report.summary.failed > 0
        ? "cleanup-passed-failed"
        : "cleanup-passed-functional-defects"
    : "cleanup-failed";
  report.finishedAt = new Date().toISOString();
  save(report);
  return report;
}

let report;
if (action === "start") report = await executeBatch();
else if (action === "resume") report = await executeBatch({ resume: true });
else if (action === "reconcile") report = await reconcile();
else if (action === "cleanup") report = await cleanup();
else throw new Error("Ação inválida; use start, resume, reconcile ou cleanup");

console.log(JSON.stringify({
  runId: report.runId,
  status: report.status,
  environment: report.environment,
  templates: report.items.length,
  sends: report.items.flatMap((item) => item.sends).length,
  summary: report.summary ?? null,
  report: reportPath,
}, null, 2));
