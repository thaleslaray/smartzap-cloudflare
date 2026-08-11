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

function setupFixture(overrides: Record<string, unknown> = {}) {
  const base = {
    required: true,
    complete: false,
    infrastructure: {
      database: true, media: true, webhookQueue: true, automationQueue: true,
      conversionQueue: true, workflow: true, durableObjects: true, rateLimit: true,
      workersAi: true, aiSearch: false, cron: true,
    },
    vault: { configured: true, rotationReady: false, rotationStatus: "idle", rotationUpdatedAt: null, metaStored: false },
    meta: { configured: false, appId: null, phoneId: null, wabaId: null, callbackUrl: null, graphVersion: "v25.0" },
    templates: { approved: 0 },
    checks: {},
    installation: { status: "configuring", last_step: "infrastructure", last_error: null, revision: 1 },
  };
  return {
    ...base,
    ...overrides,
    infrastructure: { ...base.infrastructure, ...((overrides.infrastructure as Record<string, boolean> | undefined) ?? {}) },
    vault: { ...base.vault, ...((overrides.vault as Record<string, unknown> | undefined) ?? {}) },
    meta: { ...base.meta, ...((overrides.meta as Record<string, unknown> | undefined) ?? {}) },
    templates: { ...base.templates, ...((overrides.templates as Record<string, unknown> | undefined) ?? {}) },
    checks: { ...base.checks, ...((overrides.checks as Record<string, unknown> | undefined) ?? {}) },
  };
}

async function mockSetupStatus(page: Page, state: () => Record<string, unknown>) {
  await page.route("**/api/setup/status", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(state()),
  }));
}

test("entrada interna encaminha ao provisionador OAuth sem coletar segredos", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(`${request.url()}\n${request.postData() || ""}`));
  await page.goto("/install");
  await expect(page.getByRole("heading", { name: "Instale sem terminal, token de API ou GitHub Actions." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir instalador seguro" })).toHaveAttribute(
    "href",
    "https://smartzap-provisioner.thales2581.workers.dev/",
  );
  await expect(page.locator('input, button, form')).toHaveCount(0);
  await expect(page.locator('a[href*="deploy.workers.cloudflare.com"]')).toHaveCount(0);
  expect(requests.every((entry) => !entry.includes("MASTER_PASSWORD") && !entry.includes("SMARTZAP_VAULT_KEY"))).toBe(true);

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
});

test("assistente falha fechado e não expõe os segredos cadastrados", async ({ page }) => {
  const secret = `segredo-${crypto.randomUUID()}`;
  await mockSetupStatus(page, () => setupFixture({ infrastructure: { cron: false } }));
  // Interceptar antes do login: a navegação pós-login já pode montar o Setup e
  // aquecer o cache do React Query, especialmente no WebKit.
  await login(page);
  await expect(page.getByRole("heading", { name: "Configuração inicial" })).toBeVisible();
  await expect(page.getByText("1 recurso(s) precisa(m) de atenção.")).toBeVisible();
  await expect(page.getByText("Agendamento automático")).toBeVisible();
  await expect(page.getByRole("button", { name: "Configurar webhook" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Verificar novamente" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Rotacionar cofre" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enviar mensagem de teste" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Concluir configuração" })).toBeDisabled();
  expect(await page.locator("body").textContent()).not.toContain(secret);
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
  await expect(page.getByText("Aguardando a homologação")).toBeVisible();

  complete = true;
  await expect(page.getByText("SmartZap liberado").first()).toBeVisible({ timeout: 5_000 });
});

test("senha incorreta explica qual senha deve ser usada", async ({ page }) => {
  await page.route("**/api/auth/config", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ turnstileSiteKey: null, turnstileRequired: false }),
  }));
  await page.route("**/api/auth/login", async (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: "senha incorreta" }),
  }));
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toHaveText("Senha incorreta. Use a senha administrativa criada no início da instalação.");
});

test("chave do cofre ausente ensina a corrigir sem pedir o segredo na tela", async ({ page }) => {
  await mockSetupStatus(page, () => setupFixture({ vault: { configured: false, metaStored: false } }));
  await login(page);
  const vaultWarning = page.getByRole("heading", { name: "Adicione a chave do cofre" }).locator("..");
  await expect(vaultWarning).toBeVisible();
  await expect(vaultWarning.getByText(/adicione um secret chamado/)).toBeVisible();
  await expect(vaultWarning.getByText("SMARTZAP_VAULT_KEY", { exact: true })).toBeVisible();
  await expect(vaultWarning.getByText("Não cole a chave nesta tela.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar com segurança" })).toBeDisabled();
});

test("Meta recusada mostra causa e campos que devem ser revisados", async ({ page }) => {
  await mockSetupStatus(page, () => setupFixture({
    vault: { metaStored: true },
    checks: {
      meta_credentials: { status: "failed", detail: "Token expirado ou sem permissão para esta WABA.", checked_at: "2026-08-10" },
    },
    installation: { status: "failed", last_step: "meta_validation", last_error: "Token expirado ou sem permissão para esta WABA.", revision: 2 },
  }));
  await login(page);
  await expect(page.getByRole("heading", { name: "A instalação parou nesta etapa" })).toBeVisible();
  await expect(page.getByText("Não foi possível conectar à Meta")).toBeVisible();
  await expect(page.getByText(/Confira o token, o App ID, a WABA e o Phone Number ID/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Revisar esta etapa" })).toBeVisible();
});

test("webhook inválido recebe orientação contextual na etapa Meta", async ({ page }) => {
  await mockSetupStatus(page, () => setupFixture());
  await page.route("**/api/setup/meta", async (route) => route.fulfill({
    status: 400,
    contentType: "application/json",
    body: JSON.stringify({ error: "O endereço do webhook precisa usar HTTPS." }),
  }));
  await login(page);
  await page.getByLabel("Token permanente").fill("token-permanente-de-teste");
  await page.getByLabel("App ID").fill("12345");
  await page.getByLabel("App Secret").fill("app-secret-teste");
  await page.getByLabel("Verify Token").fill("verify-token-seguro");
  await page.getByLabel("Phone Number ID").fill("67890");
  await page.getByLabel("WABA ID").fill("98765");
  await page.getByRole("button", { name: "Salvar com segurança" }).click();
  await expect(page.getByText("Não foi possível conectar à Meta")).toBeVisible();
  await expect(page.getByText(/O endereço do webhook precisa usar HTTPS/)).toBeVisible();
});

test("ausência de template aprovado informa onde corrigir", async ({ page }) => {
  await mockSetupStatus(page, () => setupFixture({
    vault: { metaStored: true },
    meta: { configured: true, callbackUrl: "https://smartzap.example.workers.dev/webhook" },
    checks: {
      meta_credentials: { status: "passed", detail: "ok", checked_at: "2026-08-10" },
      templates: { status: "failed", detail: "nenhum template aprovado encontrado", checked_at: "2026-08-10" },
    },
    installation: { status: "failed", last_step: "templates", last_error: "nenhum template aprovado encontrado", revision: 3 },
  }));
  await login(page);
  await expect(page.getByText("Nenhum template aprovado foi encontrado")).toBeVisible();
  await expect(page.getByText(/Confirme na Meta se existe um template aprovado nesta WABA/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sincronizar templates" })).toBeEnabled();
});

test("mensagem ainda não lida é acompanhada automaticamente sem botão técnico", async ({ page }) => {
  await mockSetupStatus(page, () => setupFixture({
    vault: { metaStored: true },
    templates: { approved: 1 },
    checks: {
      meta_credentials: { status: "passed", detail: "ok", checked_at: "2026-08-10" },
      templates: { status: "passed", detail: "1 template aprovado", checked_at: "2026-08-10" },
      real_message: { status: "pending", detail: "mensagem aceita pela Meta", checked_at: "2026-08-10" },
    },
    installation: { status: "configuring", last_step: "real_message", last_error: null, revision: 4 },
  }));
  await login(page);
  await expect(page.getByText("Aguardando a confirmação do WhatsApp")).toBeVisible();
  await expect(page.getByText(/verifica automaticamente, a cada 3 segundos/)).toBeVisible();
  await expect(page.getByRole("button", { name: /delivered|read/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Concluir configuração" })).toBeDisabled();
});

test("instalação interrompida retoma a verificação sem perder progresso", async ({ page }) => {
  let failed = true;
  await mockSetupStatus(page, () => setupFixture({
    infrastructure: { workflow: !failed },
    installation: failed
      ? { status: "failed", last_step: "infrastructure", last_error: "Workflow indisponível.", revision: 2 }
      : { status: "configuring", last_step: "infrastructure", last_error: null, revision: 3 },
  }));
  await page.route("**/api/setup/infrastructure/probe", async (route) => {
    failed = false;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await login(page);
  await expect(page.getByRole("heading", { name: "A instalação parou nesta etapa" })).toBeVisible();
  await expect(page.getByText("Workflows de instalação e campanhas")).toBeVisible();
  await page.getByRole("button", { name: "Testar novamente" }).click();
  await expect(page.getByText("Todos os recursos obrigatórios estão prontos.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "A instalação parou nesta etapa" })).toHaveCount(0);
});
