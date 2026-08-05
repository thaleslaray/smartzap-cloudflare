import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseUrl = String(
  process.env.QA_BASE_URL || "https://smartzap-cf-staging.thales2581.workers.dev",
).replace(/\/+$/, "");
const target = process.env.QA_META_CALLBACK_TARGET;
const apiKey = process.env.QA_API_KEY;
const expected = {
  staging: "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
  production: "https://smartzap-cf.thales2581.workers.dev/webhook",
};

if (new URL(baseUrl).hostname !== "smartzap-cf-staging.thales2581.workers.dev")
  throw new Error("A troca do callback global só pode ser chamada pelo staging.");
if (!apiKey) throw new Error("QA_API_KEY ausente.");
if (!(target in expected))
  throw new Error("QA_META_CALLBACK_TARGET precisa ser staging ou production.");

const response = await fetch(`${baseUrl}/api/flows/meta/webhook-subscription`, {
  method: "POST",
  headers: { "x-api-key": apiKey, "content-type": "application/json" },
  body: JSON.stringify({ qaCallbackTarget: target, qaCallbackScope: "app" }),
});
const body = await response.json().catch(() => ({}));
if (
  !response.ok ||
  body?.callbackUrl !== expected[target] ||
  body?.qaCallbackScope !== "app"
) {
  throw new Error(
    `Callback global não confirmou ${target}: HTTP ${response.status}, resposta=${JSON.stringify({
      callbackUrl: body?.callbackUrl,
      qaCallbackTarget: body?.qaCallbackTarget,
      qaCallbackScope: body?.qaCallbackScope,
      error: body?.error,
    })}`,
  );
}

const convergence = [];
let consecutiveMatches = 0;
for (let attempt = 1; attempt <= 45; attempt += 1) {
  const healthResponse = await fetch(`${baseUrl}/api/settings/health`, {
    headers: { "x-api-key": apiKey, "cache-control": "no-cache" },
  });
  const health = await healthResponse.json().catch(() => ({}));
  const observed = health?.meta?.appWebhookCallbackUrl ?? null;
  const matches = healthResponse.ok && observed === expected[target];
  consecutiveMatches = matches ? consecutiveMatches + 1 : 0;
  convergence.push({ attempt, status: healthResponse.status, appWebhookCallbackUrl: observed, matches });
  if (consecutiveMatches >= 3) break;
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
}
if (consecutiveMatches < 3)
  throw new Error(`Callback global não convergiu para ${target} em três leituras consecutivas.`);

const reportDir = resolve(root, process.env.QA_REPORT_DIR || "qa/reports/meta-app-callback");
mkdirSync(reportDir, { recursive: true });
writeFileSync(
  resolve(reportDir, "meta-app-callback-switch.json"),
  `${JSON.stringify({
    schemaVersion: 1,
    status: "passed",
    target,
    callbackUrl: body.callbackUrl,
    convergence,
    changedAt: new Date().toISOString(),
  }, null, 2)}\n`,
  { mode: 0o600 },
);
console.log(`Callback global da Meta direcionado temporariamente para ${target}.`);
