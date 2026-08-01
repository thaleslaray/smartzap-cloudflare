import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  throw new Error("A troca controlada só pode ser chamada pelo Worker de staging.");
if (!apiKey) throw new Error("QA_API_KEY ausente.");
if (!(target in expected))
  throw new Error("QA_META_CALLBACK_TARGET precisa ser staging ou production.");

const response = await fetch(`${baseUrl}/api/flows/meta/webhook-subscription`, {
  method: "POST",
  headers: {
    "x-api-key": apiKey,
    "content-type": "application/json",
  },
  body: JSON.stringify({ qaCallbackTarget: target }),
});
const body = await response.json().catch(() => ({}));
const callbackUrl = body?.callbackUrl;
if (!response.ok || callbackUrl !== expected[target]) {
  throw new Error(
    `Callback Meta não confirmou ${target}: HTTP ${response.status}, resposta=${JSON.stringify({
      ok: body?.ok,
      callbackUrl,
      qaCallbackTarget: body?.qaCallbackTarget,
      error: body?.error,
    })}`,
  );
}

const reportDir = resolve(
  root,
  process.env.QA_REPORT_DIR || "qa/reports/meta-callback",
);
mkdirSync(reportDir, { recursive: true });
const report = {
  schemaVersion: 1,
  status: "passed",
  target,
  callbackUrl,
  changedAt: new Date().toISOString(),
};
writeFileSync(resolve(reportDir, "meta-callback-switch.json"), `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o600,
});
console.log(`Callback Meta direcionado temporariamente para ${target}.`);
