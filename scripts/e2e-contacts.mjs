import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5174";
const password = process.env.SMARTZAP_PASSWORD || "dev";
const cleanup = process.env.SMARTZAP_E2E_CLEANUP === "1";
const out = new URL("../test-results/contacts-e2e/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "pt-BR",
  colorScheme: "dark",
});
page.setDefaultTimeout(15_000);
let seeded;

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    await page.locator('input[type="password"]').fill(password);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes("/login")),
      page.getByRole("button", { name: /Entrar/i }).click(),
    ]);
  }
  const stamp = Date.now();
  seeded = await page.evaluate(async (stamp) => {
    const request = async (path, init) => {
      const response = await fetch(path, {
        headers: { "content-type": "application/json" },
        ...init,
      });
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return response.json();
    };
    const contact = await request("/api/contacts", {
      method: "POST",
      body: JSON.stringify({
        name: `Contato lote E2E ${stamp}`,
        phone: `+5511${String(stamp).slice(-8)}`,
        optInConfirmed: true,
      }),
    });
    const untouched = await request("/api/contacts", {
      method: "POST",
      body: JSON.stringify({
        name: `Contato intacto E2E ${stamp}`,
        phone: `+5513${String(stamp).slice(-8)}`,
        optInConfirmed: true,
      }),
    });
    // Garante mais de uma página para provar seleção global, sem depender da
    // quantidade deixada por execuções anteriores.
    const current = await request("/api/contacts");
    const fillers = [];
    for (let index = current.total; index <= 50; index += 1) {
      fillers.push(await request("/api/contacts", {
        method: "POST",
        body: JSON.stringify({
          name: `Preenchimento E2E ${stamp}-${index}`,
          phone: `+5512${String(stamp + index).slice(-8)}`,
          optInConfirmed: true,
        }),
      }));
    }
    const tag = await request("/api/contacts/tags", {
      method: "POST",
      body: JSON.stringify({ name: `Tag E2E ${stamp}` }),
    });
    const field = await request("/api/contacts/custom-fields", {
      method: "POST",
      body: JSON.stringify({
        key: `campo_e2e_${String(stamp).slice(-8)}`,
        label: `Campo E2E ${stamp}`,
        type: "text",
      }),
    });
    return { contact, untouched, tag, field, fillers };
  }, stamp);

  await page.goto(`${baseUrl}/contacts`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Selecionar contatos desta página").check();
  const globalSelect = page.getByRole("button", {
    name: /Selecionar todos os \d+ contatos/,
  });
  await globalSelect.click();
  await page.getByText(/Todos os \d+ contatos foram selecionados/).waitFor();
  await page.getByRole("button", { name: "Limpar seleção" }).click();

  await page
    .getByLabel("Buscar contatos por nome ou telefone")
    .fill(seeded.contact.phone);
  await page.getByRole("button", { name: `Editar ${seeded.contact.name}` }).click();
  const editDialog = page.getByRole("dialog", { name: "Editar Contato" });
  await editDialog.waitFor();
  await editDialog.getByLabel("Tags (separadas por vírgula)").waitFor();
  await editDialog.getByText("Campos Personalizados", { exact: true }).waitFor();
  if (await editDialog.getByText("Memória", { exact: true }).count())
    throw new Error("edição compacta voltou a misturar memória/perfil");
  await editDialog.getByRole("button", { name: "Fechar formulário de edição de contato" }).click();

  await page.getByRole("button", { name: "Campos personalizados" }).click();
  const fieldSheet = page.getByRole("dialog", { name: "Gerenciar Campos" });
  await fieldSheet.waitFor();
  await fieldSheet.getByText("Campos do Sistema", { exact: true }).waitFor();
  await fieldSheet.getByText("Chave (Variável)", { exact: true }).waitFor();
  await fieldSheet.getByRole("button", { name: "Fechar gerenciamento de campos" }).click();

  await page.getByRole("checkbox", { name: `Selecionar ${seeded.contact.name}` }).check();
  await page.getByRole("button", { name: "Mais ações", exact: true }).click();
  await page.getByRole("button", { name: "Tags", exact: true }).click();
  await page.getByLabel(seeded.tag.name, { exact: true }).check();
  await page.getByRole("button", { name: "Aplicar tags" }).click();
  await page.getByRole("heading", { name: "Alterar tags em lote" }).waitFor({ state: "detached" });

  const contactCheckbox = page.getByRole("checkbox", { name: `Selecionar ${seeded.contact.name}` });
  await contactCheckbox.waitFor();
  await contactCheckbox.check();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "Mais ações", exact: true }).click();
  await page.getByRole("button", { name: "Campo", exact: true }).click();
  await page
    .getByLabel("Campo personalizado do lote")
    .selectOption(seeded.field.id);
  await page.getByLabel("Valor do campo em lote").fill("valor persistido");
  await page.getByRole("button", { name: "Aplicar campo" }).click();
  await page.getByRole("heading", { name: "Preencher campo em lote" }).waitFor({ state: "detached" });

  const proof = await page.evaluate(async (contactId) => {
    const response = await fetch(`/api/contacts/${contactId}/profile`);
    if (!response.ok) throw new Error(`profile: ${response.status}`);
    return response.json();
  }, seeded.contact.id);
  if (!proof.tags.some((tag) => tag.id === seeded.tag.id))
    throw new Error("tag do lote não persistiu");
  if (
    !proof.customValues.some(
      (field) => field.id === seeded.field.id && field.value === "valor persistido",
    )
  )
    throw new Error("campo do lote não persistiu");

  // A exclusão em massa precisa respeitar estritamente a seleção, inclusive
  // quando o usuário cancela a primeira confirmação.
  await contactCheckbox.check();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar 1 contato(s) selecionado(s)" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath || !(await readFile(downloadPath, "utf8")).includes(seeded.contact.name))
    throw new Error("a exportação selecionada não contém o contato marcado");
  await page.getByRole("button", { name: new RegExp(`Excluir 1 contato\\(s\\) selecionado\\(s\\)`) }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Confirmar Exclusão" });
  await deleteDialog.getByText("Tem certeza que deseja excluir 1 contatos?").waitFor();
  await deleteDialog.getByRole("button", { name: "Cancelar" }).click();
  const stillThere = await page.evaluate(async (contactId) => (await fetch(`/api/contacts/${contactId}/profile`)).ok, seeded.contact.id);
  if (!stillThere) throw new Error("cancelamento da exclusão em massa removeu o contato");
  await page.getByRole("button", { name: new RegExp(`Excluir 1 contato\\(s\\) selecionado\\(s\\)`) }).click();
  await deleteDialog.getByRole("button", { name: "Excluir" }).click();
  await deleteDialog.waitFor({ state: "detached" });
  const deletion = await page.evaluate(async ({ selectedId, untouchedId }) => ({
    selected: (await fetch(`/api/contacts/${selectedId}/profile`)).status,
    untouched: (await fetch(`/api/contacts/${untouchedId}/profile`)).status,
  }), { selectedId: seeded.contact.id, untouchedId: seeded.untouched.id });
  if (deletion.selected !== 404 || deletion.untouched !== 200)
    throw new Error(`exclusão em massa atingiu a seleção errada: ${JSON.stringify(deletion)}`);

  await page.screenshot({
    path: new URL("lotes-persistidos.png", out).pathname,
    fullPage: true,
  });
  console.log(JSON.stringify({ ok: true, contactId: seeded.contact.id }, null, 2));
} catch (error) {
  await page.screenshot({ path: new URL("falha.png", out).pathname, fullPage: true });
  throw error;
} finally {
  if (cleanup && seeded) {
    for (const contact of [seeded.contact, seeded.untouched, ...(seeded.fillers || [])])
      await page.request.delete(`${baseUrl}/api/contacts/${contact.id}`).catch(() => undefined);
    await page.request.delete(`${baseUrl}/api/contacts/tags/${seeded.tag.id}`).catch(() => undefined);
    await page.request.delete(`${baseUrl}/api/contacts/custom-fields/${seeded.field.id}`).catch(() => undefined);
  }
  await browser.close();
}
