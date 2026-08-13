import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const tag = String(process.argv[2] || "").trim();
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) throw new Error("Informe uma tag SemVer exata.");
const allowedSigners = resolve(process.cwd(), "release", "allowed_signers");
if (!existsSync(allowedSigners) || !readFileSync(allowedSigners, "utf8").includes("smartzap-release-signing ssh-ed25519 ")) {
  throw new Error("Lista de signatários oficiais ausente ou inválida.");
}
const output = execFileSync("git", [
  "-c", "gpg.format=ssh",
  "-c", `gpg.ssh.allowedSignersFile=${allowedSigners}`,
  "tag", "--verify", tag,
], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
console.log(output || `Assinatura oficial verificada para ${tag}.`);
