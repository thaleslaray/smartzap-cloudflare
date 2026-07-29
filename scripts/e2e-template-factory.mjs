import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const baseUrl = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5175";
const password = process.env.SMARTZAP_PASSWORD || "dev";
const outputDir = new URL("../test-results/template-factory/", import.meta.url);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  locale: "pt-BR",
  colorScheme: "dark",
});
page.setDefaultTimeout(20_000);
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
  await page.getByRole("button", { name: "Novo Projeto" }).click();
  await page.waitForURL(/\/templates\/new/);
  await page
    .getByLabel("Conteúdo fonte")
    .fill(
      "Workshop de automação no dia 20 de agosto às 19h. A aula ensina automações práticas para pequenos negócios. Inscrição pelo site oficial informado pelo organizador.",
    );
  await page.getByRole("button", { name: /Extrair informações/i }).click();
  await page.getByLabel("Nome do projeto").fill(`Fábrica E2E ${Date.now()}`);
  await page.getByRole("button", { name: /Escolher estratégia/ }).click();
  await page.getByRole("button", { name: /Utilidade/ }).click();
  await page.getByLabel("Quantidade").fill("1");
  await page.getByRole("button", { name: /Gerar templates/ }).click();
  await page.getByText("Revise os templates").waitFor({ timeout: 60_000 });
  await page.screenshot({
    path: new URL("revisao.png", outputDir).pathname,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Salvar Projeto" }).click();
  await page.waitForURL(/\/templates\/(?!new$|drafts\/)[^/]+$/);
  projectId =
    new URL(page.url()).pathname.split("/").filter(Boolean).at(-1) || "";
  console.log(JSON.stringify({ ok: true, url: page.url() }, null, 2));
} catch (error) {
  const body = await page.locator("body").innerText();
  await writeFile(
    new URL("falha.txt", outputDir),
    `${body}\n\n${error instanceof Error ? error.stack : String(error)}\n`,
  );
  console.log(body);
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
