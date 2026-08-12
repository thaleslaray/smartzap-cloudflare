import { describe, expect, it } from "vitest";
import {
  assertForkBranches,
  assertIndependentForkOwner,
  assertTrueGitHubFork,
  githubForkTarget,
  mainBranchProtection,
  normalizeGitHubOwner,
  synchronizationRef,
} from "../scripts/lib/github-fork.mjs";

const validRepository = {
  full_name: "smartzap-homologacao/smartzap-cloudflare",
  owner: { login: "smartzap-homologacao" },
  fork: true,
  parent: { full_name: "thaleslaray/smartzap-cloudflare" },
  default_branch: "main",
  private: false,
  html_url: "https://github.com/smartzap-homologacao/smartzap-cloudflare",
};

describe("verificação do fork verdadeiro", () => {
  it("aceita somente o fork que preserva o upstream oficial", () => {
    expect(assertTrueGitHubFork(validRepository, "smartzap-homologacao")).toEqual(expect.objectContaining({
      fullName: "smartzap-homologacao/smartzap-cloudflare",
      upstream: "thaleslaray/smartzap-cloudflare",
      defaultBranch: "main",
    }));
  });

  it("recusa cópia, proprietário incorreto, upstream falso e main divergente", () => {
    expect(() => assertTrueGitHubFork({ ...validRepository, fork: false }, "smartzap-homologacao")).toThrow(/não é um fork/);
    expect(() => assertTrueGitHubFork({ ...validRepository, owner: { login: "outro" } }, "smartzap-homologacao")).toThrow(/proprietário/);
    expect(() => assertTrueGitHubFork({ ...validRepository, parent: { full_name: "outro/projeto" } }, "smartzap-homologacao")).toThrow(/upstream/);
    expect(() => assertTrueGitHubFork({ ...validRepository, default_branch: "master" }, "smartzap-homologacao")).toThrow(/main/);
  });

  it("valida proprietário e nome canônico do fork", () => {
    expect(normalizeGitHubOwner("smartzap-homologacao")).toBe("smartzap-homologacao");
    expect(githubForkTarget("smartzap-homologacao")).toBe("smartzap-homologacao/smartzap-cloudflare");
    expect(() => normalizeGitHubOwner("owner/injecao")).toThrow(/inválido/);
  });

  it("aceita a conta pessoal autenticada do instalador e recusa somente o dono do upstream", () => {
    expect(assertIndependentForkOwner("cliente-smartzap")).toBe("cliente-smartzap");
    expect(assertIndependentForkOwner("smartzap-homologacao")).toBe("smartzap-homologacao");
    expect(() => assertIndependentForkOwner("thaleslaray")).toThrow(/origem já pertence/);
  });

  it("exige main e upstream-sync, sem inventar customer/*", () => {
    expect(assertForkBranches(["main", "upstream-sync"])).toEqual({ production: "main", synchronization: "upstream-sync" });
    expect(() => assertForkBranches(["main"])).toThrow(/upstream-sync/);
  });

  it("cria a referência de sincronização apenas a partir de SHA Git válido", () => {
    const sha = "a".repeat(40);
    expect(synchronizationRef({ object: { sha } })).toEqual({ ref: "refs/heads/upstream-sync", sha });
    expect(() => synchronizationRef({ object: { sha: "main" } })).toThrow(/SHA/);
  });

  it("protege main por PR e check sem permitir força ou exclusão", () => {
    expect(mainBranchProtection()).toEqual(expect.objectContaining({
      required_status_checks: { strict: true, contexts: ["validar"] },
      enforce_admins: true,
      required_linear_history: true,
      allow_force_pushes: false,
      allow_deletions: false,
      required_conversation_resolution: true,
    }));
  });
});
