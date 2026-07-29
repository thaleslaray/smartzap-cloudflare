import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
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
