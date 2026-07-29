import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
}

const matrixDefinition = {
  version: "7.3",
  screens: [
    {
      id: "START",
      title: "Matriz completa",
      final: false,
      text: "Preencha todos os componentes:",
      buttonText: "Continuar",
      next: "MIDDLE",
      blocks: [
        { id: "heading", type: "TextHeading", text: "Título principal" },
        { id: "subheading", type: "TextSubheading", text: "Subtítulo da tela" },
        { id: "body", type: "TextBody", text: "Texto explicativo" },
        { id: "caption", type: "TextCaption", text: "Legenda auxiliar" },
        { id: "name", type: "TextInput", label: "Nome", name: "name", inputType: "text", required: true },
        { id: "email", type: "TextInput", label: "E-mail", name: "email", inputType: "email", required: true },
        { id: "phone", type: "TextInput", label: "Telefone", name: "phone", inputType: "phone", required: true },
        { id: "quantity", type: "TextInput", label: "Quantidade", name: "quantity", inputType: "number", required: true },
        { id: "notes", type: "TextArea", label: "Observações", name: "notes", required: true },
        { id: "date", type: "CalendarPicker", label: "Data", name: "date", required: true },
        {
          id: "plan", type: "Dropdown", label: "Plano", name: "plan", required: true,
          options: [{ id: "basic", title: "Básico" }, { id: "pro", title: "Profissional" }],
        },
        {
          id: "channel", type: "RadioButtonsGroup", label: "Canal", name: "channel", required: true,
          options: [{ id: "whatsapp", title: "WhatsApp" }, { id: "email", title: "E-mail" }],
        },
        {
          id: "interests", type: "CheckboxGroup", label: "Interesses", name: "interests", required: true,
          options: [{ id: "news", title: "Novidades" }, { id: "offers", title: "Ofertas" }],
        },
        { id: "consent", type: "OptIn", text: "Aceito os termos", name: "consent", required: true },
      ],
    },
    {
      id: "MIDDLE",
      title: "Tela intermediária",
      final: false,
      text: "Confirme o código:",
      buttonText: "Avançar",
      next: "FINAL",
      blocks: [
        { id: "middle_heading", type: "TextHeading", text: "Segunda tela" },
        { id: "code", type: "TextInput", label: "Código", name: "code", inputType: "text", required: true },
      ],
    },
    {
      id: "FINAL",
      title: "Tela final",
      final: true,
      text: "Tudo pronto.",
      buttonText: "Concluir",
      next: null,
      blocks: [{ id: "final_heading", type: "TextHeading", text: "Última tela" }],
    },
  ],
  branchesByScreen: {
    START: [{ field: "plan", op: "equals", value: "pro", next: "FINAL" }],
  },
};

async function createMatrixFlow(page: Page) {
  const response = await page.request.post("/api/flows", {
    data: { name: `E2E matriz componentes ${Date.now()}`, definition: matrixDefinition },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ id: string }>;
}

async function openContent(page: Page, id: string) {
  await page.goto(`/flows/builder/${id}`);
  await expect(page.getByText("Como quer começar?")).toBeVisible();
  await page.getByRole("button", { name: /2 Conteúdo/i }).click();
  await expect(page.getByTestId("flow-preview")).toBeVisible();
  await page.getByRole("button", { name: "Matriz completa", exact: true }).click();
}

async function fillStart(preview: ReturnType<Page["getByTestId"]>, plan: "basic" | "pro") {
  await preview.getByLabel(/Nome \*/).fill("Pessoa teste");
  await preview.getByLabel(/E-mail \*/).fill("teste@example.com");
  await preview.getByLabel(/Telefone \*/).fill("+5521999999999");
  await preview.getByLabel(/Quantidade \*/).fill("2");
  await preview.getByLabel(/Observações \*/).fill("Observação de teste");
  await preview.getByLabel(/Data \*/).fill("2026-07-20");
  await preview.getByLabel(/Plano \*/).selectOption(plan);
  await preview.getByLabel("WhatsApp").check();
  await preview.getByLabel("Novidades").check();
  await preview.getByLabel(/Aceito os termos \*/).check();
}

test("todos os componentes, obrigatoriedade e navegação padrão funcionam no editor real", async ({ page }) => {
  await login(page);
  const flow = await createMatrixFlow(page);
  try {
    await openContent(page, flow.id);

    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    for (const label of [
      "Título", "Subtítulo", "Texto", "Legenda", "Campo: texto", "Campo: texto longo",
      "Campo: e-mail", "Campo: telefone", "Campo: número", "Campo: data",
      "Lista (dropdown)", "Escolha única", "Múltipla escolha", "Opt-in (checkbox)",
    ]) await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    const preview = page.getByTestId("flow-preview");
    await expect(preview.getByText("Título principal")).toBeVisible();
    await expect(preview.getByText("Subtítulo da tela")).toBeVisible();
    await expect(preview.getByText("Texto explicativo")).toBeVisible();
    await expect(preview.getByText("Legenda auxiliar")).toBeVisible();

    await preview.getByRole("button", { name: "Continuar" }).click();
    await expect(preview.getByText("Título principal")).toBeVisible();
    await expect(preview.locator(".ring-red-500")).toHaveCount(10);

    await fillStart(preview, "basic");
    await preview.getByRole("button", { name: "Continuar" }).click();
    await expect(preview.getByText("Segunda tela")).toBeVisible();
    await preview.getByRole("button", { name: "Avançar" }).click();
    await expect(preview.locator(".ring-red-500")).toHaveCount(1);
    await preview.getByLabel(/Código \*/).fill("ABC123");
    await preview.getByRole("button", { name: "Avançar" }).click();
    await expect(preview.getByText("Última tela")).toBeVisible();
    await preview.getByRole("button", { name: "Concluir" }).click();
    await expect(preview.getByRole("status")).toContainText("Simulação concluída");
  } finally {
    await page.request.delete(`/api/flows/${flow.id}`);
  }
});

test("ramificação pula a tela intermediária e conclui", async ({ page }) => {
  await login(page);
  const flow = await createMatrixFlow(page);
  try {
    await openContent(page, flow.id);
    const preview = page.getByTestId("flow-preview");
    await fillStart(preview, "pro");
    await preview.getByRole("button", { name: "Continuar" }).click();
    await expect(preview.getByText("Última tela")).toBeVisible();
    await expect(preview.getByText("Segunda tela")).toHaveCount(0);
    await preview.getByRole("button", { name: "Concluir" }).click();
    await expect(preview.getByRole("status")).toContainText("Simulação concluída");
  } finally {
    await page.request.delete(`/api/flows/${flow.id}`);
  }
});

test("as três telas continuam utilizáveis em viewport móvel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const flow = await createMatrixFlow(page);
  try {
    await openContent(page, flow.id);
    const preview = page.getByTestId("flow-preview");
    await expect(preview).toBeVisible();
    await fillStart(preview, "basic");
    await preview.getByRole("button", { name: "Continuar" }).click();
    await preview.getByLabel(/Código \*/).fill("MOBILE");
    await preview.getByRole("button", { name: "Avançar" }).click();
    await expect(preview.getByText("Última tela")).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  } finally {
    await page.request.delete(`/api/flows/${flow.id}`);
  }
});
