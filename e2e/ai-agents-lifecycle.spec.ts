import { expect, test } from "@playwright/test";

const conversationId = "22222222-2222-4222-8222-222222222222";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
}

test("controles reais de agente e chave global bloqueiam e retomam a IA", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const name = `Agente ciclo ${testInfo.project.name} ${Date.now()}`;
  let agentId = "";
  let originalGlobal = true;

  await login(page);
  const initial = await page.evaluate(async () => {
    const response = await fetch("/api/agents");
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<{ enabled: boolean }>;
  });
  originalGlobal = initial.enabled;

  try {
    await page.goto("/settings/ai/agents");
    await expect(page.getByRole("heading", { name: "Agentes IA" })).toBeVisible();
    await page.getByRole("button", { name: "Novo agente" }).click();
    const editor = page.getByRole("dialog", { name: "Novo agente" });
    await editor.getByLabel("Nome").fill(name);
    await editor.getByLabel("Descrição").fill("Agente temporário do reteste integral");
    await editor.getByLabel("Instruções", { exact: true }).fill(
      "Use somente a base vinculada e transfira quando não houver informação segura.",
    );
    const created = page.waitForResponse((response) =>
      response.url().endsWith("/api/agents") && response.request().method() === "POST",
    );
    await editor.getByRole("button", { name: "Salvar" }).click();
    const createdResponse = await created;
    expect(createdResponse.status()).toBe(201);
    agentId = ((await createdResponse.json()) as { id: string }).id;

    const card = page
      .getByRole("heading", { name, exact: true })
      .locator("xpath=ancestor::div[contains(@class,'relative')][1]");
    await expect(card).toContainText("Respondendo automaticamente");
    const assigned = await page.evaluate(async ({ conversationId, agentId }) => {
      const response = await fetch(`/api/conversations/${conversationId}/agent`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      return response.status;
    }, { conversationId, agentId });
    expect(assigned).toBe(200);

    const disabled = page.waitForResponse((response) =>
      response.url().endsWith(`/api/agents/${agentId}`) &&
      response.request().method() === "PATCH",
    );
    await card.getByRole("button", { name: "Desativar" }).click();
    expect((await disabled).status()).toBe(200);
    await expect(card).toContainText("Desativado");
    const inactiveConversation = await page.evaluate(async (id) => {
      const response = await fetch(`/api/conversations/${id}`);
      return response.json() as Promise<{ ai_agent_active: number }>;
    }, conversationId);
    expect(inactiveConversation.ai_agent_active).toBe(0);

    const reactivated = page.waitForResponse((response) =>
      response.url().endsWith(`/api/agents/${agentId}`) &&
      response.request().method() === "PATCH",
    );
    await card.getByRole("button", { name: "Ativar" }).click();
    expect((await reactivated).status()).toBe(200);
    await expect(card).toContainText("Respondendo automaticamente");
    const activeConversation = await page.evaluate(async (id) => {
      const response = await fetch(`/api/conversations/${id}`);
      return response.json() as Promise<{ ai_agent_active: number }>;
    }, conversationId);
    expect(activeConversation.ai_agent_active).toBe(1);

    const globalSwitch = page.getByRole("switch", { name: "Atendimento IA" });
    if ((await globalSwitch.getAttribute("aria-checked")) === "true") {
      await globalSwitch.click();
      await expect(globalSwitch).toHaveAttribute("aria-checked", "false");
      const agents = await page.evaluate(async () => (await fetch("/api/agents")).json() as Promise<{ enabled: boolean }>);
      expect(agents.enabled).toBe(false);
    }
    await globalSwitch.click();
    await expect(globalSwitch).toHaveAttribute("aria-checked", "true");
    const enabledAgents = await page.evaluate(async () => (await fetch("/api/agents")).json() as Promise<{ enabled: boolean }>);
    expect(enabledAgents.enabled).toBe(true);
  } finally {
    if (agentId) {
      await page.evaluate(async (id) => {
        await fetch(`/api/agents/${id}`, { method: "DELETE" });
      }, agentId).catch(() => undefined);
    }
    await page.evaluate(async (enabled) => {
      await fetch("/api/agents/enabled", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    }, originalGlobal).catch(() => undefined);
  }
});
