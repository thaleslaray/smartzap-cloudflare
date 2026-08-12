export const SMARTZAP_UPSTREAM = "thaleslaray/smartzap-cloudflare";
export const SMARTZAP_UPSTREAM_OWNER = SMARTZAP_UPSTREAM.split("/")[0];
export const SMARTZAP_REPOSITORY = "smartzap-cloudflare";

export function normalizeGitHubOwner(value) {
  const owner = String(value || "").trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
    throw new Error("Proprietário GitHub inválido.");
  }
  return owner;
}

export function githubForkTarget(owner) {
  return `${normalizeGitHubOwner(owner)}/${SMARTZAP_REPOSITORY}`;
}

export function assertIndependentForkOwner(value) {
  const owner = normalizeGitHubOwner(value);
  if (owner.toLowerCase() === SMARTZAP_UPSTREAM_OWNER.toLowerCase()) {
    throw new Error(`O fork precisa pertencer a outra conta ou organização; a origem já pertence a ${SMARTZAP_UPSTREAM_OWNER}.`);
  }
  return owner;
}

export function assertTrueGitHubFork(repository, expectedOwner) {
  const owner = normalizeGitHubOwner(expectedOwner);
  const fullName = githubForkTarget(owner);
  const failures = [];

  if (repository?.full_name !== fullName) failures.push(`repositório esperado ${fullName}`);
  if (repository?.owner?.login !== owner) failures.push(`proprietário esperado ${owner}`);
  if (repository?.fork !== true) failures.push("o repositório não é um fork GitHub");
  if (repository?.parent?.full_name !== SMARTZAP_UPSTREAM) {
    failures.push(`upstream esperado ${SMARTZAP_UPSTREAM}`);
  }
  if (repository?.default_branch !== "main") failures.push("branch padrão deve ser main");
  if (repository?.private === true) failures.push("o fork do projeto público não pode ser privado");

  if (failures.length > 0) {
    throw new Error(`Fork SmartZap inválido: ${failures.join("; ")}.`);
  }

  return {
    fullName,
    owner,
    upstream: SMARTZAP_UPSTREAM,
    defaultBranch: "main",
    url: repository.html_url || `https://github.com/${fullName}`,
  };
}

export function assertForkBranches(branchNames) {
  const branches = new Set((branchNames || []).map((item) => String(item)));
  const missing = ["main", "upstream-sync"].filter((branch) => !branches.has(branch));
  if (missing.length > 0) {
    throw new Error(`Branches obrigatórias ausentes: ${missing.join(", ")}.`);
  }
  return { production: "main", synchronization: "upstream-sync" };
}

export function synchronizationRef(mainRef) {
  const sha = String(mainRef?.object?.sha || "").trim();
  if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error("SHA de main inválido para criar upstream-sync.");
  return { ref: "refs/heads/upstream-sync", sha };
}
