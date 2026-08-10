import { describe, expect, it, vi, afterEach } from "vitest";
import { whatsappClient } from "../src/whatsapp/client";
import { mapWhatsAppError } from "../src/whatsapp/errors";
import { verifyMetaSignature } from "../src/whatsapp/webhook-verify";
import { probeMeta } from "../src/whatsapp/health";

afterEach(() => vi.unstubAllGlobals());

describe("whatsappClient.sendTemplate", () => {
  it("usa Graph v25 e preserva wamid, wa_id e pacing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              contacts: [{ wa_id: "5511999990001" }],
              messages: [
                {
                  id: "wamid.123",
                  message_status: "held_for_quality_assessment",
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );
    const client = whatsappClient({ token: "t", phoneId: "111" });
    const result = await client.sendTemplate("+5511999990001", {
      name: "promo",
      language: "pt_BR",
    });
    expect(result).toEqual({
      ok: true,
      messageId: "wamid.123",
      waId: "5511999990001",
      messageStatus: "held_for_quality_assessment",
    });
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("https://graph.facebook.com/v25.0/111/messages");
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({
      recipient_type: "individual",
    });
  });

  it("preserva details, fbtrace e Retry-After de erro Graph", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 130429,
                message: "(#130429) Rate limit hit",
                error_data: { details: "Cloud API throughput reached." },
                fbtrace_id: "TRACE_1",
              },
            }),
            { status: 429, headers: { "retry-after": "30" } },
          ),
      ),
    );
    const result = await whatsappClient({
      token: "t",
      phoneId: "111",
    }).sendTemplate("+5511999990001", { name: "promo", language: "pt_BR" });
    expect(result).toMatchObject({
      ok: false,
      code: 130429,
      detail: "Cloud API throughput reached.",
      httpStatus: 429,
      fbtraceId: "TRACE_1",
      retryAfterSeconds: 30,
      ambiguous: false,
    });
  });

  it("timeout e 5xx não estruturado viram resultado ambíguo, sem exception para retry cego", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("aborted", "AbortError"))
      .mockResolvedValueOnce(new Response("gateway timeout", { status: 504 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = whatsappClient({ token: "t", phoneId: "111" });
    expect(
      await client.sendTemplate("+5511999990001", {
        name: "promo",
        language: "pt_BR",
      }),
    ).toMatchObject({ ok: false, ambiguous: true, code: -1 });
    expect(
      await client.sendTemplate("+5511999990001", {
        name: "promo",
        language: "pt_BR",
      }),
    ).toMatchObject({ ok: false, ambiguous: true, httpStatus: 504 });
  });
});

describe("whatsappClient.sendText", () => {
  it("envia texto livre com identificador opaco e sem preview", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            messages: [{ id: "wamid.texto" }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const opaque = crypto.randomUUID();
    await expect(
      whatsappClient({ token: "t", phoneId: "111" }).sendText(
        "+5511999990001",
        " Olá! ",
        opaque,
      ),
    ).resolves.toMatchObject({ ok: true, messageId: "wamid.texto" });
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "+5511999990001",
      type: "text",
      text: { preview_url: false, body: "Olá!" },
      biz_opaque_callback_data: opaque,
    });
  });

  it("envia e reconhece resposta por BSUID quando o telefone não está disponível", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({
        contacts: [{ user_id: "US.13491208655302741918" }],
        messages: [{ id: "wamid.bsuid" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const opaque = crypto.randomUUID();
    const result = await whatsappClient({ token: "t", phoneId: "111" }).sendText(
      { userId: "US.13491208655302741918" },
      "Olá por BSUID",
      opaque,
    );
    expect(result).toMatchObject({
      ok: true,
      messageId: "wamid.bsuid",
      userId: "US.13491208655302741918",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      recipient: "US.13491208655302741918",
      type: "text",
    });
    expect(JSON.parse(String(init.body))).not.toHaveProperty("to");
  });

  it("rejeita corpo vazio, excessivo e identificador opaco inválido antes da rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = whatsappClient({ token: "t", phoneId: "111" });
    await expect(
      client.sendText("+5511999990001", " ", crypto.randomUUID()),
    ).rejects.toThrow("texto fora");
    await expect(
      client.sendText("+5511999990001", "x".repeat(4097), crypto.randomUUID()),
    ).rejects.toThrow("texto fora");
    await expect(
      client.sendText(
        "+5511999990001",
        "Olá",
        "00000000-0000-0000-0000-000000000000",
      ),
    ).rejects.toThrow("identificador opaco");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("whatsappClient mídia e interativos", () => {
  it("faz upload multipart autenticado e preserva o identificador da mídia", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toEqual({ authorization: "Bearer segredo" });
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      expect(form.get("messaging_product")).toBe("whatsapp");
      expect(form.get("type")).toBe("image/png");
      expect((form.get("file") as File).name).toBe("foto.png");
      return new Response(JSON.stringify({ id: "987654321" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(whatsappClient({ token: "segredo", phoneId: "111" }).uploadMedia({
      bytes: new Uint8Array([137, 80, 78, 71]).buffer,
      contentType: "image/png",
      filename: "foto.png",
    })).resolves.toEqual({ id: "987654321" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://graph.facebook.com/v25.0/111/media");
  });

  it("rejeita upload vazio, excessivo e MIME perigoso antes da rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = whatsappClient({ token: "t", phoneId: "111" });
    await expect(client.uploadMedia({ bytes: new ArrayBuffer(0), contentType: "image/png", filename: "x" }))
      .rejects.toThrow("mídia inválida");
    await expect(client.uploadMedia({ bytes: new ArrayBuffer(25 * 1024 * 1024 + 1), contentType: "image/png", filename: "x" }))
      .rejects.toThrow("grande demais");
    await expect(client.uploadMedia({ bytes: new Uint8Array([1]).buffer, contentType: "text/html", filename: "x.html" }))
      .rejects.toThrow("não permitido");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("materializa payloads oficiais com correlação opaca", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            messages: [{ id: `wamid.${fetchMock.mock.calls.length}` }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = whatsappClient({ token: "t", phoneId: "111" });
    const mediaId = crypto.randomUUID();
    await client.sendMedia(
      "+5511999990001",
      {
        type: "document",
        link: "https://cdn.example.com/manual.pdf",
        caption: "Manual",
        filename: "manual.pdf",
      },
      mediaId,
    );
    const interactiveId = crypto.randomUUID();
    await client.sendInteractive(
      "+5511999990001",
      {
        type: "button",
        body: { text: "Escolha" },
        action: {
          buttons: [{ type: "reply", reply: { id: "sim", title: "Sim" } }],
        },
      },
      interactiveId,
    );
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "+5511999990001",
      type: "document",
      document: {
        link: "https://cdn.example.com/manual.pdf",
        caption: "Manual",
        filename: "manual.pdf",
      },
      biz_opaque_callback_data: mediaId,
    });
    expect(JSON.parse(String(calls[1][1]?.body))).toMatchObject({
      type: "interactive",
      interactive: { type: "button" },
      biz_opaque_callback_data: interactiveId,
    });
  });

  it("rejeita mídia insegura e interativo desconhecido antes da rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = whatsappClient({ token: "t", phoneId: "111" });
    await expect(
      client.sendMedia(
        "+5511999990001",
        {
          type: "image",
          link: "http://inseguro.example/imagem.png",
        },
        crypto.randomUUID(),
      ),
    ).rejects.toThrow("HTTPS");
    await expect(
      client.sendInteractive(
        "+5511999990001",
        {
          type: "produto",
        },
        crypto.randomUUID(),
      ),
    ).rejects.toThrow("interativo inválido");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("whatsappClient.fetchTemplates/checkOperational", () => {
  it("não encaminha o token para origem indicada pela paginação", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [],
              paging: { next: "https://atacante.example/roubar-token" },
            }),
            { status: 200 },
          ),
      ),
    );
    const client = whatsappClient({ token: "t", phoneId: "111" });
    await expect(client.fetchTemplates("222")).rejects.toThrow(
      "origem não permitida",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("remove access_token recebido em URL de paginação da Meta", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [],
            paging: {
              next: "https://graph.facebook.com/v25.0/222/message_templates?after=x&access_token=LEAK",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await whatsappClient({ token: "t", phoneId: "111" }).fetchTemplates("222");
    expect(String(fetchMock.mock.calls[1][0])).not.toContain("access_token");
  });

  it("valida Phone ID, WABA, qualidade, verificação e limite ao vivo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/debug_token"))
          return new Response(
            JSON.stringify({
              data: {
                app_id: "app-1",
                type: "SYSTEM_USER",
                is_valid: true,
                expires_at: 0,
                data_access_expires_at: 0,
                scopes: [
                  "whatsapp_business_management",
                  "whatsapp_business_messaging",
                ],
                granular_scopes: [
                  {
                    scope: "whatsapp_business_management",
                    target_ids: ["222"],
                  },
                ],
              },
            }),
            { status: 200 },
          );
        if (url.includes("/app-1/subscriptions"))
          return new Response(
            JSON.stringify({
              data: [
                {
                  object: "whatsapp_business_account",
                  active: true,
                  callback_url: "https://global.example/webhook",
                  fields: [{ name: "messages" }],
                },
              ],
            }),
            { status: 200 },
          );
        if (url.includes("subscribed_apps"))
          return new Response(
            JSON.stringify({
              data: [
                {
                  whatsapp_business_api_data: { id: "app-1", name: "SmartZap" },
                  override_callback_uri: "https://worker.example/webhook",
                },
              ],
            }),
            { status: 200 },
          );
        if (url.includes("/222/phone_numbers"))
          return new Response(JSON.stringify({ data: [{ id: "111" }] }), {
            status: 200,
          });
        if (url.includes("/111?"))
          return new Response(
            JSON.stringify({
              id: "111",
              status: "CONNECTED",
              platform_type: "CLOUD_API",
              account_mode: "LIVE",
              quality_rating: "GREEN",
              code_verification_status: "VERIFIED",
              whatsapp_business_manager_messaging_limit: "TIER_2K",
              webhook_configuration: {
                whatsapp_business_account: "https://worker.example/webhook",
                application: "https://global.example/webhook",
              },
            }),
            { status: 200 },
          );
        return new Response(JSON.stringify({ id: "222" }), { status: 200 });
      }),
    );
    await expect(
      whatsappClient({
        token: "t",
        phoneId: "111",
        appId: "app-1",
        appSecret: "secret",
        callbackUrl: "https://worker.example/webhook",
      }).checkOperational("222"),
    ).resolves.toEqual({
      phoneId: "111",
      wabaId: "222",
      phoneBelongsToWaba: true,
      phoneWebhookCallbackUrl: null,
      effectiveWebhookCallbackUrl: "https://worker.example/webhook",
      effectiveWebhookCallbackMatches: true,
      phoneStatus: "CONNECTED",
      platformType: "CLOUD_API",
      accountMode: "LIVE",
      qualityRating: "GREEN",
      codeVerificationStatus: "VERIFIED",
      messagingLimit: "TIER_2K",
      throughputLevel: "UNKNOWN",
      throughputMps: null,
      subscribedAppIds: ["app-1"],
      webhookSubscribed: true,
      webhookCallbackUrl: "https://worker.example/webhook",
      webhookCallbackMatches: true,
      tokenAppId: "app-1",
      tokenAppMatches: true,
      tokenValid: true,
      tokenType: "SYSTEM_USER",
      tokenScopes: [
        "whatsapp_business_management",
        "whatsapp_business_messaging",
      ],
      tokenRequiredScopesPresent: true,
      tokenWabaTargeted: true,
      tokenExpiresAt: 0,
      tokenDataAccessExpiresAt: 0,
      appWebhookActive: true,
      appWebhookFields: ["messages"],
      appWebhookMessagesSubscribed: true,
      appWebhookCallbackUrl: "https://global.example/webhook",
    });
  });

  it("não declara saúde quando o app esperado não está inscrito no webhook", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/debug_token"))
          return new Response(
            JSON.stringify({
              data: {
                app_id: "app-1",
                type: "SYSTEM_USER",
                is_valid: true,
                scopes: [
                  "whatsapp_business_management",
                  "whatsapp_business_messaging",
                ],
              },
            }),
            { status: 200 },
          );
        if (url.includes("/app-1/subscriptions"))
          return new Response(
            JSON.stringify({
              data: [
                {
                  object: "whatsapp_business_account",
                  active: true,
                  fields: [{ name: "messages" }],
                },
              ],
            }),
            { status: 200 },
          );
        if (url.includes("subscribed_apps"))
          return new Response(
            JSON.stringify({
              data: [{ whatsapp_business_api_data: { id: "outro-app" } }],
            }),
            { status: 200 },
          );
        if (url.includes("/222/phone_numbers"))
          return new Response(JSON.stringify({ data: [{ id: "111" }] }), {
            status: 200,
          });
        if (url.includes("/111?"))
          return new Response(
            JSON.stringify({
              id: "111",
              status: "CONNECTED",
              platform_type: "CLOUD_API",
              account_mode: "LIVE",
              quality_rating: "GREEN",
              code_verification_status: "VERIFIED",
              webhook_configuration: {
                whatsapp_business_account: "https://worker.example/webhook",
              },
            }),
            { status: 200 },
          );
        return new Response(JSON.stringify({ id: "222" }), { status: 200 });
      }),
    );
    const result = await probeMeta({
      token: "t",
      phoneId: "111",
      wabaId: "222",
      appId: "app-1",
      appSecret: "secret",
      callbackUrl: "https://worker.example/webhook",
      graphVersion: "v25.0",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("app configurado");
  });

  it("aceita código temporário EXPIRED quando o número continua CONNECTED/LIVE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/debug_token"))
          return new Response(
            JSON.stringify({
              data: {
                app_id: "app-1",
                type: "SYSTEM_USER",
                is_valid: true,
                scopes: [
                  "whatsapp_business_management",
                  "whatsapp_business_messaging",
                ],
              },
            }),
            { status: 200 },
          );
        if (url.includes("/app-1/subscriptions"))
          return new Response(
            JSON.stringify({
              data: [
                {
                  object: "whatsapp_business_account",
                  active: true,
                  fields: [{ name: "messages" }],
                },
              ],
            }),
            { status: 200 },
          );
        if (url.includes("subscribed_apps"))
          return new Response(
            JSON.stringify({
              data: [
                {
                  whatsapp_business_api_data: { id: "app-1" },
                  override_callback_uri: "https://worker.example/webhook",
                },
              ],
            }),
            { status: 200 },
          );
        if (url.includes("/222/phone_numbers"))
          return new Response(JSON.stringify({ data: [{ id: "111" }] }), {
            status: 200,
          });
        if (url.includes("/111?"))
          return new Response(
            JSON.stringify({
              id: "111",
              status: "CONNECTED",
              platform_type: "CLOUD_API",
              account_mode: "LIVE",
              quality_rating: "GREEN",
              code_verification_status: "EXPIRED",
              webhook_configuration: {
                whatsapp_business_account: "https://worker.example/webhook",
              },
            }),
            { status: 200 },
          );
        return new Response(JSON.stringify({ id: "222" }), { status: 200 });
      }),
    );
    await expect(
      probeMeta({
        token: "t",
        phoneId: "111",
        wabaId: "222",
        appId: "app-1",
        appSecret: "secret",
        callbackUrl: "https://worker.example/webhook",
        graphVersion: "v25.0",
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("bloqueia token emitido para outro app", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/debug_token"))
          return new Response(
            JSON.stringify({
              data: {
                app_id: "outro-app",
                type: "SYSTEM_USER",
                is_valid: true,
                scopes: [
                  "whatsapp_business_management",
                  "whatsapp_business_messaging",
                ],
              },
            }),
            { status: 200 },
          );
        if (url.includes("/app-1/subscriptions"))
          return new Response(
            JSON.stringify({
              data: [
                {
                  object: "whatsapp_business_account",
                  active: true,
                  fields: [{ name: "messages" }],
                },
              ],
            }),
            { status: 200 },
          );
        if (url.includes("subscribed_apps"))
          return new Response(
            JSON.stringify({
              data: [
                {
                  whatsapp_business_api_data: { id: "app-1" },
                  override_callback_uri: "https://worker.example/webhook",
                },
              ],
            }),
            { status: 200 },
          );
        if (url.includes("/222/phone_numbers"))
          return new Response(JSON.stringify({ data: [{ id: "111" }] }), {
            status: 200,
          });
        if (url.includes("/111?"))
          return new Response(
            JSON.stringify({
              id: "111",
              status: "CONNECTED",
              platform_type: "CLOUD_API",
              account_mode: "LIVE",
              webhook_configuration: {
                whatsapp_business_account: "https://worker.example/webhook",
              },
            }),
            { status: 200 },
          );
        return new Response(JSON.stringify({ id: "222" }), { status: 200 });
      }),
    );
    await expect(
      probeMeta({
        token: "t",
        phoneId: "111",
        wabaId: "222",
        appId: "app-1",
        appSecret: "secret",
        callbackUrl: "https://worker.example/webhook",
        graphVersion: "v25.0",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Token Meta foi emitido para outro App ID.",
    });
  });

  it("bloqueia app sem assinatura do campo messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/debug_token"))
          return new Response(
            JSON.stringify({
              data: {
                app_id: "app-1",
                type: "SYSTEM_USER",
                is_valid: true,
                scopes: [
                  "whatsapp_business_management",
                  "whatsapp_business_messaging",
                ],
              },
            }),
            { status: 200 },
          );
        if (url.includes("/app-1/subscriptions"))
          return new Response(
            JSON.stringify({
              data: [
                {
                  object: "whatsapp_business_account",
                  active: true,
                  fields: [{ name: "calls" }],
                },
              ],
            }),
            { status: 200 },
          );
        if (url.includes("subscribed_apps"))
          return new Response(
            JSON.stringify({
              data: [
                {
                  whatsapp_business_api_data: { id: "app-1" },
                  override_callback_uri: "https://worker.example/webhook",
                },
              ],
            }),
            { status: 200 },
          );
        if (url.includes("/222/phone_numbers"))
          return new Response(JSON.stringify({ data: [{ id: "111" }] }), {
            status: 200,
          });
        if (url.includes("/111?"))
          return new Response(
            JSON.stringify({
              id: "111",
              status: "CONNECTED",
              platform_type: "CLOUD_API",
              account_mode: "LIVE",
              webhook_configuration: {
                whatsapp_business_account: "https://worker.example/webhook",
              },
            }),
            { status: 200 },
          );
        return new Response(JSON.stringify({ id: "222" }), { status: 200 });
      }),
    );
    await expect(
      probeMeta({
        token: "t",
        phoneId: "111",
        wabaId: "222",
        appId: "app-1",
        appSecret: "secret",
        callbackUrl: "https://worker.example/webhook",
        graphVersion: "v25.0",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "O app não possui assinatura ativa do campo messages.",
    });
  });

  it("bloqueia Phone ID que não pertence à WABA configurada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/debug_token"))
          return new Response(
            JSON.stringify({
              data: {
                app_id: "app-1",
                type: "SYSTEM_USER",
                is_valid: true,
                scopes: [
                  "whatsapp_business_management",
                  "whatsapp_business_messaging",
                ],
              },
            }),
            { status: 200 },
          );
        if (url.includes("/app-1/subscriptions"))
          return new Response(
            JSON.stringify({
              data: [
                {
                  object: "whatsapp_business_account",
                  active: true,
                  fields: [{ name: "messages" }],
                },
              ],
            }),
            { status: 200 },
          );
        if (url.includes("subscribed_apps"))
          return new Response(
            JSON.stringify({
              data: [
                {
                  whatsapp_business_api_data: { id: "app-1" },
                  override_callback_uri: "https://worker.example/webhook",
                },
              ],
            }),
            { status: 200 },
          );
        if (url.includes("/222/phone_numbers"))
          return new Response(
            JSON.stringify({ data: [{ id: "outro-phone" }] }),
            { status: 200 },
          );
        if (url.includes("/111?"))
          return new Response(
            JSON.stringify({
              id: "111",
              status: "CONNECTED",
              platform_type: "CLOUD_API",
              account_mode: "LIVE",
              webhook_configuration: {
                whatsapp_business_account: "https://worker.example/webhook",
              },
            }),
            { status: 200 },
          );
        return new Response(JSON.stringify({ id: "222" }), { status: 200 });
      }),
    );
    await expect(
      probeMeta({
        token: "t",
        phoneId: "111",
        wabaId: "222",
        appId: "app-1",
        appSecret: "secret",
        callbackUrl: "https://worker.example/webhook",
        graphVersion: "v25.0",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "O Phone Number ID não pertence à WABA configurada.",
    });
  });

  it("bloqueia override do telefone que desvia do callback da WABA", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/debug_token"))
          return new Response(
            JSON.stringify({
              data: {
                app_id: "app-1",
                type: "SYSTEM_USER",
                is_valid: true,
                scopes: [
                  "whatsapp_business_management",
                  "whatsapp_business_messaging",
                ],
              },
            }),
            { status: 200 },
          );
        if (url.includes("/app-1/subscriptions"))
          return new Response(
            JSON.stringify({
              data: [
                {
                  object: "whatsapp_business_account",
                  active: true,
                  fields: [{ name: "messages" }],
                },
              ],
            }),
            { status: 200 },
          );
        if (url.includes("subscribed_apps"))
          return new Response(
            JSON.stringify({
              data: [
                {
                  whatsapp_business_api_data: { id: "app-1" },
                  override_callback_uri: "https://worker.example/webhook",
                },
              ],
            }),
            { status: 200 },
          );
        if (url.includes("/222/phone_numbers"))
          return new Response(JSON.stringify({ data: [{ id: "111" }] }), {
            status: 200,
          });
        if (url.includes("/111?"))
          return new Response(
            JSON.stringify({
              id: "111",
              status: "CONNECTED",
              platform_type: "CLOUD_API",
              account_mode: "LIVE",
              webhook_configuration: {
                phone_number: "https://antigo.example/webhook",
                whatsapp_business_account: "https://worker.example/webhook",
                application: "https://worker.example/webhook",
              },
            }),
            { status: 200 },
          );
        return new Response(JSON.stringify({ id: "222" }), { status: 200 });
      }),
    );
    await expect(
      probeMeta({
        token: "t",
        phoneId: "111",
        wabaId: "222",
        appId: "app-1",
        appSecret: "secret",
        callbackUrl: "https://worker.example/webhook",
        graphVersion: "v25.0",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "O callback efetivo do telefone não aponta para o Worker esperado.",
      health: { phoneWebhookCallbackUrl: "https://antigo.example/webhook" },
    });
  });
});

describe("mapWhatsAppError", () => {
  it.each([368, 131005, 131042, 132000, 132001, 132015, 132016])(
    "%s interrompe campanha por erro estrutural",
    (code) => {
      expect(mapWhatsAppError(code, 400).critical).toBe(true);
      expect(mapWhatsAppError(code, 400).retryable).toBe(false);
    },
  );
  it("131050 aplica opt-out e 130429 permite retry explícito", () => {
    expect(mapWhatsAppError(131050).optOut).toBe(true);
    expect(mapWhatsAppError(130429, 429).retryable).toBe(true);
  });
});

describe("verifyMetaSignature (fail-closed)", () => {
  it("secret vazio → false", async () => {
    expect(await verifyMetaSignature("", "body", "sha256=x")).toBe(false);
  });
  it("assinatura correta → true", async () => {
    const secret = "s3cret";
    const body = '{"a":1}';
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(body),
    );
    const hex = [...new Uint8Array(sig)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(await verifyMetaSignature(secret, body, `sha256=${hex}`)).toBe(true);
    expect(await verifyMetaSignature(secret, body, "sha256=deadbeef")).toBe(
      false,
    );
  });
});
