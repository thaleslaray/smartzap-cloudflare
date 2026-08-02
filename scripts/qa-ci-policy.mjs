import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const errors = [];

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const packageJson = JSON.parse(read("package.json"));
for (const scriptName of ["test", "test:watch"]) {
  const command = packageJson.scripts?.[scriptName] ?? "";
  if (command.includes("--no-isolate")) {
    errors.push(
      `package.json#${scriptName} não pode desativar o isolamento do Vitest`,
    );
  }
}

const workflowsDir = resolve(root, ".github/workflows");
for (const fileName of readdirSync(workflowsDir).filter((name) =>
  name.endsWith(".yml") || name.endsWith(".yaml"),
)) {
  const source = read(`.github/workflows/${fileName}`);
  if (source.includes("--no-isolate")) {
    errors.push(
      `.github/workflows/${fileName} não pode desativar o isolamento do Vitest`,
    );
  }
}

const deployWorkflow = read(".github/workflows/deploy.yml");
if (
  !deployWorkflow.includes("recovery_deployment:") ||
  !deployWorkflow.includes("MONITOR_RECOVERY_MODE:") ||
  !deployWorkflow.includes(
    "Aguardar health e shell de produção após publicação",
  )
) {
  errors.push(
    "o deploy precisa manter uma recuperação explícita e validar produção após publicar",
  );
}
const monitorWorkflow = read(".github/workflows/qa-production-monitor.yml");
if (
  !monitorWorkflow.includes("node --input-type=module - <<'NODE'") ||
  !monitorWorkflow.includes(
    'import { mkdir, writeFile } from "node:fs/promises";',
  ) ||
  monitorWorkflow.includes(
    'const { mkdir, writeFile } = require("node:fs/promises");',
  )
) {
  errors.push(
    "o observador externo precisa executar como ESM explícito, sem misturar require e await no topo",
  );
}
const monitorConfig = JSON.parse(read("config/wrangler.monitor.jsonc"));
if (
  !Array.isArray(monitorConfig.compatibility_flags) ||
  !monitorConfig.compatibility_flags.includes("global_fetch_strictly_public")
) {
  errors.push(
    "o observador Cloudflare precisa atravessar a entrada pública ao consultar Workers da mesma zona",
  );
}

const playwrightConfig = read("playwright.config.ts");
if (!playwrightConfig.includes("reuseExistingServer: false")) {
  errors.push(
    "playwright.config.ts precisa iniciar o servidor da própria execução",
  );
}
if (!playwrightConfig.includes("CF_INSPECTOR_PORT")) {
  errors.push(
    "playwright.config.ts precisa encaminhar a porta exclusiva do inspetor",
  );
}
if (!playwrightConfig.includes("QA_PLAYWRIGHT_REPORT_DIR")) {
  errors.push(
    "playwright.config.ts precisa preservar relatórios separados por projeto",
  );
}
if (read("app/index.css").includes("fonts.googleapis.com")) {
  errors.push(
    "a interface não pode depender de fonte remota para renderizar ou concluir navegação",
  );
}
const viteConfig = read("vite.config.ts");
if (
  !viteConfig.includes("QA_RUN_ID") ||
  !viteConfig.includes("QA_E2E_PROJECT") ||
  !viteConfig.includes("config: isE2E ? { name: e2eWorkerName }")
) {
  errors.push(
    "vite.config.ts precisa atribuir um nome de Worker exclusivo a cada runtime E2E",
  );
}

const e2eRunner = read("scripts/qa-e2e.mjs");
if (
  !e2eRunner.includes("createServer") ||
  !e2eRunner.includes("E2E_PORT") ||
  !e2eRunner.includes("CF_INSPECTOR_PORT") ||
  !e2eRunner.includes("assertPlaywrightReportClean") ||
  !e2eRunner.includes("QA_PLAYWRIGHT_REPORT_DIR")
) {
  errors.push(
    "o runner E2E precisa isolar portas/relatórios e reprovar qualquer flake",
  );
}
const cleanup = read("scripts/qa-cleanup.mjs");
if (
  !cleanup.includes("stateEntry.startsWith(`${currentRun}-`)") ||
  !cleanup.includes("Caminho de cleanup fora de qa/.state")
) {
  errors.push(
    "o cleanup automatizado precisa remover somente o estado da execução atual",
  );
}
for (const mutatingScript of [
  "scripts/qa-ai-eval.mjs",
  "scripts/qa-ai-search-probe.mjs",
  "scripts/qa-meta-canary.mjs",
]) {
  const source = read(mutatingScript);
  if (
    source.includes("QA_ALLOW_PRODUCTION") ||
    !source.includes("smartzap-cf-staging.thales2581.workers.dev")
  ) {
    errors.push(
      `${mutatingScript} não pode oferecer escape mutante para produção`,
    );
  }
}
const stagingSecretSync = read("scripts/qa-sync-staging-secrets.mjs");
if (
  stagingSecretSync.includes("runtime.MASTER_PASSWORD") ||
  stagingSecretSync.includes("runtime.SMARTZAP_API_KEY") ||
  !stagingSecretSync.includes("QA_STAGING_MASTER_PASSWORD") ||
  !stagingSecretSync.includes("QA_STAGING_API_KEY")
) {
  errors.push(
    "staging precisa usar senha e chave de API exclusivas, sem herdar credenciais locais",
  );
}
for (const [workflow, minimumOccurrences] of [
  [".github/workflows/deploy.yml", 1],
  [".github/workflows/qa-nightly.yml", 2],
  [".github/workflows/qa-weekly.yml", 1],
]) {
  const source = read(workflow);
  const occurrences =
    source.match(/group:\s*smartzap-staging-mutating/g)?.length ?? 0;
  if (occurrences < minimumOccurrences) {
    errors.push(
      `${workflow} precisa serializar toda mutação do staging no grupo compartilhado`,
    );
  }
}
if (
  !cleanup.includes("SELECT id FROM tags WHERE name LIKE 'AUTOQA %'") ||
  !cleanup.includes("SELECT COUNT(*) AS n FROM tags WHERE name LIKE 'AUTOQA %'")
) {
  errors.push(
    "o sweep de staging precisa descobrir e comprovar a remoção de tags AUTOQA órfãs",
  );
}
const metaCanary = read("scripts/qa-meta-canary.mjs");
const contactJournal = metaCanary.indexOf("const contactArtifact =");
const journalPersist = metaCanary.indexOf("persist(report);", contactJournal);
const tagMutation = metaCanary.indexOf(
  'await api("/api/contacts/bulk-tags"',
  contactJournal,
);
if (
  !metaCanary.includes("`AUTOQA ${runId}`") ||
  contactJournal < 0 ||
  journalPersist < contactJournal ||
  tagMutation < journalPersist
) {
  errors.push(
    "o canário Meta precisa usar tag isolada por run_id e persistir o journal antes da mutação",
  );
}

if (errors.length) {
  for (const error of errors) console.error(`QA_CI_POLICY_ERROR ${error}`);
  process.exit(1);
}

console.log(
  "Política de CI aprovada: Vitest isolado e portas E2E exclusivas por execução.",
);
