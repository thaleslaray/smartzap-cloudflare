import type { ProvisionerEnv, SmartZapReleaseManifest } from "./types";
import { sha256 } from "./crypto";

export async function loadRelease(env: ProvisionerEnv): Promise<{ manifest: SmartZapReleaseManifest; url: URL }> {
  const url = new URL(env.SMARTZAP_RELEASE_MANIFEST_URL);
  const object = env.RELEASES ? await env.RELEASES.get("manifest.json") : null;
  const text = object
    ? await object.text()
    : await fetch(url).then(async (response) => {
        if (!response.ok) throw new Error(`Manifesto da release indisponível: HTTP ${response.status}`);
        return response.text();
      });
  if (env.SMARTZAP_RELEASE_MANIFEST_SHA256 && await sha256(text) !== env.SMARTZAP_RELEASE_MANIFEST_SHA256)
    throw new Error("Checksum do manifesto da release não confere");
  const manifest = JSON.parse(text) as SmartZapReleaseManifest;
  if (manifest.schemaVersion !== 2 || !manifest.version || !/^[0-9a-f]{40}$/.test(manifest.commitSha)
    || !["stable", "rc", "beta"].includes(manifest.channel)
    || !Number.isSafeInteger(manifest.databaseSchemaVersion) || manifest.databaseSchemaVersion < 1
    || !manifest.main?.sha256 || !Array.isArray(manifest.modules)
    || !manifest.baseline?.sha256 || !manifest.baseline?.statementsSha256 || !Array.isArray(manifest.baseline.statements)
    || !Array.isArray(manifest.upgrades))
    throw new Error("Manifesto da release incompatível");
  await verifySqlPayload(manifest.baseline.name, manifest.baseline.statementsSha256, manifest.baseline.statements);
  const upgradeNames = new Set<string>();
  let previousUpgrade = "";
  for (const upgrade of manifest.upgrades) {
    if (!upgrade.name || !upgrade.sha256 || !upgrade.statementsSha256 || !Array.isArray(upgrade.statements))
      throw new Error("Upgrade da release incompatível");
    if (upgradeNames.has(upgrade.name) || upgrade.name.localeCompare(previousUpgrade) <= 0)
      throw new Error("Upgrades da release precisam ser únicos e ordenados");
    upgradeNames.add(upgrade.name);
    previousUpgrade = upgrade.name;
    await verifySqlPayload(upgrade.name, upgrade.statementsSha256, upgrade.statements);
  }
  return { manifest, url };
}

async function verifySqlPayload(name: string, expected: string, statements: string[]): Promise<void> {
  if (await sha256(JSON.stringify(statements)) !== expected)
    throw new Error(`Checksum dos comandos SQL não confere: ${name}`);
}
