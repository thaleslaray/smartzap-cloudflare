import { spawn } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

const root = resolve(import.meta.dirname, "..");

function readEnv(path) {
  const values = {};
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

const runtime = readEnv(resolve(root, ".dev.vars"));
const qaPath = resolve(root, ".dev.vars.qa.local");
const qa = readEnv(qaPath);

const generatedCredentials = {};
if (!process.env.QA_STAGING_MASTER_PASSWORD && !qa.QA_STAGING_MASTER_PASSWORD)
  generatedCredentials.QA_STAGING_MASTER_PASSWORD = randomBytes(32).toString("base64url");
if (!process.env.QA_STAGING_API_KEY && !qa.QA_STAGING_API_KEY)
  generatedCredentials.QA_STAGING_API_KEY = randomBytes(32).toString("base64url");
if (Object.keys(generatedCredentials).length) {
  const current = readFileSync(qaPath, "utf8").trimEnd();
  const appended = Object.entries(generatedCredentials)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  writeFileSync(qaPath, `${current}\n${appended}\n`, { mode: 0o600 });
  chmodSync(qaPath, 0o600);
  Object.assign(qa, generatedCredentials);
  console.log("Credenciais técnicas exclusivas foram geradas e guardadas no arquivo privado de QA.");
}
const recipients = (qa.QA_META_ALLOWLIST || "")
  .split(",")
  .map((phone) => phone.trim())
  .filter(Boolean);

if (
  recipients.length !== 4 ||
  new Set(recipients).size !== 4 ||
  recipients.some((phone) => !/^[1-9]\d{9,14}$/.test(phone))
)
  throw new Error("A allowlist privada de QA precisa conter quatro telefones E.164 distintos.");

const secrets = {
  MASTER_PASSWORD:
    process.env.QA_STAGING_MASTER_PASSWORD || qa.QA_STAGING_MASTER_PASSWORD,
  SMARTZAP_API_KEY:
    process.env.QA_STAGING_API_KEY || qa.QA_STAGING_API_KEY,
  META_APP_SECRET: runtime.META_APP_SECRET,
  META_VERIFY_TOKEN: runtime.META_VERIFY_TOKEN,
  WHATSAPP_TOKEN: runtime.WHATSAPP_TOKEN,
  PILOT_RECIPIENT_ALLOWLIST: recipients.join(","),
};

const missing = Object.entries(secrets)
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missing.length)
  throw new Error(
    `Segredos ausentes para o staging: ${missing.join(", ")}. `
      + "MASTER_PASSWORD e SMARTZAP_API_KEY precisam ser exclusivos de staging "
      + "em QA_STAGING_MASTER_PASSWORD e QA_STAGING_API_KEY.",
  );

const child = spawn(
  "npx",
  [
    "wrangler",
    "secret",
    "bulk",
    "--config",
    "config/wrangler.staging.jsonc",
  ],
  {
    cwd: root,
    env: process.env,
    stdio: ["pipe", "inherit", "inherit"],
  },
);
child.stdin.end(JSON.stringify(secrets));
const exitCode = await new Promise((resolveExit) => {
  child.on("close", (code) => resolveExit(code ?? 1));
  child.on("error", () => resolveExit(1));
});
if (exitCode !== 0) process.exit(exitCode);
console.log(`Staging atualizado com ${Object.keys(secrets).length} segredos; valores não exibidos.`);
