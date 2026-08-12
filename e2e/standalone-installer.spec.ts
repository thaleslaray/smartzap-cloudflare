import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const installerUrl = pathToFileURL(resolve(process.cwd(), "docs/install/index.html")).href;

const provisionerUrl = "https://instalar.escoladeautomacao.com/smartzap/";
const forkInstallerUrl = `${provisionerUrl}fork/`;

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

test.describe("confirmação do fork verdadeiro", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("https://instalar.escoladeautomacao.com/smartzap/fork/", async (route) => {
      const { forkInstallerHtml } = await import("../provisioner/src/fork-ui");
      await route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: forkInstallerHtml(),
        headers: { "Content-Security-Policy": "default-src 'self'; connect-src 'self' https://api.github.com; script-src 'unsafe-inline'; style-src 'unsafe-inline'" },
      });
    });
  });

  test("bloqueia Cloudflare até o GitHub comprovar o vínculo upstream", async ({ page }) => {
    await page.route("https://api.github.com/repos/cliente-smartzap/smartzap-cloudflare", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          full_name: "cliente-smartzap/smartzap-cloudflare",
          fork: true,
          parent: { full_name: "thaleslaray/smartzap-cloudflare" },
          default_branch: "main",
          private: false,
        }),
      });
    });
    await page.goto(forkInstallerUrl);
    const cloudflare = page.getByRole("link", { name: /Abrir Workers/ });
    await expect(cloudflare).toHaveAttribute("aria-disabled", "true");
    await cloudflare.dispatchEvent("click");
    await expect(page.getByText("Confirme primeiro que o fork verdadeiro foi criado.")).toBeVisible();

    await page.getByLabel("Seu usuário ou organização no GitHub").fill("cliente-smartzap");
    await page.getByRole("button", { name: "Confirmar meu fork" }).click();
    await expect(page.getByText(/Fork confirmado: cliente-smartzap\/smartzap-cloudflare/)).toBeVisible();
    await expect(cloudflare).toHaveAttribute("aria-disabled", "false");
  });

  test("recusa uma cópia independente mesmo com nome idêntico", async ({ page }) => {
    await page.route("https://api.github.com/repos/copia-smartzap/smartzap-cloudflare", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          full_name: "copia-smartzap/smartzap-cloudflare",
          fork: false,
          default_branch: "main",
          private: false,
        }),
      });
    });
    await page.goto(forkInstallerUrl);
    await page.getByLabel("Seu usuário ou organização no GitHub").fill("copia-smartzap");
    await page.getByRole("button", { name: "Confirmar meu fork" }).click();
    await expect(page.getByText("Esse repositório não é um fork público válido do SmartZap com branch main.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Abrir Workers/ })).toHaveAttribute("aria-disabled", "true");
  });
});
