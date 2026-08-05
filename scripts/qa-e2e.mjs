import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { assertPlaywrightReportClean } from "./lib/playwright-report.mjs";

const root = resolve(import.meta.dirname, "..");
const mode = process.argv[2] || "p0";
const a11yTestTitle =
  "todas as rotas estáticas e dinâmicas determinísticas não têm violações WCAG A/AA detectáveis";
const responsiveTestTitle =
  "todas as rotas operacionais preservam a largura em";
const inboxTestTitle = "Inbox ";
const coreTestTitleExclusions =
  `(?:${a11yTestTitle}|${responsiveTestTitle}|${inboxTestTitle})`;
const runId = (
  process.env.QA_RUN_ID || `AUTOQA_${Date.now()}_${randomUUID().slice(0, 8)}`
).replace(/[^A-Za-z0-9_-]/g, "_");
const stateRoot = resolve(root, "qa/.state");
mkdirSync(stateRoot, { recursive: true });
const reportRoot = resolve(
  root,
  process.env.QA_REPORT_DIR || "test-results",
);
const nonSmokeSpecs = readdirSync(resolve(root, "e2e"))
  .filter((file) => file.endsWith(".spec.ts") && file !== "smoke.spec.ts")
  .map((file) => `e2e/${file}`)
  .sort();

const matrix = {
  p0: [
    // A suíte compartilha o mesmo Worker local, mas os grupos que percorrem
    // muitas rotas, telas ou estados são deliberadamente executados em
    // processos de navegador separados. Isso evita que o WebKit acumule
    // estado após os demais cenários e transforme uma queda de conexão em um
    // falso flake.
    {
      label: "chromium-core",
      project: "chromium",
      files: ["e2e/smoke.spec.ts"],
      grepInvert: coreTestTitleExclusions,
    },
    {
      label: "chromium-a11y",
      project: "chromium",
      files: ["e2e/smoke.spec.ts"],
      grep: a11yTestTitle,
    },
    {
      label: "chromium-responsive",
      project: "chromium",
      files: ["e2e/smoke.spec.ts"],
      grep: responsiveTestTitle,
    },
    {
      label: "chromium-inbox",
      project: "chromium",
      files: ["e2e/smoke.spec.ts"],
      grep: inboxTestTitle,
    },
    {
      label: "webkit-core",
      project: "webkit",
      files: ["e2e/smoke.spec.ts"],
      grepInvert: coreTestTitleExclusions,
    },
    {
      label: "webkit-a11y",
      project: "webkit",
      files: ["e2e/smoke.spec.ts"],
      grep: a11yTestTitle,
    },
    {
      label: "webkit-responsive",
      project: "webkit",
      files: ["e2e/smoke.spec.ts"],
      grep: responsiveTestTitle,
    },
    {
      label: "webkit-inbox",
      project: "webkit",
      files: ["e2e/smoke.spec.ts"],
      grep: inboxTestTitle,
    },
  ],
  matrix: [
    { project: "chromium", files: [] },
    { project: "firefox", files: [] },
    // O WebKit pode deixar uma navegação pendente depois de dezenas de
    // páginas instrumentadas pelo axe. Isolamos os mesmos grupos do P0 para
    // que a matriz continue completa sem compartilhar um único processo de
    // navegador por toda a suíte.
    { label: "webkit-features", project: "webkit", files: nonSmokeSpecs },
    {
      label: "webkit-core",
      project: "webkit",
      files: ["e2e/smoke.spec.ts"],
      grepInvert: coreTestTitleExclusions,
    },
    {
      label: "webkit-a11y",
      project: "webkit",
      files: ["e2e/smoke.spec.ts"],
      grep: a11yTestTitle,
    },
    {
      label: "webkit-responsive",
      project: "webkit",
      files: ["e2e/smoke.spec.ts"],
      grep: responsiveTestTitle,
    },
    {
      label: "webkit-inbox",
      project: "webkit",
      files: ["e2e/smoke.spec.ts"],
      grep: inboxTestTitle,
    },
  ],
  visual: [
    { project: "chromium", files: ["e2e/qa-visual.spec.ts"] },
  ],
};

if (!matrix[mode]) {
  console.error(`Modo E2E inválido: ${mode}`);
  process.exit(2);
}

const requestedProjects = new Set(
  (process.env.QA_E2E_PROJECTS || "")
    .split(",")
    .map((project) => project.trim())
    .filter(Boolean),
);
function explicitGrepMatchesItem(item) {
  const explicitGrep = process.env.QA_E2E_GREP;
  if (!explicitGrep) return true;
  if (item.grep && !new RegExp(item.grep).test(explicitGrep)) return false;
  if (item.grepInvert && new RegExp(item.grepInvert).test(explicitGrep)) return false;
  if (item.files.length) {
    const source = item.files
      .map((file) => readFileSync(resolve(root, file), "utf8"))
      .join("\n");
    try {
      if (!new RegExp(explicitGrep).test(source)) return false;
    } catch {
      if (!source.includes(explicitGrep)) return false;
    }
  }
  return true;
}

const selectedMatrix = matrix[mode].filter(
  (item) =>
    (!requestedProjects.size || requestedProjects.has(item.project)) &&
    explicitGrepMatchesItem(item),
);
if (!selectedMatrix.length) {
  console.error(
    `Nenhum projeto selecionado para ${mode}: ${[...requestedProjects].join(", ")}`,
  );
  process.exit(2);
}

function optionalPlaywrightArgs(item) {
  const args = [];
  if (process.env.QA_E2E_GREP) {
    args.push("--grep", process.env.QA_E2E_GREP);
  } else if (item.grep) {
    args.push("--grep", item.grep);
  }
  if (!process.env.QA_E2E_GREP && item.grepInvert) {
    args.push("--grep-invert", item.grepInvert);
  }
  for (const [envName, cliName] of [
    ["QA_E2E_REPEAT_EACH", "--repeat-each"],
    ["QA_E2E_RETRIES", "--retries"],
  ]) {
    if (!process.env[envName]) continue;
    const value = Number(process.env[envName]);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${envName} precisa ser um inteiro não negativo`);
    }
    args.push(cliName, String(value));
  }
  return args;
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

for (const item of selectedMatrix) {
  const runLabel = item.label || item.project;
  const statePath = resolve(
    stateRoot,
    `${runId}-${mode}-${runLabel}`,
  );
  if (!statePath.startsWith(`${stateRoot}/`))
    throw new Error("Caminho de estado E2E fora de qa/.state");
  rmSync(statePath, { recursive: true, force: true });
  mkdirSync(statePath, { recursive: true });
  const stateRelative = relative(root, statePath);
  const projectReportDir = resolve(
    reportRoot,
    "playwright",
    runLabel,
  );
  if (!projectReportDir.startsWith(`${reportRoot}/`))
    throw new Error("Caminho de relatório E2E fora do diretório da execução");
  rmSync(projectReportDir, { recursive: true, force: true });
  mkdirSync(projectReportDir, { recursive: true });
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
    QA_PLAYWRIGHT_REPORT_DIR: projectReportDir,
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
        ...optionalPlaywrightArgs(item),
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
    const playwrightReport = JSON.parse(
      readFileSync(
        resolve(projectReportDir, "playwright-results.json"),
        "utf8",
      ),
    );
    const summary = assertPlaywrightReportClean(
      playwrightReport,
      item.project,
    );
    console.log(
      `QA_PLAYWRIGHT_SUMMARY ${runLabel} expected=${summary.expected} skipped=${summary.skipped} flaky=${summary.flaky} unexpected=${summary.unexpected}`,
    );
  } finally {
    rmSync(statePath, { recursive: true, force: true });
  }
}
