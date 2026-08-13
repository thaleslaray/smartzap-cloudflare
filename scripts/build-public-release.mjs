import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const argumentsWithoutFlags = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const output = resolve(argumentsWithoutFlags[0] || join(root, "tmp", "public-release"));
const publicRepository = "https://github.com/thaleslaray/smartzap-cloudflare";
const publicProvisionerOrigin = "https://instalar.escoladeautomacao.com/smartzap";
const publicOriginSentinel = "__SMARTZAP_PUBLIC_PROVISIONER_ORIGIN__";

const rootFiles = [
  ".gitleaks.toml",
  ".dev.vars.example",
  ".gitignore",
  "LICENSE",
  "CHANGELOG.md",
  "OAUTH_PRIVACY.md",
  "PROVISIONER_TERMS.md",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "TRADEMARK_POLICY.md",
  "UPDATE_POLICY.md",
  "index.html",
  "package.json",
  "package-lock.json",
  "playwright.config.ts",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "vitest.node.config.ts",
  "worker-configuration.d.ts",
  "wrangler.jsonc",
];

const directories = [
  "app",
  "DS",
  "e2e",
  "fork-migrations",
  "migrations",
  "provisioner",
  "public",
  "shared",
  "src",
  "tests",
  "tests-node",
];

const extraFiles = [
  "config/wrangler.test.jsonc",
  ".github/workflows/upstream-sync.yml",
  "docs/FORK_INSTALLATION.md",
  "docs/MIGRATIONS_AND_ROLLBACK.md",
  "docs/MIGRATE_QUICK_TO_FORK.md",
  "docs/UPGRADING.md",
  "docs/GUIA-PROVISIONADOR-CLOUDFLARE-POR-PRODUTO.md",
  "docs/index.html",
  "docs/install",
  "qa/ai-dataset.json",
  "qa/ai-knowledge.md",
  "qa/miniapps-functional-matrix.json",
  "scripts/e2e-seed.sql",
  "scripts/fork-deploy.mjs",
  "scripts/verify-github-fork.mjs",
  "scripts/qa-fork-update-scenarios.mjs",
  "scripts/build-release-assets.mjs",
  "scripts/verify-release-assets.mjs",
  "scripts/workers-build-deploy.mjs",
  "scripts/generate-update-pr-body.mjs",
  "scripts/fork-rollback.mjs",
  "scripts/lib",
  "scripts/prepare-dev.mjs",
  "scripts/qa-ai-logic.d.mts",
  "scripts/qa-ai-logic.mjs",
  "scripts/qa-secret-scan.mjs",
  "scripts/sanitize-build.mjs",
  "scripts/validate-release-metadata.mjs",
  "release/migrations.json",
  "release/SMARTZAP_RELEASE_SIGNING_KEY.pub",
  "release/allowed_signers",
  "scripts/verify-release-tag.mjs",
];

const excludedNames = new Set([
  ".DS_Store",
  ".dev.vars",
  ".env",
  "node_modules",
  "dist",
  ".wrangler",
  "test-results",
  "tmp",
  "playwright-report",
  "blob-report",
  "build-public-release.mjs",
]);

const replacements = new Map([
  ["https://smartzap-cf-staging.thales2581.workers.dev", "https://smartzap-staging.example.workers.dev"],
  ["https://smartzap-cf.thales2581.workers.dev", "https://smartzap.example.workers.dev"],
  ["smartzap-cf-staging.thales2581.workers.dev", "smartzap-staging.example.workers.dev"],
  ["smartzap-cf.thales2581.workers.dev", "smartzap.example.workers.dev"],
  ["smartzap.laray.com.br", "smartzap.example.com"],
  ["1667768743393481", "1000000000000001"],
  ["344941004274813", "100000000000002"],
  ["708497467651098", "100000000000003"],
  ["1582832293423412", "1000000000000004"],
  ["177462062115446", "100000000000005"],
  ["159711717233997", "100000000000006"],
  ["5521982219966", "5511999999999"],
  ["5511982219966", "5511999999999"],
  ["55 (21) 98221-9966", "55 (11) 99999-9999"],
  ["+5521 *****-9966", "+5511 *****-9999"],
  ["5521923674524", "5511988888888"],
  ["5511936238242", "5511977777777"],
  ["5521998119285", "5511966666666"],
  ["thales@laray.com.br", "owner@example.com"],
  ["test-whatsapp-token", "test-token"],
  ["tok-secret-binding", "tok-test"],
  ["thales2581", "example"],
  ["Thales Laray", "SmartZap User"],
  ["Thales", "SmartZap User"],
]);

const forbidden = [
  ...replacements.keys(),
  "/Users/thaleslaray",
  "thaleslaray/Projetos",
];

const textExtensions = new Set([
  "",
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".md",
  ".mjs",
  ".mts",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yml",
  ".yaml",
]);

const normalizedCodeExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".mjs",
  ".mts",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".xml",
  ".yml",
  ".yaml",
]);

function ignored(source) {
  return source.split(sep).some((part) => excludedNames.has(part));
}

function copyEntry(sourceRelative) {
  const source = join(root, sourceRelative);
  if (!existsSync(source)) throw new Error(`Arquivo obrigatório ausente: ${sourceRelative}`);
  const target = join(output, sourceRelative);
  mkdirSync(dirname(target), { recursive: true });
  if (statSync(source).isDirectory()) {
    cpSync(source, target, {
      recursive: true,
      filter: (item) => !ignored(relative(root, item)),
    });
  } else {
    cpSync(source, target);
  }
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (excludedNames.has(entry.name) || entry.name === ".git") continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function sanitizeTextFiles() {
  for (const file of walk(output)) {
    const extension = extname(file).toLowerCase();
    if (!textExtensions.has(extension)) continue;
    let content = readFileSync(file, "utf8");
    content = content.split(publicProvisionerOrigin).join(publicOriginSentinel);
    for (const [from, to] of replacements) content = content.split(from).join(to);
    content = content.split(publicOriginSentinel).join(publicProvisionerOrigin);
    if (normalizedCodeExtensions.has(extension)) {
      content = content.replace(/[ \t]+$/gm, "").replace(/\s*$/, "\n");
    }
    writeFileSync(file, content);
  }
}

function createPublicPackage() {
  // O repositório interno preserva o histórico para auditoria e geração da
  // baseline. Um fork novo recebe somente o schema final; upgrades futuros
  // vivem exclusivamente em fork-migrations/ e release/migrations.json.
  const publicMigrationsDirectory = join(output, "migrations");
  rmSync(publicMigrationsDirectory, { recursive: true, force: true });
  mkdirSync(publicMigrationsDirectory, { recursive: true });
  cpSync(
    join(output, "provisioner", "baseline", "0001_fresh_install.sql"),
    join(publicMigrationsDirectory, "0001_fresh_install.sql"),
  );

  const packagePath = join(output, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  packageJson.name = "smartzap-cloudflare";
  packageJson.description = "SmartZap instalável em uma conta Cloudflare própria";
  packageJson.repository = { type: "git", url: publicRepository };
  packageJson.homepage = `${publicRepository}#readme`;
  packageJson.scripts = {
    predev: packageJson.scripts.predev,
    dev: packageJson.scripts.dev,
    build: packageJson.scripts.build,
    postbuild: packageJson.scripts.postbuild,
    "db:migrate:local": packageJson.scripts["db:migrate:local"],
    "db:migrate:e2e": packageJson.scripts["db:migrate:e2e"],
    "db:seed:e2e": packageJson.scripts["db:seed:e2e"],
    test: packageJson.scripts.test,
    "test:workers": packageJson.scripts["test:workers"],
    "test:workers:1": packageJson.scripts["test:workers:1"],
    "test:workers:2": packageJson.scripts["test:workers:2"],
    "test:node": packageJson.scripts["test:node"],
    "test:watch": packageJson.scripts["test:watch"],
    types: packageJson.scripts.types,
    e2e: packageJson.scripts.e2e,
    "fork:deploy": packageJson.scripts["fork:deploy"],
    "fork:preview": packageJson.scripts["fork:preview"],
    "fork:branch": packageJson.scripts["fork:branch"],
    "fork:verify": packageJson.scripts["fork:verify"],
    "qa:fork:updates": packageJson.scripts["qa:fork:updates"],
    "fork:rollback": packageJson.scripts["fork:rollback"],
    "release:validate": packageJson.scripts["release:validate"],
    "release:verify-tag": packageJson.scripts["release:verify-tag"],
    "release:assets": packageJson.scripts["release:assets"],
    "release:verify-assets": packageJson.scripts["release:verify-assets"],
    "release:scan": "node scripts/qa-secret-scan.mjs --history",
    "provisioner:check": packageJson.scripts["provisioner:check"],
  };
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const lockPath = join(output, "package-lock.json");
  const lockJson = JSON.parse(readFileSync(lockPath, "utf8"));
  lockJson.name = packageJson.name;
  if (lockJson.packages?.[""]) lockJson.packages[""].name = packageJson.name;
  writeFileSync(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`);

  const wranglerPath = join(output, "wrangler.jsonc");
  const wrangler = readFileSync(wranglerPath, "utf8")
    .replace('"name": "smartzap-cf"', '"name": "smartzap"')
    .replace('"database_name": "smartzap"', '"database_name": "smartzap-db"')
    .replace(
      '  // O plugin Vite atual ainda exige um nome padrão; o Deploy to Cloudflare\n  // permite personalizá-lo e o módulo permanece desligado até o usuário ativar IA.\n  "ai_search_namespaces": [{ "binding": "AI_SEARCH", "namespace": "smartzap" }],\n',
      "",
    )
    .replaceAll('"queue": "meta-webhooks"', '"queue": "smartzap-meta-webhooks"')
    .replaceAll('"queue": "meta-webhooks-dlq"', '"queue": "smartzap-meta-webhooks-dlq"')
    .replaceAll('"queue": "inbox-automation"', '"queue": "smartzap-inbox-automation"')
    .replaceAll('"queue": "inbox-automation-dlq"', '"queue": "smartzap-inbox-automation-dlq"')
    .replaceAll('"queue": "meta-conversions"', '"queue": "smartzap-meta-conversions"')
    .replaceAll('"queue": "meta-conversions-dlq"', '"queue": "smartzap-meta-conversions-dlq"')
    .replaceAll('"dead_letter_queue": "meta-webhooks-dlq"', '"dead_letter_queue": "smartzap-meta-webhooks-dlq"')
    .replaceAll('"dead_letter_queue": "inbox-automation-dlq"', '"dead_letter_queue": "smartzap-inbox-automation-dlq"')
    .replace('    "AUTOMATION_QUEUE_NAME": "inbox-automation",\n', "")
    .replace('    "CAPI_QUEUE_NAME": "meta-conversions"\n', "")
    .replace('    "INBOX_AUTOMATION_ENABLED": "false",\n  },', '    "INBOX_AUTOMATION_ENABLED": "false"\n  },');
  writeFileSync(wranglerPath, wrangler);

  // Estes valores existem apenas para desenvolvimento local. No fork-first,
  // entram como Build secrets; na instalação rápida, o provisionador OAuth os
  // cria diretamente como secrets do Worker e descarta os valores após o uso.
  writeFileSync(
    join(output, ".dev.vars.example"),
    [
      "# Desenvolvimento local apenas. Nunca versione estes valores.",
      "MASTER_PASSWORD=",
      "SMARTZAP_VAULT_KEY=",
      "",
    ].join("\n"),
  );

  const readmePath = join(output, "README.md");
  const readme = readFileSync(readmePath, "utf8")
    .replace(
      /> O botão só é considerado instalação simples[^\n]*\n/,
      "> Esta é uma candidata pública. Consulte a release mais recente para ver a matriz de instalações físicas já homologada.\n",
    )
    .replace(/\nO catálogo de jornadas fica em[^\n]*\n/, "\n");
  writeFileSync(readmePath, readme);
}

function assertSanitized() {
  const findings = [];
  for (const file of walk(output)) {
    if (!textExtensions.has(extname(file).toLowerCase())) continue;
    const content = readFileSync(file, "utf8").split(publicProvisionerOrigin).join("[ORIGEM_PUBLICA_PERMITIDA]");
    for (const term of forbidden) {
      if (content.includes(term)) findings.push(`${relative(output, file)}: ${term}`);
    }
  }
  if (findings.length > 0) {
    throw new Error(`A distribuição ainda contém identificadores privados:\n${findings.join("\n")}`);
  }
}

function assertPublicInstallerContract() {
  const secretExample = readFileSync(join(output, ".dev.vars.example"), "utf8");
  const secretNames = secretExample
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=", 1)[0]);
  const expectedSecrets = ["MASTER_PASSWORD", "SMARTZAP_VAULT_KEY"];
  if (JSON.stringify(secretNames) !== JSON.stringify(expectedSecrets)) {
    throw new Error(`O ambiente local deve declarar somente ${expectedSecrets.join(" e ")}.`);
  }

  const wrangler = readFileSync(join(output, "wrangler.jsonc"), "utf8");
  if (wrangler.includes('"ai_search_namespaces"')) {
    throw new Error("AI Search não pode bloquear o núcleo da instalação OAuth.");
  }

  const packageJson = JSON.parse(readFileSync(join(output, "package.json"), "utf8"));
  if (packageJson.scripts?.deploy || packageJson.scripts?.["deploy:prepare"] || packageJson.scripts?.["db:migrate:remote"]) {
    throw new Error("A distribuição pública não pode oferecer o pipeline manual legado inseguro.");
  }
  if (
    packageJson.scripts?.["fork:deploy"] !== "node scripts/fork-deploy.mjs"
    || packageJson.scripts?.["fork:preview"] !== "node scripts/fork-deploy.mjs --staging"
    || packageJson.scripts?.["fork:branch"] !== "node scripts/workers-build-deploy.mjs"
    || packageJson.scripts?.["fork:verify"] !== "node scripts/verify-github-fork.mjs"
    || packageJson.scripts?.["qa:fork:updates"] !== "node scripts/qa-fork-update-scenarios.mjs"
    || packageJson.scripts?.["fork:rollback"] !== "node scripts/fork-rollback.mjs"
  ) {
    throw new Error("O bootstrap fork-first seguro está ausente da distribuição pública.");
  }

  for (const entry of ["README.md", "docs/install/index.html", "app/pages/Installer.tsx"]) {
    const content = readFileSync(join(output, entry), "utf8");
    if (!content.includes(publicProvisionerOrigin)) {
      throw new Error(`${entry} não aponta para o provisionador OAuth público.`);
    }
    if (content.includes("deploy.workers.cloudflare.com")) throw new Error(`${entry} confunde o Deploy Button com um fork verdadeiro.`);
  }

  for (const entry of ["UPDATE_POLICY.md", "SUPPORT.md", "SECURITY.md", "CHANGELOG.md", "OAUTH_PRIVACY.md", "TRADEMARK_POLICY.md", "docs/FORK_INSTALLATION.md", "docs/MIGRATIONS_AND_ROLLBACK.md", ".github/workflows/upstream-sync.yml", "release/migrations.json", "release/SMARTZAP_RELEASE_SIGNING_KEY.pub", "release/allowed_signers", "scripts/fork-deploy.mjs", "scripts/workers-build-deploy.mjs", "scripts/generate-update-pr-body.mjs", "scripts/verify-github-fork.mjs", "scripts/qa-fork-update-scenarios.mjs", "scripts/fork-rollback.mjs", "scripts/lib/artifact-safety.mjs", "scripts/lib/fork-bootstrap.mjs", "scripts/lib/github-fork.mjs", "scripts/lib/fork-migrations.mjs", "scripts/lib/fork-release.mjs", "scripts/lib/deploy-safety.mjs", "scripts/lib/workers-build-policy.mjs", "scripts/validate-release-metadata.mjs", "scripts/verify-release-tag.mjs"]) {
    if (!existsSync(join(output, entry))) throw new Error(`Contrato fork-first ausente: ${entry}`);
  }

  for (const entry of ["provisioner/src/index.ts", "provisioner/baseline/0001_fresh_install.sql", "provisioner/wrangler.jsonc"]) {
    if (!existsSync(join(output, entry))) throw new Error(`Código auditável do provisionador ausente: ${entry}`);
  }
  const publicMigrations = readdirSync(join(output, "migrations")).filter((name) => name.endsWith(".sql"));
  if (JSON.stringify(publicMigrations) !== JSON.stringify(["0001_fresh_install.sql"])) {
    throw new Error(`O fork novo deve receber somente a baseline final; encontrados: ${publicMigrations.join(", ")}.`);
  }
}

function describeSnapshot() {
  const files = walk(output)
    .map((file) => ({
      path: relative(output, file).split(sep).join("/"),
      sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const snapshotHash = createHash("sha256")
    .update(files.map((file) => `${file.sha256}  ${file.path}`).join("\n"))
    .digest("hex");
  // O commit público ainda não existe nesta fase; qualquer sourceCommit aqui
  // apontaria para o repositório privado de origem e criaria proveniência
  // enganosa. O manifesto oficial é gerado somente a partir da tag pública por
  // scripts/build-release-assets.mjs e publicado como asset da GitHub Release.
  return { files, snapshotHash };
}

if (existsSync(output)) {
  const entries = readdirSync(output);
  if (entries.length > 0 && !process.argv.includes("--force")) {
    throw new Error(`Destino não está vazio: ${output}. Use outro diretório ou passe --force.`);
  }
  if (process.argv.includes("--force")) rmSync(output, { recursive: true, force: true });
}
mkdirSync(output, { recursive: true });

for (const entry of [...rootFiles, ...directories, ...extraFiles]) copyEntry(entry);
sanitizeTextFiles();
createPublicPackage();
assertSanitized();
assertPublicInstallerContract();
const snapshot = describeSnapshot();

console.log(JSON.stringify({ ok: true, output, files: snapshot.files.length, snapshotHash: snapshot.snapshotHash }, null, 2));
