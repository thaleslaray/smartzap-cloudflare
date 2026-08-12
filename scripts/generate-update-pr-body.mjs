import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const version = String(process.env.VERSION || process.argv[2] || "").trim();
const output = resolve(process.env.OUTPUT_FILE || process.argv[3] || ".smartzap-update-pr.md");

if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("Use uma tag SemVer exata para gerar a proposta de atualização.");
}

const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
const migrations = JSON.parse(readFileSync(resolve(root, "release", "migrations.json"), "utf8"));
const lines = changelog.split(/\r?\n/);
const heading = `## [${version.slice(1)}]`;
const start = lines.findIndex((line) => line.startsWith(heading));
const end = start < 0
  ? -1
  : lines.findIndex((line, index) => index > start && line.startsWith("## ["));
const releaseNotes = start < 0
  ? ""
  : lines.slice(start + 1, end < 0 ? lines.length : end).join("\n").trim();
if (!releaseNotes) throw new Error(`CHANGELOG.md não possui uma seção para ${version}.`);

const rows = migrations.migrations.map((migration) => {
  const compatibility = migration.compatibleWithPreviousCode ? "sim" : "não";
  const downtime = migration.downtimeRequired ? "sim" : "não";
  const destructive = migration.destructive ? "sim" : "não";
  return `| \`${migration.file}\` | ${migration.fromSchema} → ${migration.toSchema} | ${compatibility} | ${downtime} | ${destructive} |`;
});
const risks = migrations.migrations.filter((migration) => migration.destructive || migration.downtimeRequired || !migration.compatibleWithPreviousCode);

const body = `# Atualizar SmartZap para ${version}

Esta proposta foi criada a partir de uma **tag oficial assinada**. Ela não faz merge, não aplica migrations e não publica produção.

## Changelog desta versão

${releaseNotes}

## Migrations declaradas até o schema ${migrations.schemaVersion}

| Arquivo | Schema | Compatível com código anterior | Indisponibilidade | Destrutiva |
| --- | --- | --- | --- | --- |
${rows.join("\n")}

## Incompatibilidades e atenção

${risks.length
  ? risks.map((migration) => `- \`${migration.file}\`: compatibilidade anterior=${migration.compatibleWithPreviousCode ? "sim" : "não"}, indisponibilidade=${migration.downtimeRequired ? "sim" : "não"}, destrutiva=${migration.destructive ? "sim" : "não"}. Recuperação: ${migration.recovery}`).join("\n")
  : "- Nenhuma migration declarada exige indisponibilidade, operação destrutiva ou código anterior incompatível."}

## Aprovação obrigatória do proprietário

- [ ] Conferi a assinatura, o changelog e os checksums da release.
- [ ] Capturei bookmark D1 e os backups necessários.
- [ ] Homologuei esta branch em **staging físico** com \`staging/*\`.
- [ ] Validei \`/setup\`, health, Meta, filas, DLQs, Cron e rollback.
- [ ] Resolvi manualmente qualquer conflito sem sobrescrever \`customer/*\`.

Somente o merge aprovado em \`main\` permite que Workers Builds publique produção. Branches \`sync/*\` executam validação sem deploy.
`;

writeFileSync(output, body, { mode: 0o600 });
console.log(output);
