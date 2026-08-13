import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import {
  automationDebounceSeconds,
  automationPolicyDecision,
  processAutomationEvent,
} from "../src/ai/automation";
import { isAutomationQueue, processAutomationMessages } from "../src";

async function createConversation(mode = "bot", text = "Qual é o horário?") {
  const contactId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const sourceMessageId = crypto.randomUUID();
  const stamp = Math.floor(Date.now() / 1000);
  const unique = crypto
    .randomUUID()
    .replace(/\D/g, "")
    .padEnd(8, "7")
    .slice(0, 8);
  const waId = `55119${unique}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_global_enabled', 'true')",
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO knowledge_documents
       (id,name,mime_type,r2_key,checksum,ai_search_item_id,status)
       VALUES ('11111111-1111-4111-8111-111111111111','FAQ teste','text/plain',
       'knowledge/test/faq','0000000000000000000000000000000000000000000000000000000000000000',
       'item-test','ready')`,
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO ai_agent_documents(agent_id,document_id)
       VALUES('agent_commercial','11111111-1111-4111-8111-111111111111')`,
    ),
    env.DB.prepare(
      "INSERT INTO contacts (id, phone, wa_id, status) VALUES (?1, ?2, ?3, 'unknown')",
    ).bind(contactId, `+${waId}`, waId),
    env.DB.prepare(
      `INSERT INTO conversations
       (id, contact_id, wa_id, mode, status, ai_enabled, ai_agent_id)
       VALUES (?1, ?2, ?3, ?4, 'open', 1, 'agent_commercial')`,
    ).bind(conversationId, contactId, waId, mode),
    env.DB.prepare(
      `INSERT INTO conversation_messages
      (id, conversation_id, contact_id, direction, message_type, text_body, phone_number_id, meta_timestamp)
      VALUES (?1, ?2, ?3, 'inbound', 'text', ?4, '11111', ?5)`,
    ).bind(sourceMessageId, conversationId, contactId, text, stamp),
  ]);
  return { conversationId, sourceMessageId, contactId };
}

describe("automação da Inbox", () => {
  it("responde estados canônicos sem depender do RAG", () => {
    expect(automationPolicyDecision(
      "Quais são os status exatos: aceita pela Meta, entregue, lida ou falha?",
    )).toMatchObject({
      text: expect.stringContaining("sent = aceita pela Meta"),
      handoffReason: null,
    });
    expect(automationPolicyDecision(
      "HTTP 200 quer dizer que a mensagem foi entregue e lida?",
    )).toMatchObject({
      text: expect.stringMatching(/sent.*delivered.*read.*failed/),
      handoffReason: null,
    });
    expect(automationPolicyDecision(
      "Reteste após correção: quais são os quatro nomes exatos dos status de mensagem no SmartZap?",
    )).toMatchObject({
      text: expect.stringMatching(/sent.*delivered.*read.*failed/),
      handoffReason: null,
    });
    expect(automationPolicyDecision(
      "Quanto custa e em quanto tempo vocês implantam? Quero uma proposta.",
    )).toMatchObject({
      text: expect.stringContaining("time comercial"),
      handoffReason: "Cliente solicitou preço, prazo ou proposta comercial",
    });
    expect(automationPolicyDecision(
      "Quero falar com alguém do suporte humano.",
    )).toEqual({
      text: "Entendi. Vou encaminhar a conversa para uma pessoa responsável continuar o atendimento.",
      handoffReason: "Cliente solicitou atendimento humano",
    });
    expect(automationPolicyDecision(
      "Tenho uma lista com 2.000 contatos. Posso disparar para todos agora?",
    )).toMatchObject({
      text: expect.stringMatching(/opt-in.*consentimento.*segmento/),
      handoffReason: null,
    });
    expect(automationPolicyDecision(
      "Garanta no contrato que nunca haverá indisponibilidade.",
    )).toMatchObject({
      text: expect.stringMatching(/N[aã]o.*contrato.*pessoa/),
      handoffReason: "Cliente solicitou garantia absoluta de disponibilidade",
    });
    expect(automationPolicyDecision(
      "Garanta no contrato que nunca haverá indisponibilidade.",
      false,
    )).toMatchObject({
      text: expect.stringMatching(/N[aã]o.*contrato.*pessoa/),
      handoffReason: null,
    });
  });

  it("envia a confirmação comercial e muda a conversa para humano", async () => {
    const { conversationId, sourceMessageId } = await createConversation(
      "bot",
      "Quanto custa para 2.000 contatos? Quero contratar e preciso de proposta.",
    );
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR REPLACE INTO settings (key,value) VALUES ('whatsapp_phone_id','11111')",
      ),
      env.DB.prepare(
        "INSERT OR REPLACE INTO settings (key,value) VALUES ('whatsapp_waba_id','22222')",
      ),
    ]);
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      messages: [{ id: "wamid.automation.handoff" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await processAutomationEvent(
        {
          ...env,
          AI_ENABLED: "true",
          AI_MODEL: "@cf/meta/llama-3.2-3b-instruct",
          INBOX_AUTOMATION_ENABLED: "true",
          AI: { run: async () => { throw new Error("não deve chamar o modelo"); } },
        } as unknown as Env,
        { kind: "inbound_automation", conversationId, sourceMessageId },
      );
      expect(result).toBe("sent");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(payload.text.body).toContain("preparar a proposta");
      expect(
        await env.DB.prepare(
          "SELECT mode,handoff_reason FROM conversations WHERE id=?1",
        ).bind(conversationId).first(),
      ).toEqual({
        mode: "human",
        handoff_reason: "Cliente solicitou preço, prazo ou proposta comercial",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("usa o debounce do agente vinculado e arredonda para a Queue", async () => {
    const { conversationId } = await createConversation();
    const agentId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO ai_agents
         (id,name,description,instructions,active,is_default,debounce_ms)
         VALUES (?1,'Agente rápido','','Responda com precisão.',1,0,3200)`,
      ).bind(agentId),
      env.DB.prepare("UPDATE conversations SET ai_agent_id=?2 WHERE id=?1")
        .bind(conversationId, agentId),
    ]);
    expect(await automationDebounceSeconds(env.DB, conversationId)).toBe(4);
  });
  it("devolve ao bot quando o timeout do modo humano expira", async () => {
    const { conversationId, sourceMessageId } =
      await createConversation("human");
    await env.DB.prepare(
      "UPDATE conversations SET human_mode_expires_at = ?2 WHERE id = ?1",
    )
      .bind(conversationId, Math.floor(Date.now() / 1000) - 60)
      .run();
    expect(
      await processAutomationEvent(
        {
          ...env,
          INBOX_AUTOMATION_ENABLED: "true",
          AI_ENABLED: "false",
        } as Env,
        { kind: "inbound_automation", conversationId, sourceMessageId },
      ),
    ).toBe("skipped");
    expect(
      await env.DB.prepare(
        "SELECT mode, human_mode_expires_at FROM conversations WHERE id = ?1",
      )
        .bind(conversationId)
        .first(),
    ).toMatchObject({ mode: "bot", human_mode_expires_at: null });
  });

  it("kill switch impede qualquer execução antes de consultar IA", async () => {
    const { conversationId, sourceMessageId } = await createConversation();
    const result = await processAutomationEvent(
      { ...env, INBOX_AUTOMATION_ENABLED: "false" } as Env,
      {
        kind: "inbound_automation",
        conversationId,
        sourceMessageId,
      },
    );
    expect(result).toBe("skipped");
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM ai_drafts WHERE conversation_id = ?1",
        )
          .bind(conversationId)
          .first<{ n: number }>()
      )?.n,
    ).toBe(0);
  });

  it("chave global da tela impede a automação autônoma", async () => {
    const { conversationId, sourceMessageId } = await createConversation();
    await env.DB.prepare(
      "UPDATE settings SET value='false' WHERE key='ai_global_enabled'",
    ).run();
    try {
      const result = await processAutomationEvent(
        { ...env, INBOX_AUTOMATION_ENABLED: "true" } as Env,
        { kind: "inbound_automation", conversationId, sourceMessageId },
      );
      expect(result).toBe("skipped");
      expect(
        await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM ai_drafts WHERE conversation_id=?1",
        ).bind(conversationId).first<{ n: number }>(),
      ).toEqual({ n: 0 });
    } finally {
      await env.DB.prepare(
        "UPDATE settings SET value='true' WHERE key='ai_global_enabled'",
      ).run();
    }
  });

  it("agente desativado não responde a conversas já atribuídas", async () => {
    const { conversationId, sourceMessageId } = await createConversation();
    await env.DB.prepare(
      "UPDATE ai_agents SET active=0 WHERE id='agent_commercial'",
    ).run();
    try {
      const result = await processAutomationEvent(
        { ...env, INBOX_AUTOMATION_ENABLED: "true" } as Env,
        { kind: "inbound_automation", conversationId, sourceMessageId },
      );
      expect(result).toBe("skipped");
      expect(
        await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM ai_drafts WHERE conversation_id=?1",
        ).bind(conversationId).first<{ n: number }>(),
      ).toEqual({ n: 0 });
    } finally {
      await env.DB.prepare(
        "UPDATE ai_agents SET active=1 WHERE id='agent_commercial'",
      ).run();
    }
  });

  it("aplica à automação a mesma cota horária dos rascunhos humanos", async () => {
    const { conversationId, sourceMessageId } = await createConversation();
    await env.DB.prepare(
      `INSERT INTO ai_drafts
       (id,request_key,conversation_id,source_message_id,status,model,prompt_version)
       VALUES (?1,?2,?3,?4,'approved','modelo-teste','v1')`,
    ).bind(
      crypto.randomUUID(),
      `manual:${crypto.randomUUID()}`,
      conversationId,
      sourceMessageId,
    ).run();
    let searchCalled = false;
    let modelCalled = false;
    const result = await processAutomationEvent(
      {
        ...env,
        AI: {
          run: async () => {
            modelCalled = true;
            throw new Error("a cota deve bloquear antes do provider");
          },
        },
        AI_ENABLED: "true",
        AI_MODEL: "@cf/meta/llama-3.2-3b-instruct",
        INBOX_AUTOMATION_ENABLED: "true",
        AI_MAX_DRAFTS_PER_CONVERSATION_HOUR: "1",
        AI_SEARCH: {
          create: async () => ({
            items: { upload: async () => ({}), delete: async () => {} },
            search: async () => { searchCalled = true; return { chunks: [] }; },
          }),
          get: () => ({
            items: { upload: async () => ({}), delete: async () => {} },
            search: async () => { searchCalled = true; return { chunks: [] }; },
          }),
        },
      } as unknown as Env,
      { kind: "inbound_automation", conversationId, sourceMessageId },
    );
    expect(result).toBe("skipped");
    expect(searchCalled).toBe(false);
    expect(modelCalled).toBe(false);
    expect(
      await env.DB.prepare(
        "SELECT status,error_code FROM ai_drafts WHERE request_key=?1",
      ).bind(`auto:${sourceMessageId}`).first(),
    ).toMatchObject({ status: "failed", error_code: "rate_limited" });
  });

  it("sem fonte relevante faz handoff sem chamar o modelo ou enviar mensagem", async () => {
    const { conversationId, sourceMessageId } = await createConversation();
    const aiSearch = {
      create: async () => ({
        items: { upload: async () => ({}), delete: async () => {} },
        search: async () => ({ chunks: [] }),
      }),
      get: () => ({
        items: { upload: async () => ({}), delete: async () => {} },
        search: async () => ({ chunks: [] }),
      }),
    };
    const result = await processAutomationEvent(
      {
        ...env,
        AI_ENABLED: "true",
        AI_MODEL: "@cf/meta/llama-3.2-3b-instruct",
        INBOX_AUTOMATION_ENABLED: "true",
        AI_SEARCH: aiSearch,
        AI: {
          run: async () => {
            throw new Error("não deveria chamar modelo");
          },
        },
      } as unknown as Env,
      {
        kind: "inbound_automation",
        conversationId,
        sourceMessageId,
      },
    );
    expect(result).toBe("skipped");
    expect(
      await env.DB.prepare(
        "SELECT mode, handoff_reason FROM conversations WHERE id = ?1",
      )
        .bind(conversationId)
        .first(),
    ).toMatchObject({
      mode: "human",
      handoff_reason: "Base de conhecimento sem resposta relevante",
    });
    // O banco de testes é compartilhado entre arquivos quando --no-isolate está
    // ativo; a garantia relevante é não existir envio desta conversa, não do
    // banco inteiro (que pode conter cenários anteriores válidos).
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM conversation_draft_sends WHERE conversation_id = ?1",
        )
          .bind(conversationId)
          .first<{ n: number }>()
      )?.n,
    ).toBe(0);
  });

  it("inclui instruções do agente, memória revisada e fonte RAG no prompt automático", async () => {
    const { conversationId, sourceMessageId, contactId } =
      await createConversation();
    const agentId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO ai_agents (id,name,description,instructions,active,is_default)
         VALUES (?1,'Agente de Teste','','Nunca ofereça desconto sem aprovação.',1,0)`,
      ).bind(agentId),
      env.DB.prepare(
        "UPDATE conversations SET ai_agent_id=?2 WHERE id=?1",
      ).bind(conversationId, agentId),
      env.DB.prepare(
        `INSERT INTO ai_agent_documents(agent_id,document_id)
         VALUES(?1,'11111111-1111-4111-8111-111111111111')`,
      ).bind(agentId),
      env.DB.prepare(
        `INSERT INTO contact_memories (id,contact_id,summary)
         VALUES (?1,?2,'Cliente prefere contato no período da manhã.')`,
      ).bind(crypto.randomUUID(), contactId),
    ]);
    let modelInput: unknown;
    const search = async () => ({
      chunks: [{ text: "O horário oficial de atendimento é das 9h às 18h." }],
    });
    const aiSearch = {
      create: async () => ({
        items: { upload: async () => ({}), delete: async () => {} },
        search,
      }),
      get: () => ({
        items: { upload: async () => ({}), delete: async () => {} },
        search,
      }),
    };
    await processAutomationEvent(
      {
        ...env,
        AI_ENABLED: "true",
        AI_MODEL: "@cf/meta/llama-3.2-3b-instruct",
        INBOX_AUTOMATION_ENABLED: "true",
        AI_SEARCH: aiSearch,
        AI: {
          run: async (_model: string, input: unknown) => {
            modelInput = input;
            return { response: "Atendemos das 9h às 18h." };
          },
        },
      } as Env,
      { kind: "inbound_automation", conversationId, sourceMessageId },
    );
    const serialized = JSON.stringify(modelInput);
    expect(serialized).toContain("Nunca ofereça desconto sem aprovação.");
    expect(serialized).toContain(
      "Cliente prefere contato no período da manhã.",
    );
    expect(serialized).toContain(
      "O horário oficial de atendimento é das 9h às 18h.",
    );
  });
});

describe("consumo individual da Queue de automação", () => {
  it("usa o nome configurado para isolar a fila de staging", () => {
    expect(isAutomationQueue(
      { AUTOMATION_QUEUE_NAME: "inbox-automation-staging" },
      "inbox-automation-staging",
    )).toBe(true);
    expect(isAutomationQueue(
      { AUTOMATION_QUEUE_NAME: "inbox-automation-staging" },
      "inbox-automation",
    )).toBe(false);
    expect(isAutomationQueue({}, "inbox-automation")).toBe(true);
    expect(isAutomationQueue({}, "smartzap-a1b2c3d4-inbox-automation")).toBe(true);
    expect(isAutomationQueue({}, "outra-fila-inbox")).toBe(false);
  });

  it("faz retry somente do evento que falhou e confirma os demais", async () => {
    const first = {
      body: { kind: "inbound_automation" as const, conversationId: crypto.randomUUID(), sourceMessageId: crypto.randomUUID() },
      attempts: 2,
      ack: vi.fn(), retry: vi.fn(),
    };
    const second = {
      body: { kind: "inbound_automation" as const, conversationId: crypto.randomUUID(), sourceMessageId: crypto.randomUUID() },
      attempts: 1,
      ack: vi.fn(), retry: vi.fn(),
    };
    let calls = 0;
    await processAutomationMessages([first, second], env, async () => {
      calls += 1;
      if (calls === 1) throw new Error("falha transitória com token segredo");
    });
    expect(first.ack).not.toHaveBeenCalled();
    expect(first.retry).toHaveBeenCalledWith({ delaySeconds: 10 });
    expect(second.ack).toHaveBeenCalledOnce();
    expect(second.retry).not.toHaveBeenCalled();
  });
});
