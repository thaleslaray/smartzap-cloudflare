import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveMetaCallbackPreflight } from "./lib/meta-canary-preflight.mjs";
import { shouldStopMetaCampaignPolling } from "./lib/meta-canary-lifecycle.mjs";
import {
  assertMetaCanaryWindow,
  resolveMetaCanaryGuard,
} from "./lib/meta-canary-guard.mjs";
import { resolveQaStagingAuthHeaders } from "./lib/qa-staging-auth.mjs";
import {
  assertExistingMetaCanaryContact,
  selectMetaCanaryRecipients,
} from "./lib/meta-canary-recipients.mjs";

const root = resolve(import.meta.dirname, "..");
const baseUrl = (
  process.env.QA_BASE_URL ||
  "https://smartzap-cf-staging.thales2581.workers.dev"
).replace(/\/+$/, "");
const runId = (
  process.env.QA_RUN_ID ||
  `AUTOQA_META_${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`
).replace(/[^A-Za-z0-9_-]/g, "_");
const reportDir = resolve(
  root,
  process.env.QA_REPORT_DIR || `qa/reports/${runId}`,
);
const transportOnly = process.env.QA_META_TRANSPORT_ONLY === "1";
const sendCount = Number(process.env.QA_META_SEND_COUNT || 1);
const templateName = process.env.QA_META_TEMPLATE_NAME || "hello_world";
const templateLanguage = process.env.QA_META_TEMPLATE_LANGUAGE || "en_US";
const expectedTemplateCategory = process.env.QA_META_TEMPLATE_CATEGORY || "UTILITY";
const variableMapping = (() => {
  const raw = process.env.QA_META_VARIABLE_MAPPING;
  if (!raw) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("QA_META_VARIABLE_MAPPING precisa ser um JSON válido.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("QA_META_VARIABLE_MAPPING precisa ser um objeto JSON.");
  return parsed;
})();
mkdirSync(reportDir, { recursive: true });

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

function maskPhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 8
    ? `+${digits.slice(0, 4)} *****-${digits.slice(-4)}`
    : "[TELEFONE_MASCARADO]";
}

function redact(value) {
  return String(value ?? "")
    .replace(/\b(?:\+?55)?\d{10,11}\b/g, "[TELEFONE_MASCARADO]")
    .replace(
      /\b(?:token|secret|password|api[_ -]?key)\s*[:=]\s*\S+/gi,
      "[SEGREDO_REDACTED]",
    )
    .slice(0, 2_000);
}

function persist(report) {
  const path = resolve(reportDir, "meta-canary.json");
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
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

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function d1(sql) {
  const child = spawn(
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
    { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise((resolveExit) => {
    child.on("close", (exitCode) => resolveExit(exitCode ?? 1));
    child.on("error", () => resolveExit(1));
  });
  if (code !== 0)
    throw new Error(`D1 remoto falhou: ${redact(stderr || stdout)}`);
  const parsed = JSON.parse(stdout);
  return parsed.flatMap((entry) => entry.results || []);
}

const hostname = new URL(baseUrl).hostname;
if (hostname !== "smartzap-cf-staging.thales2581.workers.dev")
  throw new Error("O canário real só pode rodar no staging explícito.");
if (process.env.QA_ALLOW_REAL_META !== "1")
  throw new Error("Defina QA_ALLOW_REAL_META=1 para autorizar o canário real.");
if (!Number.isInteger(sendCount) || sendCount < 1 || sendCount > 3)
  throw new Error("QA_META_SEND_COUNT precisa estar entre 1 e 3.");
if (!/^[a-z0-9_]{1,512}$/.test(templateName))
  throw new Error("QA_META_TEMPLATE_NAME inválido.");
if (!/^[a-z]{2}_[A-Z]{2}$/.test(templateLanguage))
  throw new Error("QA_META_TEMPLATE_LANGUAGE inválido.");
if (!["MARKETING", "UTILITY"].includes(expectedTemplateCategory))
  throw new Error("QA_META_TEMPLATE_CATEGORY precisa ser MARKETING ou UTILITY.");

const nowBrt = brtParts();
const guard = resolveMetaCanaryGuard();
assertMetaCanaryWindow(nowBrt.hour, guard.outsideWindowAuthorized);

const runtime = readEnv(resolve(root, ".dev.vars"));
const qa = readEnv(resolve(root, ".dev.vars.qa.local"));
const apiKey = process.env.QA_API_KEY || runtime.SMARTZAP_API_KEY;
const authHeaders = resolveQaStagingAuthHeaders({
  mutationKey: process.env.QA_STAGING_MUTATION_API_KEY,
  apiKey,
});
const recipients = (
  process.env.QA_META_ALLOWLIST ||
  qa.QA_META_ALLOWLIST ||
  ""
)
  .split(",")
  .map((phone) => phone.trim())
  .filter(Boolean);
if (
  recipients.length !== 4 ||
  new Set(recipients).size !== 4 ||
  recipients.some((phone) => !/^[1-9]\d{9,14}$/.test(phone))
)
  throw new Error("A allowlist privada precisa conter quatro números E.164 distintos.");
const selectedRecipients = selectMetaCanaryRecipients(recipients, sendCount);
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
        ...init.headers,
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

async function findContact(phone) {
  const response = await api(`/api/contacts?q=${encodeURIComponent(`+${phone}`)}`);
  return response.body.items.find((item) => item.phone === `+${phone}`) || null;
}

async function cleanup(report) {
  const errors = [...(report.cleanup?.errors || [])];
  for (const campaign of [...report.artifacts.campaigns].reverse()) {
    if (!campaign.created || campaign.cleaned) continue;
    try {
      const current = await api(`/api/campaigns/${campaign.id}`, {}, [200, 404]);
      if (
        current.status === 200 &&
        ["scheduled", "sending", "paused"].includes(current.body.status)
      )
        await api(
          `/api/campaigns/${campaign.id}/cancel`,
          { method: "POST", body: "{}" },
          [200, 409],
        );
      await api(`/api/campaigns/${campaign.id}`, { method: "DELETE" }, [200, 404]);
      campaign.cleaned = true;
    } catch (error) {
      errors.push(`campanha ${campaign.id}: ${redact(error.message)}`);
    }
  }
  const createdContacts = report.artifacts.contacts.filter(
    (contact) => contact.created && !contact.cleaned,
  );
  if (createdContacts.length) {
    try {
      await api("/api/contacts/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: createdContacts.map((contact) => contact.id) }),
      });
      for (const contact of createdContacts) contact.cleaned = true;
    } catch (error) {
      errors.push(`contatos: ${redact(error.message)}`);
    }
  }
  const taggedExistingContacts = report.artifacts.contacts.filter(
    (contact) =>
      !contact.created &&
      contact.autoQaTagAdded &&
      !contact.tagRestored,
  );
  if (taggedExistingContacts.length && report.artifacts.tag?.id) {
    try {
      await api("/api/contacts/bulk-tags", {
        method: "POST",
        body: JSON.stringify({
          ids: taggedExistingContacts.map((contact) => contact.id),
          tagIds: [report.artifacts.tag.id],
          mode: "remove",
        }),
      });
      for (const contact of taggedExistingContacts)
        contact.tagRestored = true;
    } catch (error) {
      errors.push(`tags dos contatos existentes: ${redact(error.message)}`);
    }
  }
  const tag = report.artifacts.tag;
  if (tag?.created && !tag.cleaned) {
    try {
      await api(`/api/contacts/tags/${tag.id}`, { method: "DELETE" }, [200, 404]);
      tag.cleaned = true;
    } catch (error) {
      errors.push(`tag ${tag.id}: ${redact(error.message)}`);
    }
  }
  report.cleanup = {
    status: errors.length ? "failed" : "passed",
    errors,
    retainedAudit: ["pilot_runs", "pilot_send_ledger"],
    finishedAt: new Date().toISOString(),
  };
}

const report = {
  schemaVersion: 1,
  runId,
  mode: "cloudflare-staging-meta",
  scope: transportOnly ? "transport-only" : "full-lifecycle",
  baseUrl,
  startedAt: new Date().toISOString(),
  startedAtBrt: nowBrt.label,
  finishedAt: null,
  status: "running",
  authorizedRecipients: recipients.map(maskPhone),
  selectedRecipients: selectedRecipients.map(maskPhone),
  sendCount,
  template: {
    name: templateName,
    language: templateLanguage,
    expectedCategory: expectedTemplateCategory,
    variableMappingKeys: Object.keys(variableMapping || {}).sort(),
  },
  guard: {
    maxRunsPerDay: guard.maxRunsPerDay,
    outsideWindowAuthorized: guard.outsideWindowAuthorized,
  },
  preflight: {},
  artifacts: {
    contacts: [],
    tag: null,
    campaigns: [],
    pilotRun: null,
  },
  timeline: [],
  limitation: null,
  cleanup: { status: "pending", errors: [] },
};
persist(report);

let pilotRunId;
let canaryError;
try {
  const ledgerDir = resolve(root, "qa/.ledger");
  const ledgerPath = resolve(ledgerDir, `meta-canary-${nowBrt.day}.json`);
  mkdirSync(ledgerDir, { recursive: true });
  let localRuns = [];
  try {
    localRuns = JSON.parse(readFileSync(ledgerPath, "utf8")).runs || [];
  } catch {
    localRuns = [];
  }
  if (localRuns.length >= guard.maxRunsPerDay)
    throw new Error(
      `Limite local de ${guard.maxRunsPerDay} rodadas reais por dia atingido.`,
    );

  const health = (await api("/api/settings/health")).body;
  const templates = (await api("/api/templates")).body.items;
  const canaryTemplate = templates.find((item) =>
    item.source === "meta" &&
    item.name === templateName &&
    item.language === templateLanguage
  );
  const callback = resolveMetaCallbackPreflight(health, baseUrl);
  report.preflight = {
    databaseOk: health.databaseOk === true,
    metaConfigured: health.metaConfigured === true,
    metaLive: health.metaLive === true,
    templatesConfigured: health.templatesConfigured === true,
    approvedTemplates: health.approvedTemplates,
    qualityRating: health.meta?.qualityRating || null,
    tokenValid: health.meta?.tokenValid === true,
    tokenRequiredScopesPresent: health.meta?.tokenRequiredScopesPresent === true,
    callbackUrl: callback.callbackUrl,
    appCallbackUrl: callback.appCallbackUrl,
    wabaCallbackUrl: callback.wabaCallbackUrl,
    phoneCallbackUrl: callback.phoneCallbackUrl,
    effectiveCallbackUrl: callback.effectiveCallbackUrl,
    callbackMatchesStaging: callback.callbackMatchesStaging,
    pilot: health.pilot,
    template: canaryTemplate
      ? {
          name: canaryTemplate.name,
          language: canaryTemplate.language,
          category: canaryTemplate.category,
          status: canaryTemplate.status,
          simpleSendSupported: canaryTemplate.simpleSendSupported === true,
        }
      : null,
  };
  persist(report);
  if (
    !report.preflight.databaseOk ||
    !report.preflight.metaConfigured ||
    !report.preflight.templatesConfigured ||
    report.preflight.qualityRating === "RED" ||
    !report.preflight.tokenValid ||
    !report.preflight.tokenRequiredScopesPresent
  )
    throw new Error("Preflight operacional do staging não está verde.");
  if (
    !canaryTemplate ||
    canaryTemplate.status !== "APPROVED" ||
    canaryTemplate.category !== expectedTemplateCategory ||
    canaryTemplate.simpleSendSupported !== true
  )
    throw new Error("O template escolhido para o canário não está aprovado ou não pertence ao contrato simples suportado.");
  if (!callback.callbackMatchesStaging) {
    report.limitation =
      "O callback efetivo da Meta aponta para produção. O staging pode provar aceite do transporte, mas não entrega/leitura/inbound isolados.";
    if (!transportOnly)
      throw new Error(
        "Canário completo bloqueado: callback Meta não aponta para o staging.",
      );
  } else if (!report.preflight.metaLive) {
    throw new Error(
      "Canário completo bloqueado: a integração Meta não está operacional mesmo com callback de staging.",
    );
  }

  const activeRuns = await d1(
    "SELECT id, label FROM pilot_runs WHERE status='active' LIMIT 2;",
  );
  if (activeRuns.length)
    throw new Error("Já existe uma rodada de piloto ativa no staging.");
  const dailyRuns = await d1(
    "SELECT COUNT(*) AS n FROM pilot_runs WHERE date(created_at, '-3 hours') = date('now', '-3 hours');",
  );
  if (Number(dailyRuns[0]?.n || 0) >= guard.maxRunsPerDay)
    throw new Error(
      `Limite remoto de ${guard.maxRunsPerDay} rodadas reais por dia atingido.`,
    );

  const tagName = `AUTOQA ${runId}`.slice(0, 80);
  const tags = (await api("/api/contacts/tags")).body.items;
  let tag = tags.find((item) => item.name === tagName);
  let tagCreated = false;
  if (!tag) {
    tag = (
      await api(
        "/api/contacts/tags",
        { method: "POST", body: JSON.stringify({ name: tagName }) },
        [201],
      )
    ).body;
    tagCreated = true;
  }
  report.artifacts.tag = { id: tag.id, name: tagName, created: tagCreated };
  persist(report);

  for (const [index, phone] of selectedRecipients.entries()) {
    let contact = await findContact(phone);
    let created = false;
    assertExistingMetaCanaryContact(contact, maskPhone(phone));
    if (!contact) {
      contact = (
        await api(
          "/api/contacts",
          {
            method: "POST",
            body: JSON.stringify({
              phone,
              name: `AUTOQA ${runId} ${index + 1}`,
              optInConfirmed: true,
            }),
          },
          [201],
        )
      ).body;
      created = true;
    }
    const hadAutoQaTag = Array.isArray(contact.tags) &&
      contact.tags.some((currentTag) => currentTag.id === tag.id);
    const contactArtifact = {
      id: contact.id,
      phone: maskPhone(phone),
      created,
      originalStatus: contact.status,
      // Registrado antes da mutação: um encerramento abrupto pode executar
      // cleanup com segurança mesmo se a chamada de tag não tiver terminado.
      autoQaTagAdded: !created && !hadAutoQaTag,
    };
    report.artifacts.contacts.push(contactArtifact);
    persist(report);
    await api("/api/contacts/bulk-tags", {
      method: "POST",
      body: JSON.stringify({
        ids: [contact.id],
        tagIds: [tag.id],
        mode: "add",
      }),
    });
    contactArtifact.tagApplied = true;
    persist(report);
  }

  pilotRunId = randomUUID();
  const pilotLabel = `${runId} ${transportOnly ? "transport" : "lifecycle"}`;
  await d1(
    `INSERT INTO pilot_runs (id,label,status,max_attempts) VALUES (${sqlString(pilotRunId)},${sqlString(pilotLabel)},'active',${sendCount});`,
  );
  report.artifacts.pilotRun = {
    id: pilotRunId,
    label: pilotLabel,
    maxAttempts: sendCount,
    closed: false,
  };
  localRuns.push({ runId, pilotRunId, startedAt: report.startedAt });
  writeFileSync(ledgerPath, `${JSON.stringify({ day: nowBrt.day, runs: localRuns }, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(ledgerPath, 0o600);

  const campaign = (
    await api(
      "/api/campaigns",
      {
        method: "POST",
        body: JSON.stringify({
          name: `[PILOT REAL] ${runId}`,
          template_name: templateName,
          template_language: templateLanguage,
          ...(variableMapping ? { variable_mapping: variableMapping } : {}),
        }),
      },
      [201],
    )
  ).body;
  report.artifacts.campaigns.push({
    id: campaign.id,
    created: true,
    template: templateName,
    language: templateLanguage,
    category: expectedTemplateCategory,
  });
  const selectedIds = report.artifacts.contacts
    .slice(0, sendCount)
    .map((contact) => contact.id);
  const audience = { contactIds: selectedIds };
  const precheck = (
    await api(`/api/campaigns/${campaign.id}/precheck`, {
      method: "POST",
      body: JSON.stringify(audience),
    })
  ).body;
  report.preflight.audience = precheck.totals;
  if (precheck.totals?.valid !== sendCount || precheck.totals?.skipped !== 0)
    throw new Error("Precheck da audiência não retornou todos os destinatários válidos.");

  const dispatch = await api(
    `/api/campaigns/${campaign.id}/dispatch`,
    { method: "POST", body: JSON.stringify(audience) },
    [202],
  );
  report.artifacts.campaigns[0].workflowId = dispatch.body.workflowId;
  report.timeline.push({
    at: new Date().toISOString(),
    event: "workflow_accepted",
    workflowId: dispatch.body.workflowId,
  });
  persist(report);

  const deadline = Date.now() + 180_000;
  let finalCampaign;
  let finalContacts;
  let lastFingerprint = "";
  while (Date.now() < deadline) {
    finalCampaign = (await api(`/api/campaigns/${campaign.id}`)).body;
    finalContacts = (
      await api(`/api/campaigns/${campaign.id}/contacts?page=1`)
    ).body;
    const fingerprint = JSON.stringify({
      status: finalCampaign.status,
      counts: finalCampaign.status_counts,
      contacts: finalContacts.items.map((item) => ({
        id: item.contact_id,
        status: item.status,
        hasMessageId: Boolean(item.message_id),
        errorCode: item.error_code || null,
      })),
    });
    if (fingerprint !== lastFingerprint) {
      lastFingerprint = fingerprint;
      report.timeline.push({
        at: new Date().toISOString(),
        event: "campaign_state",
        status: finalCampaign.status,
        counts: finalCampaign.status_counts,
        contacts: finalContacts.items.map((item) => ({
          contactId: item.contact_id,
          phone: maskPhone(item.phone),
          status: item.status,
          messageId: item.message_id || null,
          acceptanceStatus: item.acceptance_status || null,
          errorCode: item.error_code || null,
          errorDetail: item.error_detail
            ? redact(item.error_detail)
            : null,
        })),
      });
      persist(report);
    }
    if (
      shouldStopMetaCampaignPolling({
        transportOnly,
        campaignStatus: finalCampaign.status,
        contacts: finalContacts.items,
      })
    )
      break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
  }
  const observed = finalContacts?.items || [];
  const accepted = observed.filter(
    (item) =>
      ["sent", "delivered", "read"].includes(item.status) &&
      Boolean(item.message_id),
  );
  if (accepted.length !== sendCount)
    throw new Error(
      `Meta não aceitou todos os envios: ${accepted.length}/${sendCount}.`,
    );
  report.transport = {
    status: "passed",
    accepted: accepted.length,
    attempted: sendCount,
    messageIds: accepted.map((item) => item.message_id),
  };
  if (transportOnly) {
    report.status = "blocked";
    report.blockedBy = "dedicated_staging_meta_callback";
  } else {
    const lifecycleConfirmed = observed.every((item) =>
      ["delivered", "read"].includes(item.status),
    );
    if (!lifecycleConfirmed)
      throw new Error("Entrega/leitura ainda não foram confirmadas pelo webhook.");
    report.status = "passed";
  }
} catch (error) {
  canaryError = error;
  report.status = report.transport?.status === "passed" ? "blocked" : "failed";
  report.error = redact(error instanceof Error ? error.message : error);
} finally {
  if (pilotRunId) {
    try {
      await d1(
        `UPDATE pilot_runs SET status='closed', closed_at=datetime('now') WHERE id=${sqlString(pilotRunId)} AND status='active';`,
      );
      if (report.artifacts.pilotRun) report.artifacts.pilotRun.closed = true;
    } catch (error) {
      report.cleanup.errors.push(`rodada: ${redact(error.message)}`);
      report.status = "failed";
    }
  }
  await cleanup(report);
  if (report.cleanup.status !== "passed") report.status = "failed";
  report.finishedAt = new Date().toISOString();
  persist(report);
}

if (report.status !== "passed") {
  const detail =
    canaryError
      ? redact(canaryError.message)
      : report.status === "blocked"
        ? "transporte aprovado; ciclo completo não executado"
        : "falha não especificada";
  console.error(`Canário Meta ${report.status}: ${detail}. Relatório: ${resolve(reportDir, "meta-canary.json")}`);
  process.exit(1);
}
console.log(
  `Canário Meta aprovado: ${report.transport.accepted}/${report.transport.attempted} envios e ciclo de webhook confirmado.`,
);
