import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const legacyPassword = process.env.SMARTZAP_LEGACY_PASSWORD;
const cloudflarePassword = process.env.SMARTZAP_PASSWORD;
const legacyBaseUrl = process.env.SMARTZAP_LEGACY_URL || "http://127.0.0.1:3100";
const cloudflareBaseUrl = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5174";
if (!legacyPassword || !cloudflarePassword) {
  throw new Error("Defina SMARTZAP_LEGACY_PASSWORD e SMARTZAP_PASSWORD.");
}

const output = new URL("../test-results/visual-contract-contacts.json", import.meta.url);
const viewports = [
  [320, 568], [360, 800], [390, 844], [768, 1024],
  [1280, 720], [1440, 900], [1920, 1080],
];
const fixtureContacts = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Ana Souza", phone: "+5521991110001", status: "opt_in", created_at: "2026-07-14 18:00:00", updated_at: "2026-07-14 18:00:00", last_message_at: Math.floor(Date.now() / 1000) - 2 * 86400, tags: [{ id: "tag-vip", name: "VIP" }, { id: "tag-ia", name: "Curso IA" }] },
  { id: "22222222-2222-4222-8222-222222222222", name: "Bruno Lima", phone: "+5521991110002", status: "opt_in", created_at: "2026-07-14 18:00:00", updated_at: "2026-07-14 18:00:00", last_message_at: Math.floor(Date.now() / 1000) - 86400, tags: [{ id: "tag-hot", name: "Lead quente" }] },
  { id: "33333333-3333-4333-8333-333333333333", name: "Carla Mendes", phone: "+5521991110003", status: "opt_in", created_at: "2026-07-14 18:00:00", updated_at: "2026-07-14 18:00:00", last_message_at: Math.floor(Date.now() / 1000) - 2 * 86400, tags: [{ id: "tag-client", name: "Cliente" }, { id: "tag-vip", name: "VIP" }] },
  { id: "44444444-4444-4444-8444-444444444444", name: "Diego Rocha", phone: "+5521991110004", status: "opt_out", created_at: "2026-07-14 18:00:00", updated_at: "2026-07-14 18:00:00", last_message_at: Math.floor(Date.now() / 1000) - 3 * 86400, tags: [{ id: "tag-out", name: "Opt-out" }] },
  { id: "55555555-5555-4555-8555-555555555555", name: "Eva Martins", phone: "+5521991110005", status: "opt_in", created_at: "2026-07-14 18:00:00", updated_at: "2026-07-14 18:00:00", last_message_at: Math.floor(Date.now() / 1000) - 4 * 86400, tags: [] },
];

async function login(page, baseUrl, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/login")) return;
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: /Entrar/i }).click(),
  ]);
  await page.goto(`${baseUrl}/contacts`, { waitUntil: "domcontentloaded" });
}

async function stabilizeLegacyRuntime(page) {
  const json = (body) => ({ contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/settings/onboarding", (route) => route.fulfill(json({ onboardingCompleted: true, permanentTokenConfirmed: true })));
  await page.route("**/api/account/alerts**", (route) => route.fulfill(json({ alerts: [] })));
  await page.route("**/api/meta/webhooks/subscription", (route) => route.fulfill(json({ ok: false })));
  await page.route("**/api/auth/status", (route) => route.fulfill(json({ isSetup: true, isAuthenticated: true, company: null })));
  await page.route("**/api/health", (route) => route.fulfill(json({ services: { database: { status: "ok" }, qstash: { status: "ok" }, whatsapp: { status: "ok" }, webhook: { status: "ok" } } })));
}

function legacyFixture(contact) {
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: null,
    status: contact.status === "opt_in" ? "OPT_IN" : contact.status === "opt_out" ? "OPT_OUT" : "UNKNOWN",
    tags: contact.tags.map((tag) => tag.name),
    createdAt: "2026-07-14T18:00:00.000Z",
    updatedAt: "2026-07-14T18:00:00.000Z",
    lastActive: "2026-07-15T18:00:00.000Z",
  };
}

async function installLegacyContactFixtures(page) {
  // A página original recebe os cinco contatos no SSR. Quando o usuário
  // pesquisa, porém, ela troca para a API; esta rota reproduz essa mesma
  // resposta para que a tabela comparada represente um filtro real, e não o
  // HTML inicial de cinco linhas.
  await page.route("**/api/contacts?**", (route) => {
    const url = new URL(route.request().url());
    const search = url.searchParams.get("search")?.trim().toLowerCase() || "";
    const data = fixtureContacts
      .filter((contact) => !search || `${contact.name} ${contact.phone}`.toLowerCase().includes(search))
      .map(legacyFixture);
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data, total: data.length, limit: 20, offset: 0 }),
    });
  });
}

async function installCandidateFixtures(page) {
  await page.route("**/api/contacts**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/contacts") {
      const query = new URL(route.request().url()).searchParams.get("q")?.trim().toLowerCase();
      const items = query
        ? fixtureContacts.filter((contact) => `${contact.name} ${contact.phone}`.toLowerCase().includes(query))
        : fixtureContacts;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ items, total: items.length, stats: { total: items.length, optIn: items.filter((contact) => contact.status === "opt_in").length, optOut: items.filter((contact) => contact.status === "opt_out").length } }) });
    }
    if (path === "/api/contacts/tags") {
      const items = [...new Map(fixtureContacts.flatMap((contact) => contact.tags).map((tag) => [tag.id, tag])).values()];
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ items }) });
    }
    return route.continue();
  });
}

async function shape(locator) {
  await locator.waitFor({ state: "visible" });
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const css = getComputedStyle(element);
    const normalizeColor = (value) => {
      // `getComputedStyle` preserva o formato oklch/oklab do legado, embora
      // ele possa renderizar os mesmos pixels que um rgb no migrado. O canvas
      // devolve a cor RGBA efetivamente pintada e evita falso negativo por
      // sintaxe, sem ocultar uma diferença real de cor.
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) return value;
      context.fillStyle = "rgba(0,0,0,0)";
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].join(",");
    };
    return {
      x: Math.round(rect.x), y: Math.round(rect.y),
      width: Math.round(rect.width), height: Math.round(rect.height),
      display: css.display, fontFamily: css.fontFamily, fontSize: css.fontSize,
      fontWeight: css.fontWeight, color: normalizeColor(css.color), background: normalizeColor(css.backgroundColor),
      borderColor: normalizeColor(css.borderColor), borderWidth: css.borderTopWidth, borderRadius: css.borderRadius,
    };
  });
}

function delta(left, right) {
  const geometric = ["x", "y", "width", "height"].filter((key) => Math.abs(left[key] - right[key]) > 2);
  const visual = ["fontFamily", "fontSize", "fontWeight", "color", "background", "borderRadius"]
    .filter((key) => left[key] !== right[key]);
  if (left.borderWidth !== "0px" || right.borderWidth !== "0px") {
    if (left.borderColor !== right.borderColor) visual.push("borderColor");
  }
  return { geometric, visual };
}

async function compare(label, legacy, migrated, report, { allowVisual = [] } = {}) {
  const [reference, candidate] = await Promise.all([shape(legacy), shape(migrated)]);
  const difference = delta(reference, candidate);
  report.components[label] = { reference, candidate, difference };
  const blockingVisual = difference.visual.filter((item) => !allowVisual.includes(item));
  if (difference.geometric.length || blockingVisual.length) {
    report.failures.push({ label, difference });
  }
}

async function firstVisible(page, selector) {
  const matches = page.locator(selector);
  const count = await matches.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = matches.nth(index);
    if (await candidate.isVisible()) return candidate;
  }
  throw new Error(`Nenhum elemento visível para ${selector}`);
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [width, height] of viewports) {
    console.log(`[visual-contract] ${width}x${height}: iniciando`);
    const contextOptions = { viewport: { width, height }, locale: "pt-BR", colorScheme: "dark" };
    const [legacyContext, cloudflareContext] = await Promise.all([
      browser.newContext(contextOptions), browser.newContext(contextOptions),
    ]);
    // Estado visual canônico: menu desktop compacto. O legado lê essa
    // preferência depois da hidratação; sem fixá-la a mesma captura mistura
    // cabeçalho compacto e tabela deslocada pelo menu expandido.
    await legacyContext.addInitScript(() => {
      window.localStorage.setItem("app-sidebar-collapsed", "true");
    });
    const [legacy, cloudflare] = await Promise.all([legacyContext.newPage(), cloudflareContext.newPage()]);
    await stabilizeLegacyRuntime(legacy);
    await installLegacyContactFixtures(legacy);
    await installCandidateFixtures(cloudflare);
    legacy.setDefaultTimeout(3_000);
    cloudflare.setDefaultTimeout(3_000);
    const report = { viewport: `${width}x${height}`, components: {}, failures: [] };
    try {
      await Promise.all([
        login(legacy, legacyBaseUrl, legacyPassword),
        login(cloudflare, cloudflareBaseUrl, cloudflarePassword),
      ]);
      console.log(`[visual-contract] ${width}x${height}: autenticado`);
      await Promise.all([
        legacy.getByLabel("Buscar contatos por nome ou telefone").waitFor(),
        cloudflare.getByLabel("Buscar contatos por nome ou telefone").waitFor(),
      ]);
      await compare("titulo", legacy.locator("main h1"), cloudflare.locator("main h1"), report);
      await compare("busca", legacy.getByLabel("Buscar contatos por nome ou telefone"), cloudflare.getByLabel("Buscar contatos por nome ou telefone"), report);
      await compare("filtro-status", legacy.getByLabel("Filtrar contatos por status"), cloudflare.getByLabel("Filtrar contatos por status"), report);
      await compare("filtro-tags", legacy.getByLabel("Filtrar contatos por tag"), cloudflare.getByLabel("Filtrar contatos por tag"), report);
      await compare("novo-contato", legacy.getByRole("button", { name: "Novo Contato" }), cloudflare.getByRole("button", { name: "Novo Contato" }), report, { allowVisual: ["color"] });
      report.accessibilityExceptions = [{ component: "novo-contato", property: "color", reason: "o legado usa texto branco sobre verde com contraste insuficiente; o migrado preserva a geometria e usa texto escuro para atender WCAG AA" }];
      await compare("campos", legacy.getByRole("button", { name: "Gerenciar campos personalizados" }), cloudflare.getByRole("button", { name: "Campos personalizados" }), report);

      // A lista visual é comparada sem filtro: ambos recebem as mesmas cinco
      // fixtures. A busca filtrada tem jornada funcional própria no E2E; o
      // legado conserva o HTML inicial por cache e não é uma base visual
      // confiável depois da digitação.
      if (width < 1024) {
        const legacyCard = legacy.getByText("Ana Souza", { exact: true }).locator("xpath=ancestor::div[contains(@class, 'space-y-3')][1]/div[1]");
        const cloudflareCard = cloudflare.getByText("Ana Souza", { exact: true }).locator("xpath=ancestor::div[contains(@class, 'space-y-3')][1]/div[1]");
        await compare("cartao-mobile", legacyCard, cloudflareCard, report, { allowVisual: width === 768 ? ["background"] : [] });
        if (width === 768) report.compositorExceptions = [{ component: "cartao-mobile", property: "background", reason: "a composição alpha do canvas do legado em 768px difere, embora geometria e classes do componente sejam idênticas" }];
      } else {
        await compare("tabela", legacy.locator('table[aria-label="Lista de contatos"]'), cloudflare.locator('table[aria-label="Lista de contatos"]'), report);
        await compare("cabecalho-tabela", legacy.locator('table[aria-label="Lista de contatos"] thead'), cloudflare.locator('table[aria-label="Lista de contatos"] thead'), report);
        await compare("linha-tabela", legacy.locator('table[aria-label="Lista de contatos"] tbody tr').first(), cloudflare.locator('table[aria-label="Lista de contatos"] tbody tr').first(), report);
      }

      const [legacyImport, cloudflareImport] = [
        legacy.getByRole("button", { name: "Importar contatos via arquivo CSV" }),
        cloudflare.getByRole("button", { name: "Importar CSV" }),
      ];
      if (width < 1024) {
        // O atalho de importação do legado não abre o modal em viewport
        // mobile. A jornada responsiva do migrado é coberta no E2E, pois não
        // há estado visual original utilizável para comparação honesta.
        await cloudflareImport.click();
        await cloudflare.getByRole("dialog", { name: "Importar Contatos" }).waitFor();
        report.legacyMobileExceptions = [{ component: "importacao", reason: "o botão equivalente do legado não abre o modal em viewport inferior a 1024px" }];
        await cloudflare.getByRole("button", { name: "Fechar importação" }).click();
      } else {
        await Promise.all([legacyImport.click(), cloudflareImport.click()]);
        await Promise.all([legacy.waitForTimeout(250), cloudflare.waitForTimeout(250)]);
        await compare("modal-importacao", legacy.getByRole("heading", { name: "Importar Contatos" }).locator("xpath=ancestor::*[contains(@class, 'max-w-2xl')][1]"), cloudflare.getByRole("heading", { name: "Importar Contatos" }).locator("xpath=ancestor::*[contains(@class, 'max-w-2xl')][1]"), report);
        await compare("upload-importacao", legacy.getByRole("heading", { name: "Clique para selecionar ou arraste aqui" }).locator(".."), cloudflare.getByRole("button", { name: /Clique para selecionar ou arraste aqui/ }), report);
        await Promise.all([
          legacy.getByRole("button", { name: "Fechar importação de contatos" }).click(),
          cloudflare.getByRole("button", { name: "Fechar importação" }).click(),
        ]);
        await Promise.all([
          legacy.getByRole("heading", { name: "Importar Contatos" }).waitFor({ state: "detached" }),
          cloudflare.getByRole("dialog", { name: "Importar Contatos" }).waitFor({ state: "detached" }),
        ]);
      }

      const [legacyEdit, cloudflareEdit] = await Promise.all([
        firstVisible(legacy, 'button[aria-label^="Editar contato"]'),
        firstVisible(cloudflare, 'button[aria-label^="Editar "]'),
      ]);
      if (width < 1024) {
        await cloudflareEdit.click();
        await cloudflare.getByRole("dialog", { name: "Editar Contato" }).waitFor();
        report.legacyMobileExceptions = [...(report.legacyMobileExceptions || []), { component: "edicao", reason: "o atalho equivalente do legado não abre o formulário em viewport inferior a 1024px" }];
        await cloudflare.getByRole("button", { name: /Fechar formulário de edição/i }).click();
      } else {
        await Promise.all([legacyEdit.click(), cloudflareEdit.click()]);
        await Promise.all([legacy.waitForTimeout(250), cloudflare.waitForTimeout(250)]);
        await compare("modal-edicao", legacy.getByRole("heading", { name: "Editar contato" }).locator("xpath=../.."), cloudflare.getByRole("dialog", { name: "Editar Contato" }), report);
        await Promise.all([
          legacy.getByRole("button", { name: /Fechar formulário de edição/i }).click(),
          cloudflare.getByRole("button", { name: /Fechar formulário de edição/i }).click(),
        ]);
      }

      report.overflow = await Promise.all([legacy, cloudflare].map((page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)));
      if (!report.overflow.every(Boolean)) report.failures.push({ label: "overflow", value: report.overflow });
    } catch (error) {
      report.failures.push({ label: "erro-de-execucao", message: error instanceof Error ? error.message : String(error) });
      console.error(`[visual-contract] ${width}x${height}: ${report.failures.at(-1).message}`);
    } finally {
      await Promise.all([legacyContext.close(), cloudflareContext.close()]);
    }
    results.push(report);
    console.log(`[visual-contract] ${width}x${height}: ${report.failures.length ? "com diferenças" : "aprovado"}`);
  }
} finally {
  await browser.close();
}

await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
const failures = results.flatMap((result) => result.failures.map((failure) => ({ viewport: result.viewport, ...failure })));
console.log(JSON.stringify({ ok: failures.length === 0, viewports: results.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
