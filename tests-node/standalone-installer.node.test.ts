import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "docs/install/index.html"), "utf8");

describe("entrada pública do provisionador", () => {
  it("bloqueia comunicação e armazenamento no contrato da página", () => {
    expect(source).toContain("connect-src 'none'");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bXMLHttpRequest\b/);
    expect(source).not.toMatch(/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/);
    expect(source).not.toMatch(/<script[^>]+src=/);
  });

  it("não coleta nem gera credenciais fora do provisionador", () => {
    expect(source).not.toMatch(/<input\b|<form\b|<button\b/);
    expect(source).not.toContain("crypto.getRandomValues");
    expect(source).not.toContain("MASTER_PASSWORD=");
    expect(source).not.toContain("SMARTZAP_VAULT_KEY=");
    expect(source).toContain("serão criadas somente no próximo passo");
  });

  it("explica as três decisões antes da instalação", () => {
    expect(source).toContain("Autorize a conta");
    expect(source).toContain("Crie sua senha e seu cofre");
    expect(source).toContain("Confira e instale");
    expect(source).toContain("bloqueia qualquer colisão");
  });

  it("aponta somente para o provisionador OAuth final", () => {
    expect(source).toContain('id="provisioner"');
    expect(source).toContain('href="https://smartzap-provisioner.thales2581.workers.dev/"');
    expect(source).not.toContain("https://deploy.workers.cloudflare.com/?url=");
    expect(source).not.toContain("User API Token");
    expect(source).not.toContain("GitHub App");
  });
});
