import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
}

test("shell executa ajuda e alertas reais sem superfície descontinuada", async ({ page }) => {
  await login(page);

  const help = page.getByRole("button", { name: "Abrir ajuda" });
  await expect(help).toHaveCount(1);
  await help.click();
  const helpDialog = page.getByRole("dialog", { name: "Ajuda do SmartZap" });
  await expect(helpDialog).toBeVisible();
  await expect(helpDialog.getByText("Configurar número e credenciais")).toBeVisible();
  await helpDialog.getByRole("button", { name: "Fechar" }).click();

  await expect(page.getByRole("button", { name: /modo desenvolvedor/i })).toHaveCount(0);

  const alerts = page.getByRole("button", { name: /Alertas operacionais/ });
  await alerts.click();
  await expect(page.getByRole("dialog", { name: "Alertas operacionais" })).toBeVisible();
});

test("rotas removidas e desconhecidas têm estados explícitos", async ({ page }) => {
  await login(page);
  await page.goto("/workflows/qualquer-coisa");
  await expect(page.getByRole("heading", { name: "Workflows não fazem parte desta versão" })).toBeVisible();
  await page.goto("/rota-que-nao-existe");
  await expect(page.getByRole("heading", { name: "Esta página não existe" })).toBeVisible();
});

test("onboarding deriva o progresso da saúde real do ambiente", async ({ page }) => {
  await page.route("**/api/settings/health", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        whatsappConfigured: false,
        metaLive: false,
        webhookConfigured: false,
        approvedTemplates: 0,
      }),
    });
  });
  await login(page);
  const onboarding = page.getByRole("complementary", { name: "Configuração inicial" });
  await expect(onboarding).toBeVisible();
  await expect(onboarding).toContainText("0 de 4 etapas concluídas");
  await onboarding.getByRole("button", { name: "Fechar configuração inicial" }).click();
  await expect(onboarding).toBeHidden();
});

test("manifesto e service worker públicos estão disponíveis", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).name).toContain("SmartZap");
  const worker = await request.get("/sw.js");
  expect(worker.ok()).toBeTruthy();
  expect(await worker.text()).toContain("smartzap-shell");
});
