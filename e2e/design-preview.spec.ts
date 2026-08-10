import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test("prévia Apple-inspired descontinuada não permanece pública", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/design-preview");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("Senha mestra")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});
