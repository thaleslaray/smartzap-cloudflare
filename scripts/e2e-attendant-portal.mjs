import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5175";
const password = process.env.SMARTZAP_PASSWORD || "dev";
const out = new URL("../test-results/attendant-portal/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  locale: "pt-BR",
  colorScheme: "dark",
});
const page = await context.newPage();
let attendantId = "";
page.setDefaultTimeout(15_000);
try {
  await page.goto(`${baseUrl}/settings/attendants`, {
    waitUntil: "networkidle",
  });
  if (page.url().includes("/login")) {
    await page.locator("input[type=password]").fill(password);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes("/login")),
      page.getByRole("button", { name: /Entrar/i }).click(),
    ]);
  }
  const attendant = await page.evaluate(async () => {
    const response = await fetch("/api/attendants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: `Portal E2E ${Date.now()}`,
        permissions: { canView: true, canReply: true, canHandoff: true },
      }),
    });
    if (!response.ok) throw new Error(`create ${response.status}`);
    return response.json();
  });
  attendantId = attendant.id;
  await page.goto(
    `${baseUrl}/atendimento?token=${encodeURIComponent(attendant.token)}`,
    { waitUntil: "networkidle" },
  );
  await page.getByText(`Olá, ${attendant.name}`, { exact: true }).waitFor();
  await page.getByRole("button", { name: /^Todos \d+$/ }).waitFor();
  await page.getByLabel("Buscar conversa").fill("sem resultado e2e");
  await page.getByLabel("Buscar conversa").press("Enter");
  await page.getByText("Nenhuma conversa", { exact: true }).waitFor();
  await page.screenshot({
    path: new URL("portal-mobile.png", out).pathname,
    fullPage: true,
  });
  console.log(
    JSON.stringify(
      { ok: true, url: page.url().replace(/token=.*/, "token=[redacted]") },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot({
    path: new URL("falha.png", out).pathname,
    fullPage: true,
  });
  throw error;
} finally {
  if (attendantId) {
    try {
      await page.request.delete(`${baseUrl}/api/attendants/${attendantId}`, {
        headers: { "x-api-key": "dev-api-key" },
      });
    } catch {}
  }
  await browser.close();
}
