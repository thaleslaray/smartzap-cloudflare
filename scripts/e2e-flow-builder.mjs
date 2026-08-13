import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5175";
const password = process.env.SMARTZAP_PASSWORD || "dev";
const cleanup = process.env.SMARTZAP_E2E_CLEANUP === "1";
const outputDir = new URL("../test-results/flow-builder/", import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  locale: "pt-BR",
  colorScheme: "dark",
});

try {
  await page.goto(`${baseUrl}/templates`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    await page.locator("input[type=password]").fill(password);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes("/login")),
      page.getByRole("button", { name: /Entrar/i }).click(),
    ]);
    await page.goto(`${baseUrl}/templates`, { waitUntil: "networkidle" });
  }

  await page.getByRole("button", { name: "MiniApps beta" }).click();
  await page.getByRole("button", { name: "Criar MiniApp" }).click();
  await page.getByLabel("Nome", { exact: true }).fill(`blank_e2e_${Date.now()}`);
  await page.getByRole("button", { name: "Começar do zero" }).click();
  await page.waitForURL(/\/flows\/builder\//);
  await page.getByRole("button", { name: "Conteúdo" }).click();
  await page.getByLabel("Título da tela").fill("Boas-vindas E2E");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page.getByRole("button", { name: "Campo: e-mail" }).click();
  await page.getByLabel("Campo: e-mail").fill("Seu e-mail");
  await page.getByLabel("Nome do campo").fill("email");
  await page.getByRole("button", { name: "Ações", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar tela" }).click();
  await page.getByRole("button", { name: "Boas-vindas E2E" }).click();
  await page.getByRole("button", { name: "Adicionar regra" }).click();
  await page.getByLabel("Operador").selectOption("is_filled");
  await page.getByRole("button", { name: "Salvar MiniApp" }).click();
  await page.getByText("MiniApp salva").waitFor();
  await page.screenshot({
    path: new URL("editor-salvo.png", outputDir).pathname,
    fullPage: true,
  });
  const editorUrl = page.url();

  await page.getByRole("button", { name: "Lista" }).click();
  await page.waitForURL(/\/templates/);
  await page.getByRole("button", { name: "MiniApps beta" }).click();
  const selection = page
    .getByRole("button", { name: "Selecionar MiniApp" })
    .first();
  await selection.click();
  await page.getByRole("button", { name: "Excluir (1)" }).waitFor();
  await selection.click();
  if (await page.getByRole("button", { name: "Excluir (1)" }).count()) {
    throw new Error("A seleção do MiniApp não foi limpa");
  }
  await page.getByRole("button", { name: "Ver", exact: true }).first().click();
  await page.waitForURL(/\/flows\/builder\//);
  await page.getByRole("button", { name: "Conteúdo" }).click();
  const persistedTitle = await page.getByLabel("Título da tela").inputValue();
  if (persistedTitle !== "Boas-vindas E2E")
    throw new Error(`Título não persistiu: ${persistedTitle}`);
  const persistedEmail = await page.getByLabel("Campo: e-mail").inputValue();
  if (persistedEmail !== "Seu e-mail")
    throw new Error(`Bloco de e-mail não persistiu: ${persistedEmail}`);
  await page.getByText("Caminhos", { exact: true }).waitFor();
  if ((await page.getByRole("button", { name: "Remover regra" }).count()) !== 1)
    throw new Error("A regra de caminho não persistiu");
  const persistedOperator = await page.getByLabel("Operador").inputValue();
  if (persistedOperator !== "is_filled")
    throw new Error(`Operador não persistiu: ${persistedOperator}`);

  await page.getByRole("button", { name: "Finalizar" }).click();
  await page.getByRole("button", { name: "Publicar na Meta" }).waitFor();
  await page.getByText("Após publicar, alterações exigem uma nova versão.").waitFor();
  await page.getByLabel("E-mail do contato").selectOption("email");
  await page.getByLabel("Título (opcional)").fill("Resposta E2E registrada ✅");
  await page.getByLabel("Rodapé (opcional)").first().fill("Rodapé E2E");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await page.getByText("MiniApp salva").waitFor();
  await page.getByRole("button", { name: "Conteúdo" }).click();
  await page.getByRole("button", { name: "Finalizar" }).click();
  if ((await page.getByLabel("E-mail do contato").inputValue()) !== "email")
    throw new Error("Mapeamento de e-mail não persistiu");
  if ((await page.getByLabel("Título (opcional)").inputValue()) !== "Resposta E2E registrada ✅")
    throw new Error("Configuração da confirmação não persistiu");
  await page.screenshot({
    path: new URL("editor-finalizar.png", outputDir).pathname,
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Editor de MiniApp", exact: true }).waitFor();
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (mobileOverflow) throw new Error("Editor de MiniApp gera overflow horizontal no mobile");
  await page.getByRole("button", { name: "Conteúdo" }).click();
  await page.getByLabel("Título da tela").waitFor();
  await page.screenshot({
    path: new URL("editor-mobile.png", outputDir).pathname,
    fullPage: true,
  });

  if (cleanup) {
    const flowId = new URL(page.url()).pathname.split("/").filter(Boolean).at(-1);
    if (!flowId) throw new Error("ID do MiniApp não localizado para limpeza");
    const removed = await page.request.delete(`${baseUrl}/api/flows/${flowId}`);
    if (!removed.ok())
      throw new Error(`Falha ao limpar rascunho E2E: HTTP ${removed.status()}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        editorUrl,
        persistedTitle,
        persistedEmail,
        persistedOperator,
        mappingPersisted: true,
        confirmationPersisted: true,
        publishActionVisible: true,
        mobileResponsive: true,
        cleanup,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot({
    path: new URL("falha.png", outputDir).pathname,
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
