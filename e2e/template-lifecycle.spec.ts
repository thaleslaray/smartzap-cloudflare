import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  if (!page.url().includes("/login")) return;
  await page.getByLabel("Senha mestra").fill(process.env.QA_MASTER_PASSWORD || "dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
}

test("template degradado explica estado, motivo, correção, qualidade e categoria futura", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/templates");

  await page.getByRole("button", { name: /Rejeitados/ }).click();
  const card = page.getByText("e2e_template_ciclo_meta").locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await expect(card).toContainText("Rejeitado");
  await card.getByRole("button", { name: "Ver detalhes" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("As variáveis do corpo precisam de contexto descritivo.");
  await expect(dialog).toContainText("Inclua texto antes e depois de cada variável.");
  await expect(dialog).toContainText("Qualidade informada pela Meta: YELLOW");
  await expect(dialog).toContainText("A Meta programou a mudança de categoria para MARKETING");
  await expect(dialog.getByRole("button", { name: "Criar campanha" })).toHaveCount(0);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
