import fs from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseUrl = process.env.SMARTZAP_URL || "http://127.0.0.1:5174";

function parseVars(source) {
  return Object.fromEntries(source.split(/\r?\n/).flatMap((line) => {
    const clean = line.trim();
    if (!clean || clean.startsWith("#") || !clean.includes("=")) return [];
    const separator = clean.indexOf("=");
    const key = clean.slice(0, separator).trim();
    const value = clean.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
    return [[key, value]];
  }));
}

const definition = {
  version: "7.3",
  screens: [
    {
      id: "START",
      title: "Matriz completa",
      final: false,
      text: "Preencha todos os componentes:",
      buttonText: "Continuar",
      next: "MIDDLE",
      blocks: [
        { id: "heading", type: "TextHeading", text: "Título principal" },
        { id: "subheading", type: "TextSubheading", text: "Subtítulo da tela" },
        { id: "body", type: "TextBody", text: "Texto explicativo" },
        { id: "caption", type: "TextCaption", text: "Legenda auxiliar" },
        { id: "name", type: "TextInput", label: "Nome", name: "name", inputType: "text", required: true },
        { id: "email", type: "TextInput", label: "E-mail", name: "email", inputType: "email", required: true },
        { id: "phone", type: "TextInput", label: "Telefone", name: "phone", inputType: "phone", required: true },
        { id: "quantity", type: "TextInput", label: "Quantidade", name: "quantity", inputType: "number", required: true },
        { id: "notes", type: "TextArea", label: "Observações", name: "notes", required: true },
        { id: "date", type: "CalendarPicker", label: "Data", name: "date", required: true },
        {
          id: "plan", type: "Dropdown", label: "Plano", name: "plan", required: true,
          options: [{ id: "basic", title: "Básico" }, { id: "pro", title: "Profissional" }],
        },
        {
          id: "channel", type: "RadioButtonsGroup", label: "Canal", name: "channel", required: true,
          options: [{ id: "whatsapp", title: "WhatsApp" }, { id: "email", title: "E-mail" }],
        },
        {
          id: "interests", type: "CheckboxGroup", label: "Interesses", name: "interests", required: true,
          options: [{ id: "news", title: "Novidades" }, { id: "offers", title: "Ofertas" }],
        },
        { id: "consent", type: "OptIn", text: "Aceito os termos", name: "consent", required: true },
      ],
    },
    {
      id: "MIDDLE",
      title: "Tela intermediária",
      final: false,
      text: "Confirme o código:",
      buttonText: "Avançar",
      next: "FINAL",
      blocks: [
        { id: "middle_heading", type: "TextHeading", text: "Segunda tela" },
        { id: "code", type: "TextInput", label: "Código", name: "code", inputType: "text", required: true },
      ],
    },
    {
      id: "FINAL",
      title: "Tela final",
      final: true,
      text: "Tudo pronto.",
      buttonText: "Concluir",
      next: null,
      blocks: [{ id: "final_heading", type: "TextHeading", text: "Última tela" }],
    },
  ],
};

const vars = parseVars(await fs.readFile(new URL("../.dev.vars", import.meta.url), "utf8"));
const token = vars.WHATSAPP_TOKEN;
const password = vars.MASTER_PASSWORD || "dev";
const graphVersion = String(vars.META_GRAPH_VERSION || "v25.0").replace(/^v?/, "v");
if (!token) throw new Error("WHATSAPP_TOKEN não configurado em .dev.vars");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let localId = null;
let metaId = null;
let remoteDeleted = false;
let localDeleted = false;

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Senha mestra").fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);

  const created = await page.request.post(`${baseUrl}/api/flows`, {
    data: { name: `Auditoria matriz Meta ${Date.now()}`, definition },
  });
  if (!created.ok()) throw new Error(`Falha ao criar Flow local (${created.status()})`);
  localId = (await created.json()).id;

  const validation = await page.request.post(`${baseUrl}/api/flows/${localId}/meta/publish`, {
    data: { publish: false },
  });
  const payload = await validation.json();
  metaId = payload.metaId || payload.item?.meta_id || null;
  if (!validation.ok()) {
    throw new Error(`Meta rejeitou a matriz: ${JSON.stringify({
      status: validation.status(),
      error: payload.error,
      validationErrors: payload.validationErrors,
      code: payload.code,
      subcode: payload.subcode,
    })}`);
  }
  if (!metaId) throw new Error("A Meta aceitou a requisição sem devolver o ID do rascunho");

  console.log(JSON.stringify({
    ok: true,
    localId,
    metaId,
    metaStatus: payload.item?.meta_status,
    validationErrors: payload.item?.meta_validation_errors ?? null,
    screens: definition.screens.length,
    components: definition.screens.reduce((total, screen) => total + screen.blocks.length, 0),
  }, null, 2));
} finally {
  if (metaId) {
    const remote = await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(metaId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await remote.json().catch(() => ({}));
    remoteDeleted = remote.ok && body.success === true;
    if (!remoteDeleted) console.error(JSON.stringify({ cleanup: "meta", metaId, status: remote.status, error: body.error?.message || "falhou" }));
  }
  if (localId) {
    const local = await page.request.delete(`${baseUrl}/api/flows/${localId}`);
    localDeleted = local.ok();
    if (!localDeleted) console.error(JSON.stringify({ cleanup: "local", localId, status: local.status() }));
  }
  console.log(JSON.stringify({ cleanup: { remoteDeleted, localDeleted } }));
  await browser.close();
}

if (!remoteDeleted || !localDeleted) process.exitCode = 1;
