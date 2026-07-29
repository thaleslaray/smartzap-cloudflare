import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5175";
const password = process.env.SMARTZAP_PASSWORD || "dev";
const outputDir = new URL(
  "../test-results/flow-builder-home/",
  import.meta.url,
);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  locale: "pt-BR",
  colorScheme: "dark",
});
page.setDefaultTimeout(20_000);

async function login() {
  await page.goto(`${baseUrl}/flows/builder`, { waitUntil: "networkidle" });
  if (!page.url().includes("/login")) return;
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: /Entrar/i }).click(),
  ]);
  await page.goto(`${baseUrl}/flows/builder`, { waitUntil: "networkidle" });
}

try {
  await login();
  await page.getByRole("heading", { name: "MiniApp Builder" }).waitFor();
  const templateName = `template_e2e_${Date.now()}`;
  await page.getByRole("button", { name: "Criar por template" }).click();
  const templateDialog = page.getByRole("dialog");
  await templateDialog.getByLabel("Nome", { exact: true }).fill(templateName);
  await templateDialog
    .getByRole("button", { name: /Agendamento Coleta serviço/i })
    .click();
  await templateDialog
    .getByRole("button", { name: "Criar", exact: true })
    .click();
  await page.waitForURL(/\/flows\/builder\/[^/]+$/);
  const templateId = page.url().split("/").at(-1);
  const templateFlow = await page.evaluate(
    async (id) => (await fetch(`/api/flows/${id}`)).json(),
    templateId,
  );
  if (
    !Array.isArray(templateFlow.definition?.screens) ||
    templateFlow.definition.screens.length < 1 ||
    !Array.isArray(templateFlow.definition.screens[0]?.blocks) ||
    templateFlow.definition.screens[0].blocks.length < 3
  )
    throw new Error("Template não preservou campos do catálogo original");

  await page.goto(`${baseUrl}/flows/builder`, { waitUntil: "networkidle" });
  await page.route("**/api/flows/generate", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        definition: {
          version: "7.3",
          screens: [
            {
              id: "ai-screen",
              title: "Qualificação IA",
              text: "Informe seu interesse.",
              buttonText: "Concluir",
              final: true,
              next: null,
            },
          ],
        },
      }),
    }),
  );
  const aiName = `ai_e2e_${Date.now()}`;
  await page.getByRole("button", { name: "Criar com IA" }).click();
  await page.getByLabel("Nome", { exact: true }).fill(aiName);
  await page
    .getByLabel("O que você quer no formulário?")
    .fill("Quero captar o interesse principal do novo lead.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Criar", exact: true })
    .click();
  await page.waitForURL(/\/flows\/builder\/[^/]+$/);
  const aiId = page.url().split("/").at(-1);
  const aiFlow = await page.evaluate(
    async (id) => (await fetch(`/api/flows/${id}`)).json(),
    aiId,
  );
  if (aiFlow.definition?.screens?.[0]?.title !== "Qualificação IA")
    throw new Error("Geração IA não persistiu a definição retornada");

  await page.screenshot({
    path: new URL("resultado.png", outputDir).pathname,
    fullPage: true,
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        template: { id: templateId, screens: templateFlow.definition.screens.length },
        ai: { id: aiId, title: aiFlow.definition.screens[0].title },
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
  await writeFile(
    new URL("falha.txt", outputDir),
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  throw error;
} finally {
  await browser.close();
}
