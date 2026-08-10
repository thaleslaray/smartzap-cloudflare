import { expect, test, type Page, type Route } from "@playwright/test";

async function login(page: Page) {
  // O WebKit pode manter recursos não essenciais do shell em aberto depois de
  // várias navegações sequenciais. O formulário já está utilizável quando o
  // DOM termina de carregar; esperar o evento `load` tornava a matriz inteira
  // dependente desses recursos e travava sempre no mesmo ponto da suíte.
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/login")) return;
  await page.getByLabel("Senha mestra").fill(process.env.QA_MASTER_PASSWORD || "dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
}

type MockItem = {
  id: string; name: string; content: string; language: string; category: string;
  status: string; meta_id: string | null; meta_status: string | null;
  rejected_reason: string | null; variables: Record<string, string>;
  sample_variables: Record<string, string>; buttons: Array<Record<string, unknown>>;
};
const draft: MockItem = {
  id: "draft-1",
  name: "lembrete_autoqa",
  content: "Olá {{1}}, sua confirmação está disponível.",
  language: "pt_BR",
  category: "UTILITY",
  status: "draft",
  meta_id: null,
  meta_status: null,
  rejected_reason: null,
  variables: { "1": "Ana" },
  sample_variables: { "1": "Ana" },
  buttons: [],
};
const approved = { ...draft, id: "approved-1", name: "aprovado_autoqa", meta_id: "meta-1", meta_status: "APPROVED", status: "submitted" };
const rejected = { ...draft, id: "rejected-1", name: "rejeitado_autoqa", meta_id: "meta-2", meta_status: "REJECTED", status: "submitted", rejected_reason: "INVALID_FORMAT" };
const pending = { ...draft, id: "pending-1", name: "pendente_autoqa", meta_id: "meta-3", meta_status: "PENDING", status: "submitted" };
const project = (items: MockItem[] = [draft]) => ({
  id: "project-autoqa",
  title: "Projeto AUTOQA",
  strategy: "utility",
  status: items.length && items.every((item) => item.meta_status === "APPROVED") ? "completed" : items.some((item) => item.meta_id) ? "active" : "draft",
  source: "manual",
  template_count: items.length,
  approved_count: items.filter((item) => item.meta_status === "APPROVED").length,
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
  items,
});
async function mockDetail(page: Page, items: MockItem[] = [draft], handler?: (route: Route) => Promise<void>) {
  await page.route("**/api/template-projects/project-autoqa", async (route) => {
    if (handler && route.request().method() !== "GET") return handler(route);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(project(items)) });
  });
}
async function reachStrategy(page: Page) {
  await page.goto("/templates/projects/new");
  await page.getByLabel("Conteúdo fonte").fill("Workshop oficial com informações suficientes para criação de uma mensagem transacional segura e revisável.");
  await page.getByRole("button", { name: /Extrair Informações/ }).click();
  await page.getByRole("button", { name: /Escolher estratégia/ }).click();
}
async function reachConfig(page: Page, strategy: "Marketing" | "Utilidade" = "Utilidade") {
  await reachStrategy(page);
  await page.getByRole("button", { name: new RegExp(strategy) }).click();
}

test.beforeEach(async ({ page }) => login(page));

test("01 rota canônica abre a criação", async ({ page }) => {
  await page.goto("/templates/projects/new");
  await expect(page.getByRole("heading", { name: "Novo Projeto de Templates" })).toBeVisible();
});

test("02 rota legada abre a mesma criação", async ({ page }) => {
  await page.goto("/templates/new");
  await expect(page.getByRole("heading", { name: "Novo Projeto de Templates" })).toBeVisible();
});

test("rota canônica de listagem abre a aba Projetos", async ({ page }) => {
  await page.route("**/api/template-projects", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) }),
  );
  await page.goto("/templates/projects");
  await expect(page).toHaveURL(/\/templates\?tab=projects$/);
  await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
  await expect(page.getByText("Nenhum projeto criado.")).toBeVisible();
});

test("03 conteúdo mínimo controla o avanço", async ({ page }) => {
  await page.goto("/templates/projects/new");
  const next = page.getByRole("button", { name: /Extrair Informações/ });
  await expect(next).toBeDisabled();
  await page.getByLabel("Conteúdo fonte").fill("curto");
  await expect(next).toBeDisabled();
});

test("04 voltar preserva conteúdo e nome", async ({ page }) => {
  await page.goto("/templates/projects/new");
  const text = "Conteúdo de teste suficientemente longo para permanecer intacto ao voltar de uma etapa do assistente.";
  await page.getByLabel("Conteúdo fonte").fill(text);
  await page.getByRole("button", { name: /Extrair Informações/ }).click();
  await page.getByLabel("Nome do projeto").fill("Nome preservado");
  await page.getByText("Voltar", { exact: true }).click();
  await expect(page.getByLabel("Conteúdo fonte")).toHaveValue(text);
  await page.getByRole("button", { name: /Extrair Informações/ }).click();
  await expect(page.getByLabel("Nome do projeto")).toHaveValue("Nome preservado");
});

test("05 estratégia Marketing chega à configuração", async ({ page }) => {
  await reachConfig(page, "Marketing");
  await expect(page.getByText("marketing", { exact: true })).toBeVisible();
});

test("06 estratégia Utilidade chega à configuração", async ({ page }) => {
  await reachConfig(page, "Utilidade");
  await expect(page.getByText("utility", { exact: true })).toBeVisible();
});

test("07 quantidade respeita limites da interface", async ({ page }) => {
  await reachConfig(page);
  const quantity = page.getByLabel("Quantidade");
  await quantity.fill("0");
  await expect(quantity).toHaveValue("1");
  await quantity.fill("99");
  await expect(quantity).toHaveValue("10");
});

test("08 oferece os três idiomas suportados", async ({ page }) => {
  await reachConfig(page);
  const language = page.getByLabel("Idioma");
  await expect(language.locator("option")).toHaveCount(3);
  await language.selectOption("es_ES");
  await expect(language).toHaveValue("es_ES");
});

test("09 falha do gerador retorna à configuração com diagnóstico", async ({ page }) => {
  await page.route("**/api/template-projects/generate", (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "A IA retornou um formato inválido" }) }));
  await reachConfig(page);
  await page.getByRole("button", { name: /Gerar templates/ }).click();
  await expect(page.getByRole("alert")).toContainText("A IA retornou um formato inválido");
});

test("10 revisão permite selecionar nenhum, alguns e todos", async ({ page }) => {
  await page.route("**/api/template-projects/generate", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ templates: [draft, { ...draft, name: "segundo_autoqa" }] }) }));
  await reachConfig(page);
  await page.getByRole("button", { name: /Gerar templates/ }).click();
  await expect(page.getByText("2 de 2 selecionados" )).toBeVisible();
  await page.getByRole("heading", { name: "lembrete_autoqa" }).click();
  await expect(page.getByText("1 de 2 selecionados")).toBeVisible();
  await page.getByRole("heading", { name: "segundo_autoqa" }).click();
  await expect(page.getByText("0 de 2 selecionados")).toBeVisible();
});

test("11 salvar geração navega para o projeto criado", async ({ page }) => {
  await page.route("**/api/template-projects/generate", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ templates: [draft] }) }));
  await page.route("**/api/template-projects/save-generated", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "project-autoqa" }) }));
  await mockDetail(page);
  await reachConfig(page);
  await page.getByRole("button", { name: /Gerar templates/ }).click();
  await page.getByLabel("Nome do projeto").fill("Projeto salvo");
  await page.getByRole("button", { name: "Salvar Projeto" }).click();
  await expect(page).toHaveURL(/\/templates\/project-autoqa$/);
});

test("12 lista mostra estado vazio acionável", async ({ page }) => {
  await page.route("**/api/template-projects", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) }));
  await page.goto("/templates?tab=projects");
  await expect(page.getByText("Nenhum projeto criado.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar projeto" })).toBeVisible();
});

test("13 busca filtra projetos sem perder o resultado", async ({ page }) => {
  await page.route("**/api/template-projects", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [project([]), { ...project([]), id: "outro", title: "Outro projeto" }] }) }));
  await page.goto("/templates?tab=projects");
  await page.getByPlaceholder("Buscar projetos...").fill("AUTOQA");
  await expect(page.getByText("Projeto AUTOQA", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Outro projeto", { exact: true })).toHaveCount(0);
});

test("14 erro da lista é explícito e permite atualizar", async ({ page }) => {
  let failed = true;
  await page.route("**/api/template-projects", (route) => failed ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Falha controlada da lista" }) }) : route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) }));
  await page.goto("/templates?tab=projects");
  await expect(page.getByRole("alert")).toContainText("Falha controlada da lista");
  failed = false;
  await page.getByRole("button", { name: "Atualizar projetos" }).click();
  await expect(page.getByText("Nenhum projeto criado.")).toBeVisible();
});

test("15 lista mobile não corta ações", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/template-projects", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [project([])] }) }));
  await page.goto("/templates?tab=projects");
  await expect(page.getByRole("button", { name: "Editar" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("16 rota canônica reabre detalhe", async ({ page }) => {
  await mockDetail(page);
  await page.goto("/templates/projects/project-autoqa");
  await expect(page.getByRole("heading", { name: "Projeto AUTOQA" })).toBeVisible();
});

test("17 rota legada reabre o mesmo detalhe", async ({ page }) => {
  await mockDetail(page);
  await page.goto("/templates/project-autoqa");
  await expect(page.getByRole("heading", { name: "Projeto AUTOQA" })).toBeVisible();
});

test("18 filtros exibem somente o grupo escolhido", async ({ page }) => {
  await mockDetail(page, [draft, approved, rejected, pending]);
  await page.goto("/templates/projects/project-autoqa");
  await page.getByRole("button", { name: "Filtrar por Aprovados" }).click();
  await expect(page.getByText("aprovado_autoqa", { exact: true })).toBeVisible();
  await expect(page.getByText("rejeitado_autoqa", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Filtrar por Todos" }).click();
  await expect(page.getByText("rejeitado_autoqa", { exact: true })).toBeVisible();
});

test("19 editor não oferece Autenticação genérica", async ({ page }) => {
  await mockDetail(page, []);
  await page.goto("/templates/projects/project-autoqa");
  await page.getByRole("button", { name: "Adicionar template" }).click();
  await expect(page.getByLabel("Categoria").locator("option")).toHaveText(["UTILITY", "MARKETING"]);
});

test("20 variável exige exemplo antes de salvar", async ({ page }) => {
  await mockDetail(page, []);
  await page.goto("/templates/projects/project-autoqa");
  await page.getByRole("button", { name: "Adicionar template" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome técnico").fill("variavel_autoqa");
  await dialog.getByLabel("Conteúdo").fill("Olá {{1}}, confirmação disponível.");
  await expect(dialog.getByRole("button", { name: "Salvar template" })).toBeDisabled();
  await dialog.getByLabel("Exemplo para {{1}}").fill("Ana");
  await expect(dialog.getByRole("button", { name: "Salvar template" })).toBeEnabled();
});

test("21 renomeia projeto e encerra o modo de edição", async ({ page }) => {
  await mockDetail(page, [draft], (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...project([draft]), title: "Renomeado" }) }));
  await page.goto("/templates/projects/project-autoqa");
  await page.getByRole("button", { name: "Renomear projeto" }).click();
  await page.locator("input").first().fill("Renomeado");
  await page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(page.getByRole("button", { name: "Salvar nome" })).toHaveCount(0);
});

test("22 excluir projeto exige confirmação", async ({ page }) => {
  await page.route("**/api/template-projects", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [project([])] }) }));
  await page.goto("/templates?tab=projects");
  await page.getByRole("button", { name: "Excluir" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Excluir projeto?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
});

test("23 item publicado não expõe edição nem exclusão local", async ({ page }) => {
  await mockDetail(page, [approved]);
  await page.goto("/templates/projects/project-autoqa");
  await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Excluir" })).toHaveCount(0);
});

test("24 prévia mobile abre em modal e fecha por Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDetail(page, [draft]);
  await page.goto("/templates/projects/project-autoqa");
  await page.getByText("lembrete_autoqa", { exact: true }).click();
  await expect(page.getByRole("dialog", { name: /Prévia/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /Prévia/ })).toBeHidden();
});
