import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const baseUrl = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5175";
const password = process.env.SMARTZAP_PASSWORD || "dev";
const out = new URL("../test-results/ai-agents/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "pt-BR",
  colorScheme: "dark",
});
page.setDefaultTimeout(15_000);
try {
  await page.goto(`${baseUrl}/settings/ai`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    await page.locator("input[type=password]").fill(password);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.includes("/login")),
      page.getByRole("button", { name: /Entrar/i }).click(),
    ]);
    await page.goto(`${baseUrl}/settings/ai`, { waitUntil: "networkidle" });
  }
  await page.getByRole("link", { name: /Agentes de Atendimento/ }).click();
  await page.waitForURL(/\/settings\/ai\/agents/);
  await page.getByRole("button", { name: /Novo agente/ }).click();
  const dialog = page.getByRole("dialog");
  const agentName = `Agente E2E ${Date.now()}`;
  await dialog.getByLabel("Nome").fill(agentName);
  await dialog.getByLabel("Descrição").fill("Agente de validação");
  await dialog
    .getByLabel("Instruções", { exact: true })
    .fill(
      "Use somente a base de conhecimento e faça handoff quando faltar informação.",
    );
  await dialog.getByText("Parâmetros avançados", { exact: true }).click();
  const advancedRanges = dialog.locator("details").nth(0).locator('input[type="range"]');
  await advancedRanges.nth(0).fill("0.4");
  await advancedRanges.nth(1).fill("768");
  await advancedRanges.nth(2).fill("3000");
  await dialog.getByText("Configuração RAG", { exact: true }).click();
  const ragRanges = dialog.locator("details").nth(1).locator('input[type="range"]');
  await ragRanges.nth(0).fill("0.65");
  await ragRanges.nth(1).fill("8");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await page.getByRole("heading", { name: agentName, exact: true }).waitFor();
  const persisted = await page.request.get(`${baseUrl}/api/agents`, {
    headers: { "x-api-key": "dev-api-key" },
  });
  const createdAgent = (await persisted.json()).items.find(
    (agent) => agent.name === agentName,
  );
  if (
    !createdAgent ||
    createdAgent.temperature !== 0.4 ||
    createdAgent.max_tokens !== 768 ||
    createdAgent.debounce_ms !== 3000 ||
    createdAgent.rag_similarity_threshold !== 0.65 ||
    createdAgent.rag_max_results !== 8
  )
    throw new Error("parâmetros avançados do agente não foram persistidos");
  await page.getByRole("tab", { name: "Testar Agente" }).click();
  await page
    .getByLabel("Mensagem de teste")
    .fill("Qual é o horário de atendimento?");
  await page.getByRole("button", { name: "Enviar teste" }).click();
  await page.getByText(/encaminhar para uma pessoa/i).waitFor();
  await page.screenshot({
    path: new URL("agentes.png", out).pathname,
    fullPage: true,
  });
  console.log(JSON.stringify({ ok: true, url: page.url() }, null, 2));
} catch (error) {
  await page.screenshot({
    path: new URL("falha.png", out).pathname,
    fullPage: true,
  });
  throw error;
} finally {
  try {
    const listing = await page.request.get(`${baseUrl}/api/agents`, {
      headers: { "x-api-key": "dev-api-key" },
    });
    const data = await listing.json();
    for (const agent of data.items || [])
      if (String(agent.name).startsWith("Agente E2E "))
        await page.request.delete(`${baseUrl}/api/agents/${agent.id}`, {
          headers: { "x-api-key": "dev-api-key" },
        });
  } catch {}
  await browser.close();
}
