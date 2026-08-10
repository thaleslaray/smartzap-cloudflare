import { sanitizeMetaDetail } from "./client";

const GRAPH_ORIGIN = "https://graph.facebook.com";
const TIMEOUT_MS = 15_000;

type Fetcher = typeof fetch;

type GraphError = {
  message?: unknown;
  code?: unknown;
  error_subcode?: unknown;
  fbtrace_id?: unknown;
  error_user_msg?: unknown;
  error_data?: { details?: unknown };
};

export type DatasetResult =
  | { ok: true; datasetId: string | null }
  | {
      ok: false;
      retryable: boolean;
      httpStatus: number;
      code: string | null;
      detail: string;
      fbtraceId: string | null;
    };

export type CapiSendResult =
  | {
      outcome: "accepted";
      httpStatus: number;
      eventsReceived: number;
      fbtraceId: string | null;
    }
  | {
      outcome: "unknown" | "temporary_failed" | "permanent_failed";
      httpStatus: number;
      code: string | null;
      subcode: string | null;
      detail: string;
      fbtraceId: string | null;
      retryAfterSeconds?: number;
    };

function graphUrl(version: string, id: string, edge: string) {
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("versão Graph inválida");
  if (!/^\d{5,32}$/.test(id)) throw new Error("ID Meta inválido");
  return `${GRAPH_ORIGIN}/${version}/${id}/${edge}`;
}

function retryable(code: number | null, httpStatus: number) {
  return (
    [1, 2, 4, 17, 32, 613, 130429].includes(code ?? -1) ||
    httpStatus === 408 ||
    httpStatus === 429 ||
    httpStatus >= 500
  );
}

function retryAfter(response: Response): number | undefined {
  const raw = response.headers.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.min(3600, Math.ceil(seconds));
  return undefined;
}

async function parse(response: Response) {
  const raw = await response.text();
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object"
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function datasetIdFrom(payload: Record<string, unknown> | null): string | null {
  const direct = payload?.id ?? payload?.dataset_id;
  if (typeof direct === "string" && /^\d{5,32}$/.test(direct)) return direct;
  if (Array.isArray(payload?.data)) {
    const candidate = payload.data.find((item) => item && typeof item === "object") as
      | Record<string, unknown>
      | undefined;
    const value = candidate?.id ?? candidate?.dataset_id;
    if (typeof value === "string" && /^\d{5,32}$/.test(value)) return value;
  }
  return null;
}

function graphFailure(response: Response, payload: Record<string, unknown> | null) {
  const error = payload?.error && typeof payload.error === "object"
    ? payload.error as GraphError
    : null;
  const code = typeof error?.code === "number" ? error.code : null;
  return {
    retryable: retryable(code, response.status),
    httpStatus: response.status,
    code: code === null ? null : String(code),
    subcode: typeof error?.error_subcode === "number"
      ? String(error.error_subcode)
      : null,
    detail: sanitizeMetaDetail(
      error?.error_data?.details ??
      error?.error_user_msg ??
      error?.message ??
      (payload ? "resposta Graph inválida" : `HTTP ${response.status}`),
    ),
    fbtraceId: typeof error?.fbtrace_id === "string" ? error.fbtrace_id : null,
  };
}

export function businessMessagingCapi(input: {
  token: string;
  graphVersion: string;
  fetcher?: Fetcher;
}) {
  if (!input.token) throw new Error("token Meta ausente");
  const fetcher = input.fetcher ?? fetch;
  const headers = {
    authorization: `Bearer ${input.token}`,
    "content-type": "application/json",
  };

  async function datasetRequest(wabaId: string, method: "GET" | "POST"): Promise<DatasetResult> {
    let response: Response;
    try {
      response = await fetcher(graphUrl(input.graphVersion, wabaId, "dataset"), {
        method,
        headers,
        ...(method === "POST" ? { body: "{}" } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return {
        ok: false,
        retryable: true,
        httpStatus: 0,
        code: null,
        detail: "Meta indisponível ou timeout ao consultar o Dataset",
        fbtraceId: null,
      };
    }
    const payload = await parse(response);
    const error = payload?.error;
    if (!response.ok || error) {
      const failure = graphFailure(response, payload);
      return {
        ok: false,
        retryable: failure.retryable,
        httpStatus: failure.httpStatus,
        code: failure.code,
        detail: failure.detail,
        fbtraceId: failure.fbtraceId,
      };
    }
    return { ok: true, datasetId: datasetIdFrom(payload) };
  }

  return {
    getDataset: (wabaId: string) => datasetRequest(wabaId, "GET"),
    createDataset: (wabaId: string) => datasetRequest(wabaId, "POST"),

    async sendEvent(event: {
      datasetId: string;
      eventId: string;
      eventName: "LeadSubmitted" | "QualifiedLead" | "Purchase";
      eventTime: number;
      wabaId: string;
      ctwaClid: string;
      valueMinor?: number | null;
      currency?: string | null;
      testEventCode?: string;
    }): Promise<CapiSendResult> {
      if (!event.ctwaClid || event.ctwaClid.length > 2048)
        throw new Error("ctwa_clid inválido");
      if (!event.eventId || event.eventId.length > 128)
        throw new Error("event_id inválido");
      if (event.testEventCode && !/^[A-Za-z0-9_-]{1,64}$/.test(event.testEventCode))
        throw new Error("código de Test Events inválido");
      const customData = event.eventName === "Purchase"
        ? {
            value: Number(((event.valueMinor ?? 0) / 100).toFixed(2)),
            currency: event.currency,
          }
        : undefined;
      const body = {
        data: [{
          event_name: event.eventName,
          event_time: event.eventTime,
          event_id: event.eventId,
          action_source: "business_messaging",
          messaging_channel: "whatsapp",
          user_data: {
            whatsapp_business_account_id: event.wabaId,
            ctwa_clid: event.ctwaClid,
          },
          ...(customData ? { custom_data: customData } : {}),
        }],
        ...(event.testEventCode ? { test_event_code: event.testEventCode } : {}),
      };
      let response: Response;
      try {
        response = await fetcher(
          graphUrl(input.graphVersion, event.datasetId, "events"),
          {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          },
        );
      } catch {
        return {
          outcome: "unknown",
          httpStatus: 0,
          code: null,
          subcode: null,
          detail: "resultado desconhecido após falha de rede ou timeout",
          fbtraceId: null,
        };
      }
      const payload = await parse(response);
      const eventsReceived = typeof payload?.events_received === "number"
        ? payload.events_received
        : null;
      if (response.ok && !payload?.error && eventsReceived === 1) {
        return {
          outcome: "accepted",
          httpStatus: response.status,
          eventsReceived,
          fbtraceId: typeof payload?.fbtrace_id === "string" ? payload.fbtrace_id : null,
        };
      }
      if (response.ok && !payload?.error) {
        return {
          outcome: "unknown",
          httpStatus: response.status,
          code: null,
          subcode: null,
          detail: "Meta respondeu sem confirmar events_received=1",
          fbtraceId: typeof payload?.fbtrace_id === "string" ? payload.fbtrace_id : null,
        };
      }
      const failure = graphFailure(response, payload);
      return {
        outcome: failure.retryable ? "temporary_failed" : "permanent_failed",
        httpStatus: failure.httpStatus,
        code: failure.code,
        subcode: failure.subcode,
        detail: failure.detail,
        fbtraceId: failure.fbtraceId,
        ...(failure.retryable ? { retryAfterSeconds: retryAfter(response) } : {}),
      };
    },
  };
}
