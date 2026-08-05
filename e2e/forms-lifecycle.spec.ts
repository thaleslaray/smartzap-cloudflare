import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./support/a11y";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
}

function getFormCard(
  page: import("@playwright/test").Page,
  title: string,
) {
  return page
    .locator("p.font-medium")
    .filter({ hasText: title })
    .first()
    .locator("..")
    .locator("..");
}

test("Forms percorre CRUD, captação consentida e consulta completa da submissão", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const title = `Form QA ${suffix}`;
  const updatedTitle = `${title} editado`;
  const slug = `form-qa-${suffix}`;
  const tagName = `Tag Form QA ${suffix}`;
  const phone = `+5561${String(Date.now()).slice(-8)}`;

  await login(page);
  await page.goto("/forms");
  await expect(
    page.getByRole("heading", { name: "Formularios", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Criar formulario" }).click();

  const editor = page.getByRole("dialog", { name: "Criar formulario" });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Nome", { exact: true }).fill(title);
  await expect(editor.getByLabel("Slug (URL)")).toHaveValue(slug);

  await editor.getByLabel("Nome da nova tag").fill(tagName);
  await editor.getByRole("button", { name: "Criar tag" }).click();
  await expect(editor.getByRole("button", { name: tagName })).toBeVisible();

  await editor.getByRole("button", { name: /Coletar email/ }).click();
  await editor.getByLabel("Mensagem de sucesso (opcional)").fill(
    "Recebemos sua inscrição de teste.",
  );
  await editor.getByRole("button", { name: "Adicionar campo" }).click();
  await editor.getByLabel("Label do campo 1").fill("Interesse");
  await editor.getByLabel("Key do campo 1").fill("interesse");
  await editor.getByRole("button", { name: /^Texto/ }).click();
  await editor.getByRole("option", { name: "Lista" }).click();
  await editor.getByLabel("Opções do campo 1").fill("Campanhas\nInbox\nIA");
  await editor.getByText("Obrigatorio", { exact: true }).click();
  await editor.getByRole("button", { name: "Salvar" }).click();
  await expect(editor).toBeHidden();

  const formCard = getFormCard(page, title);
  await expect(formCard).toContainText("Ativo");
  await expect(formCard).toContainText(tagName);
  await expect(formCard).toContainText("0 resposta(s) recebida(s)");

  await page.goto(`/f/${slug}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expectNoA11yViolations(page, testInfo, "/f/:slug ativo");
  const send = page.getByRole("button", { name: "Enviar" });
  await expect(send).toBeDisabled();
  await page.getByLabel("Nome *").fill(`Lead QA ${suffix}`);
  await page.getByLabel("Telefone (WhatsApp) *").fill(phone);
  await page.getByLabel("E-mail (opcional)").fill(`qa-${suffix}@example.com`);
  await page.getByLabel("Interesse *").selectOption("IA");
  await page
    .getByLabel(/Aceito receber mensagens deste negócio pelo WhatsApp/)
    .check();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole("heading", { name: "Resposta enviada" })).toBeVisible();
  await expect(page.getByText("Recebemos sua inscrição de teste.")).toBeVisible();

  await page.goto("/forms");
  const populatedCard = getFormCard(page, title);
  await expect(populatedCard).toContainText("1 resposta(s) recebida(s)");
  await populatedCard.getByRole("button", { name: "Ver respostas" }).click();
  await expect(page).toHaveURL(/\/submissions\?formId=/);
  await expect(page.getByText("Respostas recebidas por este formulário")).toBeVisible();
  await expect(page.getByText(updatedTitle)).toHaveCount(0);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText("Form", { exact: true })).toBeVisible();
  await expect(page.getByText("Nome:", { exact: true })).toBeVisible();
  await expect(page.getByText("Telefone:", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ver respostas" }).click();
  const details = page.getByRole("dialog", { name: title });
  await expect(details).toContainText("Form público");
  await expect(details).toContainText("E-mail");
  await expect(details).toContainText("Interesse");
  await expect(details).toContainText("IA");
  await details.getByText("Fechar", { exact: true }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Exportar CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("submissoes-smartzap.csv");

  await page.goto("/contacts");
  await page.getByLabel("Buscar contatos por nome ou telefone").fill(phone);
  await expect(page.getByRole("cell", { name: "OPT_IN", exact: true })).toBeVisible();

  await page.goto("/forms");
  const editableCard = getFormCard(page, title);
  await editableCard.getByRole("button", { name: "Editar" }).click();
  const editDialog = page.getByRole("dialog", { name: "Editar formulario" });
  await editDialog.getByLabel("Nome", { exact: true }).fill(updatedTitle);
  await editDialog.getByRole("button", { name: /Ativo/ }).click();
  await editDialog.getByRole("button", { name: "Salvar" }).click();
  await expect(editDialog).toBeHidden();
  const updatedCard = getFormCard(page, updatedTitle);
  await expect(updatedCard).toContainText(updatedTitle);
  await expect(updatedCard).toContainText("Inativo");

  await page.goto(`/f/${slug}`);
  await expect(page.getByRole("alert")).toContainText("formulário não encontrado");

  await page.goto("/forms");
  const inactiveCard = getFormCard(page, updatedTitle);
  await inactiveCard.getByRole("button", { name: "Editar" }).click();
  const reactivateDialog = page.getByRole("dialog", { name: "Editar formulario" });
  await reactivateDialog.getByRole("button", { name: /Ativo/ }).click();
  await reactivateDialog.getByRole("button", { name: "Salvar" }).click();
  await expect(reactivateDialog).toBeHidden();
  await page.goto(`/f/${slug}`);
  await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible();

  await page.goto("/forms");
  const deleteCard = getFormCard(page, updatedTitle);
  await deleteCard.getByRole("button", { name: "Deletar" }).click();
  await expect(page.getByText(updatedTitle, { exact: false })).toHaveCount(0);
});
