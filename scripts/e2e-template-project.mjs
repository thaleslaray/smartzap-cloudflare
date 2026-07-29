import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5175";
const password = process.env.SMARTZAP_PASSWORD || "dev";
const outputDir = new URL("../test-results/template-project/", import.meta.url);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  locale: "pt-BR",
  colorScheme: "dark",
});
page.setDefaultTimeout(8_000);
page.on("response", (response) => {
  if (response.url().includes("/api/template-projects"))
    console.log(
      "api",
      response.status(),
      response.request().method(),
      response.url(),
    );
});
page.on("requestfailed", (request) =>
  console.log("request-failed", request.url(), request.failure()?.errorText),
);
page.on("pageerror", (error) => console.log("page-error", error.message));
let projectId = "";
try {
  await page.goto(`${baseUrl}/templates?tab=projects`, {
    waitUntil: "networkidle",
  });
  if (page.url().includes("/login")) {
    await page.locator("input[type=password]").fill(password);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.includes("/login")),
      page.getByRole("button", { name: /Entrar/i }).click(),
    ]);
    await page.goto(`${baseUrl}/templates?tab=projects`, {
      waitUntil: "networkidle",
    });
  }
  const project = await page.evaluate(async (title) => {
    const response = await fetch("/api/template-projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, strategy: "utility", source: "manual" }),
    });
    if (!response.ok)
      throw new Error(`Falha ao criar projeto: ${response.status}`);
    return response.json();
  }, `Projeto E2E ${Date.now()}`);
  projectId = project.id;
  await page.goto(`${baseUrl}/templates/${project.id}`, {
    waitUntil: "networkidle",
  });
  await page.waitForURL(/\/templates\/[^/]+$/);
  await page
    .getByRole("button", { name: "Adicionar template" })
    .first()
    .click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Nome técnico").fill("boas_vindas_e2e");
  await editor
    .getByLabel("Conteúdo")
    .fill("Olá {{1}}, este é um teste completo.");
  await editor.getByRole("button", { name: "Salvar template" }).click();
  await page.getByText("boas_vindas_e2e").first().waitFor();
  console.log("template-criado");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  console.log("editar-clicado");
  const editDialog = page.getByRole("dialog");
  await editDialog.waitFor();
  await editDialog
    .getByLabel("Conteúdo")
    .fill("Olá {{1}}, conteúdo atualizado e persistido.");
  console.log("conteudo-preenchido");
  await editDialog.getByRole("button", { name: "Salvar template" }).click();
  console.log("salvar-clicado");
  await page
    .getByText("Olá {{1}}, conteúdo atualizado e persistido.")
    .first()
    .waitFor();
  await page.screenshot({
    path: new URL("detalhe.png", outputDir).pathname,
    fullPage: true,
  });
  console.log(
    JSON.stringify(
      { ok: true, url: page.url(), item: "boas_vindas_e2e" },
      null,
      2,
    ),
  );
} catch (error) {
  console.log("body", await page.locator("body").innerText());
  await page.screenshot({
    path: new URL("falha.png", outputDir).pathname,
    fullPage: true,
  });
  throw error;
} finally {
  if (projectId) {
    try {
      await page.request.delete(
        `${baseUrl}/api/template-projects/${projectId}`,
        {
          headers: { "x-api-key": "dev-api-key" },
        },
      );
    } catch {}
  }
  await browser.close();
}
