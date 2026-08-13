import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";

const legacyPassword = process.env.SMARTZAP_LEGACY_PASSWORD;
const legacyBaseUrl = process.env.SMARTZAP_LEGACY_URL || "http://127.0.0.1:3100";
const cloudflareBaseUrl = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5175";
if (!legacyPassword)
  throw new Error("Defina SMARTZAP_LEGACY_PASSWORD para autenticar no legado.");

const outputDir = new URL("../test-results/visual-contacts/", import.meta.url);
const viewports = [
  { name: "desktop-1280x720", width: 1280, height: 720 },
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "desktop-1920x1080", width: 1920, height: 1080 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "mobile-390x844", width: 390, height: 844 },
  { name: "mobile-360x800", width: 360, height: 800 },
  { name: "mobile-320x568", width: 320, height: 568 },
].filter(
  (viewport) =>
    !process.env.VISUAL_VIEWPORT || viewport.name === process.env.VISUAL_VIEWPORT,
);

const createdAt = "2026-07-14 18:00:00";
const contacts = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Ana Souza",
    phone: "+5521991110001",
    status: "opt_in",
    created_at: createdAt,
    updated_at: createdAt,
    last_message_at: Math.floor(Date.now() / 1000) - 2 * 86400,
    tags: [
      { id: "tag-vip", name: "VIP" },
      { id: "tag-ia", name: "Curso IA" },
    ],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Bruno Lima",
    phone: "+5521991110002",
    status: "opt_in",
    created_at: createdAt,
    updated_at: createdAt,
    // O legado exibe a atividade como dias desde o evento, não horas. A
    // fixture reproduz a saída renderizada, não o relógio de cada servidor.
    last_message_at: Math.floor(Date.now() / 1000) - 1 * 86400,
    tags: [{ id: "tag-hot", name: "Lead quente" }],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Carla Mendes",
    phone: "+5521991110003",
    status: "opt_in",
    created_at: createdAt,
    updated_at: createdAt,
    last_message_at: Math.floor(Date.now() / 1000) - 2 * 86400,
    tags: [
      { id: "tag-client", name: "Cliente" },
      { id: "tag-vip", name: "VIP" },
    ],
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Diego Rocha",
    phone: "+5521991110004",
    status: "opt_out",
    created_at: createdAt,
    updated_at: createdAt,
    last_message_at: Math.floor(Date.now() / 1000) - 3 * 86400,
    tags: [{ id: "tag-out", name: "Opt-out" }],
  },
  {
    id: "55555555-4444-4444-8444-555555555555",
    name: "Eva Martins",
    phone: "+5521991110005",
    status: "opt_in",
    created_at: createdAt,
    updated_at: createdAt,
    last_message_at: Math.floor(Date.now() / 1000) - 4 * 86400,
    tags: [],
  },
];

async function login(page, baseUrl, password) {
  // O aplicativo mantém canais de realtime abertos. "networkidle" nunca é
  // atingido nesses casos e não é sinal de que a tela ainda esteja carregando.
  // Entrar diretamente por /login evita a corrida em que /contacts devolve o
  // shell antes do redirecionamento cliente por sessão ausente.
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/login")) return;
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: /Entrar/i }).click(),
  ]);
  await page.goto(`${baseUrl}/contacts`, { waitUntil: "domcontentloaded" });
}

async function installFixtures(page, sourceContacts = contacts) {
  await page.route("**/api/contacts**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/api/contacts/tags"
        ? { items: [...new Map(sourceContacts.flatMap((item) => item.tags).map((tag) => [tag.id, tag])).values()] }
        : path === "/api/contacts"
          ? {
              items: sourceContacts,
              total: sourceContacts.length,
              stats: {
                total: sourceContacts.length,
                optIn: sourceContacts.filter((item) => item.status === "opt_in").length,
                optOut: sourceContacts.filter((item) => item.status === "opt_out").length,
              },
            }
          : null;
    if (!body) return route.continue();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function installLegacyRuntimeFixtures(page) {
  // A referência visual usa o código original com dados estáticos. Estas
  // respostas evitam que alertas/onboarding externos derrubem a hidratação da
  // tela durante a captura; não alteram o DOM de Contatos nem mascaram pixels.
  await page.route("**/api/settings/onboarding", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ onboardingCompleted: true, permanentTokenConfirmed: true }) }),
  );
  await page.route("**/api/account/alerts**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ alerts: [] }) }),
  );
  await page.route("**/api/meta/webhooks/subscription", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: false }) }),
  );
  await page.route("**/api/auth/status", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ isSetup: true, isAuthenticated: true, company: null }) }),
  );
  await page.route("**/api/health", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        services: {
          database: { status: "ok" },
          qstash: { status: "ok" },
          whatsapp: { status: "ok" },
          webhook: { status: "ok" },
        },
      }),
    }),
  );
}

function dateFromBrazilianDisplay(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return createdAt;
  return `${match[3]}-${match[2]}-${match[1]}T12:00:00.000Z`;
}

function lastActivityFromDisplay(value) {
  const normalized = value.trim();
  if (normalized === "agora") return Math.floor(Date.now() / 1000);
  const match = /^(\d+)(h|d) atrás$/.exec(normalized);
  if (!match) return null;
  const amount = Number(match[1]);
  return Math.floor(Date.now() / 1000) - amount * (match[2] === "h" ? 3600 : 86400);
}

async function extractVisibleLegacyContacts(page) {
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('table[aria-label="Lista de contatos"] tbody tr')]
      .map((row) => {
        const cells = [...row.querySelectorAll("td")];
        if (cells.length < 7) return null;
        const contactLines = (cells[1].innerText || "")
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean);
        const phone = contactLines.find((value) => value.startsWith("+")) || "";
        const name = contactLines.find((value) => value !== phone) || "Sem nome";
        const tags = [...cells[2].querySelectorAll("span")]
          .map((tag) => (tag.textContent || "").trim())
          .filter(Boolean);
        return {
          name,
          phone,
          tags,
          status: (cells[3].innerText || "").trim(),
          createdAt: (cells[4].innerText || "").trim(),
          lastActivity: (cells[5].innerText || "").trim(),
        };
      })
      .filter(Boolean),
  );
  return rows
    .filter((row) => row.phone)
    .map((row, index) => ({
      id: `legacy-visual-${index}`,
      name: row.name,
      phone: row.phone,
      status:
        row.status === "OPT_IN" ? "opt_in" : row.status === "OPT_OUT" ? "opt_out" : row.status === "SUPRIMIDO" ? "suppressed" : "unknown",
      created_at: dateFromBrazilianDisplay(row.createdAt),
      updated_at: dateFromBrazilianDisplay(row.createdAt),
      last_message_at: lastActivityFromDisplay(row.lastActivity),
      tags: row.tags.map((name, tagIndex) => ({
        id: `legacy-visual-tag-${index}-${tagIndex}`,
        name,
      })),
    }));
}

async function stabilize(page) {
  await page.getByLabel("Buscar contatos por nome ou telefone").waitFor();
  await page.addStyleTag({
    // O Tailwind usa propriedades de animação também na composição de alguns
    // utilitários. Desativá-las globalmente apagava partes reais da interface.
    content: "input,textarea{caret-color:transparent!important}",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  await page.waitForTimeout(200);
}

async function capture(page, width, height) {
  const full = await page.screenshot({ type: "png", animations: "disabled" });
  const metadata = await sharp(full).metadata();
  return sharp(full)
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
}

async function compare(aBuffer, bBuffer, width, height) {
  const a = await sharp(aBuffer).ensureAlpha().raw().toBuffer();
  const b = await sharp(bBuffer).ensureAlpha().raw().toBuffer();
  const diff = Buffer.alloc(a.length);
  let changed = 0;
  for (let index = 0; index < a.length; index += 4) {
    const delta = Math.max(
      Math.abs(a[index] - b[index]),
      Math.abs(a[index + 1] - b[index + 1]),
      Math.abs(a[index + 2] - b[index + 2]),
    );
    const different = delta > 25;
    if (different) changed += 1;
    diff[index] = different ? 255 : 238;
    diff[index + 1] = different ? 0 : 238;
    diff[index + 2] = different ? 0 : 238;
    diff[index + 3] = 255;
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
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of viewports) {
    const legacyContext = await browser.newContext({
      viewport,
      locale: "pt-BR",
      colorScheme: "dark",
    });
    // Estado visual canônico: menu desktop compacto. O legado lê essa
    // preferência depois da hidratação; sem fixá-la a mesma captura mistura
    // cabeçalho compacto e tabela deslocada pelo menu expandido.
    await legacyContext.addInitScript(() => {
      window.localStorage.setItem("app-sidebar-collapsed", "true");
    });
    const cloudflareContext = await browser.newContext({
      viewport,
      locale: "pt-BR",
      colorScheme: "dark",
    });
    const legacy = await legacyContext.newPage();
    const cloudflare = await cloudflareContext.newPage();
    cloudflare.on("pageerror", (error) => console.log(`Erro do migrado: ${error.message}`));
    cloudflare.on("console", (message) => {
      if (message.type() === "error") console.log(`Console do migrado: ${message.text()}`);
    });
    await installLegacyRuntimeFixtures(legacy);
    await installFixtures(cloudflare);
    // O legado abre canais em segundo plano durante o bootstrap. Fazemos os
    // logins em sequência para não disputar a primeira navegação do Vite.
    await login(legacy, legacyBaseUrl, legacyPassword);
    await login(cloudflare, cloudflareBaseUrl, "dev");
    console.log(`Referência em ${legacy.url()}`);
    console.log(`Migrado em ${cloudflare.url()}`);
    console.log(`Campos da referência: ${await legacy.locator("input").count()}`);
    console.log(`Campos do migrado: ${await cloudflare.locator("input").count()}`);
    if ((await cloudflare.locator("input").count()) === 0) {
      console.log(`Migrado sem campos: ${(await cloudflare.locator("body").innerText()).slice(0, 240)}`);
    }
    console.log(`Estabilizando referência: ${viewport.name}`);
    await stabilize(legacy);
    console.log(`Estabilizando migrado: ${viewport.name}`);
    await stabilize(cloudflare);
    const [reference, candidate] = await Promise.all([
      capture(legacy, viewport.width, viewport.height),
      capture(cloudflare, viewport.width, viewport.height),
    ]);
    const comparison = await compare(
      reference,
      candidate,
      viewport.width,
      viewport.height,
    );
    await Promise.all([
      writeFile(new URL(`${viewport.name}-original.png`, outputDir), reference),
      writeFile(new URL(`${viewport.name}-cloudflare.png`, outputDir), candidate),
      writeFile(new URL(`${viewport.name}-diff.png`, outputDir), comparison.diff),
    ]);
    results.push({
      viewport: viewport.name,
      changedPixels: comparison.changed,
      differencePercent: comparison.percent,
    });
    await Promise.all([legacyContext.close(), cloudflareContext.close()]);
  }
} finally {
  await browser.close();
}
await writeFile(
  new URL("summary.json", outputDir),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.table(results);
