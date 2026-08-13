import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = execFileSync(
  "git",
  ["ls-files", "-co", "--exclude-standard", "-z"],
  { cwd: root },
).toString();
const files = output.split("\0").filter(Boolean);
const rules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["openai-key", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["google-key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ["github-token", /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/],
  ["meta-token", /\bEAA[A-Za-z0-9]{40,}\b/],
  ["bearer-token", /Bearer\s+[A-Za-z0-9._~-]{30,}/i],
];
const historyRules = [
  ["private-key", "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["openai-key", "(^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}", /(?:^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}/],
  ["google-key", "AIza[0-9A-Za-z_-]{30,}", /AIza[0-9A-Za-z_-]{30,}/],
  ["github-token", "(ghp_|github_pat_)[A-Za-z0-9_]{20,}", /(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/],
  ["meta-token", "EAA[A-Za-z0-9]{40,}", /EAA[A-Za-z0-9]{40,}/],
  ["bearer-token", "Bearer[[:space:]]+[A-Za-z0-9._~-]{30,}", /Bearer\s+[A-Za-z0-9._~-]{30,}/i],
  ["tracked-secret-assignment", "(TOKEN|SECRET|PASSWORD|PRIVATE_KEY)[[:blank:]]*[:=][[:blank:]]*['\"]?[A-Za-z0-9_./+~-]{16,}", /(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY)[ \t]*[:=][ \t]*['\"]?[A-Za-z0-9_./+~-]{16,}/],
];
const hits = [];
const officialMetaDocumentationSampleHashes = new Set([
  "a66b29c2fef2986e44172a615419d01b960eee6abd786d7d0511bd1d5ccbb6b8",
  "e4617bcb32f12e7016c4393c323722413544ce4983ed0240f26b872d059689a0",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function containsHistoricalSecret(rule, content, file) {
  if (rule === "meta-token") {
    const candidates = content.match(/EAA[A-Za-z0-9]{40,}/g) ?? [];
    return candidates.some(
      (candidate) => !officialMetaDocumentationSampleHashes.has(sha256(candidate)),
    );
  }
  if (rule !== "tracked-secret-assignment") return historyRules
    .find(([candidate]) => candidate === rule)[2]
    .test(content);

  const assignments = content.match(
    /(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY)[ \t]*[:=][ \t]*['\"]?[A-Za-z0-9_./+~-]{16,}/g,
  ) ?? [];
  return assignments.some((assignment) => {
    const value = assignment.split(/[:=]/, 2)[1]?.trim().replace(/^['\"]/, "") ?? "";
    const placeholder = /^(?:replace|example|dummy|your|dev|test|fake|gere|smartzap_install)[-_]/i.test(value);
    const codeReference = /^(?:process\.env|qa\.|env\.|runtime\.|settings\.)/i.test(value);
    const testFixture =
      /^(?:db|local|fixture|tok-secret)[-_]/i.test(value) &&
      /^(?:tests\/|vitest\.)/.test(file);
    return !(placeholder || codeReference || testFixture);
  });
}

for (const file of files) {
  let content;
  try {
    const bytes = readFileSync(resolve(root, file));
    if (bytes.includes(0)) continue;
    content = bytes.toString("utf8");
  } catch {
    continue;
  }
  for (const [rule, pattern] of rules) {
    if (!pattern.test(content)) continue;
    const policySelfReference =
      file === ".gitleaks.toml" && rule === "private-key";
    const placeholder =
      file === ".dev.vars.example" &&
      rule === "private-key" &&
      content.includes("replace-me");
    if (!placeholder && !policySelfReference) hits.push({ file, rule });
  }
}

const trackedLocalVars = execFileSync(
  "git",
  ["ls-files", ".dev.vars", ".dev.vars.*", ".env", ".env.*"],
  { cwd: root },
)
  .toString()
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => ![".dev.vars.example", ".env.example"].includes(file));
for (const file of trackedLocalVars)
  hits.push({ file, rule: "tracked-local-environment" });

const localAllowlist = resolve(root, ".dev.vars.qa.local");
try {
  execFileSync("git", ["check-ignore", "-q", ".dev.vars.qa.local"], {
    cwd: root,
  });
} catch {
  hits.push({
    file: ".dev.vars.qa.local",
    rule: "not-ignored",
  });
}
if (existsSync(localAllowlist)) {
  const mode = statSync(localAllowlist).mode & 0o777;
  if (mode !== 0o600)
    hits.push({
      file: ".dev.vars.qa.local",
      rule: `permissions-${mode.toString(8)}-expected-600`,
    });
}

if (process.argv.includes("--history")) {
  for (const [rule, expression, contentPattern] of historyRules) {
    const log = execFileSync(
      "git",
      ["log", "--all", "--no-renames", "--format=__COMMIT__%H", "--name-only", "-G", expression, "--"],
      { cwd: root, maxBuffer: 64 * 1024 * 1024 },
    ).toString();
    let commit = "unknown";
    for (const line of log.split(/\r?\n/)) {
      if (line.startsWith("__COMMIT__")) {
        commit = line.slice("__COMMIT__".length);
        continue;
      }
      const file = line.trim();
      if (!file) continue;
      // `git log -G` também retorna o commit que removeu uma ocorrência. Antes
      // de classificar o commit, confirme que o blob daquele commit ainda
      // contém o padrão. Isso evita transformar remoção de segredo em achado.
      let historicalContent = "";
      try {
        historicalContent = execFileSync(
          "git",
          ["show", `${commit}:${file}`],
          { cwd: root, maxBuffer: 64 * 1024 * 1024 },
        ).toString("utf8");
      } catch {
        continue;
      }
      if (!contentPattern.test(historicalContent)) continue;
      if (!containsHistoricalSecret(rule, historicalContent, file)) continue;
      if (
        file === ".dev.vars.example" &&
        rule === "private-key" &&
        historicalContent.includes("replace-me")
      ) continue;
      hits.push({ file, rule: `history-${rule}`, commit });
    }
  }
}

const uniqueHits = [...new Map(
  hits.map((hit) => [`${hit.rule}:${hit.file}:${"commit" in hit ? hit.commit : "working-tree"}`, hit]),
).values()];
const report = {
  ok: uniqueHits.length === 0,
  filesScanned: files.length,
  historyScanned: process.argv.includes("--history"),
  hits: uniqueHits,
};
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
