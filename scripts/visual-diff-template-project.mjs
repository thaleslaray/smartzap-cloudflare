import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";
const password = process.env.SMARTZAP_LEGACY_PASSWORD;
if (!password) throw new Error("Defina SMARTZAP_LEGACY_PASSWORD.");
const out = new URL(
  "../test-results/visual-template-project/",
  import.meta.url,
);
const viewports = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "mobile-390x844", width: 390, height: 844 },
];
const project = {
  id: "tp_demo_julho",
  title: "Campanha de julho",
  strategy: "marketing",
  status: "active",
  source: "ai",
  template_count: 2,
  approved_count: 1,
  created_at: "2026-07-15T00:59:35.726Z",
  items: [
    {
      id: "tpi_demo_julho_1",
      name: "convite_lancamento",
      content: "Olá {{1}}, temos uma novidade para você.",
      language: "pt_BR",
      category: "MARKETING",
      status: "approved",
      meta_id: "meta_demo_1",
      meta_status: "APPROVED",
      rejected_reason: null,
      variables: { 1: "nome" },
      buttons: [],
    },
    {
      id: "tpi_demo_julho_2",
      name: "lembrete_lancamento",
      content: "Oi {{1}}, nosso evento começa em {{2}}.",
      language: "pt_BR",
      category: "UTILITY",
      status: "draft",
      meta_id: null,
      meta_status: null,
      rejected_reason: null,
      variables: { 1: "nome", 2: "horario" },
      buttons: [],
    },
  ],
};
async function login(page, base, pwd) {
  await page.goto(`${base}/templates`, { waitUntil: "networkidle" });
  if (!page.url().includes("/login")) return;
  await page.locator("input[type=password]").fill(pwd);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("/login"), {
      waitUntil: "commit",
    }),
    page.getByRole("button", { name: /Entrar/i }).click(),
  ]);
}
async function stabilize(page) {
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
}
async function capture(page, w, h) {
  const full = await page.screenshot({
    fullPage: true,
    animations: "disabled",
  });
  const m = await sharp(full).metadata();
  return sharp(full)
    .extract({
      left: 0,
      top: 0,
      width: Math.min(w, m.width || w),
      height: Math.min(h, m.height || h),
    })
    .extend({
      right: Math.max(0, w - (m.width || w)),
      bottom: Math.max(0, h - (m.height || h)),
      background: "#09090b",
    })
    .png()
    .toBuffer();
}
async function compare(a, b, w, h) {
  const [aa, bb] = await Promise.all([
    sharp(a).ensureAlpha().raw().toBuffer(),
    sharp(b).ensureAlpha().raw().toBuffer(),
  ]);
  const diff = Buffer.alloc(aa.length);
  let changed = 0;
  for (let i = 0; i < aa.length; i += 4) {
    const d = Math.max(
      Math.abs(aa[i] - bb[i]),
      Math.abs(aa[i + 1] - bb[i + 1]),
      Math.abs(aa[i + 2] - bb[i + 2]),
    );
    const yes = d > 25;
    if (yes) changed++;
    diff[i] = yes ? 255 : 238;
    diff[i + 1] = yes ? 0 : 238;
    diff[i + 2] = yes ? 0 : 238;
    diff[i + 3] = 255;
  }
  return {
    percent: Number(((changed / (w * h)) * 100).toFixed(3)),
    diff: await sharp(diff, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toBuffer(),
  };
}
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const summary = [];
try {
  for (const viewport of viewports) {
    const legacyContext = await browser.newContext({
      viewport,
      locale: "pt-BR",
      colorScheme: "dark",
    });
    const cfContext = await browser.newContext({
      viewport,
      locale: "pt-BR",
      colorScheme: "dark",
    });
    const legacy = await legacyContext.newPage();
    const cf = await cfContext.newPage();
    await cf.route("**/api/template-projects/tp_demo_julho", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(project),
      }),
    );
    await Promise.all([
      login(legacy, "http://127.0.0.1:3100", password),
      login(cf, "http://127.0.0.1:5175", "dev"),
    ]);
    await Promise.all([
      legacy.goto("http://127.0.0.1:3100/templates/tp_demo_julho", {
        waitUntil: "networkidle",
      }),
      cf.goto("http://127.0.0.1:5175/templates/tp_demo_julho", {
        waitUntil: "networkidle",
      }),
    ]);
    await Promise.all([stabilize(legacy), stabilize(cf)]);
    const [reference, candidate] = await Promise.all([
      capture(legacy, viewport.width, viewport.height),
      capture(cf, viewport.width, viewport.height),
    ]);
    const result = await compare(
      reference,
      candidate,
      viewport.width,
      viewport.height,
    );
    await Promise.all([
      writeFile(new URL(`${viewport.name}-original.png`, out), reference),
      writeFile(new URL(`${viewport.name}-cloudflare.png`, out), candidate),
      writeFile(new URL(`${viewport.name}-diff.png`, out), result.diff),
    ]);
    summary.push({
      viewport: viewport.name,
      differencePercent: result.percent,
    });
    await Promise.all([legacyContext.close(), cfContext.close()]);
  }
} finally {
  await browser.close();
}
await writeFile(
  new URL("summary.json", out),
  JSON.stringify(summary, null, 2) + "\n",
);
console.table(summary);
