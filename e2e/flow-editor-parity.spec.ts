import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
}

test("editor restaura os três inícios e persiste modelo e ajustes avançados", async ({ page }) => {
  await login(page);
  const created = await page.request.post("/api/flows", {
    data: {
      name: "E2E paridade editor",
      definition: {
        version: "7.3",
        screens: [{
          id: "INICIO",
          title: "Início",
          final: true,
          text: "Preencha os dados abaixo:",
          buttonText: "Enviar",
          next: null,
        }],
      },
    },
  });
  expect(created.ok()).toBeTruthy();
  const flow = await created.json();

  try {
    await page.goto(`/flows/builder/${flow.id}`);
    await expect(page.getByText("Como quer começar?")).toBeVisible();
    await expect(page.getByRole("button", { name: /Criar com IA/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Usar modelo pronto/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Criar do zero/ })).toBeVisible();

    await page.getByRole("button", { name: /Usar modelo pronto/ }).click();
    await page.getByRole("button", { name: /Lead \/ Cadastro/ }).click();
    await page.getByRole("button", { name: "Usar modelo", exact: true }).click();

    const preview = page.getByTestId("flow-preview");
    await preview.getByLabel("Nome").fill("Pessoa de teste");
    await preview.getByLabel(/E-mail/).fill("pessoa@example.com");
    await expect(preview.getByLabel("Nome")).toHaveValue("Pessoa de teste");
    await preview.getByText(/Vamos te cadastrar rapidinho/).click();
    await expect(page.locator('[data-flow-block-id="lead_intro"]')).toHaveClass(/ring-primary/);
    await preview.getByRole("button", { name: /Enviar|Continuar/ }).click();
    await expect(preview.getByRole("status")).toContainText("Simulação concluída");

    await page.getByRole("button", { name: "Ações", exact: true }).click();
    await page.getByRole("button", { name: "Ajustes avançados" }).click();
    const dialog = page.getByRole("dialog", { name: "Ajustes avançados" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Título").fill("Cadastro E2E");
    await dialog.getByRole("button", { name: /Fechar/ }).click();

    await page.getByRole("button", { name: "Ações", exact: true }).click();
    await page.getByRole("button", { name: "Salvar agora" }).click();
    await expect(page.getByText("MiniApp salva")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Como quer começar?")).toBeVisible();
    await page.getByRole("button", { name: /2 Conteúdo/i }).click();
    await expect(page.locator('input[value="Cadastro E2E"]')).toBeVisible();
  } finally {
    await page.request.delete(`/api/flows/${flow.id}`);
  }
});

test("inícios por IA e do zero exibem estados completos", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const created = await page.request.post("/api/flows", {
    data: { name: "E2E inícios editor" },
  });
  expect(created.ok()).toBeTruthy();
  const flow = await created.json();

  await page.route("**/api/flows/generate", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        definition: {
          version: "7.3",
          screens: [{
            id: "IA_E2E",
            title: "Gerado pela IA",
            final: true,
            text: "Conteúdo gerado",
            buttonText: "Enviar",
            next: null,
          }],
        },
      }),
    });
  });

  try {
    await page.goto(`/flows/builder/${flow.id}`);
    await page.getByRole("button", { name: /1 Começar/i }).click();
    await page.getByRole("button", { name: /Criar com IA/ }).click();
    await page.getByLabel("O que você quer coletar").fill("Quero coletar nome, telefone e cidade do contato.");
    const generation = page.getByRole("button", { name: "Gerar MiniApp" }).click();
    await expect(page.getByRole("button", { name: "Gerando…" })).toBeVisible();
    await generation;
    await expect(page.locator('input[value="Gerado pela IA"]')).toBeVisible();
    await page.getByRole("button", { name: "Ações", exact: true }).click();
    await page.getByRole("button", { name: "Salvar agora" }).click();
    await expect(page.getByText("MiniApp salva")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Como quer começar?")).toBeVisible();
    await page.getByRole("button", { name: /2 Conteúdo/i }).click();
    await expect(page.locator('input[value="Gerado pela IA"]')).toBeVisible();

    await page.getByRole("button", { name: /1 Começar/i }).click();
    await page.getByRole("button", { name: /Criar com IA/ }).click();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByLabel("O que você quer coletar")).toHaveCount(0);

    await page.unroute("**/api/flows/generate");
    await page.route("**/api/flows/generate", (route) => route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "O provedor de IA não respondeu" }),
    }));
    await page.getByRole("button", { name: /Criar com IA/ }).click();
    await page.getByLabel("O que você quer coletar").fill("Quero coletar nome e telefone para testar uma falha.");
    await page.getByRole("button", { name: "Gerar MiniApp" }).click();
    await expect(page.getByRole("alert")).toContainText("O provedor de IA não respondeu");
    await page.getByRole("button", { name: "Cancelar" }).click();

    await page.getByRole("button", { name: /Criar do zero/ }).click();
    await page.getByRole("button", { name: "Começar do zero" }).click();
    await expect(page.locator('input[value="E2E inícios editor"]')).toBeVisible();
  } finally {
    await page.request.delete(`/api/flows/${flow.id}`);
  }
});
