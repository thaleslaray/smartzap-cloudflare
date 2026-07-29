import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test("prévia Apple-inspired renderiza e responde no desktop e mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/design-preview");
  await expect(page.getByRole("heading", { name: "Mensagens que chegam com clareza." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(page.getByRole("button", { name: "Fechar menu", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fechar menu", exact: true }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Navegação da prévia" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nova campanha" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
