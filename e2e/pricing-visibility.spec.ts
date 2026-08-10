import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
}

test("detalhe separa custo estimado e confirmado sem competir com os logs", async ({ page }) => {
  await login(page);
  await page.goto("/campaigns/77777777-7777-4777-8777-777777777777");
  const cost = page.locator("section", { hasText: "Custo Meta" });
  await expect(cost.getByText("Estimativa (BRL)")).toBeVisible();
  await expect(cost.getByText("R$ 0,3217", { exact: true })).toBeVisible();
  await expect(cost.getByText("Tabela 2026-07-01", { exact: true })).toBeVisible();
  await expect(cost.getByText("Confirmado pela Meta (BRL)")).toBeVisible();
  await expect(cost.getByText("R$ 0,33", { exact: true })).toBeVisible();
  await expect(cost.getByText("Pricing analytics/webhooks", { exact: true })).toBeVisible();
  const boxes = cost.locator("div.rounded-lg.border");
  await expect(boxes).toHaveCount(2);
  const positions = await boxes.evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width) };
  }));
  expect(positions[0].y).toBe(positions[1].y);
  expect(positions[0].x).toBeLessThan(positions[1].x);
  expect(positions[0].width).toBe(positions[1].width);
  await expect(page.getByRole("heading", { name: "Logs de Envio" })).toBeVisible();
});

test("Configurações comunica quando a tabela oficial já está vigente", async ({ page }) => {
  await login(page);
  await page.route("**/api/pricing/rate-cards/import-official", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        imported: false,
        rows: 1,
        effectiveFrom: "2026-07-01",
      }),
    });
  });
  await page.goto("/settings");
  await expect(page.getByText(/Ativa desde 2026-07-01 · 1 tarifas/)).toBeVisible();
  await page.getByRole("button", { name: "Atualizar automaticamente" }).click();
  await expect(page.getByText(
    "Nenhuma atualização necessária: a tabela BRL oficial de 01/07/2026 já está ativa.",
  )).toBeVisible();
  await expect(page.getByText("Importar arquivo CSV", { exact: true })).toBeVisible();
});
