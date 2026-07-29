import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";

const legacyPassword = process.env.SMARTZAP_LEGACY_PASSWORD;
if (!legacyPassword)
  throw new Error(
    "Defina SMARTZAP_LEGACY_PASSWORD para autenticar no SmartZap original.",
  );
const cloudflareBase = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5175";

const outputDir = new URL("../test-results/visual-campaigns/", import.meta.url);
const viewports = [
  { name: "desktop-1280x720", width: 1280, height: 720 },
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "mobile-390x844", width: 390, height: 844 },
  { name: "mobile-320x568", width: 320, height: 568 },
].filter(
  (viewport) =>
    !process.env.VISUAL_VIEWPORT ||
    viewport.name === process.env.VISUAL_VIEWPORT,
);

const states = [
  { name: "configuracao", advance: 0 },
  { name: "template-selecionado", advance: 1 },
  { name: "publico", advance: 2 },
  { name: "validacao", advance: 3 },
  { name: "agendamento", advance: 4 },
].filter(
  (state) =>
    !process.env.VISUAL_STATE || state.name === process.env.VISUAL_STATE,
);

const templates = [
  {
    id: "tpl-visual-1",
    name: "boas_vindas_smartzap",
    language: "pt_BR",
    category: "MARKETING",
    status: "APPROVED",
    requiresParameters: false,
    components: [{ type: "BODY", text: "Olá! Esta é uma mensagem de teste." }],
  },
  {
    id: "tpl-visual-2",
    name: "lembrete_aula",
    language: "pt_BR",
    category: "UTILIDADE",
    status: "APPROVED",
    requiresParameters: false,
    components: [{ type: "BODY", text: "Lembrete da sua aula." }],
  },
];

const contacts = [
  {
    id: "contact-visual-1",
    name: "Contato Visual",
    phone: "+5521999990001",
    email: "visual@smartzap.test",
    status: "Opt-in",
    consent: true,
    custom_fields: {},
    tags: [],
  },
  {
    id: "contact-visual-2",
    name: "Contato Válido",
    phone: "+5521999990002",
    email: "valido@smartzap.test",
    status: "Opt-in",
    consent: true,
    custom_fields: {},
    tags: [],
  },
  {
    id: "contact-visual-3",
    name: "Contato Suprimido",
    phone: "+5521999990003",
    status: "Opt-out",
    consent: false,
    custom_fields: {},
    tags: [],
  },
];

async function installFixtures(page, app) {
  const json = (route, body) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/templates")
      return json(route, app === "legacy" ? templates : { items: templates });
    if (path === "/api/custom-fields")
      return json(route, app === "legacy" ? [] : { items: [] });
    if (path === "/api/settings/test-contact") return json(route, null);
    if (path === "/api/contacts/stats")
      return json(route, { total: 3, optIn: 2, optOut: 1 });
    if (path === "/api/contacts/tags")
      return json(route, app === "legacy" ? [] : { items: [] });
    if (
      path === "/api/contacts/country-codes" ||
      path === "/api/contacts/state-codes"
    )
      return json(route, { data: [] });
    if (path === "/api/contacts")
      return json(
        route,
        app === "legacy"
          ? url.search
            ? { data: contacts, total: 3, limit: 25, offset: 0 }
            : contacts
          : { items: contacts, total: 3, page: 1, pageSize: 25 },
      );
    if (path === "/api/segments") return json(route, { items: [] });
    if (path === "/api/campaigns/folders")
      return json(route, app === "legacy" ? [] : { items: [] });

    if (app === "legacy" && path === "/api/campaign/precheck")
      return json(route, {
        ok: true,
        templateName: "boas_vindas_smartzap",
        totals: { total: 3, valid: 2, skipped: 1 },
        results: [
          {
            ok: true,
            contactId: "contact-visual-1",
            name: "Contato Visual",
            phone: "+5521999990001",
            normalizedPhone: "+5521999990001",
          },
          {
            ok: true,
            contactId: "contact-visual-2",
            name: "Contato Válido",
            phone: "+5521999990002",
            normalizedPhone: "+5521999990002",
          },
          {
            ok: false,
            contactId: "contact-visual-3",
            name: "Contato Suprimido",
            phone: "+5521999990003",
            normalizedPhone: "+5521999990003",
            skipCode: "OPT_OUT",
            reason: "Contato opt-out",
          },
        ],
      });

    if (
      app === "cloudflare" &&
      path === "/api/campaigns" &&
      request.method() === "POST"
    )
      return json(route, {
        id: "campaign-visual",
        name: "Campanha visual",
        status: "draft",
        template_name: "boas_vindas_smartzap",
        template_language: "pt_BR",
      });
    if (
      app === "cloudflare" &&
      path === "/api/campaigns/campaign-visual/estimate"
    )
      return json(route, {
        recipients: 3,
        skipped: 1,
        unit: 0.42,
        total: 1.26,
      });
    if (
      app === "cloudflare" &&
      path === "/api/campaigns/campaign-visual/precheck"
    )
      return json(route, {
        totals: { total: 3, valid: 2, skipped: 1 },
        skippedItems: [
          {
            id: "contact-visual-3",
            name: "Contato Suprimido",
            phone: "+5521999990003",
            reason: "opt_out",
            detail: "Contato opt-out",
          },
        ],
      });

    return route.continue();
  });
}

async function advanceWizard(page, count) {
  if (count === 0) {
    await page
      .getByRole("heading", { name: "Template", exact: true })
      .waitFor();
    return;
  }
  await page.getByRole("button", { name: /boas_vindas_smartzap/i }).click();
  await page.getByText("Trocar", { exact: true }).waitFor();
  if (count === 1) return;

  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Escolha o público", exact: true })
    .waitFor();
  await page.waitForTimeout(100);
  if (count === 2) return;

  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Validação de destinatários", exact: true })
    .waitFor();
  await page.waitForTimeout(100);
  if (count === 3) return;

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Agendamento", exact: true })
    .waitFor();
  await page.waitForTimeout(100);
}

async function login(page, baseUrl, password) {
  await page.goto(`${baseUrl}/campaigns/new`, { waitUntil: "networkidle" });
  if (!page.url().includes("/login")) return;
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login"), {
      waitUntil: "commit",
    }),
    page.getByRole("button", { name: /Entrar/i }).click(),
  ]);
  if (!page.url().endsWith("/campaigns/new"))
    await page.goto(`${baseUrl}/campaigns/new`, {
      waitUntil: "domcontentloaded",
    });
  await page.waitForLoadState("networkidle");
}

async function stabilize(page) {
  await page.addStyleTag({
    content: `
    *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
    [data-next-badge-root], nextjs-portal { display: none !important; }
  `,
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
    document.body.getBoundingClientRect();
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  await page.waitForTimeout(500);
}

async function compareImages(reference, candidate, width, height) {
  const a = await sharp(reference).ensureAlpha().raw().toBuffer();
  const b = await sharp(candidate).ensureAlpha().raw().toBuffer();
  const diff = Buffer.alloc(a.length);
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    const delta = Math.max(
      Math.abs(a[i] - b[i]),
      Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2]),
    );
    const different = delta > 25;
    if (different) changed += 1;
    diff[i] = different ? 255 : 238;
    diff[i + 1] = different ? 0 : 238;
    diff[i + 2] = different ? 0 : 238;
    diff[i + 3] = 255;
  }
  return {
    changed,
    percent: Number(((changed / (width * height)) * 100).toFixed(3)),
    diff: await sharp(diff, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer(),
  };
}

async function captureViewport(page, width, height) {
  await page.bringToFront();
  await page.waitForTimeout(750);
  let best = null;
  let bestEntropy = -1;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const full = await page.screenshot({
      type: "png",
      animations: "disabled",
      fullPage: false,
    });
    const metadata = await sharp(full).metadata();
    const image = await sharp(full)
      .extract({
        left: 0,
        top: 0,
        width: Math.min(width, metadata.width ?? width),
        height: Math.min(height, metadata.height ?? height),
      })
      .extend({
        right: Math.max(0, width - (metadata.width ?? width)),
        bottom: Math.max(0, height - (metadata.height ?? height)),
        background: "#09090b",
      })
      .png()
      .toBuffer();
    const { entropy } = await sharp(image).stats();
    if (entropy > bestEntropy) {
      best = image;
      bestEntropy = entropy;
    }
    await page.waitForTimeout(100);
  }
  return best;
}

await mkdir(outputDir, { recursive: true });
const browserArgs = [
  "--disable-gpu",
  "--disable-accelerated-2d-canvas",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];
const legacyBrowser = await chromium.launch({
  headless: true,
  args: browserArgs,
});
const cloudflareBrowser = await chromium.launch({
  headless: true,
  args: browserArgs,
});
const results = [];
try {
  for (const viewport of viewports) {
    // As duas aplicações usam cookie de sessão em 127.0.0.1; contextos
    // separados impedem que uma autenticação sobrescreva a outra pela porta.
    const legacyContext = await legacyBrowser.newContext({
      viewport,
      deviceScaleFactor: 1,
      colorScheme: "dark",
      locale: "pt-BR",
    });
    const cloudflareContext = await cloudflareBrowser.newContext({
      viewport,
      deviceScaleFactor: 1,
      colorScheme: "dark",
      locale: "pt-BR",
    });
    const legacy = await legacyContext.newPage();
    const cloudflare = await cloudflareContext.newPage();
    await Promise.all([
      installFixtures(legacy, "legacy"),
      installFixtures(cloudflare, "cloudflare"),
    ]);
    await Promise.all([
      login(legacy, "http://127.0.0.1:3100", legacyPassword),
      login(cloudflare, cloudflareBase, "dev"),
    ]);
    for (const state of states) {
      if (state.advance > 0) {
        await Promise.all([
          advanceWizard(legacy, state.advance),
          advanceWizard(cloudflare, state.advance),
        ]);
      } else {
        await Promise.all([
          advanceWizard(legacy, 0),
          advanceWizard(cloudflare, 0),
        ]);
      }
      await Promise.all([stabilize(legacy), stabilize(cloudflare)]);
      if (process.env.VISUAL_DEBUG) {
        const inspect = (page) =>
          page.evaluate(() => ({
            points: [
              [100, 450],
              [100, 520],
              [100, 610],
              [600, 40],
            ].map(([x, y]) => ({
              point: [x, y],
              stack: document
                .elementsFromPoint(x, y)
                .slice(0, 5)
                .map((element) => ({
                  tag: element.tagName,
                  text: element.textContent?.trim().slice(0, 80),
                  className: element.getAttribute("class"),
                  background: getComputedStyle(element).backgroundColor,
                  color: getComputedStyle(element).color,
                })),
            })),
            grids: [
              ...document.querySelectorAll(
                ".xl\\:grid-cols-\\[minmax\\(0\\,2fr\\)_minmax\\(0\\,1fr\\)\\]",
              ),
            ].map((grid) => ({
              rect: grid.getBoundingClientRect().toJSON(),
              children: [...grid.children].map((child) => ({
                tag: child.tagName,
                className: child.getAttribute("class"),
                rect: child.getBoundingClientRect().toJSON(),
                children: [...child.children].map((nested) => ({
                  className: nested.getAttribute("class"),
                  rect: nested.getBoundingClientRect().toJSON(),
                })),
              })),
            })),
          }));
        console.log(
          JSON.stringify(
            {
              viewport: viewport.name,
              state: state.name,
              legacy: await inspect(legacy),
              cloudflare: await inspect(cloudflare),
            },
            null,
            2,
          ),
        );
      }
      const reference = await captureViewport(
        legacy,
        viewport.width,
        viewport.height,
      );
      const candidate = await captureViewport(
        cloudflare,
        viewport.width,
        viewport.height,
      );
      const comparison = await compareImages(
        reference,
        candidate,
        viewport.width,
        viewport.height,
      );
      const basename = `${viewport.name}-${state.name}`;
      await Promise.all([
        writeFile(new URL(`${basename}-original.png`, outputDir), reference),
        writeFile(new URL(`${basename}-cloudflare.png`, outputDir), candidate),
        writeFile(new URL(`${basename}-diff.png`, outputDir), comparison.diff),
      ]);
      results.push({
        viewport: viewport.name,
        state: state.name,
        changedPixels: comparison.changed,
        differencePercent: comparison.percent,
      });
      if (state.advance < 4) {
        await Promise.all([
          legacy.goto("http://127.0.0.1:3100/campaigns/new", {
            waitUntil: "networkidle",
          }),
          cloudflare.goto(`${cloudflareBase}/campaigns/new`, {
            waitUntil: "networkidle",
          }),
        ]);
      }
    }
    await Promise.all([legacyContext.close(), cloudflareContext.close()]);
  }
} finally {
  await Promise.all([legacyBrowser.close(), cloudflareBrowser.close()]);
}

await writeFile(
  new URL("summary.json", outputDir),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.table(results);
