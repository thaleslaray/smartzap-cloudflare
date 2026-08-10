import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const AUTH = { "x-api-key": "dev-api-key", "content-type": "application/json" };

async function conversation() {
  const contactId = crypto.randomUUID();
  const id = crypto.randomUUID();
  const stamp = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO contacts (id, phone, status, wa_id) VALUES (?1, ?2, 'unknown', ?3)",
    ).bind(contactId, `+55129${String(stamp).slice(-8)}`, `55${stamp}`),
    env.DB.prepare(
      "INSERT INTO conversations (id, contact_id, wa_id) VALUES (?1, ?2, ?3)",
    ).bind(id, contactId, `55${stamp}`),
  ]);
  return id;
}

describe("operações humanas da Inbox", () => {
  it("persiste timeout humano e retenção com os limites do legado", async () => {
    const update = await SELF.fetch("https://x.com/api/settings/inbox", {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({
        retention_days: 180,
        human_mode_timeout_hours: 24,
      }),
    });
    expect(update.status).toBe(200);
    expect(await update.json()).toEqual({
      retention_days: 180,
      human_mode_timeout_hours: 24,
    });
    expect(
      await (
        await SELF.fetch("https://x.com/api/settings/inbox", { headers: AUTH })
      ).json(),
    ).toEqual({ retention_days: 180, human_mode_timeout_hours: 24 });
    expect(
      (
        await SELF.fetch("https://x.com/api/settings/inbox", {
          method: "PATCH",
          headers: AUTH,
          body: JSON.stringify({
            retention_days: 2,
            human_mode_timeout_hours: 999,
          }),
        })
      ).status,
    ).toBe(400);
  });

  it("cria, lista, atualiza e remove links de atendentes", async () => {
    const createdResponse = await SELF.fetch("https://x.com/api/attendants", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ name: "João Suporte" }),
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      id: string;
      token: string;
      permissions: Record<string, boolean>;
    };
    expect(created.token).toMatch(/^[a-f0-9]{32}$/);
    expect(created.permissions).toEqual({
      canView: true,
      canReply: true,
      canHandoff: false,
    });
    expect(
      await (
        await SELF.fetch("https://x.com/api/attendants", { headers: AUTH })
      ).json(),
    ).toContainEqual(
      expect.objectContaining({ id: created.id, name: "João Suporte" }),
    );
    const updated = await SELF.fetch(
      `https://x.com/api/attendants/${created.id}`,
      {
        method: "PATCH",
        headers: AUTH,
        body: JSON.stringify({ is_active: false }),
      },
    );
    expect(await updated.json()).toMatchObject({
      id: created.id,
      is_active: false,
    });
    expect(
      (
        await SELF.fetch(`https://x.com/api/attendants/${created.id}`, {
          method: "DELETE",
          headers: AUTH,
        })
      ).status,
    ).toBe(200);
  });

  it("mantém labels, resposta rápida, nota interna e handoff persistidos", async () => {
    const id = await conversation();
    await SELF.fetch("https://x.com/api/settings/inbox", {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({ human_mode_timeout_hours: 24 }),
    });
    const label = await SELF.fetch("https://x.com/api/conversations/labels", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        name: `Urgente-${id.slice(0, 6)}`,
        color: "#ff0000",
      }),
    });
    const labelBody = (await label.json()) as { id: string };
    expect(
      (
        await SELF.fetch("https://x.com/api/conversations/quick-replies", {
          method: "POST",
          headers: AUTH,
          body: JSON.stringify({
            title: "Olá",
            shortcut: `/ola-${id.slice(0, 6)}`,
            body: "Olá, como posso ajudar?",
          }),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await SELF.fetch(`https://x.com/api/conversations/${id}/labels`, {
          method: "PUT",
          headers: AUTH,
          body: JSON.stringify({ labelIds: [labelBody.id] }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await SELF.fetch(`https://x.com/api/conversations/${id}/notes`, {
          method: "POST",
          headers: AUTH,
          body: JSON.stringify({ body: "Cliente pediu retorno." }),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await SELF.fetch(`https://x.com/api/conversations/${id}/operation`, {
          method: "PUT",
          headers: AUTH,
          body: JSON.stringify({
            mode: "human",
            priority: "urgent",
            handoffReason: "pedido de humano",
          }),
        })
      ).status,
    ).toBe(200);
    const detail = await SELF.fetch(`https://x.com/api/conversations/${id}`, {
      headers: AUTH,
    });
    const detailBody = (await detail.json()) as {
      mode: string;
      priority: string;
      handoff_reason: string;
      human_mode_expires_at: number;
    };
    expect(detailBody).toMatchObject({
      mode: "human",
      priority: "urgent",
      handoff_reason: "pedido de humano",
    });
    expect(detailBody.human_mode_expires_at).toBeGreaterThan(
      Math.floor(Date.now() / 1000) + 23 * 3600,
    );
    const pauseUntil = Math.floor(Date.now() / 1000) + 900;
    expect(
      (
        await SELF.fetch(`https://x.com/api/conversations/${id}/operation`, {
          method: "PUT",
          headers: AUTH,
          body: JSON.stringify({ pausedUntil: pauseUntil }),
        })
      ).status,
    ).toBe(200);
    expect(
      await (
        await SELF.fetch(`https://x.com/api/conversations/${id}`, {
          headers: AUTH,
        })
      ).json(),
    ).toMatchObject({ automation_paused_until: pauseUntil });
    const filtered = await SELF.fetch(
      `https://x.com/api/conversations?status=open&mode=human&labelId=${labelBody.id}`,
      { headers: AUTH },
    );
    expect(filtered.status).toBe(200);
    expect(
      (
        (await filtered.json()) as {
          items: { id: string; label_ids: string }[];
        }
      ).items,
    ).toContainEqual(expect.objectContaining({ id, label_ids: labelBody.id }));
    const excluded = await SELF.fetch(
      `https://x.com/api/conversations?status=closed&mode=human&labelId=${labelBody.id}`,
      { headers: AUTH },
    );
    expect(
      ((await excluded.json()) as { items: { id: string }[] }).items,
    ).not.toContainEqual(expect.objectContaining({ id }));
    const notes = await SELF.fetch(
      `https://x.com/api/conversations/${id}/notes`,
      { headers: AUTH },
    );
    expect(
      ((await notes.json()) as { items: { body: string }[] }).items,
    ).toEqual([expect.objectContaining({ body: "Cliente pediu retorno." })]);
  });

  it("atribui um agente ativo à conversa e expõe o nome no detalhe", async () => {
    const id = await conversation();
    const created = await SELF.fetch("https://x.com/api/agents", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        name: "Agente Financeiro",
        description: "Cobrança",
        instructions:
          "Responda apenas dúvidas financeiras com base nas fontes.",
        active: true,
      }),
    });
    const agent = (await created.json()) as { id: string };
    expect(
      (
        await SELF.fetch(`https://x.com/api/conversations/${id}/agent`, {
          method: "PUT",
          headers: AUTH,
          body: JSON.stringify({ agentId: agent.id }),
        })
      ).status,
    ).toBe(200);
    expect(
      await (
        await SELF.fetch(`https://x.com/api/conversations/${id}`, {
          headers: AUTH,
        })
      ).json(),
    ).toEqual(
      expect.objectContaining({
        ai_agent_id: agent.id,
        ai_agent_name: "Agente Financeiro",
        ai_agent_instructions:
          "Responda apenas dúvidas financeiras com base nas fontes.",
      }),
    );
  });

  it("aceita o ID legado do agente comercial padrão", async () => {
    const id = await conversation();
    const response = await SELF.fetch(`https://x.com/api/conversations/${id}/agent`, {
      method: "PUT",
      headers: AUTH,
      body: JSON.stringify({ agentId: "agent_commercial" }),
    });
    expect(response.status).toBe(200);
    expect(
      await (
        await SELF.fetch(`https://x.com/api/conversations/${id}`, {
          headers: AUTH,
        })
      ).json(),
    ).toEqual(
      expect.objectContaining({
        ai_agent_id: "agent_commercial",
        ai_agent_name: "Agente Comercial",
      }),
    );
  });
});
