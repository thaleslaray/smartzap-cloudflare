import { describe, expect, it, vi } from "vitest";
import { businessMessagingCapi } from "../src/whatsapp/conversions";

describe("CAPI for Business Messaging", () => {
  it("consulta e cria somente o Dataset da WABA esperada", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      Response.json(init?.method === "POST"
        ? { id: "555555555555555" }
        : { data: [{ id: "555555555555555" }] }),
    );
    const client = businessMessagingCapi({
      token: "secret-token",
      graphVersion: "v26.0",
      fetcher,
    });
    await expect(client.getDataset("159711717233997")).resolves.toEqual({
      ok: true,
      datasetId: "555555555555555",
    });
    await expect(client.createDataset("159711717233997")).resolves.toEqual({
      ok: true,
      datasetId: "555555555555555",
    });
    expect(fetcher.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
      ["https://graph.facebook.com/v26.0/159711717233997/dataset", "GET"],
      ["https://graph.facebook.com/v26.0/159711717233997/dataset", "POST"],
    ]);
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      authorization: "Bearer secret-token",
    });
  });

  it("envia Purchase com o contrato business_messaging e sem conteúdo da conversa", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({
      events_received: 1,
      fbtrace_id: "TRACE_OK",
    }));
    const result = await businessMessagingCapi({
      token: "token",
      graphVersion: "v26.0",
      fetcher,
    }).sendEvent({
      datasetId: "555555555555555",
      eventId: "sz_1234567890abcdef",
      eventName: "Purchase",
      eventTime: 1_786_000_000,
      wabaId: "159711717233997",
      ctwaClid: "click-id-123",
      valueMinor: 12990,
      currency: "BRL",
    });
    expect(result).toEqual({
      outcome: "accepted",
      httpStatus: 200,
      eventsReceived: 1,
      fbtraceId: "TRACE_OK",
    });
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toEqual({ data: [{
      event_name: "Purchase",
      event_time: 1_786_000_000,
      event_id: "sz_1234567890abcdef",
      action_source: "business_messaging",
      messaging_channel: "whatsapp",
      user_data: {
        whatsapp_business_account_id: "159711717233997",
        ctwa_clid: "click-id-123",
      },
      custom_data: { value: 129.9, currency: "BRL" },
    }] });
    expect(JSON.stringify(body)).not.toMatch(/phone|email|text|media_url|image_url|video_url/i);
  });

  it("distingue falha temporária, permanente e resultado desconhecido", async () => {
    const temporary = businessMessagingCapi({
      token: "token",
      graphVersion: "v26.0",
      fetcher: async () => new Response(JSON.stringify({
        error: { code: 613, message: "rate limited", fbtrace_id: "T1" },
      }), { status: 429, headers: { "retry-after": "45" } }),
    });
    await expect(temporary.sendEvent({
      datasetId: "555555555555555", eventId: "event-temporary-1234",
      eventName: "LeadSubmitted", eventTime: 1, wabaId: "159711717233997",
      ctwaClid: "clid",
    })).resolves.toMatchObject({
      outcome: "temporary_failed", code: "613", retryAfterSeconds: 45,
    });

    const permanent = businessMessagingCapi({
      token: "token", graphVersion: "v26.0",
      fetcher: async () => Response.json({
        error: { code: 100, error_subcode: 33, message: "invalid parameter" },
      }, { status: 400 }),
    });
    await expect(permanent.sendEvent({
      datasetId: "555555555555555", eventId: "event-permanent-1234",
      eventName: "QualifiedLead", eventTime: 1, wabaId: "159711717233997",
      ctwaClid: "clid",
    })).resolves.toMatchObject({
      outcome: "permanent_failed", code: "100", subcode: "33",
    });

    const unknown = businessMessagingCapi({
      token: "token", graphVersion: "v26.0",
      fetcher: async () => { throw new Error("timeout"); },
    });
    await expect(unknown.sendEvent({
      datasetId: "555555555555555", eventId: "event-unknown-1234",
      eventName: "LeadSubmitted", eventTime: 1, wabaId: "159711717233997",
      ctwaClid: "clid",
    })).resolves.toMatchObject({ outcome: "unknown", httpStatus: 0 });
  });
});
