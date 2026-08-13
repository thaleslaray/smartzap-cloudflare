import { chromium } from "playwright";

const baseUrl = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5174";
const password = process.env.SMARTZAP_PASSWORD || "dev";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "pt-BR", colorScheme: "dark" });
const stamp = Date.now();
const phone = `+5548${String(stamp).slice(-8)}`;
const fieldLabel = `Origem Importação E2E ${stamp}`;
const fieldKey = `origem_importacao_e2e_${String(stamp).slice(-8)}`;
let contactId;
let fieldId;
let tagIds = [];

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    await page.locator('input[type="password"]').fill(password);
    await Promise.all([page.waitForURL((url) => !url.pathname.includes("/login")), page.getByRole("button", { name: /Entrar/i }).click()]);
  }
  await page.goto(`${baseUrl}/contacts`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Importar CSV" }).click();
  const dialog = page.getByRole("dialog", { name: "Importar Contatos" });
  await dialog.getByText("Clique para selecionar ou arraste aqui").waitFor();
  const csv = [
    "telefone,nome,email,tags,origem",
    `${phone},Contato importado,IMPORT@EXAMPLE.COM,Import E2E ${stamp};Florianópolis ${stamp},landing-page`,
    `${phone},Contato duplicado,duplicate@example.com,Duplicado,duplicado`,
    "inválido,Contato inválido,invalid@example.com,Erro,n/a",
  ].join("\n");
  await dialog.locator('input[type="file"]').setInputFiles({ name: `contatos-${stamp}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await dialog.getByText(`contatos-${stamp}.csv`).waitFor();
  await dialog.getByLabel("Coluna para Telefone").selectOption("telefone");
  await dialog.getByRole("button", { name: "Mapear campos" }).click();
  const sheet = page.getByRole("dialog", { name: "Mapear campos personalizados" });
  await sheet.getByPlaceholder("Ex.: Empresa").fill(fieldLabel);
  await sheet.getByRole("button", { name: "Criar campo" }).click();
  // O campo recém-criado é o rótulo de um select; o texto completo do label
  // inclui as opções. Validamos o controle utilizável, não um nó de texto solto.
  const mappingField = sheet.locator("label", { hasText: fieldLabel }).last();
  await mappingField.locator("select").waitFor();
  const mappingSelect = mappingField.locator("select");
  await mappingSelect.selectOption("origem");
  await sheet.getByRole("button", { name: "Concluir mapeamento" }).click();
  await dialog.getByText("Resumo da importação").waitFor();
  await dialog.getByText("Novos").waitFor();
  await dialog.getByRole("button", { name: "Confirmar Importação" }).click();
  await dialog.getByText("Importação Concluída!").waitFor();
  await dialog.getByRole("button", { name: "Fechar" }).click();

  const proof = await page.evaluate(async ({ phone, fieldKey, stamp }) => {
    const response = await fetch(`/api/contacts?q=${encodeURIComponent(phone)}`);
    if (!response.ok) throw new Error(`contacts: ${response.status}`);
    const list = await response.json();
    const contact = list.items.find((item) => item.phone === phone);
    if (!contact) throw new Error("contato importado não localizado");
    const [profileResponse, fieldsResponse, tagsResponse, exportResponse] = await Promise.all([
      fetch(`/api/contacts/${contact.id}/profile`), fetch("/api/contacts/custom-fields"), fetch("/api/contacts/tags"), fetch(`/api/contacts/export.csv?ids=${contact.id}`),
    ]);
    return { contact, profile: await profileResponse.json(), fields: await fieldsResponse.json(), tags: await tagsResponse.json(), exported: await exportResponse.text(), fieldKey, stamp };
  }, { phone, fieldKey, stamp });
  contactId = proof.contact.id;
  if (proof.contact.status !== "unknown") throw new Error("importação sem declaração inferiu opt-in");
  const field = proof.fields.items.find((item) => item.key === fieldKey);
  if (!field) throw new Error("campo criado dentro do mapeamento não persistiu");
  fieldId = field.id;
  if (proof.contact.email !== "import@example.com") throw new Error("e-mail não foi normalizado/persistido");
  if (!proof.profile.customValues.some((item) => item.id === fieldId && item.value === "landing-page")) throw new Error("campo personalizado não foi persistido");
  for (const name of [`Import E2E ${stamp}`, `Florianópolis ${stamp}`]) {
    const tag = proof.tags.items.find((item) => item.name === name);
    if (!tag || !proof.profile.tags.some((item) => item.id === tag.id)) throw new Error(`tag não persistiu: ${name}`);
    tagIds.push(tag.id);
  }
  if (!proof.exported.includes("import@example.com")) throw new Error("exportação do contato importado não contém e-mail");
  console.log(JSON.stringify({ ok: true, contactId, fieldId, imported: 1, duplicates: 1, invalid: 1 }, null, 2));
} finally {
  if (contactId) await page.request.delete(`${baseUrl}/api/contacts/${contactId}`).catch(() => undefined);
  if (fieldId) await page.request.delete(`${baseUrl}/api/contacts/custom-fields/${fieldId}`).catch(() => undefined);
  else await page.evaluate(async (fieldLabel) => {
    const response = await fetch("/api/contacts/custom-fields");
    if (!response.ok) return;
    const field = (await response.json()).items?.find((item) => item.label === fieldLabel);
    if (field) await fetch(`/api/contacts/custom-fields/${field.id}`, { method: "DELETE" });
  }, fieldLabel).catch(() => undefined);
  for (const tagId of tagIds) await page.request.delete(`${baseUrl}/api/contacts/tags/${tagId}`).catch(() => undefined);
  await browser.close();
}
