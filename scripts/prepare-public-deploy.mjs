import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepareIsolatedDeploymentConfig } from "./lib/deploy-safety.mjs";

const wranglerPath = resolve(process.cwd(), "wrangler.jsonc");
const prepared = prepareIsolatedDeploymentConfig(readFileSync(wranglerPath, "utf8"));
writeFileSync(wranglerPath, prepared.source);

console.log(`Recursos internos isolados para ${prepared.workerName}:`);
console.log(`- Workflow de campanhas: ${prepared.workflows.CAMPAIGN_WF}`);
console.log(`- Workflow de diagnóstico: ${prepared.workflows.SETUP_WF}`);
console.log(`- Namespace do limitador: ${prepared.rateLimitNamespace}`);
console.log(`- AI Gateway opcional: ${prepared.aiGatewayId}`);
