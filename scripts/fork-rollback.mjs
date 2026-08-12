import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertRollbackCheckpoint } from "./lib/fork-release.mjs";
import { deploymentId } from "./lib/fork-bootstrap.mjs";

const root = process.cwd();
const staging = process.argv.includes("--staging");
const execute = process.argv.includes("--execute");
const restoreD1 = process.argv.includes("--restore-d1");
const checkpointArgument = process.argv.find((argument) => argument.startsWith("--checkpoint="));
const workerName = deploymentId(process.env.SMARTZAP_INSTALL_ID, staging);
const checkpointPath = resolve(root, checkpointArgument?.slice("--checkpoint=".length) || "");

if (!checkpointArgument || !existsSync(checkpointPath)) throw new Error("Informe --checkpoint=.smartzap/checkpoints/arquivo.json.");
const checkpoint = assertRollbackCheckpoint(JSON.parse(readFileSync(checkpointPath, "utf8")), workerName);

const plan = {
  worker: { name: checkpoint.workerName, versionId: checkpoint.versionId },
  d1: restoreD1 ? { name: checkpoint.databaseName, bookmark: checkpoint.bookmark } : "não será restaurado",
  warning: "R2, Queues e storage dos Durable Objects não fazem parte da versão do Worker e não são apagados por este comando.",
};
console.log(JSON.stringify(plan, null, 2));

if (!execute) {
  console.log("Plano somente leitura. Repita com --execute e, se a migration alterou schema/dados, --restore-d1.");
  process.exit(0);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
if (restoreD1) {
  execFileSync(npx, ["wrangler", "d1", "time-travel", "restore", checkpoint.databaseName, "--bookmark", checkpoint.bookmark, "--json"], { cwd: root, stdio: "inherit", env: { ...process.env, CI: "1" } });
}
execFileSync(npx, ["wrangler", "rollback", checkpoint.versionId, "--name", checkpoint.workerName, "--message", `Rollback SmartZap para ${checkpoint.fromRelease?.version || checkpoint.versionId}`, "-y"], { cwd: root, stdio: "inherit", env: { ...process.env, CI: "1" } });
console.log("Rollback solicitado. Valide /setup, health, filas, DLQs, webhook e reconciliação antes de reabrir tráfego.");
