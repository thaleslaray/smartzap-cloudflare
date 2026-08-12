import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { publicStaticRoutes } from "./support/route-inventory";

for (const path of publicStaticRoutes) {
  test(`${path} é pública, responsiva e acessível`, async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByText("Informação pública")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText("Instalação autogerenciada")).toBeVisible();
      await expect(page.getByText("Escola de Automação")).toHaveCount(0);
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 2);
    }
    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });
}
