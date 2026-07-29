import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMetaFlowJson } from "../src/whatsapp/flows";
const AUTH = { "x-api-key": "dev-api-key", "content-type": "application/json" };
afterEach(() => vi.unstubAllGlobals());
describe("MiniApps e formulários", () => {
  it("configura no app da Meta todos os campos de webhook necessários para Pricing e Flows", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO settings(key,value)VALUES('whatsapp_phone_id','11111') ON CONFLICT(key) DO UPDATE SET value='11111'",
      ),
      env.DB.prepare(
        "INSERT INTO settings(key,value)VALUES('whatsapp_waba_id','22222') ON CONFLICT(key) DO UPDATE SET value='22222'",
      ),
    ]);
    const replies = [
      { success: true },
      { id: "11111", status: "CONNECTED", platform_type: "CLOUD_API", account_mode: "LIVE", quality_rating: "GREEN", throughput: { level: "STANDARD" }, code_verification_status: "VERIFIED", whatsapp_business_manager_messaging_limit: "TIER_100K", webhook_configuration: { application: "123456789" } },
      { id: "22222" },
      { data: [{ id: "11111" }] },
      { data: [{ whatsapp_business_api_data: { id: "123456789" } }] },
      { data: { is_valid: true, app_id: "123456789", type: "SYSTEM_USER", scopes: ["whatsapp_business_management", "whatsapp_business_messaging"] } },
      { data: [{ object: "whatsapp_business_account", active: true, callback_url: "https://worker.example/webhook", fields: ["messages", "flows", "account_update", "template_category_update"] }] },
    ];
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify(replies[fetchMock.mock.calls.length - 1]), { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const response = await SELF.fetch("https://x.com/api/flows/meta/webhook-subscription", {
      method: "POST", headers: AUTH, body: "{}",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, flowsSubscribed: true });
    const subscription = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(subscription[0]).toBe("https://graph.facebook.com/v25.0/123456789/subscriptions");
    const body = new URLSearchParams(String(subscription[1].body));
    expect(body.get("fields")?.split(",")).toEqual(expect.arrayContaining([
      "messages", "flows", "account_update", "template_category_update",
      "phone_number_quality_update", "business_capability_update",
      "message_template_quality_update", "business_username_updates",
    ]));
    expect(String(subscription[1].headers)).not.toContain("dev-meta-secret");
  });
  it("converte IDs locais em Flow JSON válido e mantém a navegação", () => {
    expect(
      buildMetaFlowJson({
        version: "7.3",
        screens: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            title: "Boas-vindas",
            text: "Olá",
            buttonText: "Continuar",
            final: false,
            next: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          },
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            title: "Final",
            text: "Tudo certo",
            buttonText: "Concluir",
            final: true,
            next: null,
          },
        ],
      }),
    ).toEqual({
      version: "7.3",
      screens: [
        expect.objectContaining({
          id: "SCREEN_A",
          terminal: false,
          layout: expect.objectContaining({
            children: expect.arrayContaining([
              expect.objectContaining({
                type: "Footer",
                  "on-click-action": {
                    name: "navigate",
                    next: { type: "screen", name: "SCREEN_B" },
                    payload: {},
                  },
              }),
            ]),
          }),
        }),
        expect.objectContaining({
          id: "SCREEN_B",
          terminal: true,
          layout: expect.objectContaining({
            children: expect.arrayContaining([
              expect.objectContaining({
                "on-click-action": { name: "complete", payload: { flow_completed: true } },
              }),
            ]),
          }),
        }),
      ],
    });
  });

  it("publica blocos editáveis no contrato de componentes da Meta", () => {
    const json = buildMetaFlowJson({
      screens: [
        {
          id: crypto.randomUUID(),
          title: "Cadastro",
          final: true,
          buttonText: "Enviar",
          blocks: [
            { id: "ui-1", type: "TextHeading", text: "Seus dados" },
            {
              id: "ui-2",
              type: "TextInput",
              name: "email",
              label: "Seu e-mail",
              required: true,
              inputType: "email",
            },
            {
              id: "ui-3",
              type: "Dropdown",
              name: "interesse",
              label: "Interesse",
              options: [{ id: "curso", title: "Curso" }],
            },
          ],
        },
      ],
    });
    const layoutChildren = (
      (json.screens as Array<Record<string, unknown>>)[0].layout as {
        children: Array<Record<string, unknown>>;
      }
    ).children;
    expect(layoutChildren[0]).toMatchObject({ type: "Form", name: "form_screen_a" });
    const children = layoutChildren[0].children as Array<Record<string, unknown>>;
    expect(children).toEqual(
      expect.arrayContaining([
        { type: "TextHeading", text: "Seus dados" },
        {
          type: "TextInput",
          name: "email",
          label: "Seu e-mail",
          required: true,
          "input-type": "email",
        },
        {
          type: "Dropdown",
          name: "interesse",
          label: "Interesse",
          required: false,
          "data-source": [{ id: "curso", title: "Curso" }],
        },
      ]),
    );
    expect(JSON.stringify(json)).not.toContain("ui-1");
  });

  it("envia um MiniApp publicado e abre uma submissão rastreável", async () => {
    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR REPLACE INTO settings(key,value)VALUES('whatsapp_phone_id','11111')",
      ),
      env.DB.prepare(
        "INSERT OR REPLACE INTO settings(key,value)VALUES('whatsapp_waba_id','22222')",
      ),
      env.DB.prepare(
        `INSERT INTO flows
         (id,name,status,meta_status,meta_id,definition_json,local_revision,synced_revision)
         VALUES(?1,'Teste Flow','PUBLISHED','PUBLISHED','987654321',?2,1,1)`,
      ).bind(
        id,
        JSON.stringify({
          screens: [{ id: "start", title: "Início", final: true }],
        }),
      ),
    ]);
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ id: "wamid.flow-test" }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await SELF.fetch(`https://x.com/api/flows/${id}/send`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        to: "+5511987654321",
        body: "Vamos começar?",
        ctaText: "Abrir",
      }),
    });
    expect(response.status).toBe(200);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(call[1].body));
    expect(payload).toEqual(
      expect.objectContaining({
        type: "interactive",
        interactive: expect.objectContaining({
          type: "flow",
          action: expect.objectContaining({
            parameters: expect.objectContaining({
              flow_id: "987654321",
              flow_action: "navigate",
              flow_token: expect.stringMatching(/^smartzap:987654321:/),
            }),
          }),
        }),
      }),
    );
    const submission = await env.DB.prepare(
      "SELECT message_id,status,flow_local_id FROM flow_submissions WHERE message_id='wamid.flow-test'",
    ).first<{ message_id: string; status: string; flow_local_id: string }>();
    expect(submission).toEqual({
      message_id: "wamid.flow-test",
      status: "sent",
      flow_local_id: id,
    });
  });

  it("publica MiniApp na Meta, preserva preview e status", async () => {
    await env.DB.prepare(
      "INSERT INTO settings(key,value)VALUES('whatsapp_phone_id','11111') ON CONFLICT(key) DO UPDATE SET value='11111'",
    ).run();
    await env.DB.prepare(
      "INSERT INTO settings(key,value)VALUES('whatsapp_waba_id','22222') ON CONFLICT(key) DO UPDATE SET value='22222'",
    ).run();
    const created = await SELF.fetch("https://x.com/api/flows", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        name: "Captação Meta",
        definition: {
          version: "7.3",
          screens: [
            {
              id: crypto.randomUUID(),
              title: "Início",
              text: "Olá",
              buttonText: "Concluir",
              final: true,
              next: null,
            },
          ],
        },
      }),
    });
    const flow = (await created.json()) as { id: string };
    const metaReplies = [
      { id: "987654321", success: true },
      {
        id: "987654321",
        status: "DRAFT",
        validation_errors: [],
      },
      { success: true },
      {
        id: "987654321",
        status: "PUBLISHED",
        validation_errors: [],
      },
      {
        id: "987654321",
        preview: {
          preview_url: "https://business.facebook.com/wa/manage/flows/preview",
        },
      },
    ];
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(metaReplies[fetchMock.mock.calls.length - 1]), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await SELF.fetch(
      `https://x.com/api/flows/${flow.id}/meta/publish`,
      {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({ publish: true }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        ok: true,
        item: expect.objectContaining({
          meta_id: "987654321",
          status: "PUBLISHED",
          meta_preview_url:
            "https://business.facebook.com/wa/manage/flows/preview",
        }),
      }),
    );
    const createCall = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(createCall[0]).toBe(
      "https://graph.facebook.com/v25.0/22222/flows",
    );
    const body = JSON.parse(String(createCall[1].body));
    expect(body.publish).toBe(false);
    expect(JSON.parse(body.flow_json)).toEqual(
      expect.objectContaining({
        version: "7.3",
        screens: [expect.objectContaining({ id: "SCREEN_A" })],
      }),
    );
    expect(String(createCall[1].headers)).not.toContain("test-whatsapp-token");
  });
  it("recusa MiniApp sem tela antes de chamar a Meta", async () => {
    await env.DB.prepare(
      "INSERT INTO settings(key,value)VALUES('whatsapp_phone_id','11111') ON CONFLICT(key) DO UPDATE SET value='11111'",
    ).run();
    await env.DB.prepare(
      "INSERT INTO settings(key,value)VALUES('whatsapp_waba_id','22222') ON CONFLICT(key) DO UPDATE SET value='22222'",
    ).run();
    const created = await SELF.fetch("https://x.com/api/flows", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ name: "MiniApp inválido", definition: {} }),
    });
    const flow = (await created.json()) as { id: string };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await SELF.fetch(
      `https://x.com/api/flows/${flow.id}/meta/publish`,
      {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({ publish: true }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: "O MiniApp precisa ter ao menos uma tela" }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("preserva a rejeição da Meta e não publica o MiniApp inválido", async () => {
    await env.DB.prepare(
      "INSERT INTO settings(key,value)VALUES('whatsapp_phone_id','11111') ON CONFLICT(key) DO UPDATE SET value='11111'",
    ).run();
    await env.DB.prepare(
      "INSERT INTO settings(key,value)VALUES('whatsapp_waba_id','22222') ON CONFLICT(key) DO UPDATE SET value='22222'",
    ).run();
    const created = await SELF.fetch("https://x.com/api/flows", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        name: "Contrato Meta inválido",
        definition: {
          version: "7.3",
          screens: [
            {
              id: crypto.randomUUID(),
              title: "Início",
              text: "Olá",
              buttonText: "Concluir",
              final: true,
              next: null,
            },
          ],
        },
      }),
    });
    const flow = (await created.json()) as { id: string };
    const metaReplies = [
      { id: "987654322", success: true },
      {
        id: "987654322",
        status: "DRAFT",
        validation_errors: [{ error: "Campo obrigatório ausente" }],
      },
    ];
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(metaReplies[fetchMock.mock.calls.length - 1]), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await SELF.fetch(
      `https://x.com/api/flows/${flow.id}/meta/publish`,
      {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({ publish: true }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: "A Meta rejeitou o Flow JSON durante a validação",
        metaId: "987654322",
        validationErrors: [{ error: "Campo obrigatório ausente" }],
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      await env.DB.prepare("SELECT status,meta_id FROM flows WHERE id=?1")
        .bind(flow.id)
        .first(),
    ).toEqual({ status: "ACTION_REQUIRED", meta_id: "987654322" });
  });
  it("cria, edita, lista e exclui MiniApp", async () => {
    const created = await SELF.fetch("https://x.com/api/flows", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ name: "Qualificação de lead" }),
    });
    expect(created.status).toBe(201);
    const flow = (await created.json()) as { id: string };
    const definition = {
      version: "7.3",
      screens: [
        {
          id: "inicio",
          title: "Início",
          final: true,
          text: "Olá",
          buttonText: "Concluir",
          next: null,
        },
      ],
    };
    const edited = await SELF.fetch(`https://x.com/api/flows/${flow.id}`, {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({ name: "Qualificação atualizada", definition }),
    });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toEqual(
      expect.objectContaining({ name: "Qualificação atualizada", definition }),
    );
    const detail = await SELF.fetch(`https://x.com/api/flows/${flow.id}`, {
      headers: AUTH,
    });
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual(
      expect.objectContaining({
        id: flow.id,
        name: "Qualificação atualizada",
        definition,
      }),
    );
    expect(
      (
        (await (
          await SELF.fetch("https://x.com/api/flows", { headers: AUTH })
        ).json()) as { items: Array<{ id: string }> }
      ).items,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: flow.id })]),
    );
    expect(
      (
        await SELF.fetch(`https://x.com/api/flows/${flow.id}`, {
          method: "DELETE",
          headers: AUTH,
        })
      ).status,
    ).toBe(200);
  });
  it("editar MiniApp publicado cria revisão local DRAFT sem perder a versão Meta", async () => {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO flows
       (id,name,status,meta_status,meta_id,definition_json,local_revision,synced_revision)
       VALUES(?1,'Publicado','PUBLISHED','PUBLISHED','9988770011',?2,1,1)`,
    ).bind(id, JSON.stringify({ screens: [{ id: 'old', final: true }] })).run();
    const definition = {
      screens: [{ id: 'new', title: 'Nova revisão', final: true }],
    };
    const response = await SELF.fetch(`https://x.com/api/flows/${id}`, {
      method: 'PATCH', headers: AUTH,
      body: JSON.stringify({ name: 'Publicado editado', definition }),
    });
    expect(response.status).toBe(200);
    const stored = await env.DB.prepare(
      `SELECT status,meta_status,meta_id,local_revision,synced_revision
       FROM flows WHERE id=?1`,
    ).bind(id).first();
    expect(stored).toEqual({
      status: 'DRAFT', meta_status: 'PUBLISHED', meta_id: '9988770011',
      local_revision: 2, synced_revision: 1,
    });
  });
  it("clona a versão publicada imutável, publica a revisão e preserva o histórico", async () => {
    await env.DB.prepare(
      "INSERT INTO settings(key,value)VALUES('whatsapp_phone_id','11111') ON CONFLICT(key) DO UPDATE SET value='11111'",
    ).run();
    await env.DB.prepare(
      "INSERT INTO settings(key,value)VALUES('whatsapp_waba_id','22222') ON CONFLICT(key) DO UPDATE SET value='22222'",
    ).run();
    const id = crypto.randomUUID();
    const oldMetaId = "7766554400";
    await env.DB.prepare(
      `INSERT INTO flows
       (id,name,status,meta_status,meta_id,published_meta_id,definition_json,local_revision,synced_revision,published_revision)
       VALUES(?1,'Revisão oficial','DRAFT','PUBLISHED',?2,?2,?3,2,1,1)`,
    ).bind(id, oldMetaId, JSON.stringify({
      screens: [{ id: "new", title: "Nova", final: true, buttonText: "Concluir" }],
    })).run();
    const replies = [
      { id: oldMetaId, status: "PUBLISHED", validation_errors: [] },
      { id: "7766554401" },
      { success: true },
      { success: true, validation_errors: [] },
      { id: "7766554401", status: "DRAFT", validation_errors: [] },
      { success: true },
      { id: "7766554401", status: "PUBLISHED", validation_errors: [] },
      { id: "7766554401", preview: { preview_url: "https://example.com/preview" } },
    ];
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify(replies[fetchMock.mock.calls.length - 1]), { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const response = await SELF.fetch(`https://x.com/api/flows/${id}/meta/publish`, {
      method: "POST", headers: AUTH, body: JSON.stringify({ publish: true }),
    });
    expect(response.status).toBe(200);
    const cloneBody = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(cloneBody).toMatchObject({ clone_flow_id: oldMetaId, publish: false });
    expect(cloneBody).not.toHaveProperty("flow_json");
    const draftUpdateBody = JSON.parse(String((fetchMock.mock.calls[2] as unknown as [string, RequestInit])[1].body));
    expect(draftUpdateBody.name).toMatch(/^Revisão oficial #r2-[0-9a-f]{8}$/);
    expect(await env.DB.prepare(
      "SELECT meta_id,published_meta_id,status,local_revision,synced_revision,published_revision FROM flows WHERE id=?1",
    ).bind(id).first()).toEqual({
      meta_id: "7766554401", published_meta_id: "7766554401", status: "PUBLISHED",
      local_revision: 2, synced_revision: 2, published_revision: 2,
    });
    expect(await env.DB.prepare(
      "SELECT meta_flow_id,replaced_by_meta_flow_id FROM flow_meta_versions WHERE flow_local_id=?1",
    ).bind(id).first()).toEqual({ meta_flow_id: oldMetaId, replaced_by_meta_flow_id: "7766554401" });
  });
  it("publica um draft Meta existente sem reutilizar o nome do Flow anterior", async () => {
    await env.DB.prepare(
      "INSERT INTO settings(key,value)VALUES('whatsapp_phone_id','11111') ON CONFLICT(key) DO UPDATE SET value='11111'",
    ).run();
    await env.DB.prepare(
      "INSERT INTO settings(key,value)VALUES('whatsapp_waba_id','22222') ON CONFLICT(key) DO UPDATE SET value='22222'",
    ).run();
    const id = crypto.randomUUID();
    const draftMetaId = "7766554412";
    await env.DB.prepare(
      `INSERT INTO flows
       (id,name,status,meta_status,meta_id,published_meta_id,definition_json,local_revision,synced_revision,published_revision)
       VALUES(?1,'Revisão publicada','DRAFT','DRAFT',?2,'7766554400',?3,2,2,1)`,
    ).bind(id, draftMetaId, JSON.stringify({
      screens: [{ id: "draft", title: "Draft", final: true }],
    })).run();
    const replies = [
      { id: draftMetaId, status: "DRAFT", validation_errors: [] },
      { success: true },
      { success: true, validation_errors: [] },
      { id: draftMetaId, status: "DRAFT", validation_errors: [] },
      { success: true },
      { id: draftMetaId, status: "PUBLISHED", validation_errors: [] },
      { id: draftMetaId, preview: { preview_url: "https://example.com/draft-preview" } },
    ];
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify(replies[fetchMock.mock.calls.length - 1]), { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const response = await SELF.fetch(`https://x.com/api/flows/${id}/meta/publish`, {
      method: "POST", headers: AUTH, body: JSON.stringify({ publish: true }),
    });
    expect(response.status).toBe(200);
    const updateBody = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(updateBody.name).toMatch(/^Revisão publicada #r2-[0-9a-f]{8}$/);
    expect(await env.DB.prepare(
      "SELECT meta_id,meta_status,status,published_meta_id,published_revision FROM flows WHERE id=?1",
    ).bind(id).first()).toEqual({
      meta_id: draftMetaId, meta_status: "PUBLISHED", status: "PUBLISHED",
      published_meta_id: draftMetaId, published_revision: 2,
    });
  });
  it("publica formulário, capta contato e registra submissão", async () => {
    const slug = `diagnostico-${crypto.randomUUID().slice(0, 8)}`;
    const created = await SELF.fetch("https://x.com/api/forms", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        title: "Diagnóstico gratuito",
        slug,
        active: true,
        fields: [
          { key: "name", label: "Nome", required: true },
          { key: "phone", label: "WhatsApp", required: true },
        ],
      }),
    });
    expect(created.status).toBe(201);
    expect(
      (await SELF.fetch(`https://x.com/api/public/forms/${slug}`)).status,
    ).toBe(200);
    const submitted = await SELF.fetch(
      `https://x.com/api/public/forms/${slug}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Pessoa Teste",
          phone: `+55219${Date.now().toString().slice(-8)}`,
          email: "pessoa.teste@example.com",
          optInConfirmed: true,
          values: { origem: "e2e", email: "pessoa.teste@example.com" },
        }),
      },
    );
    expect(submitted.status).toBe(201);
    expect(await submitted.json()).toEqual({ ok: true });
    const contact = await env.DB.prepare(
      "SELECT email,status FROM contacts WHERE email=?1",
    )
      .bind("pessoa.teste@example.com")
      .first();
    expect(contact).toEqual({
      email: "pessoa.teste@example.com",
      status: "opt_in",
    });
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) total FROM consent_events WHERE contact_id=(SELECT id FROM contacts WHERE email=?1)",
      )
        .bind("pessoa.teste@example.com")
        .first(),
    ).toEqual({ total: 1 });
    const rejectedWithoutConsent = await SELF.fetch(
      `https://x.com/api/public/forms/${slug}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Sem consentimento",
          phone: "+5521999990000",
          values: {},
        }),
      },
    );
    expect(rejectedWithoutConsent.status).toBe(400);
  });
  it("mantém projeto e templates editáveis no detalhe", async () => {
    const created = await SELF.fetch("https://x.com/api/template-projects", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        title: "Campanha de julho",
        strategy: "marketing",
        source: "manual",
      }),
    });
    expect(created.status).toBe(201);
    const project = (await created.json()) as { id: string };
    const itemCreated = await SELF.fetch(
      `https://x.com/api/template-projects/${project.id}/items`,
      {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({
          name: "convite_lancamento",
          content: "Olá {{1}}",
          language: "pt_BR",
          category: "MARKETING",
          variables: { "1": "nome" },
        }),
      },
    );
    expect(itemCreated.status).toBe(201);
    const item = (await itemCreated.json()) as { id: string };
    const edited = await SELF.fetch(
      `https://x.com/api/template-projects/items/${item.id}`,
      {
        method: "PATCH",
        headers: AUTH,
        body: JSON.stringify({
          name: "convite_lancamento",
          content: "Olá {{1}}, temos uma novidade.",
          language: "pt_BR",
          category: "MARKETING",
          variables: { "1": "nome" },
        }),
      },
    );
    expect(edited.status).toBe(200);
    const detail = await SELF.fetch(
      `https://x.com/api/template-projects/${project.id}`,
      { headers: AUTH },
    );
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual(
      expect.objectContaining({
        id: project.id,
        template_count: 1,
        items: [
          expect.objectContaining({
            id: item.id,
            content: "Olá {{1}}, temos uma novidade.",
            variables: { "1": "nome" },
          }),
        ],
      }),
    );
    expect(
      (
        await SELF.fetch(
          `https://x.com/api/template-projects/items/${item.id}`,
          { method: "DELETE", headers: AUTH },
        )
      ).status,
    ).toBe(200);
  });
  it("salva geração revisada em lote de forma atômica", async () => {
    const response = await SELF.fetch(
      "https://x.com/api/template-projects/save-generated",
      {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({
          title: "Projeto gerado",
          strategy: "utility",
          prompt: "Gere lembretes",
          items: [
            {
              name: "lembrete_teste",
              content: "Olá {{1}}, sua aula começa às {{2}}.",
              language: "pt_BR",
              category: "UTILITY",
              variables: { "1": "nome", "2": "horário" },
            },
          ],
        }),
      },
    );
    expect(response.status).toBe(201);
    const project = (await response.json()) as { id: string };
    const detail = (await (
      await SELF.fetch(`https://x.com/api/template-projects/${project.id}`, {
        headers: AUTH,
      })
    ).json()) as {
      source: string;
      template_count: number;
      items: Array<{ name: string }>;
    };
    expect(detail).toEqual(
      expect.objectContaining({
        source: "ai",
        template_count: 1,
        items: [expect.objectContaining({ name: "lembrete_teste" })],
      }),
    );
  });
  it("protege envio e sincronização de projeto sem seleção ou credenciais válidas", async () => {
    const created = await SELF.fetch("https://x.com/api/template-projects", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        title: "Projeto protegido",
        strategy: "utility",
        source: "manual",
      }),
    });
    const project = (await created.json()) as { id: string };
    const noSelection = await SELF.fetch(
      `https://x.com/api/template-projects/${project.id}/submit`,
      {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({ itemIds: [crypto.randomUUID()] }),
      },
    );
    expect(noSelection.status).toBe(409);
    expect(await noSelection.json()).toEqual({
      error: "nenhum rascunho selecionado",
    });

    await env.DB.prepare("DELETE FROM settings WHERE key IN ('whatsapp_phone_id','whatsapp_waba_id')").run();

    const sync = await SELF.fetch(
      `https://x.com/api/template-projects/${project.id}/sync`,
      { method: "POST", headers: AUTH },
    );
    expect(sync.status).toBe(400);
    expect(await sync.json()).toEqual({
      error: "credenciais Meta não configuradas",
    });
  });
  it("exporta submissões de Forms junto com MiniApps", async () => {
    const formId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO lead_forms(id,title,slug)VALUES(?1,?2,?3)")
      .bind(formId, "Formulário CSV", `csv-${formId}`).run();
    await env.DB.prepare("INSERT INTO lead_form_submissions(id,form_id,payload_json)VALUES(?1,?2,?3)")
      .bind(submissionId, formId, JSON.stringify({ values: { nome: "Ana" } })).run();
    const response = await SELF.fetch("https://x.com/api/submissions/export.csv?q=Formulário%20CSV", { headers: AUTH });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("submissoes-smartzap.csv");
    const csv = await response.text();
    expect(csv).toContain('"origem"');
    expect(csv).toContain('"formulario_ou_miniapp"');
    expect(csv).toContain('"Form"');
    expect(csv).toContain('"Formulário CSV"');
    expect(csv).toContain(submissionId);
  });
  it("identifica e filtra a origem das submissões sem misturar Form e MiniApp", async () => {
    const formId = crypto.randomUUID();
    const flowId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO lead_forms(id,title,slug)VALUES(?1,?2,?3)")
      .bind(formId, "Cadastro público", `cadastro-${formId}`).run();
    await env.DB.prepare("INSERT INTO lead_form_submissions(id,form_id,payload_json)VALUES(?1,?2,?3)")
      .bind(crypto.randomUUID(), formId, JSON.stringify({ values: { name: "Ana", email: "ana@example.test" } })).run();
    await env.DB.prepare("INSERT INTO flows(id,name,definition_json)VALUES(?1,?2,'{}')")
      .bind(flowId, "Pesquisa WhatsApp").run();
    await env.DB.prepare("INSERT INTO flow_submissions(id,flow_local_id,response_json,status)VALUES(?1,?2,?3,'completed')")
      .bind(crypto.randomUUID(), flowId, JSON.stringify({ score: 10 })).run();

    const formsResponse = await SELF.fetch("https://x.com/api/submissions?source=form", { headers: AUTH });
    expect(formsResponse.status).toBe(200);
    const forms = await formsResponse.json() as { items: Array<{ source: string; form_title: string; payload: { values: Record<string, string> } }> };
    expect(forms.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "form", form_title: "Cadastro público", payload: { values: expect.objectContaining({ email: "ana@example.test" }) } }),
    ]));
    expect(forms.items.every((item) => item.source === "form")).toBe(true);

    const flowsResponse = await SELF.fetch("https://x.com/api/submissions?source=flow", { headers: AUTH });
    expect(flowsResponse.status).toBe(200);
    const flows = await flowsResponse.json() as { items: Array<{ source: string; form_title: string; payload: { values: Record<string, unknown> } }> };
    expect(flows.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "flow", form_title: "Pesquisa WhatsApp", payload: { values: { score: 10 } } }),
    ]));
    expect(flows.items.every((item) => item.source === "flow")).toBe(true);
  });
});
