import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const legacyPassword = process.env.SMARTZAP_LEGACY_PASSWORD;
const cloudflarePassword = process.env.SMARTZAP_PASSWORD;
const legacyBaseUrl = process.env.SMARTZAP_LEGACY_URL || "http://127.0.0.1:3100";
const cloudflareBaseUrl = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5174";
if (!legacyPassword || !cloudflarePassword)
  throw new Error("Informe as senhas locais do legado e do migrado.");

const outputDir = new URL("../test-results/contact-surfaces/", import.meta.url);
await mkdir(outputDir, { recursive: true });
console.log("[contact-surfaces] iniciando captura");
const browser = await chromium.launch({ headless: true });
const contextOptions = {
  viewport: { width: 1440, height: 900 },
  locale: "pt-BR",
  colorScheme: "dark",
};
// Os dois apps usam o mesmo host em portas diferentes. Contextos separados
// impedem que cookies de sessão com o mesmo nome se sobrescrevam.
const legacyContext = await browser.newContext(contextOptions);
const cloudflareContext = await browser.newContext(contextOptions);
const legacy = await legacyContext.newPage();
const cloudflare = await cloudflareContext.newPage();
const evidence = [];
let importedContactId;

async function login(page, baseUrl, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/login")) return;
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: /Entrar/i }).click(),
  ]);
  await page.goto(`${baseUrl}/contacts`, { waitUntil: "domcontentloaded" });
}

async function stabilizeLegacyRuntime(page) {
  const json = (body) => ({ contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/settings/onboarding", (route) => route.fulfill(json({ onboardingCompleted: true, permanentTokenConfirmed: true })));
  await page.route("**/api/account/alerts**", (route) => route.fulfill(json({ alerts: [] })));
  await page.route("**/api/meta/webhooks/subscription", (route) => route.fulfill(json({ ok: false })));
  await page.route("**/api/auth/status", (route) => route.fulfill(json({ isSetup: true, isAuthenticated: true, company: null })));
  await page.route("**/api/health", (route) => route.fulfill(json({ services: { database: { status: "ok" }, qstash: { status: "ok" }, whatsapp: { status: "ok" }, webhook: { status: "ok" } } })));
}

async function shot(page, side, state) {
  const file = `${side}-${state}.png`;
  await page.screenshot({
    path: new URL(file, outputDir).pathname,
    animations: "disabled",
  });
  evidence.push({ side, state, file, url: page.url() });
}

async function closeByEscape(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
}

try {
  console.log("[contact-surfaces] autenticando as duas referências");
  await stabilizeLegacyRuntime(legacy);
  await Promise.all([
    login(legacy, legacyBaseUrl, legacyPassword),
    login(cloudflare, cloudflareBaseUrl, cloudflarePassword),
  ]);
  console.log("[contact-surfaces] lista autenticada; capturando estados");
  await Promise.all([
    legacy.getByLabel("Buscar contatos por nome ou telefone").waitFor(),
    cloudflare.getByLabel("Buscar contatos por nome ou telefone").waitFor(),
  ]);

  await shot(legacy, "original", "lista");
  await shot(cloudflare, "migrado", "lista");

  // A cópia isolada do legado usa dados estáticos para não tocar no banco
  // original. O estado vazio é coberto pelo E2E funcional; aqui seguimos com
  // as superfícies que a referência renderiza de forma interativa.
  await legacy.getByRole("button", { name: /^Editar contato / }).first().waitFor();
  await cloudflare.getByRole("button", { name: /^Editar / }).first().waitFor();

  await legacy.getByRole("checkbox", { name: "Selecionar todos os contatos" }).check();
  await shot(legacy, "original", "selecao-em-massa");
  await legacy.getByRole("button", { name: /^Excluir \d+ contato/ }).click();
  await shot(legacy, "original", "exclusao-em-massa");
  await legacy.getByRole("button", { name: "Cancelar" }).click();
  await legacy.getByRole("checkbox", { name: "Selecionar todos os contatos" }).uncheck();

  const initialCloudflareCheckbox = cloudflare
    .getByRole("checkbox", { name: /^Selecionar (?!contatos desta página)/ })
    .first();
  await initialCloudflareCheckbox.check();
  await shot(cloudflare, "migrado", "selecao-acoes");
  await initialCloudflareCheckbox.uncheck();

  await legacy.getByRole("button", { name: "Adicionar novo contato" }).click();
  await cloudflare.getByRole("button", { name: "Novo Contato" }).click();
  await shot(legacy, "original", "novo-contato");
  await shot(cloudflare, "migrado", "novo-contato");
  await legacy.getByRole("button", { name: "Fechar formulário de novo contato" }).click();
  await closeByEscape(cloudflare);

  await legacy.getByRole("button", { name: /^Editar contato / }).first().click();
  await cloudflare.getByRole("button", { name: /^Editar / }).first().click();
  await cloudflare.getByRole("dialog", { name: "Editar Contato" }).waitFor();
  await shot(legacy, "original", "editar-contato");
  await shot(cloudflare, "migrado", "editar-contato");
  await legacy.getByRole("button", { name: "Fechar formulário de edição de contato" }).click();
  await closeByEscape(cloudflare);

  await legacy.getByRole("button", { name: /^Excluir contato / }).first().click();
  await cloudflare.getByRole("button", { name: /^Excluir / }).first().click();
  await shot(legacy, "original", "excluir-contato");
  await shot(cloudflare, "migrado", "excluir-contato");
  await legacy.getByRole("button", { name: "Cancelar" }).click();
  await cloudflare.getByRole("button", { name: "Cancelar" }).click();

  await legacy.getByRole("button", { name: "Gerenciar campos personalizados" }).click();
  await cloudflare.getByRole("button", { name: "Campos personalizados" }).click();
  await cloudflare.getByRole("dialog", { name: "Gerenciar Campos" }).waitFor();
  await shot(legacy, "original", "campos-personalizados");
  await shot(cloudflare, "migrado", "campos-personalizados");
  await legacy.getByRole("button", { name: "Close" }).click();
  await closeByEscape(cloudflare);

  await legacy.getByRole("button", { name: "Importar contatos via arquivo CSV" }).click();
  await cloudflare.getByRole("button", { name: "Importar CSV" }).click();
  await shot(legacy, "original", "importacao-etapa-1");
  await shot(cloudflare, "migrado", "importacao-etapa-1");

  await legacy.locator('input[type="file"]').setInputFiles({
    name: "auditoria-contatos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'Nome,Telefone,E-mail,Tags\nAna Souza,+5521991110001,ana@example.local,"VIP,Curso IA"\n',
    ),
  });
  await legacy.getByRole("heading", { name: "Mapear Colunas" }).waitFor();
  await shot(legacy, "original", "importacao-etapa-2");

  const cfImportPhone = `+5561${String(Date.now()).slice(-8)}`;
  await cloudflare.locator('input[type="file"]').setInputFiles({
    name: "auditoria-contatos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`Nome,Telefone,E-mail,Tags\nAuditoria,${cfImportPhone},auditoria@example.local,Auditoria\n`),
  });
  await cloudflare.getByText("Resumo da importação").waitFor();
  await shot(cloudflare, "migrado", "importacao-etapa-2");
  await legacy.getByRole("button", { name: "Confirmar Importação" }).click();
  await legacy.getByRole("heading", { name: "Importação Concluída!" }).waitFor();
  await shot(legacy, "original", "importacao-etapa-3");
  await legacy.getByRole("button", { name: "Fechar", exact: true }).click();

  await cloudflare.getByRole("button", { name: "Confirmar Importação" }).click();
  await cloudflare.getByRole("heading", { name: "Importação Concluída!" }).waitFor();
  await shot(cloudflare, "migrado", "importacao-etapa-3");
  const imported = await cloudflare.evaluate(async (phone) => {
    const response = await fetch(`/api/contacts?q=${encodeURIComponent(phone)}`);
    const body = await response.json();
    return body.items.find((item) => item.phone === phone)?.id;
  }, cfImportPhone);
  importedContactId = imported;
  await cloudflare.getByRole("button", { name: "Fechar", exact: true }).click();

  const firstCloudflareCheckbox = cloudflare
    .getByRole("checkbox", { name: /^Selecionar (?!contatos desta página)/ })
    .first();
  await firstCloudflareCheckbox.check();

  for (const [button, dialog, state] of [
    ["Tags", "Alterar tags em lote", "lote-tags"],
    ["Campo", "Preencher campo em lote", "lote-campo"],
    ["Status", "Alterar status em lote", "lote-status"],
  ]) {
    await cloudflare.getByRole("button", { name: "Mais ações", exact: true }).click();
    await cloudflare.getByRole("button", { name: button, exact: true }).click();
    await cloudflare.getByRole("dialog", { name: dialog }).waitFor();
    await shot(cloudflare, "migrado", state);
    await closeByEscape(cloudflare);
  }

  // A seleção parcial não exibe a faixa "Limpar seleção". Desmarcamos o
  // mesmo contato para manter o fluxo visual e evitar depender do texto de
  // uma ação que só existe na seleção global.
  await firstCloudflareCheckbox.uncheck();
  await cloudflare.locator("tbody tr td:nth-child(2) button").first().click();
  await cloudflare.getByRole("dialog", { name: "Editar contato" }).waitFor();
  await shot(cloudflare, "migrado", "perfil-memoria-historico");
  await closeByEscape(cloudflare);

  await writeFile(
    new URL("manifest.json", outputDir),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(JSON.stringify({ ok: true, captured: evidence.length }, null, 2));
} finally {
  if (importedContactId)
    await cloudflare.request.delete(`${cloudflareBaseUrl}/api/contacts/${importedContactId}`).catch(() => undefined);
  await legacyContext.close();
  await cloudflareContext.close();
  await browser.close();
}
