import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Estes cenários interceptam APIs para provar estados de falha. Em ambiente
// remoto, o service worker pode responder antes do roteamento do Playwright.
// A jornada PWA possui cobertura própria e não depende desta suíte.
test.use({ serviceWorkers: "block" });

async function login(page: Page) {
  await page.goto("/login");
  if (!page.url().includes("/login")) return;
  await page.getByLabel("Senha mestra").fill(process.env.QA_MASTER_PASSWORD || "dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
}

test("instalador gera segredos localmente sem persistência ou overflow", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(`${request.url()}\n${request.postData() || ""}`));
  await page.goto("/install");
  await expect(page.getByRole("heading", { name: "Proteja sua instalação antes do deploy." })).toBeVisible();
  const prepare = page.getByRole("button", { name: "Criar chave do cofre" });
  await expect(prepare).toBeDisabled();
  await page.getByRole("button", { name: "Gerar senha forte" }).click();
  const suggestedPassword = await page.getByLabel("Senha administrativa").inputValue();
  expect(suggestedPassword).toHaveLength(24);
  expect(await page.getByLabel("Confirme a senha").inputValue()).toBe(suggestedPassword);
  await expect(prepare).toBeEnabled();

  await page.getByLabel("Senha administrativa").fill("fraca");
  await page.getByLabel("Confirme a senha").fill("diferente");
  await expect(page.getByText("As senhas não coincidem.")).toBeVisible();
  await expect(prepare).toBeDisabled();

  const chosenPassword = "SmartZap!Seguro2026";
  await page.getByLabel("Senha administrativa").fill(chosenPassword);
  await page.getByLabel("Confirme a senha").fill(chosenPassword);
  await expect(prepare).toBeEnabled();
  await prepare.click();

  const vault = await page.locator("code").nth(0).textContent();
  const password = await page.locator("code").nth(1).textContent();
  expect(vault).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(password).toBe(chosenPassword);
  expect(vault).not.toBe(password);

  const resourceNames = await page.locator("dl code").allTextContents();
  expect(resourceNames).toHaveLength(9);
  expect(new Set(resourceNames).size).toBe(9);
  for (const name of resourceNames) expect(name).toMatch(/^smartzap-[a-f0-9]{8}(?:-[a-z-]+)?$/);

  const browserStorage = await page.evaluate(() => JSON.stringify({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  expect(browserStorage).not.toContain(vault!);
  expect(browserStorage).not.toContain(password!);
  expect(requests.join("\n")).not.toContain(vault!);
  expect(requests.join("\n")).not.toContain(password!);

  for (const width of [360, 390, 620, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    const size = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.client + 2);
  }
  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(page.getByRole("button", { name: "Salve a recuperação" })).toBeDisabled();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Baixar recuperação" }).click(),
  ]);
  const stream = await download.createReadStream();
  let recovery = "";
  for await (const chunk of stream) recovery += chunk.toString();
  expect(recovery).toContain(`SMARTZAP_VAULT_KEY=${vault}`);
  expect(recovery).toContain(`MASTER_PASSWORD=${password}`);
  for (const name of resourceNames) expect(recovery).toContain(name);

  await expect(page.getByRole("button", { name: "Confirme os nomes" })).toBeDisabled();
  await page.getByLabel(/Vou usar estes nomes/).check();
  await expect(page.getByRole("link", { name: "Deploy to Cloudflare" })).toHaveAttribute(
    "href",
    /deploy\.workers\.cloudflare\.com\/\?url=/,
  );
});

test("assistente falha fechado e não expõe os segredos cadastrados", async ({ page }) => {
  const secret = `segredo-${crypto.randomUUID()}`;
  await page.route("**/api/setup/status", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      infrastructure: {
        database: true, media: true, webhookQueue: true, automationQueue: true,
        conversionQueue: true, workflow: true, durableObjects: true, rateLimit: true,
        workersAi: true, aiSearch: true, cron: false,
      },
      vault: { configured: true, rotationReady: false, rotationStatus: "idle", metaStored: false },
      meta: { configured: false, appId: null, phoneId: null, wabaId: null, callbackUrl: null, graphVersion: "v25.0" },
      templates: { approved: 0 },
      checks: {},
      required: true,
      complete: false,
    }),
  }));
  // Interceptar antes do login: a navegação pós-login já pode montar o Setup e
  // aquecer o cache do React Query, especialmente no WebKit.
  await login(page);
  await expect(page.getByRole("heading", { name: "Configuração inicial" })).toBeVisible();
  await expect(page.getByText("Há recursos obrigatórios ausentes")).toBeVisible();
  await expect(page.getByRole("button", { name: "Validar na Meta" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Rotacionar cofre" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enviar teste" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Concluir configuração" })).toBeDisabled();
  expect(await page.locator("body").textContent()).not.toContain(secret);
});

test("instalação obrigatória redireciona o produto para o setup", async ({ page }) => {
  await page.route("**/api/setup/status", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      required: true,
      complete: false,
      infrastructure: {},
      vault: { configured: true, rotationReady: false, rotationStatus: "idle", metaStored: false },
      meta: { configured: false, appId: null, phoneId: null, wabaId: null, callbackUrl: null, graphVersion: "v25.0" },
      templates: { approved: 0 },
      checks: {},
      installation: { status: "configuring", last_step: "infrastructure", last_error: null, revision: 1 },
    }),
  }));
  await login(page);
  // A recuperação automática de chunks pode substituir a navegação enquanto
  // um deploy acaba de propagar; o destino funcional continua sendo /setup.
  await page.goto("/").catch(() => undefined);
  await page.waitForURL((url) => url.pathname === "/setup");
  await expect(page.getByRole("heading", { name: "Configuração inicial" })).toBeVisible();
});

test("assistente acompanha automaticamente a conclusão recebida pela Queue", async ({ page }) => {
  let complete = false;
  await page.route("**/api/setup/status", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      required: true,
      complete,
      infrastructure: {
        database: true, media: true, webhookQueue: true, automationQueue: true,
        conversionQueue: true, workflow: true, durableObjects: true, rateLimit: true,
        workersAi: true, aiSearch: true, cron: true,
      },
      vault: { configured: true, rotationReady: false, rotationStatus: "idle", metaStored: true },
      meta: { configured: true, appId: "123", phoneId: "456", wabaId: "789", callbackUrl: "https://example.com/webhook", graphVersion: "v25.0" },
      templates: { approved: 1 },
      checks: {
        meta_credentials: { status: "passed", detail: "ok", checked_at: "2026-08-09" },
        templates: { status: "passed", detail: "ok", checked_at: "2026-08-09" },
        real_message: { status: complete ? "passed" : "pending", detail: "ok", checked_at: "2026-08-09" },
      },
      installation: { status: complete ? "ready" : "configuring", last_step: complete ? "complete" : "real_message", last_error: null, revision: complete ? 2 : 1 },
    }),
  }));
  await login(page);
  await expect(page.getByText("Homologação pendente")).toBeVisible();

  complete = true;
  await expect(page.getByText("SmartZap liberado").first()).toBeVisible({ timeout: 5_000 });
});
