import { chromium } from "playwright";

const password = process.env.SMARTZAP_LEGACY_PASSWORD;
if (!password) throw new Error("Defina SMARTZAP_LEGACY_PASSWORD.");

const viewport = {
  width: Number(process.env.VIEWPORT_WIDTH || 390),
  height: Number(process.env.VIEWPORT_HEIGHT || 844),
};
const route = process.env.ROUTE || "/templates";

async function login(page, base, secret) {
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  if (!page.url().includes("/login")) return;
  await page.locator('input[type="password"]').fill(secret);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login"), {
      waitUntil: "commit",
    }),
    page.getByRole("button", { name: /Entrar/i }).click(),
  ]);
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
}

async function snapshot(locator, ancestor = 0) {
  if (!(await locator.count())) return null;
  let target = locator.first();
  for (let index = 0; index < ancestor; index += 1) {
    target = target.locator("..");
  }
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const numeric = (value) => Number(value.toFixed(3));
    return {
      tag: element.tagName.toLowerCase(),
      text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80),
      rect: {
        x: numeric(rect.x),
        y: numeric(rect.y),
        width: numeric(rect.width),
        height: numeric(rect.height),
      },
      display: style.display,
      gap: style.gap,
      padding: style.padding,
      margin: style.margin,
      color: style.color,
      background: style.backgroundColor,
      border: style.border,
      borderRadius: style.borderRadius,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
    };
  });
}

async function inspect(page) {
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important}",
  });
  await page.evaluate(async () => document.fonts.ready);
  const search = page.getByPlaceholder("Buscar templates...");
  const approved = page.getByRole("button", { name: /Filtrar por status: Aprovados|Aprovados \(/i });
  const workflowName = page.getByText(/^Fluxo 20/).first();
  const workflowSearch = page.getByPlaceholder("Buscar fluxo...");
  const workflowRow = workflowName.locator(
    "xpath=ancestor::*[contains(@class,'rounded-xl')][1]",
  );
  return {
    fonts: await page.evaluate(() => ({
      status: document.fonts.status,
      faces: [...document.fonts].map((font) => ({
        family: font.family,
        status: font.status,
        weight: font.weight,
      })),
      variables: Object.fromEntries(
        [
          "--color-emerald-300",
          "--color-emerald-400",
          "--color-emerald-500",
          "--color-primary-300",
          "--color-primary-400",
          "--color-primary-500",
          "--ds-bg-glass",
          "--ds-border-subtle",
        ].map((name) => [
          name,
          getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
        ]),
      ),
    })),
    title: await snapshot(page.getByRole("heading", { name: "Templates", exact: true })),
    description: await snapshot(page.getByText("Gerencie templates e rascunhos.", { exact: true })),
    create: await snapshot(page.getByRole("button", { name: /Criar template/i })),
    sync: await snapshot(page.getByRole("button", { name: /Sincronizar/i })),
    metaTab: await snapshot(page.getByRole("button", { name: /Meta \(Templates\)/i })),
    miniAppsTab: await snapshot(page.getByRole("button", { name: /MiniApps/i })),
    allCategory: await snapshot(page.getByRole("button", { name: /categoria: Todos|^TODOS$/i })),
    approvedStatus: await snapshot(approved),
    search: await snapshot(search),
    searchBox: await snapshot(search, 1),
    filterPanel: await snapshot(search, 3),
    workflow: {
      name: await snapshot(workflowName),
      parent1: await snapshot(workflowName, 1),
      parent2: await snapshot(workflowName, 2),
      parent3: await snapshot(workflowName, 3),
      parent4: await snapshot(workflowName, 4),
      draft: await snapshot(page.getByText("Rascunho", { exact: true })),
      publish: await snapshot(page.getByRole("button", { name: "Publicar", exact: true })),
      search: await snapshot(workflowSearch),
      searchBox: await snapshot(workflowSearch, 1),
      icon: await snapshot(workflowRow.locator("svg").first()),
      iconBox: await snapshot(workflowRow.locator("svg").first(), 1),
    },
  };
}

const browser = await chromium.launch({ headless: true });
try {
  const contexts = await Promise.all([
    browser.newContext({ viewport, locale: "pt-BR", colorScheme: "dark" }),
    browser.newContext({ viewport, locale: "pt-BR", colorScheme: "dark" }),
  ]);
  const [legacy, cloudflare] = await Promise.all(contexts.map((context) => context.newPage()));
  await Promise.all([
    login(legacy, "http://127.0.0.1:3100", password),
    login(cloudflare, "http://127.0.0.1:5175", "dev"),
  ]);
  const [reference, candidate] = await Promise.all([
    inspect(legacy),
    inspect(cloudflare),
  ]);
  console.log(JSON.stringify({ viewport, route, reference, candidate }, null, 2));
  await Promise.all(contexts.map((context) => context.close()));
} finally {
  await browser.close();
}
