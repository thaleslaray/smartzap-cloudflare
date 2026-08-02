import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  gotoAuthedRoute,
  reloadAuthedRoute,
  waitForAuthedAppReady,
} from "./support/navigation";

async function expectNoHorizontalOverflow(page: Page, viewportWidth: number) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(dimensions.viewportWidth).toBe(viewportWidth);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectNoVisibleLayoutOverflow(page: Page) {
  const result = await page.evaluate(() => {
    const offenders = [...document.querySelectorAll("body *")]
      .map((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const visible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        if (!visible || ["INPUT", "TEXTAREA", "SELECT", "SCRIPT", "STYLE", "SVG", "PATH"].includes(element.tagName)) return null;
        const insideScroller = Boolean(element.closest('[class*="overflow-x-auto"], [class*="overflow-x-scroll"]'));
        if (insideScroller) return null;
        if (rect.left < -2 || rect.right > window.innerWidth + 2) {
          return `${element.tagName}.${typeof element.className === "string" ? element.className.split(" ").slice(0, 2).join(".") : ""} (${Math.round(rect.left)}..${Math.round(rect.right)})`;
        }
        return null;
      })
      .filter((value): value is string => Boolean(value))
      .slice(0, 10);
    return { path: location.pathname, offenders };
  });
  expect(result.offenders, `${result.path}: elementos visíveis fora do viewport: ${result.offenders.join(", ")}`).toEqual([]);
}

test("login → import com consentimento → estimativa/preflight → cancelamento", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1206, height: 900 });
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("link", { name: "Contatos", exact: true }).click();
  await page.getByRole("button", { name: "Importar CSV" }).click();
  // Telefone único por execução: o D1 de dev persiste entre rodadas e um número fixo
  // vira duplicado no INSERT OR IGNORE ("0 importados") ao reexecutar. Mantém o prefixo
  // válido do original (11 9 9999 ....) para o normalizePhone aceitar como BR móvel.
  const phone =
    "119" + String(BigInt(Date.now()) % 100_000_000n).padStart(8, "0");
  // A jornada visual completa de upload/mapeamento é executada no script
  // e2e-contact-import.mjs. Nesta matriz, o browser confirma abertura e foco
  // do modal e usa o contrato autenticado para semear a campanha subsequente.
  const importDialog = page.getByRole("dialog", { name: "Importar Contatos" });
  await expect(importDialog).toBeVisible();
  await page.keyboard.press("Escape");
  const imported = await page.evaluate(async (input) => {
    const response = await fetch("/api/contacts/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }, { csv: `telefone,nome\n${phone},E2E`, mapping: { phone: "telefone", name: "nome" }, optInConfirmed: true });
  expect(imported.status).toBe(200);
  expect(imported.body).toMatchObject({ imported: 1 });

  await page.getByRole("link", { name: "Campanhas", exact: true }).click();
  // A navegação premium permanece expandida no desktop; a ação fica disponível
  // diretamente no menu persistente.
  await page.getByRole("link", { name: "Nova Campanha", exact: true }).click();
  await page
    .getByPlaceholder("Nome da campanha")
    .fill(`Simulação E2E ${Date.now()}`);
  const templateSearch = page.getByLabel("Buscar template");
  await expect(templateSearch).toBeVisible();
  await templateSearch.fill("e2e_marketing_simples");
  await page.getByRole("button", { name: /e2e_marketing_simples/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(
    page.getByRole("heading", { name: "Validação de destinatários" }),
  ).toBeVisible();
  const proceedValidOnly = page.getByRole("checkbox", {
    name: /Prosseguir apenas com/,
  });
  if (await proceedValidOnly.isVisible()) await proceedValidOnly.check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Agendamento" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lancar campanha" }).click();
  // O seed remove o Phone ID: o preflight deve explicar o bloqueio antes de
  // reivindicar a campanha, criar Workflow ou fazer qualquer chamada à Meta.
  await expect(
    page.getByText("credenciais Meta não configuradas"),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1206,
  );

  await page.goto(`/campaigns/e2e-campaign-control-${testInfo.project.name}`);
  await expect(
    page.getByRole("heading", { name: "Controle E2E" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancelar envio", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Cancelar campanha?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Voltar" }).click();
  await expect(dialog).toBeHidden();

  await page
    .getByRole("button", { name: "Cancelar envio", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmar cancelamento" }).click();
  await expect(page.getByText("Cancelado")).toBeVisible();
});

test("guarda de rota: sem sessão, /campaigns redireciona para /login", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto("/campaigns");
  // o Shell (Task 14) consulta /api/auth/status ao montar; o 401 dispara o
  // redirect para /login feito pelo próprio api client
  await expect(page).toHaveURL(/\/login/);
});

test("Contatos expõe carregamento, vazio e erro recuperável pela interface", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // Pré-aquece o chunk para que o atraso teste o carregamento da consulta,
  // não o carregamento assíncrono do bundle da rota.
  await page.goto("/contacts");
  await expect(page.getByRole("heading", { name: "Contatos" })).toBeVisible({ timeout: 15000 });

  // O Firefox pode serializar a query em ordem diferente durante um reload
  // frio. O contrato do cenário é o endpoint de lista na página 1, não a
  // ordem dos parâmetros; um regex preso em `q=...&page=1` transforma isso em
  // flake e deixa a segunda resposta real escapar do mock.
  const listUrl = "**/api/contacts?*";
  const isFirstContactsPage = (route: import("@playwright/test").Route) => {
    const url = new URL(route.request().url());
    return url.pathname.endsWith("/api/contacts") && url.searchParams.get("page") === "1";
  };
  await page.route(listUrl, async (route) => {
    if (!isFirstContactsPage(route)) return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [], total: 0, stats: { total: 0, optIn: 0, optOut: 0 },
      }),
    });
  });
  const loadingNavigation = page.reload();
  await expect(page.getByText("Carregando contatos…", { exact: true })).toBeVisible({ timeout: 10000 });
  await loadingNavigation;
  await expect(page.getByRole("cell", { name: "Nenhum contato encontrado." })).toBeVisible();
  await page.unroute(listUrl);

  await page.route(listUrl, async (route) => {
    if (!isFirstContactsPage(route)) return route.continue();
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Falha controlada" }) });
  });
  await page.reload();
  const failure = page.getByRole("alert");
  await expect(failure).toContainText("Falha controlada");
  await page.unroute(listUrl);
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("heading", { name: "Contatos" })).toBeVisible();
  const filters = page.getByRole("button", { name: "Filtros" });
  await expect(filters).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Filtrar contatos por status")).toBeVisible();
  await filters.click();
  await expect(filters).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Filtrar contatos por status")).toHaveCount(0);
  await filters.click();
  await expect(page.getByLabel("Filtrar contatos por status")).toBeVisible();
});

test("Contato manual preserva o modal original e cria registro sem inferir opt-in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("link", { name: "Contatos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Contatos" })).toBeVisible();
  const name = `Cadastro manual E2E ${Date.now()}`;
  const phone = `+5561${String(Date.now()).slice(-8)}`;
  await page.getByRole("button", { name: "Novo Contato" }).click();
  const dialog = page.getByRole("dialog", { name: "Novo Contato" });
  await expect(dialog.getByText("Confirmo que este contato consentiu", { exact: false })).toHaveCount(0);
  await dialog.getByLabel("Nome Completo").fill(name);
  await dialog.getByLabel("Telefone (WhatsApp) *").fill(phone);
  await dialog.getByLabel("E-mail").fill("manual@example.com");
  await dialog.getByRole("button", { name: "Salvar Contato" }).click();
  await expect(dialog).toBeHidden();
  await page.getByLabel("Buscar contatos por nome ou telefone").fill(phone);
  await expect(page.getByRole("cell", { name: "UNKNOWN", exact: true })).toBeVisible();
  const selectCreated = page.getByRole("checkbox", {
    name: `Selecionar ${name}`,
  });
  await expect(selectCreated).toHaveCount(1);
  await selectCreated.check();
  const deleteSelected = page.getByRole("button", {
    name: "Excluir 1 contato(s) selecionado(s)",
  });
  await expect(deleteSelected).toHaveCount(1);
  await deleteSelected.click();
  const deleteDialog = page.getByRole("dialog", { name: "Confirmar Exclusão" });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole("button", { name: "Excluir" }).click();
  await expect(deleteDialog).toBeHidden();
  await expect(page.getByText("A tela encontrou um erro")).toHaveCount(0);
  await expect(page.getByText(name)).toHaveCount(0);
});

test("Contatos oferece selecionar todos no layout reduzido", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir menu de navegação" }).click();
  await page.getByRole("link", { name: "Contatos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Contatos" })).toBeVisible();

  const selectAll = page.getByRole("button", {
    name: "Selecionar todos os contatos desta página",
  });
  await expect(selectAll).toHaveCount(1);
  await expect(selectAll).toHaveAttribute("aria-pressed", "false");
  await selectAll.click();
  await expect(selectAll).toHaveAttribute("aria-pressed", "true");
  await expect(selectAll).toContainText("Desselecionar todos");
  await selectAll.click();
  await expect(selectAll).toHaveAttribute("aria-pressed", "false");
  await expectNoHorizontalOverflow(page, 390);
});

test("campanha usa segmento salvo, busca contatos no servidor e mapeia variáveis", async ({
  page,
}) => {
  // Esta jornada cria o segmento e depois percorre todo o wizard de campanha.
  // O POST isolado já possui até 45 s para atravessar o cold start do Worker;
  // o orçamento global precisa ainda cobrir login, navegações e validações da
  // interface. Ele continua finito e nenhum retry é aceito como aprovação.
  test.setTimeout(90_000);

  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);

  const segmentName = `Segmento campanha E2E ${Date.now()}`;
  await page.goto("/segments");
  await page.getByLabel("Nome do segmento").fill(segmentName);
  await page.getByLabel("Regras do segmento em JSON").fill(
    JSON.stringify({
      combinator: "and",
      conditions: [{ field: "name", operator: "contains", value: "E2E" }],
    }),
  );
  const segmentCreated = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/segments") &&
      response.request().method() === "POST",
    { timeout: 45_000 },
  );
  await page.getByRole("button", { name: "Salvar segmento" }).click();
  const segmentResponse = await segmentCreated;
  expect(segmentResponse.status()).toBe(201);
  await expect(page.getByText(segmentName)).toBeVisible();

  await page.goto("/campaigns/new");
  await page.getByLabel("Nome da campanha").fill(`Variáveis E2E ${Date.now()}`);
  await page.getByLabel("Buscar template").fill("e2e_template_variaveis");
  await page.getByRole("button", { name: /e2e_template_variaveis/ }).click();
  await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
  await page.getByRole("button", { name: "Inserir variável dinâmica em header.1" }).click();
  await page.getByRole("menuitem", { name: /Nome/ }).click();
  await expect(page.getByLabel("Valor de header.1")).toHaveValue("{{nome}}");
  await page.getByLabel("Fallback de header.1").fill("Cliente E2E");
  await page.getByRole("button", { name: "Inserir variável dinâmica em body.1" }).click();
  await page.getByRole("menuitem", { name: /Telefone/ }).click();
  await expect(page.getByLabel("Valor de body.1")).toHaveValue("{{telefone}}");
  await page.getByLabel("Valor de button.0.1").fill("destino-e2e");
  await page.getByRole("button", { name: "Continuar" }).click();

  const customAudience = page
    .getByRole("button", {
      name: /Público personalizado Público salvo, tags, DDI ou UF/,
    });
  await expect(page.getByRole("heading", { name: "Escolha o público" })).toBeVisible();
  await expect(customAudience).toBeVisible();
  await customAudience.click();
  await page.getByLabel("Público salvo").selectOption({ label: segmentName });
  await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled();
  await expect(page.getByText("Preview com contato real")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Gerar preview" })).toHaveCount(0);
  await expect(page.getByText('"header.1"')).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Validação de destinatários" }),
  ).toBeVisible();
});

test("campanha orienta contato sem opt-in para Contatos em vez de oferecer correção de campo", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/campaigns/new");
  await page
    .getByLabel("Nome da campanha")
    .fill(`Opt-in E2E ${Date.now()}`);
  await page.getByLabel("Buscar template").fill("e2e_marketing_simples");
  await page.getByRole("button", { name: /e2e_marketing_simples/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(
    page.getByRole("heading", { name: "Validação de destinatários" }),
  ).toBeVisible();
  await expect(page.getByText("Contatos não elegíveis")).toBeVisible();
  await expect(
    page.getByText(/status de opt-in ou supressão/i),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aplicar em massa" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir contatos" }).click();
  await expect(page).toHaveURL(/\/contacts$/);
});

test("detalhe da campanha permite corrigir um contato ignorado sem sair da tela", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/campaigns/e2e-campaign-correction");
  await expect(
    page.getByRole("heading", { name: "Correção E2E" }),
  ).toBeVisible();
  await expect(page.getByText("Ignorado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Corrigir contato" }).click();
  const dialog = page.getByRole("dialog", { name: "Corrigir contato" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Nome").fill("Contato Corrigido E2E");
  await dialog.getByRole("button", { name: "Salvar correção" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Contato Corrigido E2E")).toBeVisible();

  await page
    .getByRole("button", { name: /Template: e2e_marketing_simples/ })
    .click();
  await expect(
    page.getByRole("dialog", { name: "e2e_marketing_simples" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar preview" }).click();

  await page.getByRole("button", { name: "Filtrar logs" }).click();
  await page.getByRole("button", { name: "Ignorados" }).last().click();
  await expect(page.getByText("Contato Corrigido E2E")).toBeVisible();

});

test("Inbox exige confirmação explícita antes de enviar rascunho aprovado", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/inbox/22222222-2222-4222-8222-222222222222");
  await page.getByRole("button", { name: "Contexto e memória" }).click();
  await expect(page.getByText("Rascunho aprovado")).toBeVisible();
  const trigger = page.getByRole("button", { name: "Enviar mensagem" });
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Confirmar envio pelo WhatsApp",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("mensagem real")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Confirmar e enviar" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Inbox mantém filtros, configurações e links de atendentes operacionais", async ({
  page,
}) => {
  // O WebKit pode encontrar o Worker local ainda frio ao trocar o filtro.
  // A prova aguarda a resposta específica em vez de confundir latência do
  // runtime com ausência de atualização visual; retry continua proibido.
  test.setTimeout(90_000);
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/inbox");

  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  const closedConversationsLoaded = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/conversations" &&
        url.searchParams.get("status") === "closed" &&
        response.request().method() === "GET";
    },
    { timeout: 45_000 },
  );
  await page.getByRole("button", { name: "Fechadas", exact: true }).click();
  expect((await closedConversationsLoaded).status()).toBe(200);
  await expect(page.getByText("Nenhuma conversa recebida.")).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.getByText("Contato Piloto E2E")).toBeVisible();

  await page.getByRole("button", { name: "Configurações da Inbox" }).click();
  await page.getByLabel("Timeout do modo humano").selectOption("24");
  await page.getByLabel("Retenção de mensagens").fill("180");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Configurações salvas")).toBeVisible();

  await page.getByRole("button", { name: "Configurações da Inbox" }).click();
  await page.getByRole("button", { name: "Atendentes" }).click();
  const attendantName = `Atendente E2E ${Date.now()}`;
  await page.getByLabel("Nome do atendente").fill(attendantName);
  const attendantCreated = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/attendants" &&
      response.request().method() === "POST",
    { timeout: 45_000 },
  );
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  expect((await attendantCreated).status()).toBe(201);
  await expect(page.getByText(attendantName, { exact: true })).toBeVisible();
});

test("Inbox alterna entre lista e conversa sem exibir dois painéis no mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/inbox");

  await expect(page.getByRole("complementary", { name: "Configuração inicial" })).toBeHidden();
  await expect(page.getByRole("link", { name: /Contato Piloto E2E/ })).toBeVisible();
  await expect(page.getByText("Selecione uma conversa", { exact: true })).toBeHidden();
  await expectNoHorizontalOverflow(page, 390);

  await page.getByRole("link", { name: /Contato Piloto E2E/ }).click();
  await expect(page.getByRole("link", { name: "Voltar para conversas" })).toBeVisible();
  await expect(page.getByText("Selecione uma conversa", { exact: true })).toBeHidden();
  await expectNoHorizontalOverflow(page, 390);

  await page.getByRole("link", { name: "Voltar para conversas" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByRole("link", { name: /Contato Piloto E2E/ })).toBeVisible();
  await expectNoHorizontalOverflow(page, 390);
});

test("layout móvel, menu e modal permanecem acessíveis sem conteúdo cortado", async ({
  page,
}) => {
  // O cenário cruza quatro rotas e executa o axe dentro do modal. Em uma
  // compilação fria do Firefox, 30s encerrava a página durante a última rota;
  // o orçamento maior continua finito e evita transformar preparação em flake.
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await expectNoHorizontalOverflow(page, 390);
  await expect(
    page.getByRole("link", { name: "Campanha rápida" }),
  ).toBeVisible();

  const openMenu = page.getByRole("button", {
    name: "Abrir menu de navegação",
  });
  await openMenu.click();
  const menu = page.getByRole("dialog", { name: "Menu principal" });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("button", { name: "Fechar menu" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(openMenu).toBeFocused();

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/contacts");
  await expect(
    page.getByLabel("Filtrar contatos por status"),
  ).toBeVisible();
  await expect(page.getByLabel("Filtrar contatos por tag")).toBeVisible();
  await expectNoHorizontalOverflow(page, 360);
  await expectNoVisibleLayoutOverflow(page);
  const importTrigger = page.getByRole("button", { name: "Importar CSV" });
  await importTrigger.click();
  const dialog = page.getByRole("dialog", { name: "Importar Contatos" });
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox?.x).toBeGreaterThanOrEqual(0);
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(
    360,
  );
  const importA11y = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(importA11y.violations).toEqual([]);
  expect(await page.locator("#root").getAttribute("inert")).not.toBeNull();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(importTrigger).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/campaigns");
  await expectNoHorizontalOverflow(page, 390);
  await page.getByRole("button", { name: "Abrir menu de navegação" }).click();
  await expect(page.getByRole("link", { name: "Nova Campanha" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/campaigns/e2e-campaign-control");
  await expect(
    page.getByRole("heading", { name: "Controle E2E" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page, 390);

  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/campaigns/new");
  await expect(
    page.getByRole("heading", { name: "Criar campanha" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page, 320);
});

const operationalRoutes = [
  "/",
  "/campaigns",
  "/campaigns/new",
  "/contacts",
  "/templates",
  "/templates/drafts/new",
  "/templates/new",
  "/segments",
  "/knowledge",
  "/forms",
  "/submissions",
  "/flows",
  "/flows/builder",
  "/settings",
  "/settings/attendants",
  "/settings/meta-diagnostics",
  "/settings/performance",
  "/settings/ai",
  "/settings/ai/agents",
  "/inbox",
];
const responsiveViewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 620, height: 900 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const responsiveRouteGroups = Array.from(
  { length: Math.ceil(operationalRoutes.length / 7) },
  (_, index) => operationalRoutes.slice(index * 7, index * 7 + 7),
);

for (const { width, height } of responsiveViewports) {
  for (const [groupIndex, routes] of responsiveRouteGroups.entries()) {
    test(`todas as rotas operacionais preservam a largura em ${width}×${height} — grupo ${groupIndex + 1}/${responsiveRouteGroups.length}`, async ({
      page,
    }) => {
      // Grupos finitos impedem que a soma de vinte navegações válidas estoure
      // um único orçamento global em runners frios. Cada rota mantém as mesmas
      // asserções e nenhum retry passa a ser aceito como aprovação.
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height });
      await page.goto("/login");
      await page.getByLabel("Senha mestra").fill("dev");
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page).toHaveURL(/\/$/);
      for (const path of routes) {
        await page.goto(path);
        await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Algo deu errado.")).toHaveCount(0);
        await expectNoHorizontalOverflow(page, width);
        await expectNoVisibleLayoutOverflow(page);
      }
    });
  }
}

test("wizard de campanha mantém etapas e campos legíveis em largura reduzida", async ({
  page,
}) => {
  await page.setViewportSize({ width: 620, height: 900 });
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/campaigns/new");

  await expect(page.getByLabel("Etapas da campanha")).toBeVisible();
  await expect(page.getByRole("button", { name: /1 Configuração/ })).toBeVisible();
  await expect(page.getByLabel("Nome da campanha")).toBeVisible();
  await expect(page.getByLabel("Filtrar por categoria")).toBeVisible();
  const templateTitles = page.locator('button > div[title]');
  await expect(templateTitles.first()).toBeVisible();
  expect(
    await templateTitles.evaluateAll((nodes) =>
      nodes.every((node) => node.scrollWidth <= node.clientWidth),
    ),
  ).toBe(true);
  await expectNoHorizontalOverflow(page, 620);
});

test("Dashboard exibe estados sem dados, erro e recuperação sem depender da base publicada", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sent30d: 0,
        deliveryRate: 0,
        readRate: 0,
        failed30d: 0,
        activeCampaigns: 0,
        volume: [],
        recentCampaigns: [],
      }),
    });
  });
  await page.goto("/");
  await expect(page.getByText("Nenhuma campanha ainda")).toBeVisible();
  await expect(page.getByText("Enviadas", { exact: true })).toBeVisible();

  await page.unroute("**/api/dashboard");
  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Falha controlada da auditoria" }),
    });
  });
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();

  await page.unroute("**/api/dashboard");
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Performance exibe estado sem dados e erro controlado", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.route("**/api/dashboard/performance**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        rangeDays: 30,
        totals: {
          runs: 0,
          throughput_mps: { median: null, p90: null, samples: 0 },
          sent: 0,
          failed: 0,
        },
        runs: [],
        hint: "Execute campanhas para formar uma linha de base de performance.",
      }),
    });
  });
  await page.goto("/settings/performance");
  await expect(page.getByText("Nenhuma execução no período.")).toBeVisible();
  await expect(page.getByText("Execuções", { exact: true })).toBeVisible();

  await page.unroute("**/api/dashboard/performance**");
  await page.route("**/api/dashboard/performance**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Indisponibilidade controlada" }),
    });
  });
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("Central de IA exibe estado pendente quando o provedor global não está pronto", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.route("**/api/settings/health", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ai: {
          enabled: false,
          configured: true,
          ready: false,
          model: "@cf/meta/llama-3.2-3b-instruct",
        },
      }),
    });
  });
  await page.goto("/settings/ai");
  await expect(page.getByText("Pendente", { exact: true })).toBeVisible();
  await expect(page.getByText("Cloudflare Workers AI", { exact: true })).toBeVisible();
});

test("Configurações permitem ativar Google Calendar opcionalmente sem expor segredo", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Google Calendar" })).toBeVisible();
  await expect(page.getByText("Não configurado. Ative apenas se quiser usar agendamento pelo Google.")).toBeVisible();
  await page.getByRole("button", { name: "Configurar" }).click();
  await expect(page.getByText("Callback autorizado")).toBeVisible();
  await expect(page.getByLabel("Client ID")).toBeVisible();
  await expect(page.getByLabel("Client Secret")).toHaveAttribute("type", "password");
  await expect(page.getByText(/CLIENT_SECRET|ENCRYPTION_KEY/)).toHaveCount(0);
});

test("Configurações oferecem importação segura da tabela de preços Meta", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Tabela de preços Meta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Atualizar automaticamente" })).toBeEnabled();
  await expect(page.getByText("Importar arquivo CSV", { exact: true })).toBeVisible();
});

test("Configurações não inventam consumo de infraestrutura", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Uso da Infraestrutura" })).toBeVisible();
  await expect(page.getByText("Dados reais do ambiente atual")).toBeVisible();
  await expect(page.getByText("Backlog em tempo real")).toBeVisible();
  await expect(page.getByText("Configure o token Analytics")).toBeVisible();
  await expect(page.getByText(/O backlog das filas, o armazenamento do D1 e os envios são reais/)).toBeVisible();
});

test("Inbox bloqueia ativação quando a IA global está indisponível", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  const conversationId = "22222222-2222-4222-8222-222222222222";
  await page.route(`**/api/conversations/${conversationId}/ai`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        enabled: false,
        global: {
          enabled: false,
          configured: true,
          ready: false,
          model: "@cf/meta/llama-3.2-3b-instruct",
        },
        sending: { enabled: true, serviceWindowOpen: true },
        drafts: [],
      }),
    });
  });
  await page.goto(`/inbox/${conversationId}`);
  await page.getByRole("button", { name: "Contexto e memória" }).click();
  await expect(
    page.getByText(
      "O provedor de IA ainda não está pronto. Verifique a Central de IA.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Ativar" })).toHaveCount(0);
});

test("Templates permite selecionar itens e expõe ações em lote reais", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1206, height: 900 });
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/templates");

  const checkbox = page.getByRole("button", {
    name: "Selecionar e2e_marketing_simples",
  });
  await checkbox.click();
  await expect(checkbox).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 template selecionado")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Excluir selecionados" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Limpar seleção" }).click();
  await expect(page.getByText(/template selecionado/)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Selecionar todos os templates" })
    .click();
  await expect(
    page.getByRole("button", { name: "Selecionar todos os templates" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Limpar seleção" }).click();
  await expect(page.getByText(/template selecionado/)).toHaveCount(0);

  await page.getByRole("button", { name: "Alternar para tema claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await reloadAuthedRoute(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Alternar para tema escuro" }).click();
});

test("Templates preserva a ação de clonar no layout móvel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/templates");
  await page.getByLabel("Buscar templates").fill("e2e_marketing_simples");
  await expect(page.getByRole("button", { name: "Clonar" })).toBeVisible();
  await expectNoHorizontalOverflow(page, 390);
});

test("Campanhas permite atribuir pasta e tags em desktop e mobile", async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name;
  const campaignName = `Organização E2E ${suffix}`;
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/campaigns");
  await page.getByRole("searchbox").fill(campaignName);

  await page.getByRole("button", { name: `Mover ${campaignName} para pasta` }).click();
  const folderMenu = page.getByRole("menu", { name: `Mover ${campaignName} para pasta` });
  await folderMenu.getByRole("menuitemradio", { name: `Pasta Org ${suffix}` }).click();
  await expect(page.getByRole("button", { name: `Mover ${campaignName} para pasta` })).toBeVisible();

  await page.getByRole("button", { name: `Editar tags de ${campaignName}` }).click();
  const tag = page.getByRole("menuitemcheckbox", { name: `Tag Org ${suffix}` });
  if ((await tag.getAttribute("aria-checked")) === "true") {
    await tag.click();
    await expect(tag).toHaveAttribute("aria-checked", "false");
  }
  await tag.click();
  await expect(tag).toHaveAttribute("aria-checked", "true");

  await page.setViewportSize({ width: 390, height: 844 });
  await reloadAuthedRoute(page);
  await page.getByRole("searchbox").fill(campaignName);
  await expect(
    page.getByRole("button", { name: `Mover ${campaignName} para pasta` }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Editar tags de ${campaignName}` }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page, 390);
});

test("Inbox seleciona template, resolve variáveis e exige confirmação de envio", async ({ page }) => {
  // A Inbox carrega várias consultas em paralelo e este cenário ainda roda o
  // axe dentro do modal. O primeiro carregamento WebKit pode passar de 30s;
  // manter um orçamento explícito evita que o teardown feche a página antes
  // do clique e transforme timeout de preparação em falso erro de interação.
  test.setTimeout(60_000);
  let sentBody: Record<string, unknown> | null = null;
  await page.route(
    "**/api/conversations/22222222-2222-4222-8222-222222222222/templates/send",
    async (route) => {
      sentBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ status: "accepted", message_id: "wamid.e2e.template" }),
      });
    },
  );
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await waitForAuthedAppReady(page);
  await page.goto("/inbox/22222222-2222-4222-8222-222222222222");
  await page.getByLabel("Ações da mensagem").click();
  await page.getByRole("button", { name: "Enviar template aprovado" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Enviar template aprovado" })).toBeVisible();
  await dialog.getByLabel("Template aprovado para envio").selectOption({
    label: "e2e_template_variaveis · pt_BR · UTILITY",
  });
  await dialog.getByLabel("Fonte de Cabeçalho {{1}}").selectOption("contact_name");
  await dialog.getByLabel("Fonte de Corpo {{1}}").selectOption("contact_phone");
  await dialog.getByLabel("Valor de Botão 1 {{1}}").fill("pedido-123");
  const preview = dialog.getByLabel("Preview do template e2e_template_variaveis");
  await expect(preview).toContainText("Contato Piloto E2E");
  await expect(preview).toContainText("+5511999999999");
  const templateA11y = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(templateA11y.violations).toEqual([]);
  await dialog.getByRole("button", { name: "Confirmar e enviar template" }).click();
  await expect(dialog).toBeHidden();
  expect(sentBody).toMatchObject({
    confirm: true,
    name: "e2e_template_variaveis",
    language: "pt_BR",
    mapping: {
      "header.1": { source: "contact_name" },
      "body.1": { source: "contact_phone" },
      "button.0.1": { source: "fixed", value: "pedido-123" },
    },
  });
});

test("rotas críticas não têm violações WCAG A/AA detectáveis", async ({ page }, testInfo) => {
  // O axe percorre sete rotas completas. O orçamento continua finito, mas
  // contempla a compilação fria do Worker e a instrumentação no runner Linux.
  test.setTimeout(90_000);
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);

  const findings: Array<{
    path: string;
    rule: string;
    targets: string[];
    html: string[];
    summary: string[];
  }> = [];
  for (const path of [
    "/",
    "/campaigns",
    "/campaigns/new",
    "/templates",
    "/contacts",
    "/inbox/22222222-2222-4222-8222-222222222222",
    "/settings",
  ]) {
    await gotoAuthedRoute(page, path);
    await page.waitForTimeout(250);
    if (testInfo.project.name === "webkit") {
      const selectStyles = await page.locator("select:visible").evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node);
          return {
            color: style.color,
            webkitTextFillColor: style.webkitTextFillColor,
            backgroundColor: style.backgroundColor,
            opacity: style.opacity,
            html: node.outerHTML,
          };
        }).filter((style) => style.opacity !== "0"),
      );
      for (const style of selectStyles) {
        expect(style.webkitTextFillColor, `${path}: ${style.html}`).toBe(
          "rgb(244, 244, 245)",
        );
      }
    }
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    for (const violation of violations) {
      const webkitNativeSelectFalsePositive =
        testInfo.project.name === "webkit" &&
        violation.id === "color-contrast" &&
        violation.nodes.every((node) =>
          node.target.every((target) => String(target).includes("select")),
        );
      if (webkitNativeSelectFalsePositive) continue;
      findings.push({
        path,
        rule: violation.id,
        targets: violation.nodes.flatMap((node) => node.target.map(String)),
        html: violation.nodes.map((node) => node.html),
        summary: violation.nodes.map((node) => node.failureSummary ?? ""),
      });
    }
  }
  expect(findings).toEqual([]);
});

test("configurações mostram IDs salvos como valores, não placeholders", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  const phoneId = "123456789012345";
  const wabaId = "987654321098765";
  const original = await page.evaluate(async () => {
    const response = await fetch("/api/settings");
    return (await response.json()) as {
      whatsapp_phone_id?: string | null;
      whatsapp_waba_id?: string | null;
    };
  });

  try {
    const updated = await page.evaluate(async (values) => {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      return response.status;
    }, { whatsapp_phone_id: phoneId, whatsapp_waba_id: wabaId });
    expect(updated).toBe(200);

    await page.goto("/settings");
    await expect(page.locator("#whatsapp_phone_id")).toHaveValue(phoneId);
    await expect(page.locator("#whatsapp_waba_id")).toHaveValue(wabaId);
  } finally {
    await page.evaluate(async (values) => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
    }, {
      whatsapp_phone_id: original.whatsapp_phone_id ?? "",
      whatsapp_waba_id: original.whatsapp_waba_id ?? "",
    });
  }
});
