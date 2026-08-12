const BOOKMARK_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{32}$/i;
const VERSION_ID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function parseTimeTravelBookmark(output) {
  const parsed = JSON.parse(String(output));
  const bookmark = String(parsed?.bookmark || "");
  if (!BOOKMARK_PATTERN.test(bookmark)) throw new Error("A Cloudflare não devolveu um bookmark D1 válido.");
  return bookmark;
}

export function parseActiveDeploymentVersion(output) {
  const deployments = JSON.parse(String(output));
  if (!Array.isArray(deployments)) throw new Error("A Cloudflare não devolveu a lista de deployments.");
  const candidates = deployments
    .flatMap((deployment) => (deployment?.versions || [])
      .filter((version) => Number(version?.percentage) === 100 && VERSION_ID_PATTERN.test(String(version?.version_id || "")))
      .map((version) => ({ versionId: String(version.version_id), createdOn: String(deployment.created_on || "") })))
    .sort((left, right) => Date.parse(right.createdOn) - Date.parse(left.createdOn));
  if (!candidates[0]) throw new Error("Nenhuma versão ativa a 100% foi encontrada para rollback.");
  return candidates[0].versionId;
}

export function buildRollbackCheckpoint({ workerName, databaseName, bookmark, versionId, fromRelease, toRelease }) {
  if (!/^smartzap-[a-f0-9]{8}(?:-staging)?$/.test(workerName)) throw new Error("Worker inválido no checkpoint.");
  if (databaseName !== `${workerName}-db`) throw new Error("D1 não corresponde ao Worker no checkpoint.");
  if (!BOOKMARK_PATTERN.test(bookmark)) throw new Error("Bookmark inválido no checkpoint.");
  if (!VERSION_ID_PATTERN.test(versionId)) throw new Error("Versão do Worker inválida no checkpoint.");
  return {
    schema: 1,
    workerName,
    databaseName,
    bookmark,
    versionId,
    fromRelease,
    toRelease,
    createdAt: new Date().toISOString(),
  };
}

export function assertRollbackCheckpoint(value, expectedWorkerName) {
  if (!value || value.schema !== 1 || value.workerName !== expectedWorkerName) throw new Error("O checkpoint não pertence a este deployment.");
  return buildRollbackCheckpoint(value);
}
