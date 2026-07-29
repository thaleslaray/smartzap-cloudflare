import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.SMARTZAP_CF_URL || "http://127.0.0.1:5175";
const password = process.env.SMARTZAP_PASSWORD || "dev";
const out = new URL("../test-results/inbox-e2e/", import.meta.url);
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
  await page.goto(`${baseUrl}/inbox`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    await page.locator('input[type="password"]').fill(password);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes("/login")),
      page.getByRole("button", { name: /Entrar/i }).click(),
    ]);
    await page.goto(`${baseUrl}/inbox`, { waitUntil: "networkidle" });
  }

  const stamp = Date.now();
  seeded = await page.evaluate(async (stamp) => {
    const request = async (path, init) => {
      const response = await fetch(path, {
        headers: { "content-type": "application/json" },
        ...init,
      });
      if (!response.ok)
        throw new Error(`${init?.method || "GET"} ${path}: ${response.status}`);
      return response.json();
    };
    const conversations = await request("/api/conversations");
    const conversation = conversations.items[0];
    if (!conversation) throw new Error("E2E precisa de uma conversa local");
    const label = await request("/api/conversations/labels", {
      method: "POST",
      body: JSON.stringify({ name: `E2E-${stamp}`, color: "#f97316" }),
    });
    const agent = await request("/api/agents", {
      method: "POST",
      body: JSON.stringify({
        name: `Agente E2E ${stamp}`,
        description: "Validação da Inbox",
        instructions: "Use a memória e a base de conhecimento.",
        active: true,
      }),
    });
    return { conversation, label, agent };
  }, stamp);

  // Reabre a Inbox para que os catálogos criados acima sejam carregados pelos
  // mesmos hooks que um operador real utiliza ao iniciar a tela.
  await page.goto(`${baseUrl}/inbox`, { waitUntil: "networkidle" });
  await page.getByLabel("Buscar conversa").fill(seeded.conversation.phone);
  await page
    .getByText(seeded.conversation.name || seeded.conversation.phone, {
      exact: true,
    })
    .last()
    .click();
  await page.waitForURL(/\/inbox\//);
  await page.getByLabel("Contexto e memória").click();

  await page.getByRole("button", { name: seeded.label.name }).click();
  await page.getByLabel("Nova nota interna").fill(`Nota E2E ${stamp}`);
  await page.getByRole("button", { name: "Adicionar nota" }).click();
  await page.getByText(`Nota E2E ${stamp}`, { exact: true }).waitFor();

  await page.locator("summary").filter({ hasText: "Gerenciar respostas rápidas" }).click();
  await page.getByLabel("Título da resposta rápida").fill(`Resposta E2E ${stamp}`);
  await page.getByLabel("Atalho da resposta rápida").fill(`e2e-${stamp}`);
  await page
    .getByLabel("Texto da resposta rápida")
    .fill("Resposta persistida pela interface da Inbox.");
  await page.getByRole("button", { name: "Salvar resposta rápida" }).click();

  await page.getByLabel("Agente atribuído").selectOption(seeded.agent.id);
  await page.getByRole("button", { name: "Devolver à IA" }).click();
  await page.getByRole("button", { name: "Urgente", exact: true }).click();
  await page.getByRole("button", { name: "5min", exact: true }).click();
  await page.getByLabel("Memória do contato").fill(`Memória E2E ${stamp}`);
  await page.getByRole("button", { name: "Salvar memória" }).click();

  await page.waitForTimeout(500);
  const proof = await page.evaluate(
    async ({ conversationId, contactId, labelId, agentId, stamp }) => {
      const get = async (path) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
        return response.json();
      };
      const [detail, labels, notes, memory, quickReplies] = await Promise.all([
        get(`/api/conversations/${conversationId}`),
        get(`/api/conversations/${conversationId}/labels`),
        get(`/api/conversations/${conversationId}/notes`),
        get(`/api/contacts/${contactId}/memory`),
        get("/api/conversations/quick-replies"),
      ]);
      const checks = {
        label: labels.items.some((item) => item.id === labelId),
        note: notes.items.some((item) => item.body === `Nota E2E ${stamp}`),
        quickReply: quickReplies.items.some(
          (item) => item.title === `Resposta E2E ${stamp}`,
        ),
        agent: detail.ai_agent_id === agentId,
        botMode: detail.mode === "bot",
        priority: detail.priority === "urgent",
        paused: detail.automation_paused_until > Date.now() / 1000,
        memory: memory.memory?.summary === `Memória E2E ${stamp}`,
      };
      if (Object.values(checks).some((value) => !value))
        throw new Error(`Falha de persistência: ${JSON.stringify(checks)}`);
      return checks;
    },
    {
      conversationId: seeded.conversation.id,
      contactId: seeded.conversation.contact_id,
      labelId: seeded.label.id,
      agentId: seeded.agent.id,
      stamp,
    },
  );

  await page.screenshot({
    path: new URL("operacoes-persistidas.png", out).pathname,
    fullPage: true,
  });
  console.log(JSON.stringify({ ok: true, proof }, null, 2));
} catch (error) {
  await page.screenshot({
    path: new URL("falha.png", out).pathname,
    fullPage: true,
  });
  throw error;
} finally {
  if (seeded?.conversation?.id && seeded?.agent?.id) {
    try {
      await page.request.put(
        `${baseUrl}/api/conversations/${seeded.conversation.id}/agent`,
        {
          headers: {
            "content-type": "application/json",
            "x-api-key": "dev-api-key",
          },
          data: { agentId: seeded.conversation.ai_agent_id ?? null },
        },
      );
      await page.request.delete(`${baseUrl}/api/agents/${seeded.agent.id}`, {
        headers: { "x-api-key": "dev-api-key" },
      });
    } catch {}
  }
  await browser.close();
}
