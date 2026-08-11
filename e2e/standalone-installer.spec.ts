import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const installerUrl = pathToFileURL(resolve(process.cwd(), "docs/install/index.html")).href;

test.describe("instalador estático pré-deploy", () => {
  test("gera e limpa credenciais sem tráfego externo", async ({ page }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith("file:")) externalRequests.push(request.url());
    });

    await page.goto(installerUrl);
    await expect(page.getByRole("heading", { name: "Crie as chaves sem enviá-las para ninguém." })).toBeVisible();
    await page.getByRole("button", { name: "Gerar senha forte" }).click();
    await expect(page.getByRole("button", { name: "Criar chave e nomes" })).toBeEnabled();
    await page.getByRole("button", { name: "Criar chave e nomes" }).click();

    await expect(page.locator("#vault")).toHaveText(/^[-_A-Za-z0-9]{43}$/);
    await expect(page.locator("#master")).toHaveText(/^.{24}$/);
    await expect(page.locator(".resource")).toHaveCount(9);
    await expect(page.locator("#deploy")).toHaveAttribute("aria-disabled", "true");
    expect(externalRequests).toEqual([]);

    await page.reload();
    await expect(page.locator("#password-step")).toBeVisible();
    await expect(page.locator("#recovery-step")).toBeHidden();
    await expect(page.locator("#vault")).toHaveText("");
  });

  test("só libera o deploy depois do download e do preflight", async ({ page }) => {
    await page.goto(installerUrl);
    await page.getByRole("button", { name: "Gerar senha forte" }).click();
    await page.getByRole("button", { name: "Criar chave e nomes" }).click();

    for (const checkbox of await page.locator("[data-preflight]").all()) await checkbox.check();
    await expect(page.locator("#deploy")).toHaveAttribute("aria-disabled", "true");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar arquivo de recuperação" }).click();
    const artifact = await download;
    expect(artifact.suggestedFilename()).toBe("smartzap-recuperacao.txt");
    await expect(page.locator("#deploy")).toHaveAttribute("aria-disabled", "false");
    await expect(page.locator("#deploy")).toHaveAttribute(
      "href",
      "https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fthaleslaray%2Fsmartzap-cloudflare",
    );
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
    await page.getByRole("button", { name: "Gerar senha forte" }).click();
    await page.getByRole("button", { name: "Criar chave e nomes" }).click();
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(violations).toEqual([]);
  });
});
