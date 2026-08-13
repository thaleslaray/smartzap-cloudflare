import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmodSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

if (!process.argv.includes("--rotate"))
  throw new Error(
    "Rotação não executada. Confirme explicitamente com --rotate.",
  );

const root = resolve(import.meta.dirname, "..");
const staging = process.argv.includes("--staging");
const target = staging ? "staging" : "production";
const config = staging
  ? "config/wrangler.staging.jsonc"
  : (process.env.SMARTZAP_PRODUCTION_WRANGLER_CONFIG || "wrangler.jsonc");
const privatePath = resolve(root, `.dev.vars.qa.${target}.local`);
const pendingPath = `${privatePath}.next`;
const key = randomBytes(32).toString("base64url");

writeFileSync(pendingPath, `QA_READONLY_API_KEY=${key}\n`, { mode: 0o600 });
chmodSync(pendingPath, 0o600);

const child = spawn(
  "npx",
  [
    "wrangler",
    "secret",
    "put",
    "QA_READONLY_API_KEY",
    "--config",
    config,
  ],
  {
    cwd: root,
    env: process.env,
    stdio: ["pipe", "inherit", "inherit"],
  },
);
child.stdin.end(`${key}\n`);

const exitCode = await new Promise((resolveExit) => {
  child.on("close", (code) => resolveExit(code ?? 1));
  child.on("error", () => resolveExit(1));
});

if (exitCode !== 0) {
  rmSync(pendingPath, { force: true });
  process.exit(exitCode);
}

renameSync(pendingPath, privatePath);
chmodSync(privatePath, 0o600);
console.log(
  `Credencial QA somente-leitura sincronizada em ${target} e guardada no arquivo privado; valor não exibido.`,
);
