import { execFileSync } from "node:child_process";
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
  ["private-key", "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"],
  ["openai-key", "(^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}"],
  ["google-key", "AIza[0-9A-Za-z_-]{30,}"],
  ["github-token", "(ghp_|github_pat_)[A-Za-z0-9_]{20,}"],
  ["meta-token", "EAA[A-Za-z0-9]{40,}"],
  ["bearer-token", "Bearer[[:space:]]+[A-Za-z0-9._~-]{30,}"],
  ["tracked-secret-assignment", "(TOKEN|SECRET|PASSWORD|PRIVATE_KEY)[[:space:]]*[:=][[:space:]]*['\"]?[A-Za-z0-9_./+~-]{16,}"],
];
const hits = [];

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
    const placeholder =
      file === ".dev.vars.example" &&
      rule === "private-key" &&
      content.includes("replace-me");
    if (!placeholder) hits.push({ file, rule });
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
  for (const [rule, expression] of historyRules) {
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
