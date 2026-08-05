import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveMetaCallbackPreflight } from "./lib/meta-canary-preflight.mjs";
import { resolveQaStagingAuthHeaders } from "./lib/qa-staging-auth.mjs";

const root = resolve(import.meta.dirname, "..");
const baseUrl = String(
  process.env.QA_BASE_URL || "https://smartzap-cf-staging.thales2581.workers.dev",
).replace(/\/+$/, "");
const target = process.env.QA_META_CALLBACK_TARGET;
const apiKey = process.env.QA_API_KEY;
const authHeaders = resolveQaStagingAuthHeaders({
  mutationKey: process.env.QA_STAGING_MUTATION_API_KEY,
  apiKey,
});
const expected = {
  staging: "https://smartzap-cf-staging.thales2581.workers.dev/webhook",
  production: "https://smartzap-cf.thales2581.workers.dev/webhook",
};

if (new URL(baseUrl).hostname !== "smartzap-cf-staging.thales2581.workers.dev")
  throw new Error("A troca controlada só pode ser chamada pelo Worker de staging.");
if (!(target in expected))
  throw new Error("QA_META_CALLBACK_TARGET precisa ser staging ou production.");

const response = await fetch(`${baseUrl}/api/flows/meta/webhook-subscription`, {
  method: "POST",
  headers: {
    ...authHeaders,
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

const convergence = [];
let consecutiveMatches = 0;
for (let attempt = 1; attempt <= 45; attempt += 1) {
  const healthResponse = await fetch(`${baseUrl}/api/settings/health`, {
    headers: { ...authHeaders, "cache-control": "no-cache" },
  });
  const health = await healthResponse.json().catch(() => ({}));
  const observed = resolveMetaCallbackPreflight(
    health,
    expected[target].replace(/\/webhook$/, ""),
  );
  const matches =
    healthResponse.ok &&
    observed.callbackMatchesStaging;
  consecutiveMatches = matches ? consecutiveMatches + 1 : 0;
  convergence.push({
    attempt,
    status: healthResponse.status,
    phoneCallbackUrl: observed.phoneCallbackUrl,
    wabaCallbackUrl: observed.wabaCallbackUrl,
    effectiveCallbackUrl: observed.effectiveCallbackUrl,
    matches,
  });
  if (consecutiveMatches >= 3) break;
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
}
if (consecutiveMatches < 3) {
  throw new Error(
    `Callback Meta não convergiu para ${target} em três leituras consecutivas.`,
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
  convergence,
  changedAt: new Date().toISOString(),
};
writeFileSync(resolve(reportDir, "meta-callback-switch.json"), `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o600,
});
console.log(`Callback Meta direcionado temporariamente para ${target}.`);
