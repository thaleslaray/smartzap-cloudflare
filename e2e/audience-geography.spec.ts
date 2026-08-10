import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
}

test("seletor geográfico cobre países e mantém 27 UFs em grade de três colunas", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  let campaignId = "";
  await login(page);
  try {
    await page.goto("/campaigns/new");
    await page.getByLabel("Nome da campanha").fill(`Geografia ${testInfo.project.name} ${Date.now()}`);
    await page.getByLabel("Buscar template").fill("e2e_marketing_simples");
    await page.getByRole("button", { name: /e2e_marketing_simples/ }).click();
    const created = page.waitForResponse((response) =>
      response.url().endsWith("/api/campaigns") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Continuar" }).click();
    const createdResponse = await created;
    expect(createdResponse.status()).toBe(201);
    campaignId = ((await createdResponse.json()) as { id: string }).id;

    await page.getByRole("button", {
      name: /Público personalizado Público salvo, tags, DDI ou UF/,
    }).click();
    await expect(page.getByText("245 países e territórios.")).toBeVisible();
    await expect(page.getByText("27 UFs · 67 DDDs.")).toBeVisible();

    const states = page.locator("button").filter({ hasText: /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/ });
    await expect(states).toHaveCount(27);
    expect(await states.evaluateAll((nodes) => nodes.every((node) => (node as HTMLButtonElement).disabled))).toBe(true);
    const geometry = await states.evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
    }));
    expect(new Set(geometry.map((item) => item.x)).size).toBe(3);
    expect(new Set(geometry.map((item) => item.y)).size).toBe(9);
    expect(new Set(geometry.map((item) => item.width)).size).toBe(1);
    expect(new Set(geometry.map((item) => item.height)).size).toBe(1);

    await page.getByRole("button", { name: "Selecionar países por DDI" }).click();
    await page.getByLabel("Buscar país ou DDI").fill("Japão");
    await expect(page.getByRole("option", { name: /Japão \(JP\).+81/ })).toHaveCount(1);
    await page.getByRole("option", { name: /Japão \(JP\).+81/ }).click();
    await expect(page.getByText("JP +81", { exact: true })).toBeVisible();

    await page.getByLabel("Buscar país ou DDI").fill("Brasil");
    await page.getByRole("option", { name: /Brasil \(BR\).+55/ }).click();
    expect(await states.evaluateAll((nodes) => nodes.every((node) => !(node as HTMLButtonElement).disabled))).toBe(true);
    await page.getByRole("button", { name: "DF", exact: true }).click();
    await page.getByRole("button", { name: "GO", exact: true }).click();
    await expect(page.getByRole("button", { name: "DF", exact: true })).toHaveClass(/emerald/);
    await expect(page.getByRole("button", { name: "GO", exact: true })).toHaveClass(/emerald/);
  } finally {
    if (campaignId) {
      await page.evaluate(async (id) => {
        await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      }, campaignId).catch(() => undefined);
    }
  }
});
