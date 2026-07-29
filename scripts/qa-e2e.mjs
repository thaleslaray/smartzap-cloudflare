import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";

const root = resolve(import.meta.dirname, "..");
const mode = process.argv[2] || "p0";
const runId = (
  process.env.QA_RUN_ID || `AUTOQA_${Date.now()}_${randomUUID().slice(0, 8)}`
).replace(/[^A-Za-z0-9_-]/g, "_");
const stateRoot = resolve(root, "qa/.state");
mkdirSync(stateRoot, { recursive: true });

const matrix = {
  p0: [
    { project: "chromium", files: ["e2e/smoke.spec.ts"] },
    { project: "webkit", files: ["e2e/smoke.spec.ts"] },
  ],
  matrix: [
    { project: "chromium", files: [] },
    { project: "firefox", files: [] },
    { project: "webkit", files: [] },
  ],
  visual: [
    { project: "chromium", files: ["e2e/qa-visual.spec.ts"] },
  ],
};

if (!matrix[mode]) {
  console.error(`Modo E2E inválido: ${mode}`);
  process.exit(2);
}

function run(executable, args, env, options = {}) {
  return new Promise((resolveExit) => {
    let workerErrorDetected = false;
    let scanTail = "";
    const child = spawn(executable, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ["inherit", "pipe", "pipe"],
    });

    function forward(chunk, stream) {
      stream.write(chunk);
      if (!options.detectWorkerErrors || workerErrorDetected) return;
      scanTail = `${scanTail}${String(chunk)}`.slice(-512);
      if (scanTail.includes('"level":"error"')) workerErrorDetected = true;
    }

    child.stdout.on("data", (chunk) => forward(chunk, process.stdout));
    child.stderr.on("data", (chunk) => forward(chunk, process.stderr));
    child.on("close", (code) =>
      resolveExit({ exitCode: code ?? 1, workerErrorDetected }),
    );
    child.on("error", () =>
      resolveExit({ exitCode: 1, workerErrorDetected }),
    );
  });
}

function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Não foi possível reservar uma porta E2E"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(port);
      });
    });
  });
}

for (const item of matrix[mode]) {
  const statePath = resolve(
    stateRoot,
    `${runId}-${mode}-${item.project}`,
  );
  if (!statePath.startsWith(`${stateRoot}/`))
    throw new Error("Caminho de estado E2E fora de qa/.state");
  rmSync(statePath, { recursive: true, force: true });
  mkdirSync(statePath, { recursive: true });
  const stateRelative = relative(root, statePath);
  const port = await availablePort();
  let inspectorPort = await availablePort();
  while (inspectorPort === port) inspectorPort = await availablePort();
  const env = {
    E2E: "1",
    E2E_PORT: String(port),
    CF_INSPECTOR_PORT: String(inspectorPort),
    QA_RUN_ID: runId,
    QA_E2E_STATE: stateRelative,
    QA_E2E_PROJECT: item.project,
  };
  try {
    let result = await run(
      "npx",
      [
        "wrangler",
        "d1",
        "migrations",
        "apply",
        "smartzap-test",
        "--config",
        "config/wrangler.test.jsonc",
        "--local",
        "--persist-to",
        stateRelative,
      ],
      env,
    );
    if (result.exitCode !== 0)
      throw new Error(`migrações D1 falharam (${result.exitCode})`);
    result = await run(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        "smartzap-test",
        "--config",
        "config/wrangler.test.jsonc",
        "--local",
        "--persist-to",
        stateRelative,
        "--file",
        "scripts/e2e-seed.sql",
      ],
      env,
    );
    if (result.exitCode !== 0)
      throw new Error(`seed D1 falhou (${result.exitCode})`);
    result = await run(
      "npx",
      [
        "playwright",
        "test",
        ...item.files,
        "--project",
        item.project,
      ],
      env,
      { detectWorkerErrors: true },
    );
    if (result.exitCode !== 0)
      throw new Error(
        `Playwright ${item.project} falhou (${result.exitCode})`,
      );
    if (result.workerErrorDetected)
      throw new Error(
        `Playwright ${item.project} registrou erro interno no Worker`,
      );
  } finally {
    rmSync(statePath, { recursive: true, force: true });
  }
}
