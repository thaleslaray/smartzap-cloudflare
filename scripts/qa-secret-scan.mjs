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

const report = { ok: hits.length === 0, filesScanned: files.length, hits };
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
