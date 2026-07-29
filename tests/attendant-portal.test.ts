import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const token = `portal-${"a".repeat(32)}`;
const headers = {
  "content-type": "application/json",
  "x-attendant-token": token,
};
let conversationId = "";

beforeEach(async () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const attendantId = crypto.randomUUID();
  conversationId = crypto.randomUUID();
  const contactId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM attendant_tokens WHERE token=?1").bind(token),
    env.DB.prepare(
      "INSERT INTO attendant_tokens(id,name,token,permissions_json)VALUES(?1,'Equipe Portal',?2,?3)",
    ).bind(
      attendantId,
      token,
      JSON.stringify({ canView: true, canReply: true, canHandoff: true }),
    ),
    env.DB.prepare(
      "INSERT INTO contacts(id,name,phone,wa_id,status)VALUES(?1,'Cliente Portal',?2,?3,'unknown')",
    ).bind(contactId, `+552199${suffix}`, `552199${suffix}`),
    env.DB.prepare(
      "INSERT INTO conversations(id,contact_id,wa_id,last_message_at,last_message_preview,unread_count)VALUES(?1,?2,?3,?4,'Preciso de ajuda',1)",
    ).bind(
      conversationId,
      contactId,
      `552199${suffix}`,
      Math.floor(Date.now() / 1000),
    ),
    env.DB.prepare(
      "INSERT INTO conversation_messages(id,conversation_id,contact_id,direction,message_type,text_body,phone_number_id,meta_timestamp)VALUES(?1,?2,?3,'inbound','text','Preciso de ajuda','11111',?4)",
    ).bind(
      `wamid.${suffix}`,
      conversationId,
      contactId,
      Math.floor(Date.now() / 1000),
    ),
  ]);
});

describe("portal do atendente", () => {
  it("valida token e registra o acesso sem expor o token", async () => {
    const response = await SELF.fetch("https://x.com/api/attendant/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      valid: true,
      attendant: {
        id: expect.any(String),
        name: "Equipe Portal",
        permissions: { canView: true, canReply: true, canHandoff: true },
      },
    });
    const row = await env.DB.prepare(
      "SELECT access_count,last_used_at FROM attendant_tokens WHERE token=?1",
    )
      .bind(token)
      .first<{ access_count: number; last_used_at: string | null }>();
    expect(row?.access_count).toBe(1);
    expect(row?.last_used_at).toBeTruthy();
  });
  it("lista conversas, abre histórico e registra handoff autorizado", async () => {
    const list = await SELF.fetch("https://x.com/api/attendant/conversations", {
      headers,
    });
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual(
      expect.objectContaining({
        conversations: expect.arrayContaining([
          expect.objectContaining({
            id: conversationId,
            contactName: "Cliente Portal",
            lastMessage: "Preciso de ajuda",
          }),
        ]),
      }),
    );
    const detail = await SELF.fetch(
      `https://x.com/api/attendant/conversations/${conversationId}`,
      { headers },
    );
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual(
      expect.objectContaining({
        permissions: { canView: true, canReply: true, canHandoff: true },
        messages: [expect.objectContaining({ text_body: "Preciso de ajuda" })],
      }),
    );
    expect(
      (
        await SELF.fetch(
          `https://x.com/api/attendant/conversations/${conversationId}/handoff`,
          { method: "POST", headers },
        )
      ).status,
    ).toBe(200);
    expect(
      await env.DB.prepare(
        "SELECT mode,handoff_reason FROM conversations WHERE id=?1",
      )
        .bind(conversationId)
        .first(),
    ).toEqual(
      expect.objectContaining({
        mode: "human",
        handoff_reason: "Assumido por Equipe Portal",
      }),
    );
  });
  it("nega token inválido e permissões insuficientes", async () => {
    expect(
      (
        await SELF.fetch("https://x.com/api/attendant/conversations", {
          headers: { "x-attendant-token": "invalid-token-ascii" },
        })
      ).status,
    ).toBe(401);
    await env.DB.prepare(
      "UPDATE attendant_tokens SET permissions_json=?1 WHERE token=?2",
    )
      .bind(
        JSON.stringify({ canView: false, canReply: false, canHandoff: false }),
        token,
      )
      .run();
    expect(
      (
        await SELF.fetch("https://x.com/api/attendant/conversations", {
          headers,
        })
      ).status,
    ).toBe(403);
  });
  it("bloqueia resposta fora da janela antes de chamar a Meta", async () => {
    await env.DB.prepare(
      "UPDATE conversation_messages SET meta_timestamp=?2 WHERE conversation_id=?1",
    )
      .bind(conversationId, Math.floor(Date.now() / 1000) - 25 * 60 * 60)
      .run();
    const response = await SELF.fetch(
      `https://x.com/api/attendant/conversations/${conversationId}/reply`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: "Posso ajudar?",
          requestKey: crypto.randomUUID(),
        }),
      },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "janela de atendimento de 24 horas encerrada",
    });
  });
});
