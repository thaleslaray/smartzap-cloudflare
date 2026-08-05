import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./support/a11y";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  if (!page.url().includes("/login")) return;
  const password = page.getByLabel("Senha mestra");
  await expect(password).toBeVisible();
  await password.fill(process.env.QA_MASTER_PASSWORD || "dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
}

test("editor mantém navegação no box, variável assistida e uma única prévia", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/templates/drafts/new");

  await page.getByRole("button", { name: /Continuar/ }).click();
  const message = page.getByLabel("Mensagem do template");
  await message.fill("Olá !");
  await message.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(4, 4);
  });
  await page.getByRole("button", { name: "Adicionar variável" }).click();

  await expect(message).toHaveValue("Olá {{1}}!");
  await expect(page.getByRole("button", { name: "Visualizar" })).toHaveCount(0);
  await expect(page.getByText("Previa do modelo")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Continuar/ })).toBeVisible();
});

test("editor móvel oferece prévia sem esconder o avanço", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/templates/drafts/new");
  await expect(page.getByRole("button", { name: /Continuar/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
  const steps = page.getByTestId("template-step");
  await expect(steps).toHaveCount(3);
  expect(
    await steps.evaluateAll((nodes) =>
      nodes.every((node) => node.scrollWidth <= node.clientWidth),
    ),
  ).toBe(true);
});

test("editor bloqueia conteúdo que a Meta rejeita e libera após correção", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/templates/drafts/new");
  await page.getByRole("button", { name: /Continuar/ }).click();

  const message = page.getByLabel("Mensagem do template");
  const continueButton = page.getByRole("button", { name: /Continuar/ });
  await message.fill("{{1}} oi ?");
  await expect(page.getByRole("alert")).toContainText(
    "não pode começar nem terminar com uma variável",
  );
  await expect(continueButton).toBeDisabled();

  await message.fill("Olá {{1}}, tudo bem?");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(continueButton).toBeEnabled();
});

for (const category of ["MARKETING", "UTILITY"] as const) {
  test(`editor salva matriz simples completa na categoria ${category}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page);
    await page.goto("/templates/drafts/new");

    const categorySelect = page.getByLabel("Categoria do template");
    await expect(categorySelect.locator("option")).toHaveText(["Marketing", "Utilidade"]);
    await expect(categorySelect.locator('option[value="AUTHENTICATION"]')).toHaveCount(0);
    await categorySelect.selectOption(category);
    await page.getByLabel("Nome do template").fill(`e2e_${category.toLowerCase()}_${Date.now()}`);
    await page.getByRole("button", { name: /Continuar/ }).click();

    await page.getByLabel("Mensagem do template").fill("Olá {{1}}, seu pedido {{2}} está pronto.");
    await page.getByLabel("Rodapé do template").fill("SmartZap QA");
    await page.getByRole("button", { name: /Continuar/ }).click();

    await page.getByRole("button", { name: "+ Resposta rápida", exact: true }).click();
    await page.getByRole("button", { name: "+ Link", exact: true }).click();
    await page.getByRole("button", { name: "+ Telefone", exact: true }).click();
    await page.getByLabel("Texto do botão 1").fill("Confirmar");
    await page.getByLabel("Texto do botão 2").fill("Acompanhar");
    await page.getByLabel("URL do botão 2").fill("https://example.com/pedido/{{1}}");
    await page.getByLabel("Exemplo da URL do botão 2").fill("pedido-123");
    await page.getByLabel("Texto do botão 3").fill("Falar conosco");
    await page.getByLabel("Telefone do botão 3").fill("+5521999999999");
    await expect(page.getByRole("alert")).toHaveCount(0);

    const saved = page.waitForResponse((response) =>
      response.url().endsWith("/api/templates/drafts") &&
      response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const created = await response.json() as { id: string };
    const payload = response.request().postDataJSON() as {
      category: string;
      components: Array<Record<string, unknown>>;
    };
    expect(payload.category).toBe(category);
    expect(payload.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "BODY", text: "Olá {{1}}, seu pedido {{2}} está pronto." }),
      expect.objectContaining({ type: "FOOTER", text: "SmartZap QA" }),
      expect.objectContaining({
        type: "BUTTONS",
        buttons: [
          { type: "QUICK_REPLY", text: "Confirmar" },
          { type: "URL", text: "Acompanhar", url: "https://example.com/pedido/{{1}}", example: ["pedido-123"] },
          { type: "PHONE_NUMBER", text: "Falar conosco", phone_number: "+5521999999999" },
        ],
      }),
    ]));

    await page.evaluate(async (id) => {
      await fetch(`/api/templates/drafts/${id}`, { method: "DELETE" });
    }, created.id);
  });
}

test("editor explica agrupamento inválido de botões e bloqueia envio", async ({ page }) => {
  await login(page);
  await page.goto("/templates/drafts/new");
  await page.getByRole("button", { name: /Continuar/ }).click();
  await page.getByLabel("Mensagem do template").fill("Olá, escolha uma opção abaixo.");
  await page.getByRole("button", { name: /Continuar/ }).click();

  await page.getByRole("button", { name: "+ Resposta rápida", exact: true }).click();
  await page.getByRole("button", { name: "+ Link", exact: true }).click();
  await page.getByRole("button", { name: "+ Resposta rápida", exact: true }).click();
  await page.getByLabel("Texto do botão 1").fill("Primeiro");
  await page.getByLabel("Texto do botão 2").fill("Abrir site");
  await page.getByLabel("URL do botão 2").fill("https://example.com");
  await page.getByLabel("Texto do botão 3").fill("Terceiro");

  await expect(page.getByRole("alert")).toContainText(
    "Agrupe respostas rápidas juntas e botões de ação juntos",
  );
  await expect(page.getByRole("button", { name: "Enviar para Meta" })).toBeDisabled();
});

test("editar pela interface preserva componentes e botões avançados", async ({ page }, testInfo) => {
  await login(page);
  const name = `template_avancado_${Date.now()}`;
  const created = await page.evaluate(async (draft) => {
    const response = await fetch("/api/templates/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<{ id: string }>;
  }, {
    name,
    language: "pt_BR",
    category: "UTILITY",
    components: [
      { type: "HEADER", format: "LOCATION", example: { latitude: -22.9, longitude: -43.2, name: "Unidade E2E" } },
      {
        type: "CAROUSEL",
        cards: [{
          components: [
            { type: "HEADER", format: "IMAGE", example: { header_handle: ["media-handle-e2e"] } },
            { type: "BODY", text: "Card avançado" },
          ],
        }],
      },
      { type: "BODY", text: "Seu codigo esta pronto." },
      {
        type: "BUTTONS",
        buttons: [
          { type: "COPY_CODE", text: "Copiar codigo", example: "123456" },
          { type: "OTP", otp_type: "ONE_TAP", text: "Copiar OTP", autofill_text: "Preencher" },
          { type: "FLOW", text: "Abrir MiniApp", flow_id: "123456789", navigate_screen: "START" },
        ],
      },
    ],
  });

  try {
    await page.goto(`/templates/drafts/${created.id}`);
    await expect(page.getByText(`ID do rascunho: ${created.id}`)).toBeVisible();
    await expectNoA11yViolations(page, testInfo, "/templates/drafts/:id");
    await page.getByRole("button", { name: /Continuar/ }).click();
    await page.getByLabel("Mensagem do template").fill("Seu codigo continua pronto.");

    const saved = page.waitForResponse((response) =>
      response.url().endsWith(`/api/templates/drafts/${created.id}`) &&
      response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    expect((await saved).status()).toBe(200);

    const persisted = await page.evaluate(async (id) => {
      const response = await fetch(`/api/templates/drafts/${id}`);
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<{ components: Array<Record<string, unknown>> }>;
    }, created.id);
    expect(persisted.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "HEADER", format: "LOCATION" }),
      expect.objectContaining({ type: "CAROUSEL", cards: expect.any(Array) }),
      expect.objectContaining({ type: "BODY", text: "Seu codigo continua pronto." }),
      expect.objectContaining({
        type: "BUTTONS",
        buttons: [
          expect.objectContaining({ type: "COPY_CODE", text: "Copiar codigo" }),
          expect.objectContaining({ type: "OTP", otp_type: "ONE_TAP" }),
          expect.objectContaining({ type: "FLOW", flow_id: "123456789" }),
        ],
      }),
    ]));
  } finally {
    await page.evaluate(async (id) => {
      await fetch(`/api/templates/drafts/${id}`, { method: "DELETE" });
    }, created.id);
  }
});
