import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const installerUrl = pathToFileURL(resolve(process.cwd(), "docs/install/index.html")).href;

const provisionerUrl = "https://instalar.escoladeautomacao.com/smartzap/";

test.describe("entrada pública do provisionador", () => {
  test("não coleta credenciais e aponta para o seletor das duas modalidades", async ({ page }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith("file:")) externalRequests.push(request.url());
    });

    await page.goto(installerUrl);
    await expect(page.getByRole("heading", { name: "Escolha o fork ou uma instalação rápida." })).toBeVisible();
    await expect(page.getByRole("link", { name: /Comparar formas de instalação/ })).toHaveAttribute("href", provisionerUrl);
    await expect(page.locator('input, button, form')).toHaveCount(0);
    await expect(page.locator(`a[href*="deploy.workers.cloudflare.com"]`)).toHaveCount(0);
    expect(externalRequests).toEqual([]);
  });

  test("explica propriedade do código, versão fixa e setup", async ({ page }) => {
    await page.goto(installerUrl);
    await expect(page.getByRole("heading", { name: "Produção: crie seu fork" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Avaliação: use OAuth" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Conclua o /setup" })).toBeVisible();
    await expect(page.getByText(/não inclui atualizações/i)).toBeVisible();
  });

  for (const width of [360, 390, 620, 768, 1440, 1920]) {
    test(`não cria overflow em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(installerUrl);
      const sizes = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
    });
  }

  test("não possui violações WCAG A/AA automatizadas", async ({ page }) => {
    await page.goto(installerUrl);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(violations).toEqual([]);
  });
});
