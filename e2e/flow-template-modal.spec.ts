import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`modal de templates preserva ações e rola somente o catálogo em ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    await page.getByLabel("Senha mestra").fill("dev");
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes("/login")),
      page.getByRole("button", { name: "Entrar" }).click(),
    ]);
    await page.goto("/flows/builder");
    await page.getByRole("button", { name: "Criar por template" }).click();

    const dialog = page.getByRole("dialog", { name: "Criar MiniApp por template" });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/flows\/builder$/);
    await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Criar", exact: true })).toBeVisible();

    const geometry = await dialog.evaluate((element) => {
      const panel = element.getBoundingClientRect();
      const catalog = Array.from(element.querySelectorAll("div")).find(
        (candidate) => getComputedStyle(candidate).overflowY === "auto",
      );
      const catalogRect = catalog?.getBoundingClientRect();
      return {
        panelHeight: panel.height,
        panelWidth: panel.width,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        catalogHeight: catalogRect?.height ?? 0,
        catalogScrollHeight: catalog?.scrollHeight ?? 0,
      };
    });

    expect(geometry.panelHeight).toBeLessThanOrEqual(geometry.viewportHeight * 0.86 + 2);
    expect(geometry.panelWidth).toBeLessThanOrEqual(Math.min(576, geometry.viewportWidth - 32) + 2);
    expect(geometry.catalogHeight).toBeGreaterThan(0);
    expect(geometry.catalogScrollHeight).toBeGreaterThanOrEqual(geometry.catalogHeight);
  });
}

test("Templates cria MiniApp vazio e abre o editor sem exibir o catálogo", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
  await page.goto("/templates?tab=flows");
  await Promise.all([
    page.waitForURL(/\/flows\/builder\/[^/?]+$/),
    page.getByRole("button", { name: "Criar MiniApp", exact: true }).click(),
  ]);
  await expect(page.getByRole("dialog", { name: "Criar MiniApp por template" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Editor de MiniApp", exact: true })).toBeVisible();
  await expect(page.getByText("Como quer começar?")).toBeVisible();

  const id = new URL(page.url()).pathname.split("/").at(-1);
  if (id) await page.request.delete(`/api/flows/${id}`);
});
