import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";

const legacyPassword = process.env.SMARTZAP_LEGACY_PASSWORD;
const cloudflareBaseUrl =
  process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5175";
if (!legacyPassword)
  throw new Error(
    "Defina SMARTZAP_LEGACY_PASSWORD para autenticar no SmartZap original.",
  );

const outputDir = new URL("../test-results/visual-inbox/", import.meta.url);
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

const conversationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = Math.floor(Date.now() / 1000);
const conversation = {
  id: conversationId,
  contact_id: "11111111-1111-4111-8111-111111111111",
  name: "Ana Souza",
  phone: "+5521991110001",
  contact_status: "Opt-in",
  last_message_at: now - 3 * 3600,
  last_message_preview: "Quero saber como funciona o plano completo",
  unread_count: 2,
  ai_enabled: 1,
  ai_agent_id: "agent_commercial",
  ai_agent_name: "Agente Comercial",
  status: "open",
  mode: "bot",
};
const conversations = [
  conversation,
  {
    ...conversation,
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    contact_id: "22222222-2222-4222-8222-222222222222",
    name: "Bruno Lima",
    phone: "+5521992220002",
    last_message_preview: "Obrigado pelo atendimento!",
    unread_count: 0,
    mode: "human",
    last_message_at: now - 3 * 3600 - 300,
  },
  {
    ...conversation,
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    contact_id: "33333333-3333-4333-8333-333333333333",
    name: "Carla Mendes",
    phone: "+5521993330003",
    last_message_preview: "Resolvido, obrigada!",
    unread_count: 0,
    mode: "human",
    status: "closed",
    last_message_at: now - 2 * 86400,
  },
];
const messages = [
  {
    id: "m3",
    direction: "inbound",
    message_type: "text",
    text_body: "Quero saber como funciona o plano completo",
    content: null,
    meta_timestamp: now - 3 * 3600,
    read_at: null,
    received_at: "",
    delivery_status: null,
  },
  {
    id: "m2",
    direction: "outbound",
    message_type: "text",
    text_body:
      "Oi Ana! Posso explicar campanhas, Inbox, automações e inteligência artificial. Qual área é mais importante para você?",
    content: { aiSources: [{ title: "SmartZap" }] },
    meta_timestamp: now - 3 * 3600 - 720,
    read_at: "",
    received_at: "",
    delivery_status: "read",
  },
  {
    id: "m1",
    direction: "inbound",
    message_type: "text",
    text_body: "Olá, vi a apresentação e quero entender o plano completo.",
    content: null,
    meta_timestamp: now - 3 * 3600 - 900,
    read_at: "",
    received_at: "",
    delivery_status: null,
  },
];

async function login(page, baseUrl, password) {
  await page.goto(`${baseUrl}/inbox`, { waitUntil: "networkidle" });
  if (!page.url().includes("/login")) return;
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login"), {
      waitUntil: "commit",
    }),
    page.getByRole("button", { name: /Entrar/i }).click(),
  ]);
  await page.goto(`${baseUrl}/inbox`, { waitUntil: "networkidle" });
}

async function installCloudflareFixtures(page) {
  const json = (route, body) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/conversations")
      return json(route, { items: conversations, total: conversations.length });
    if (path === `/api/conversations/${conversationId}`)
      return json(route, conversation);
    if (path === `/api/conversations/${conversationId}/messages`)
      return json(route, { items: messages, total: messages.length });
    if (path === `/api/conversations/${conversationId}/read`)
      return json(route, { ok: true, changed: 1 });
    if (path === `/api/conversations/${conversationId}/ai`)
      return json(route, {
        enabled: true,
        global: {
          enabled: true,
          configured: true,
          ready: true,
          model: "@cf/meta/llama-3.2-3b-instruct",
        },
        sending: { enabled: true, serviceWindowOpen: true },
        drafts: [],
      });
    if (path === "/api/agents")
      return json(route, {
        enabled: true,
        items: [
          {
            id: "agent_commercial",
            name: "Agente Comercial",
            instructions: "Atendimento comercial do SmartZap.",
            active: true,
            is_default: true,
          },
        ],
      });
    if (
      path === "/api/conversations/labels" ||
      path === `/api/conversations/${conversationId}/labels` ||
      path === "/api/conversations/quick-replies" ||
      path === `/api/conversations/${conversationId}/notes`
    )
      return json(route, { items: [] });
    if (path === `/api/contacts/${conversation.contact_id}/memory`)
      return json(route, { memory: null });
    return route.continue();
  });
}

async function stabilize(page) {
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}[data-next-badge-root],nextjs-portal{display:none!important}",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  await page.waitForTimeout(300);
}

async function capture(page, width, height) {
  const full = await page.screenshot({
    type: "png",
    animations: "disabled",
    fullPage: true,
  });
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
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-gpu", "--disable-accelerated-2d-canvas"],
});
const results = [];
try {
  for (const viewport of viewports) {
    const legacyContext = await browser.newContext({
      viewport,
      locale: "pt-BR",
      colorScheme: "dark",
    });
    const cloudflareContext = await browser.newContext({
      viewport,
      locale: "pt-BR",
      colorScheme: "dark",
    });
    const legacy = await legacyContext.newPage();
    const cloudflare = await cloudflareContext.newPage();
    await installCloudflareFixtures(cloudflare);
    await Promise.all([
      login(legacy, "http://127.0.0.1:3100", legacyPassword),
      login(cloudflare, cloudflareBaseUrl, "dev"),
    ]);
    for (const state of ["list", "detail"]) {
      if (state === "detail") {
        await Promise.all([
          legacy.goto(`http://127.0.0.1:3100/inbox?c=${conversationId}`, {
            waitUntil: "networkidle",
          }),
          cloudflare.goto(`${cloudflareBaseUrl}/inbox/${conversationId}`, {
            waitUntil: "networkidle",
          }),
        ]);
      }
      await Promise.all([stabilize(legacy), stabilize(cloudflare)]);
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
      const basename = `${viewport.name}-${state}`;
      await Promise.all([
        writeFile(new URL(`${basename}-original.png`, outputDir), reference),
        writeFile(new URL(`${basename}-cloudflare.png`, outputDir), candidate),
        writeFile(new URL(`${basename}-diff.png`, outputDir), comparison.diff),
      ]);
      results.push({
        viewport: viewport.name,
        state,
        changedPixels: comparison.changed,
        differencePercent: comparison.percent,
      });
    }
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
