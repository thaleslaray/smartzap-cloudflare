import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";

const password = process.env.SMARTZAP_LEGACY_PASSWORD;
if (!password) throw new Error("Defina SMARTZAP_LEGACY_PASSWORD.");
const cfPassword = process.env.SMARTZAP_CF_PASSWORD || "dev";
// Next dev bloqueia hidratação/HMR quando acessado por 127.0.0.1 sem
// `allowedDevOrigins`; localhost é a origem canônica dos dois runtimes locais.
const legacyBase = process.env.SMARTZAP_LEGACY_URL || "http://localhost:3100";
const cfBase = process.env.SMARTZAP_CF_URL || "http://localhost:5175";
const out = new URL("../test-results/visual-route-matrix/", import.meta.url);
const routes = [
  ["dashboard", "/"],
  ["campaigns", "/campaigns"],
  ["contacts", "/contacts"],
  ["inbox", "/inbox"],
  ["templates", "/templates"],
  ["settings", "/settings"],
  ["ai-center", "/settings/ai"],
  ["ai-agents", "/settings/ai/agents"],
  ["attendants", "/settings/attendants"],
  ["submissions", "/submissions"],
  ["forms", "/forms"],
  ["flows", "/flows"],
  ["flow-builder-home", "/flows/builder"],
  ["flow-builder-detail", "/flows/builder"],
  ["template-project-new", "/templates/new"],
  ["template-draft-new", "/templates/drafts/new"],
].filter(
  ([name]) => !process.env.VISUAL_ROUTE || name === process.env.VISUAL_ROUTE,
);
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
].filter(
  (item) =>
    !process.env.VISUAL_VIEWPORT || item.name === process.env.VISUAL_VIEWPORT,
);
if (!routes.length || !viewports.length) {
  throw new Error(
    `Matriz visual vazia (rota=${process.env.VISUAL_ROUTE || "todas"}, viewport=${process.env.VISUAL_VIEWPORT || "todos"}).`,
  );
}

async function authState(browser, base, pwd, label) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  const input = page.locator('input[type="password"]');
  if (await input.isVisible()) {
    const result = await page.evaluate(async (password) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      return { ok: response.ok, status: response.status };
    }, pwd);
    if (!result.ok)
      throw new Error(`${label}: login falhou com HTTP ${result.status}`);
  }
  const state = await context.storageState();
  await context.close();
  return state;
}

async function stabilize(page) {
  const editorLoading = page.getByText("Carregando editor...", { exact: true });
  if (await editorLoading.count()) {
    await editorLoading.first().waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  }
  // O legado usa skeletons `animate-pulse` enquanto carrega Supabase. Comparar
  // esse estado com a tela final do Worker distorce completamente a métrica.
  const skeleton = page.locator(".animate-pulse").first();
  if (await skeleton.count()) {
    await skeleton.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  }
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}[data-next-badge-root],nextjs-portal{display:none!important}",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    for (const element of document.querySelectorAll("*")) {
      if (element instanceof HTMLElement && element.scrollTop)
        element.scrollTop = 0;
    }
  });
  await page.waitForTimeout(400);
}

async function compare(a, b, width, height) {
  const [aa, bb] = await Promise.all([
    sharp(a).ensureAlpha().raw().toBuffer(),
    sharp(b).ensureAlpha().raw().toBuffer(),
  ]);
  const diff = Buffer.alloc(aa.length);
  let changed = 0;
  for (let index = 0; index < aa.length; index += 4) {
    const delta = Math.max(
      Math.abs(aa[index] - bb[index]),
      Math.abs(aa[index + 1] - bb[index + 1]),
      Math.abs(aa[index + 2] - bb[index + 2]),
    );
    const different = delta > 25;
    if (different) changed += 1;
    diff[index] = different ? 255 : 238;
    diff[index + 1] = different ? 0 : 238;
    diff[index + 2] = different ? 0 : 238;
    diff[index + 3] = 255;
  }
  return {
    percent: Number(((changed / (width * height)) * 100).toFixed(3)),
    diff: await sharp(diff, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer(),
  };
}

async function captureViewport(page, width, height) {
  await page.bringToFront();
  await page.waitForTimeout(150);
  // A primeira captura depois de alternar abas pode vir de uma superfície
  // parcialmente descartada pelo compositor headless. Ela serve apenas para
  // forçar o repaint; a segunda é a evidência usada na comparação.
  await page.screenshot({
    type: "png",
    animations: "disabled",
    fullPage: false,
  });
  await page.waitForTimeout(100);
  const viewport = await page.screenshot({
    type: "png",
    animations: "disabled",
    fullPage: false,
  });
  const metadata = await sharp(viewport).metadata();
  return sharp(viewport)
    .extend({
      right: Math.max(0, width - (metadata.width ?? width)),
      bottom: Math.max(0, height - (metadata.height ?? height)),
      background: "#09090b",
    })
    .png()
    .toBuffer();
}

async function captureRoute({
  browser,
  storageState,
  viewport,
  base,
  route,
  openFirstFlow,
}) {
  const context = await browser.newContext({
    viewport,
    locale: "pt-BR",
    colorScheme: "dark",
    storageState,
  });
  try {
    const page = await context.newPage();
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
    if (openFirstFlow) {
      await page.getByText("Abrir", { exact: true }).first().click();
      await page.waitForURL(/\/flows\/builder\/[^/]+$/);
    }
    await stabilize(page);
    return {
      image: await captureViewport(page, viewport.width, viewport.height),
      url: page.url().replace(base, ""),
    };
  } finally {
    await context.close();
  }
}

await mkdir(out, { recursive: true });
// Não desative GPU/canvas aqui. Em Chromium headless isso pode descartar
// parcialmente a superfície da aba que acabou de perder foco e produzir
// falsos positivos (textos e blocos desaparecem apenas no PNG).
const browser = await chromium.launch({ headless: true });
console.log("Matriz visual: autenticando as duas aplicações…");
const [legacyState, cfState] = await Promise.all([
  authState(browser, legacyBase, password, "legado"),
  authState(browser, cfBase, cfPassword, "cloudflare"),
]);
console.log(
  `Matriz visual: autenticação concluída; ${routes.length * viewports.length} comparação(ões).`,
);
const summary = [];
try {
  for (const viewport of viewports) {
    for (const [name, legacyRoute, candidateRoute = legacyRoute] of routes) {
      console.log(`Matriz visual: ${viewport.name}/${name}`);
      // Captura sequencial: manter as duas aplicações abertas simultaneamente
      // faz o compositor headless descartar partes da aba em segundo plano.
      const legacyCapture = await captureRoute({
        browser,
        storageState: legacyState,
        viewport,
        base: legacyBase,
        route: legacyRoute,
        openFirstFlow: name === "flow-builder-detail",
      });
      const cfCapture = await captureRoute({
        browser,
        storageState: cfState,
        viewport,
        base: cfBase,
        route: candidateRoute,
        openFirstFlow: name === "flow-builder-detail",
      });
      const reference = legacyCapture.image;
      const candidate = cfCapture.image;
      const result = await compare(
        reference,
        candidate,
        viewport.width,
        viewport.height,
      );
      const runSuffix = process.env.VISUAL_RUN_ID
        ? `-${process.env.VISUAL_RUN_ID.replace(/[^a-zA-Z0-9_-]/g, "")}`
        : "";
      const basename = `${viewport.name}-${name}${runSuffix}`;
      await Promise.all([
        writeFile(new URL(`${basename}-original.png`, out), reference),
        writeFile(new URL(`${basename}-cloudflare.png`, out), candidate),
        writeFile(new URL(`${basename}-diff.png`, out), result.diff),
      ]);
      summary.push({
        viewport: viewport.name,
        route: name,
        differencePercent: result.percent,
        legacyUrl: legacyCapture.url,
        cfUrl: cfCapture.url,
      });
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  new URL("summary.json", out),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.table(summary);
console.log(`Matriz visual concluída: ${summary.length} comparações em ${out.pathname}`);
