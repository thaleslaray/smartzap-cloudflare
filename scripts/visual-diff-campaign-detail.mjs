import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";

const legacyPassword = process.env.SMARTZAP_LEGACY_PASSWORD;
if (!legacyPassword)
  throw new Error(
    "Defina SMARTZAP_LEGACY_PASSWORD para autenticar no SmartZap original.",
  );
const cloudflareBase = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5175";

const outputDir = new URL(
  "../test-results/visual-campaign-detail/",
  import.meta.url,
);
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
  {
    name: "draft",
    legacyStatus: "Rascunho",
    cfStatus: "draft",
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    skipped: 0,
  },
  {
    name: "scheduled",
    legacyStatus: "Agendado",
    cfStatus: "scheduled",
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    skipped: 0,
    scheduledAt: "2026-07-16T15:00:00.000Z",
  },
  {
    name: "sending",
    legacyStatus: "Enviando",
    cfStatus: "sending",
    sent: 8,
    delivered: 5,
    read: 3,
    failed: 1,
    skipped: 1,
  },
  {
    name: "paused",
    legacyStatus: "Pausado",
    cfStatus: "paused",
    sent: 8,
    delivered: 5,
    read: 3,
    failed: 1,
    skipped: 1,
  },
  {
    name: "completed",
    legacyStatus: "Concluído",
    cfStatus: "completed",
    sent: 11,
    delivered: 10,
    read: 7,
    failed: 1,
    skipped: 1,
  },
  {
    name: "logs",
    legacyStatus: "Concluído",
    cfStatus: "completed",
    sent: 3,
    delivered: 2,
    read: 1,
    failed: 0,
    skipped: 1,
    logs: true,
  },
].filter(
  (state) =>
    !process.env.VISUAL_STATE || state.name === process.env.VISUAL_STATE,
);

const campaignId = "11111111-1111-4111-8111-111111111111";
const createdAt = "2026-07-14T12:00:00.000Z";

async function login(page, baseUrl, password) {
  await page.goto(`${baseUrl}/campaigns/${campaignId}`, {
    waitUntil: "domcontentloaded",
  });
  if (!page.url().includes("/login")) return;
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login"), {
      waitUntil: "commit",
    }),
    page.getByRole("button", { name: /Entrar/i }).click(),
  ]);
  await page.goto(`${baseUrl}/campaigns/${campaignId}`, {
    waitUntil: "domcontentloaded",
  });
}

async function installFixtures(page, app, state) {
  const json = (route, body) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  const legacyMessages = state.logs
    ? [
        {
          id: "msg-1",
          campaignId,
          contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          contactName: "Ana Lima",
          contactPhone: "+5521999990001",
          status: "Entregue",
          sentAt: "15/07/2026, 10:01:00",
        },
        {
          id: "msg-2",
          campaignId,
          contactId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          contactName: "Bruno Souza",
          contactPhone: "+5521999990002",
          status: "Lido",
          sentAt: "15/07/2026, 10:02:00",
        },
        {
          id: "msg-3",
          campaignId,
          contactId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          contactName: "Carla Melo",
          contactPhone: "+5521999990003",
          status: "Ignorado",
          sentAt: "-",
          error: "missing_template_data",
        },
      ]
    : [];
  const cfContacts = state.logs
    ? [
        {
          contact_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "Ana Lima",
          phone: "+5521999990001",
          status: "delivered",
          updated_at: "2026-07-15T13:01:00.000Z",
          error_detail: null,
        },
        {
          contact_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "Bruno Souza",
          phone: "+5521999990002",
          status: "read",
          updated_at: "2026-07-15T13:02:00.000Z",
          error_detail: null,
        },
        {
          contact_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          name: "Carla Melo",
          phone: "+5521999990003",
          status: "skipped",
          updated_at: "2026-07-15T13:03:00.000Z",
          error_detail: "missing_template_data",
        },
      ]
    : [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (app === "legacy") {
      if (path === `/api/campaigns/${campaignId}`)
        return json(route, {
          id: campaignId,
          name: "Campanha de referência",
          status: state.legacyStatus,
          recipients: 12,
          sent: state.sent,
          delivered: state.delivered,
          read: state.read,
          skipped: state.skipped,
          failed: state.failed,
          createdAt,
          templateName: "boas_vindas_smartzap",
          scheduledAt: state.scheduledAt ?? null,
        });
      if (path === `/api/campaigns/${campaignId}/messages`)
        return json(route, {
          messages: legacyMessages,
          stats: {
            total: state.logs ? 3 : 12,
            pending: Math.max(
              0,
              12 - state.sent - state.failed - state.skipped,
            ),
            sent: state.sent,
            delivered: state.delivered,
            read: state.read,
            skipped: state.skipped,
            failed: state.failed,
          },
          pagination: { limit: 100, offset: 0, total: 0, hasMore: false },
        });
      if (path === `/api/campaigns/${campaignId}/metrics`)
        return json(route, null);
      if (path === `/api/campaign/${campaignId}/status`)
        return json(route, null);
      if (path.includes("/trace")) return json(route, { items: [] });
    } else {
      if (path === `/api/campaigns/${campaignId}`)
        return json(route, {
          id: campaignId,
          name: "Campanha de referência",
          status: state.cfStatus,
          total: 12,
          sent: state.sent,
          delivered: state.delivered,
          read: state.read,
          failed: state.failed,
          created_at: createdAt,
          template_name: "boas_vindas_smartzap",
          template_language: "pt_BR",
          scheduled_at: state.scheduledAt ?? null,
          status_counts: { skipped: state.skipped },
          cost: {
            unit: 0.42,
            estimated: 5.04,
            deliveredEstimate: 0,
            currency: "BRL",
            effectiveFrom: "2026-01-01",
            basis: "meta_list_rate",
          },
        });
      if (path === `/api/campaigns/${campaignId}/contacts`)
        return json(route, { items: cfContacts, total: state.logs ? 3 : 12 });
      if (path === `/api/campaigns/${campaignId}/batches`)
        return json(route, { items: [], traces: [] });
    }
    return route.continue();
  });
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
    for (const element of document.querySelectorAll("*")) {
      if (element instanceof HTMLElement && element.scrollTop)
        element.scrollTop = 0;
    }
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

await mkdir(outputDir, { recursive: true });
const legacyBrowser = await chromium.launch({ headless: true });
const cloudflareBrowser = await chromium.launch({ headless: true });
async function authState(browser, baseUrl, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const passwordInput = page.locator('input[type="password"]');
  if (await passwordInput.isVisible()) {
    await passwordInput.fill(password);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes("/login"), {
        waitUntil: "commit",
      }),
      page.getByRole("button", { name: /Entrar/i }).click(),
    ]);
  }
  const state = await context.storageState();
  await context.close();
  return state;
}
const [legacyStorageState, cloudflareStorageState] = await Promise.all([
  authState(legacyBrowser, "http://127.0.0.1:3100", legacyPassword),
  authState(cloudflareBrowser, cloudflareBase, "dev"),
]);
const results = [];
try {
  for (const viewport of viewports) {
    for (const state of states) {
      const legacyContext = await legacyBrowser.newContext({
        viewport,
        deviceScaleFactor: 1,
        colorScheme: "dark",
        storageState: legacyStorageState,
      });
      const cloudflareContext = await cloudflareBrowser.newContext({
        viewport,
        deviceScaleFactor: 1,
        colorScheme: "dark",
        storageState: cloudflareStorageState,
      });
      const legacy = await legacyContext.newPage();
      const cloudflare = await cloudflareContext.newPage();
      await Promise.all([
        installFixtures(legacy, "legacy", state),
        installFixtures(cloudflare, "cloudflare", state),
      ]);
      await Promise.all([
        legacy.goto(`http://127.0.0.1:3100/campaigns/${campaignId}`, {
          waitUntil: "domcontentloaded",
        }),
        cloudflare.goto(`${cloudflareBase}/campaigns/${campaignId}`, {
          waitUntil: "domcontentloaded",
        }),
      ]);
      await legacy
        .getByRole("heading", { name: "Campanha de referência" })
        .waitFor();
      await cloudflare
        .getByRole("heading", { name: "Campanha de referência" })
        .waitFor();
      await Promise.all([stabilize(legacy), stabilize(cloudflare)]);
      const reference = await legacy.screenshot({ type: "png" });
      const candidate = await cloudflare.screenshot({ type: "png" });
      const comparison = await compareImages(
        reference,
        candidate,
        viewport.width,
        viewport.height,
      );
      await Promise.all([
        writeFile(
          new URL(`${viewport.name}-${state.name}-original.png`, outputDir),
          reference,
        ),
        writeFile(
          new URL(`${viewport.name}-${state.name}-cloudflare.png`, outputDir),
          candidate,
        ),
        writeFile(
          new URL(`${viewport.name}-${state.name}-diff.png`, outputDir),
          comparison.diff,
        ),
      ]);
      results.push({
        viewport: viewport.name,
        state: state.name,
        changedPixels: comparison.changed,
        differencePercent: comparison.percent,
      });
      await Promise.all([legacyContext.close(), cloudflareContext.close()]);
    }
  }
} finally {
  await Promise.all([legacyBrowser.close(), cloudflareBrowser.close()]);
}

await writeFile(
  new URL("summary.json", outputDir),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.table(results);
