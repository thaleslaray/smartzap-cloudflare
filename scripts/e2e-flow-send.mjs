import { chromium } from "playwright";
const baseUrl = process.env.SMARTZAP_CF_URL;
const password = process.env.SMARTZAP_PASSWORD;
const to = process.env.SMARTZAP_TO || "5521982219966";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "pt-BR" });
try {
  await page.goto(`${baseUrl}/flows/builder`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    await page.locator('input[type="password"]').fill(password);
    await Promise.all([page.waitForURL((u) => !u.pathname.includes("/login")), page.getByRole("button", { name: /Entrar/i }).click()]);
  }
  await page.goto(`${baseUrl}/flows/builder`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Criar por template" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome", { exact: true }).fill(`MiniApp envio E2E ${Date.now()}`);
  await dialog.getByRole("button", { name: /^Agendamento/ }).click();
  await dialog.getByRole("button", { name: "Criar", exact: true }).click();
  await page.waitForURL(/\/flows\/builder\/[^/]+$/);
  const id = page.url().split("/").at(-1);
  const local = await page.evaluate(async (id) => (await fetch(`/api/flows/${id}`)).json(), id);
  console.log("definition", JSON.stringify(local.definition));
  const pub = await page.evaluate(async (id) => {
    const r = await fetch(`/api/flows/${id}/meta/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ publish: true }) });
    return { status: r.status, body: await r.json() };
  }, id);
  console.log("publish", JSON.stringify(pub));
  if (pub.status >= 400 || !pub.body?.item?.meta_id) process.exitCode = 2;
  else {
    const sent = await page.evaluate(async ({ id, to }) => {
      const r = await fetch(`/api/flows/${id}/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to, body: "Teste MiniApp SmartZap", ctaText: "Abrir formulário", footer: "Teste autorizado" }) });
      return { status: r.status, body: await r.json() };
    }, { id, to });
    console.log("send", JSON.stringify(sent));
    if (sent.status >= 400 || !sent.body?.ok) process.exitCode = 3;
  }
} finally { await browser.close(); }
