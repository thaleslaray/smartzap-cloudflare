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
  "../test-results/visual-campaign-list/",
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
const states = ["closed", "folder-open", "tags-open"].filter(
  (state) => !process.env.VISUAL_STATE || state === process.env.VISUAL_STATE,
);

const legacyCampaigns = [
  {
    id: "c_demo_rascunho",
    name: "Reativação de clientes",
    status: "Rascunho",
    recipients: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    skipped: 0,
    failed: 0,
    createdAt: "2026-07-14T22:59:35.727776+00:00",
    templateName: "boas_vindas_smartzap",
    scheduledAt: null,
    folderId: null,
    folder: null,
    tags: [],
  },
  {
    id: "c_demo_lembrete",
    name: "Lembrete da aula ao vivo",
    status: "Enviando",
    recipients: 480,
    sent: 312,
    delivered: 290,
    read: 171,
    skipped: 7,
    failed: 4,
    createdAt: "2026-07-14T20:59:35.727776+00:00",
    templateName: "lembrete_aula",
    scheduledAt: null,
    folderId: "22222222-2222-4222-8222-222222222222",
    folder: {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Relacionamento",
      color: "#8B5CF6",
    },
    tags: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Orgânico",
        color: "#3B82F6",
      },
    ],
  },
  {
    id: "c_demo_agendada",
    name: "Oferta especial de julho",
    status: "Agendado",
    recipients: 860,
    sent: 0,
    delivered: 0,
    read: 0,
    skipped: 0,
    failed: 0,
    createdAt: "2026-07-14T00:59:35.727776+00:00",
    templateName: "promocao_julho",
    scheduledAt: null,
    folderId: "11111111-1111-4111-8111-111111111111",
    folder: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Lançamentos",
      color: "#10B981",
    },
    tags: [],
  },
  {
    id: "c_demo_lancamento",
    name: "Lançamento Curso de IA",
    status: "Concluído",
    recipients: 1250,
    sent: 1210,
    delivered: 1168,
    read: 904,
    skipped: 22,
    failed: 18,
    createdAt: "2026-07-07T00:59:35.727776+00:00",
    templateName: "boas_vindas_smartzap",
    scheduledAt: null,
    completedAt: "2026-07-08T00:59:35.727776+00:00",
    folderId: "11111111-1111-4111-8111-111111111111",
    folder: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Lançamentos",
      color: "#10B981",
    },
    tags: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Prioridade alta",
        color: "#EF4444",
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Orgânico",
        color: "#3B82F6",
      },
    ],
  },
];
const cfCampaigns = legacyCampaigns.map((campaign) => ({
  id: campaign.id,
  name: campaign.name,
  status: {
    Rascunho: "draft",
    Enviando: "sending",
    Agendado: "scheduled",
    "Concluído": "completed",
  }[campaign.status],
  total: campaign.recipients,
  sent: campaign.sent,
  delivered: campaign.delivered,
  read: campaign.read,
  failed: campaign.failed,
  created_at: campaign.createdAt,
  template_name: campaign.templateName,
  template_language: "pt_BR",
  scheduled_at: campaign.scheduledAt,
  completed_at: campaign.completedAt ?? null,
  folder_id: campaign.folderId,
  tags: campaign.tags,
}));

async function login(page, baseUrl, password) {
  await page.goto(`${baseUrl}/campaigns`, { waitUntil: "networkidle" });
  if (!page.url().includes("/login")) return;
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login"), {
      waitUntil: "commit",
    }),
    page.getByRole("button", { name: /Entrar/i }).click(),
  ]);
  await page.goto(`${baseUrl}/campaigns`, { waitUntil: "networkidle" });
}

async function installFixtures(page, app) {
  const json = (route, body) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (app === "legacy") {
      if (path === "/api/campaigns")
        return json(route, {
          data: legacyCampaigns,
          total: legacyCampaigns.length,
          limit: 10,
          offset: 0,
        });
      if (path === "/api/campaigns/folders")
        return json(route, {
          folders: [
            {
              id: "folder-1",
              name: "Clientes",
              color: "#10b981",
              campaignCount: 1,
            },
          ],
          totalCount: 2,
          unfiledCount: 1,
        });
      if (path === "/api/campaigns/tags")
        return json(route, [
          { id: "tag-1", name: "VIP", color: "#10b981", campaignCount: 1 },
        ]);
    } else {
      if (path === "/api/campaigns")
        return json(route, { items: cfCampaigns, total: cfCampaigns.length });
      if (path === "/api/campaigns/folders")
        return json(route, {
          items: [{ id: "folder-1", name: "Clientes", campaign_count: 1 }],
        });
      if (path === "/api/campaigns/tags")
        return json(route, {
          items: [
            { id: "tag-1", name: "VIP", color: "#10b981", campaign_count: 1 },
          ],
        });
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
async function authState(browser, baseUrl, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, baseUrl, password);
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
        installFixtures(legacy, "legacy"),
        installFixtures(cloudflare, "cloudflare"),
      ]);
      await Promise.all([
        legacy.goto("http://127.0.0.1:3100/campaigns", {
          waitUntil: "networkidle",
        }),
        cloudflare.goto(`${cloudflareBase}/campaigns`, {
          waitUntil: "networkidle",
        }),
      ]);
      await Promise.all([
        legacy.getByRole("heading", { name: "Campanhas" }).waitFor(),
        cloudflare.getByRole("heading", { name: "Campanhas" }).waitFor(),
      ]);
      if (state === "folder-open")
        await Promise.all([
          legacy.getByRole("button", { name: /^Pasta/ }).click(),
          cloudflare.getByRole("button", { name: /^Pasta/ }).click(),
        ]);
      if (state === "tags-open")
        await Promise.all([
          legacy.getByRole("button", { name: /^Tags/ }).click(),
          cloudflare.getByRole("button", { name: /^Tags/ }).click(),
        ]);
      await Promise.all([stabilize(legacy), stabilize(cloudflare)]);
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
      await Promise.all([
        writeFile(
          new URL(`${viewport.name}-${state}-original.png`, outputDir),
          reference,
        ),
        writeFile(
          new URL(`${viewport.name}-${state}-cloudflare.png`, outputDir),
          candidate,
        ),
        writeFile(
          new URL(`${viewport.name}-${state}-diff.png`, outputDir),
          comparison.diff,
        ),
      ]);
      results.push({
        viewport: viewport.name,
        state,
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
