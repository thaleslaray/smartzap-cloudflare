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
    expect(source).toContain("A senha e a chave do cofre são criadas no navegador");
  });

  it("explica as duas modalidades e recomenda o fork para produção", () => {
    expect(source).toContain("Código próprio recomendado");
    expect(source).toContain("Produção: crie seu fork");
    expect(source).toContain("Avaliação: use OAuth");
    expect(source).toContain("versão fixa, sem manutenção contínua");
  });

  it("aponta para o seletor que preserva fork e instalação rápida", () => {
    expect(source).toContain('id="provisioner"');
    expect(source).toContain('href="https://instalar.escoladeautomacao.com/smartzap/"');
    expect(source).not.toContain("https://deploy.workers.cloudflare.com/?url=");
    expect(source).not.toContain("User API Token");
    expect(source).toContain("fork");
  });
});
