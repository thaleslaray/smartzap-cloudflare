import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "docs/install/index.html"), "utf8");

describe("instalador estático pré-deploy", () => {
  it("bloqueia comunicação e armazenamento no contrato da página", () => {
    expect(source).toContain("connect-src 'none'");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bXMLHttpRequest\b/);
    expect(source).not.toMatch(/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/);
    expect(source).not.toMatch(/<script[^>]+src=/);
  });

  it("gera chave, senha opcional e nomes exclusivos com Web Crypto", () => {
    expect(source).toContain("crypto.getRandomValues");
    expect(source).toContain("SMARTZAP_VAULT_KEY");
    expect(source).toContain("MASTER_PASSWORD");
    expect(source).toContain("smartzap-${hex(randomBytes(4))}");
    expect(source).toContain('addEventListener("pagehide", clear');
  });

  it("exige recuperação e cinco confirmações antes do status final", () => {
    expect(source).toContain("Baixar arquivo de recuperação");
    // Cinco checkboxes e consultas JavaScript que agregam o conjunto.
    expect(source.match(/<input type="checkbox" data-preflight=/g)).toHaveLength(5);
    expect(source).toContain("recoverySaved && checked");
    expect(source).toContain("conta Cloudflare correta");
    expect(source).toContain("R2 está ativado");
    expect(source).toContain("50 User API Tokens");
    expect(source).toContain("Cloudflare Workers and Pages");
  });

  it("bloqueia o deploy conhecido como defeituoso e aponta para o incidente upstream", () => {
    expect(source).toContain("Deploy to Cloudflare temporariamente indisponível");
    expect(source).toContain("https://github.com/cloudflare/workers-sdk/issues/14553");
    expect(source).toContain('$("#deploy").disabled = true');
    expect(source).not.toContain("https://deploy.workers.cloudflare.com/?url=");
  });
});
