import { chromium } from "playwright";

const baseUrl = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5174";
const password = process.env.SMARTZAP_PASSWORD || "dev";
const prefixes = ["Origem Importação E2E", "Campo E2E", "Teste Campo"];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    await page.locator('input[type="password"]').fill(password);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes("/login")),
      page.getByRole("button", { name: /Entrar/i }).click(),
    ]);
  }
  const removed = await page.evaluate(async (prefixes) => {
    const fieldsResponse = await fetch("/api/contacts/custom-fields");
    if (!fieldsResponse.ok) throw new Error(`campos: ${fieldsResponse.status}`);
    const fields = (await fieldsResponse.json()).items ?? [];
    const targets = fields.filter((field) => prefixes.some((prefix) => field.label?.startsWith(prefix)));
    for (const field of targets) {
      const response = await fetch(`/api/contacts/custom-fields/${field.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`remover campo ${field.id}: ${response.status}`);
    }
    const contactsResponse = await fetch("/api/contacts?q=Auditoria");
    if (!contactsResponse.ok) throw new Error(`contatos: ${contactsResponse.status}`);
    const contacts = (await contactsResponse.json()).items ?? [];
    const contactTargets = contacts.filter((contact) => contact.name === "Auditoria" && contact.phone?.startsWith("+5561"));
    for (const contact of contactTargets) {
      const response = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`remover contato ${contact.id}: ${response.status}`);
    }
    return { fields: targets.map((field) => ({ id: field.id, label: field.label })), contacts: contactTargets.map((contact) => ({ id: contact.id, name: contact.name })) };
  }, prefixes);
  console.log(JSON.stringify({ ok: true, removed }, null, 2));
} finally {
  await browser.close();
}
