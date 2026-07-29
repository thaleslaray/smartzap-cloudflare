import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";
const password = process.env.SMARTZAP_LEGACY_PASSWORD;
if (!password) throw new Error("Defina SMARTZAP_LEGACY_PASSWORD.");
const out = new URL("../test-results/visual-templates/", import.meta.url);
const viewports = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "mobile-390x844", width: 390, height: 844 },
];
const stamp = "2026-07-15T00:59:35.726Z";
const templates = [
  {
    id: "tpl_demo_boas_vindas",
    name: "boas_vindas_smartzap",
    category: "MARKETING",
    language: "pt_BR",
    status: "APPROVED",
    content: "Olá {{1}}, que bom ter você aqui!",
    lastUpdated: stamp,
    synced_at: stamp,
    requiresParameters: true,
    components: [
      { text: "Bem-vindo ao SmartZap", type: "HEADER", format: "TEXT" },
      { text: "Olá {{1}}, que bom ter você aqui!", type: "BODY" },
      { text: "Responda SAIR para não receber mensagens.", type: "FOOTER" },
    ],
  },
  {
    id: "tpl_demo_lembrete",
    name: "lembrete_aula",
    category: "UTILITY",
    language: "pt_BR",
    status: "APPROVED",
    content: "Olá {{1}}, sua aula começa às {{2}}.",
    lastUpdated: stamp,
    synced_at: stamp,
    requiresParameters: true,
    components: [
      { text: "Olá {{1}}, sua aula começa às {{2}}.", type: "BODY" },
      {
        type: "BUTTONS",
        buttons: [
          {
            url: "https://example.local/aula",
            text: "Acessar aula",
            type: "URL",
          },
        ],
      },
    ],
  },
  {
    id: "tpl_demo_promocao",
    name: "promocao_julho",
    category: "MARKETING",
    language: "pt_BR",
    status: "PENDING",
    content: "{{1}}, aproveite nossa condição especial de julho.",
    lastUpdated: stamp,
    synced_at: stamp,
    requiresParameters: true,
    components: [
      {
        text: "{{1}}, aproveite nossa condição especial de julho.",
        type: "BODY",
      },
    ],
  },
];
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
  await page.goto(`${base}/templates`, { waitUntil: "networkidle" });
}
async function stabilize(page) {
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    for (const element of document.querySelectorAll("*")) {
      if (element instanceof HTMLElement && element.scrollTop)
        element.scrollTop = 0;
    }
  });
  await page.waitForTimeout(250);
}
async function hoverVisible(locator) {
  for (let i = 0; i < (await locator.count()); i++) {
    if (await locator.nth(i).isVisible()) {
      await locator.nth(i).hover();
      return;
    }
  }
}
async function capture(page, w, h) {
  await page.bringToFront();
  await page.waitForTimeout(750);
  await page.screenshot({
    fullPage: false,
    animations: "disabled",
  });
  await page.waitForTimeout(100);
  const full = await page.screenshot({
    fullPage: false,
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
    changed,
    percent: Number(((changed / (w * h)) * 100).toFixed(3)),
    diff: await sharp(diff, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toBuffer(),
  };
}
await mkdir(out, { recursive: true });
const browserArgs = ["--disable-gpu", "--disable-accelerated-2d-canvas"];
const legacyBrowser = await chromium.launch({
  headless: true,
  args: browserArgs,
});
const cloudflareBrowser = await chromium.launch({
  headless: true,
  args: browserArgs,
});
const summary = [];
try {
  for (const viewport of viewports) {
    const a = await legacyBrowser.newContext({
      viewport,
      locale: "pt-BR",
      colorScheme: "dark",
    });
    const c = await cloudflareBrowser.newContext({
      viewport,
      locale: "pt-BR",
      colorScheme: "dark",
    });
    const legacy = await a.newPage();
    const cf = await c.newPage();
    await cf.route("**/api/templates", (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: templates }),
      }),
    );
    await Promise.all([
      login(legacy, "http://127.0.0.1:3100", password),
      login(cf, "http://127.0.0.1:5175", "dev"),
    ]);
    for (const state of ["list", "hover"]) {
      if (state === "hover")
        await Promise.all([
          hoverVisible(legacy.getByText("lembrete_aula", { exact: true })),
          hoverVisible(cf.getByText("lembrete_aula", { exact: true })),
        ]);
      else await Promise.all([legacy.mouse.move(0, 0), cf.mouse.move(0, 0)]);
      await Promise.all([stabilize(legacy), stabilize(cf)]);
      const reference = await capture(
        legacy,
        viewport.width,
        viewport.height,
      );
      const candidate = await capture(cf, viewport.width, viewport.height);
      const result = await compare(
        reference,
        candidate,
        viewport.width,
        viewport.height,
      );
      const name = `${viewport.name}-${state}`;
      await Promise.all([
        writeFile(new URL(`${name}-original.png`, out), reference),
        writeFile(new URL(`${name}-cloudflare.png`, out), candidate),
        writeFile(new URL(`${name}-diff.png`, out), result.diff),
      ]);
      summary.push({
        viewport: viewport.name,
        state,
        differencePercent: result.percent,
      });
    }
    await Promise.all([a.close(), c.close()]);
  }
} finally {
  await Promise.all([legacyBrowser.close(), cloudflareBrowser.close()]);
}
await writeFile(
  new URL("summary.json", out),
  JSON.stringify(summary, null, 2) + "\n",
);
console.table(summary);
