import { expect, type Page } from "@playwright/test";

export async function waitForAuthedAppReady(page: Page) {
  await expect(page.locator("main")).toBeVisible();
  await expect(
    page.getByText("Carregando…", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("A tela encontrou um erro", { exact: false }),
  ).toHaveCount(0);
}

export async function gotoAuthedRoute(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await waitForAuthedAppReady(page);
}

export async function reloadAuthedRoute(page: Page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAuthedAppReady(page);
}
