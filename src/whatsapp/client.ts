import { redactOperationalDetail } from "../domain/redaction";
import { resolveMetaThroughput, type MetaThroughputLevel } from "../domain/meta-throughput";

const GRAPH_ORIGIN = "https://graph.facebook.com";
export const DEFAULT_GRAPH_VERSION = "v25.0";
const META_TIMEOUT_MS = 15_000;
const MAX_TEMPLATE_PAGES = 100;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

type MetaErrorPayload = {
  message?: string;
  type?: string;
  code?: number;
  error_user_title?: string;
  error_user_msg?: string;
  error_data?: { details?: string; messaging_product?: string };
  fbtrace_id?: string;
};

export type MetaTemplate = {
  id?: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown[];
  quality_score?: unknown;
};

export type SendResult =
  | {
      ok: true;
      messageId: string;
      waId?: string;
      userId?: string;
      messageStatus?: string;
    }
  | {
      ok: false;
      code: number;
      detail: string;
      httpStatus: number;
      fbtraceId?: string;
      retryAfterSeconds?: number;
      ambiguous: boolean;
    };

export type MessageRecipient =
  | string
  | { phone?: string; userId?: string; parentUserId?: string };

function recipientPayload(recipient: MessageRecipient): { to?: string; recipient?: string } {
  if (typeof recipient === "string") {
    if (!recipient.trim()) throw new Error("destinatário vazio");
    return { to: recipient };
  }
  if (recipient.phone?.trim()) return { to: recipient.phone.trim() };
  const bsuid = recipient.userId?.trim() || recipient.parentUserId?.trim();
  if (!bsuid) throw new Error("destinatário sem telefone nem BSUID");
  return { recipient: bsuid };
}

export type MetaOperationalHealth = {
  phoneId: string;
  wabaId: string;
  phoneBelongsToWaba: boolean;
  phoneWebhookCallbackUrl: string | null;
  effectiveWebhookCallbackUrl: string | null;
  effectiveWebhookCallbackMatches: boolean;
  phoneStatus: string | null;
  platformType: string | null;
  accountMode: string | null;
  qualityRating: string | null;
  codeVerificationStatus: string | null;
  messagingLimit: string | number | null;
  throughputLevel: MetaThroughputLevel;
  throughputMps: number | null;
  subscribedAppIds: string[];
  webhookSubscribed: boolean;
  webhookCallbackUrl: string | null;
  webhookCallbackMatches: boolean;
  tokenAppId: string | null;
  tokenAppMatches: boolean;
  tokenValid: boolean;
  tokenType: string | null;
  tokenScopes: string[];
  tokenRequiredScopesPresent: boolean;
  tokenWabaTargeted: boolean | null;
  tokenExpiresAt: number | null;
  tokenDataAccessExpiresAt: number | null;
  appWebhookActive: boolean;
  appWebhookFields: string[];
  appWebhookMessagesSubscribed: boolean;
  appWebhookCallbackUrl: string | null;
};

export class MetaApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly httpStatus: number,
    readonly fbtraceId?: string,
  ) {
    super(message);
    this.name = "MetaApiRequestError";
  }
}

function graphBase(version?: string): string {
  const value = version || DEFAULT_GRAPH_VERSION;
  if (!/^v\d+\.\d+$/.test(value)) throw new Error("versão Graph inválida");
  return `${GRAPH_ORIGIN}/${value}`;
}

// `details` pode conter telefone/IDs. O operador precisa do diagnóstico, não da PII.
export function sanitizeMetaDetail(value: unknown): string {
  return redactOperationalDetail(value);
}

function retryAfterSeconds(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.min(3600, Math.ceil(seconds));
  const date = Date.parse(raw);
  if (!Number.isFinite(date)) return undefined;
  return Math.min(3600, Math.max(0, Math.ceil((date - Date.now()) / 1000)));
}

async function parseResponse(
  res: Response,
): Promise<{ data: Record<string, unknown> | null; raw: string }> {
  const raw = await res.text();
  if (!raw) return { data: null, raw };
  try {
    const parsed = JSON.parse(raw);
    return {
      data:
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : null,
      raw,
    };
  } catch {
    return { data: null, raw };
  }
}

export function whatsappClient(creds: {
  token: string;
  phoneId: string;
  appId?: string;
  appSecret?: string;
  callbackUrl?: string;
  graphVersion?: string;
}) {
  const graph = graphBase(creds.graphVersion);
  const headers = {
    authorization: `Bearer ${creds.token}`,
    "content-type": "application/json",
  };

  async function getJson(
    url: string,
    bearer = creds.token,
  ): Promise<Record<string, unknown>> {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== GRAPH_ORIGIN)
      throw new MetaApiRequestError(
        "Meta retornou origem não permitida",
        0,
        502,
      );
    // Algumas paginações legadas devolvem access_token na query. O header Bearer
    // já autentica a chamada; removemos a cópia para não propagar segredo em URL.
    parsedUrl.searchParams.delete("access_token");
    let res: Response;
    try {
      res = await fetch(parsedUrl.toString(), {
        headers: { ...headers, authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(META_TIMEOUT_MS),
      });
    } catch {
      throw new MetaApiRequestError("Meta indisponível ou timeout", 0, 503);
    }
    const { data } = await parseResponse(res);
    const error = data?.error as MetaErrorPayload | undefined;
    if (!res.ok || error || !data) {
      const detail = sanitizeMetaDetail(
        error?.error_data?.details ?? error?.error_user_msg ?? error?.message ?? `HTTP ${res.status}`,
      );
      throw new MetaApiRequestError(
        detail,
        error?.code ?? res.status,
        res.status,
        error?.fbtrace_id,
      );
    }
    return data;
  }

  async function sendMessage(
    body: Record<string, unknown>,
  ): Promise<SendResult> {
    let res: Response;
    try {
      res = await fetch(`${graph}/${creds.phoneId}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(META_TIMEOUT_MS),
      });
    } catch {
      // O request pode ter chegado à Meta. O chamador deve bloquear a tentativa;
      // biz_opaque_callback_data permite recuperá-la se o webhook chegar depois.
      return {
        ok: false,
        code: -1,
        httpStatus: 0,
        ambiguous: true,
        detail: "resultado do envio desconhecido após falha de rede/timeout",
      };
    }

    let parsed: { data: Record<string, unknown> | null; raw: string };
    try {
      parsed = await parseResponse(res);
    } catch {
      return {
        ok: false,
        code: res.status || -1,
        httpStatus: res.status,
        ambiguous: true,
        detail: "resultado do envio desconhecido ao ler a resposta da Meta",
      };
    }
    const data = parsed.data;
    const messages = data?.messages as
      { id?: string; message_status?: string }[] | undefined;
    const contacts = data?.contacts as { wa_id?: string; user_id?: string }[] | undefined;
    const error = data?.error as MetaErrorPayload | undefined;
    if (res.ok && !error && messages?.[0]?.id) {
      return {
        ok: true,
        messageId: messages[0].id,
        ...(contacts?.[0]?.wa_id ? { waId: contacts[0].wa_id } : {}),
        ...(contacts?.[0]?.user_id ? { userId: contacts[0].user_id } : {}),
        ...(messages[0].message_status
          ? { messageStatus: messages[0].message_status }
          : {}),
      };
    }

    // 2xx sem wamid ou 5xx sem erro Graph estruturado não provam rejeição.
    const ambiguous = !error && (res.ok || res.status >= 500);
    return {
      ok: false,
      code: error?.code ?? (res.status || -1),
      detail: sanitizeMetaDetail(
        error?.error_data?.details ?? error?.error_user_msg ?? error?.message ?? `HTTP ${res.status}`,
      ),
      httpStatus: res.status,
      fbtraceId: error?.fbtrace_id,
      retryAfterSeconds: retryAfterSeconds(res),
      ambiguous,
    };
  }

  function assertOpaqueId(value: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    )
      throw new Error("identificador opaco inválido");
  }

  async function mutateJson(
    url: string,
    method: "POST" | "DELETE",
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(META_TIMEOUT_MS),
      });
    } catch {
      throw new MetaApiRequestError("Meta indisponível ou timeout", 0, 503);
    }
    const { data } = await parseResponse(response);
    const error = data?.error as MetaErrorPayload | undefined;
    if (!response.ok || error || !data)
      throw new MetaApiRequestError(
        sanitizeMetaDetail(
          error?.error_data?.details ??
            error?.error_user_msg ??
            error?.message ??
            `HTTP ${response.status}`,
        ),
        error?.code ?? response.status,
        response.status,
        error?.fbtrace_id,
      );
    return data;
  }

  return {
    async uploadMedia(input: {
      bytes: ArrayBuffer;
      contentType: string;
      filename: string;
    }): Promise<{ id: string }> {
      if (input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_MEDIA_BYTES)
        throw new MetaApiRequestError("mídia inválida ou grande demais", 0, 413);
      const contentType = input.contentType.trim().toLowerCase();
      if (
        !contentType.startsWith("image/") &&
        !contentType.startsWith("video/") &&
        !contentType.startsWith("audio/") &&
        ![
          "application/pdf",
          "text/plain",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ].includes(contentType)
      )
        throw new MetaApiRequestError("tipo de mídia não permitido", 0, 415);
      const filename = input.filename.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 240) || "arquivo";
      const form = new FormData();
      form.set("messaging_product", "whatsapp");
      form.set("type", contentType);
      form.set("file", new File([input.bytes], filename, { type: contentType }));
      let response: Response;
      try {
        response = await fetch(`${graph}/${creds.phoneId}/media`, {
          method: "POST",
          headers: { authorization: `Bearer ${creds.token}` },
          body: form,
          signal: AbortSignal.timeout(META_TIMEOUT_MS),
        });
      } catch {
        throw new MetaApiRequestError("Meta indisponível durante upload de mídia", 0, 503);
      }
      const { data } = await parseResponse(response);
      const error = data?.error as MetaErrorPayload | undefined;
      const id = typeof data?.id === "string" ? data.id : "";
      if (!response.ok || error || !/^\d{1,512}$/.test(id))
        throw new MetaApiRequestError(
          sanitizeMetaDetail(error?.error_data?.details ?? error?.error_user_msg ?? error?.message ?? "upload de mídia rejeitado"),
          error?.code ?? response.status,
          response.status || 502,
          error?.fbtrace_id,
        );
      return { id };
    },

    async downloadMedia(
      mediaId: string,
    ): Promise<{
      bytes: ArrayBuffer;
      contentType: string;
      contentLength: number;
    }> {
      if (!/^\d{1,512}$/.test(mediaId))
        throw new MetaApiRequestError(
          "identificador de mídia inválido",
          0,
          400,
        );
      const metadata = await getJson(`${graph}/${mediaId}`);
      const rawUrl = typeof metadata.url === "string" ? metadata.url : "";
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        throw new MetaApiRequestError(
          "Meta não retornou URL de mídia válida",
          0,
          502,
        );
      }
      // A URL é temporária e emitida pela Meta; mesmo assim, não permitimos que
      // uma resposta inesperada transforme este Worker em proxy arbitrário.
      if (
        url.protocol !== "https:" ||
        !["lookaside.fbsbx.com"].includes(url.hostname)
      )
        throw new MetaApiRequestError("origem de mídia inesperada", 0, 502);
      let response: Response;
      try {
        response = await fetch(url.toString(), {
          headers: { authorization: `Bearer ${creds.token}` },
          redirect: "error",
          signal: AbortSignal.timeout(META_TIMEOUT_MS),
        });
      } catch {
        throw new MetaApiRequestError(
          "não foi possível baixar a mídia da Meta",
          0,
          503,
        );
      }
      const length = Number(response.headers.get("content-length"));
      if (
        !response.ok ||
        !response.body ||
        (Number.isFinite(length) && length > MAX_MEDIA_BYTES)
      )
        throw new MetaApiRequestError(
          "mídia indisponível ou grande demais",
          response.status || 0,
          502,
        );
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_MEDIA_BYTES)
        throw new MetaApiRequestError(
          "mídia indisponível ou grande demais",
          0,
          413,
        );
      return {
        bytes,
        contentType:
          response.headers.get("content-type") || "application/octet-stream",
        contentLength: bytes.byteLength,
      };
    },
    async sendTemplate(
      to: MessageRecipient,
      template: { name: string; language: string; components?: unknown[] },
      bizOpaqueCallbackData?: string,
    ): Promise<SendResult> {
      if (bizOpaqueCallbackData) assertOpaqueId(bizOpaqueCallbackData);
      return sendMessage({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        ...recipientPayload(to),
        type: "template",
        template: {
          name: template.name,
          language: { code: template.language },
          ...(template.components ? { components: template.components } : {}),
        },
        ...(bizOpaqueCallbackData
          ? { biz_opaque_callback_data: bizOpaqueCallbackData }
          : {}),
      });
    },

    async sendText(
      to: MessageRecipient,
      text: string,
      bizOpaqueCallbackData: string,
    ): Promise<SendResult> {
      const body = text.trim();
      if (!body || body.length > 4096)
        throw new Error("texto fora do limite da Meta");
      assertOpaqueId(bizOpaqueCallbackData);
      return sendMessage({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        ...recipientPayload(to),
        type: "text",
        text: { preview_url: false, body },
        biz_opaque_callback_data: bizOpaqueCallbackData,
      });
    },

    async sendMedia(
      to: MessageRecipient,
      media: {
        type: "image" | "video" | "audio" | "document" | "sticker";
        id?: string;
        link?: string;
        caption?: string;
        filename?: string;
      },
      bizOpaqueCallbackData: string,
    ): Promise<SendResult> {
      assertOpaqueId(bizOpaqueCallbackData);
      if (!media.id && !media.link) throw new Error("mídia requer id ou URL");
      if (media.link) {
        const url = new URL(media.link);
        if (url.protocol !== "https:")
          throw new Error("URL de mídia deve usar HTTPS");
      }
      const payload: Record<string, unknown> = media.id
        ? { id: media.id }
        : { link: media.link };
      if (media.caption && !["audio", "sticker"].includes(media.type))
        payload.caption = media.caption.slice(0, 1024);
      if (media.filename && media.type === "document")
        payload.filename = media.filename.slice(0, 240);
      return sendMessage({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        ...recipientPayload(to),
        type: media.type,
        [media.type]: payload,
        biz_opaque_callback_data: bizOpaqueCallbackData,
      });
    },

    async sendInteractive(
      to: string,
      interactive: Record<string, unknown>,
      bizOpaqueCallbackData: string,
    ): Promise<SendResult> {
      assertOpaqueId(bizOpaqueCallbackData);
      if (!["button", "list"].includes(String(interactive.type || "")))
        throw new Error("tipo interativo inválido");
      return sendMessage({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive,
        biz_opaque_callback_data: bizOpaqueCallbackData,
      });
    },

    async sendFlow(
      to: string,
      input: {
        flowId: string;
        flowToken: string;
        body: string;
        ctaText: string;
        footer?: string;
        action: "navigate" | "data_exchange";
        mode?: "draft" | "published";
      },
      bizOpaqueCallbackData: string,
    ): Promise<SendResult> {
      assertOpaqueId(bizOpaqueCallbackData);
      if (!/^\d{6,25}$/.test(input.flowId))
        throw new Error("ID da MiniApp inválido");
      if (!input.flowToken.trim() || input.flowToken.length > 512)
        throw new Error("token da MiniApp inválido");
      const body = input.body.trim();
      const cta = input.ctaText.trim();
      if (!body || body.length > 1024 || !cta || cta.length > 30)
        throw new Error("texto da MiniApp fora do limite");
      return sendMessage({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "flow",
          body: { text: body },
          ...(input.footer?.trim()
            ? { footer: { text: input.footer.trim().slice(0, 60) } }
            : {}),
          action: {
            name: "flow",
            parameters: {
              flow_message_version: "3",
              flow_token: input.flowToken,
              flow_id: input.flowId,
              flow_cta: cta,
              flow_action: input.action,
              mode: input.mode ?? "published",
            },
          },
        },
        biz_opaque_callback_data: bizOpaqueCallbackData,
      });
    },

    async fetchTemplates(wabaId: string): Promise<MetaTemplate[]> {
      const out: MetaTemplate[] = [];
      let url: string | null =
        `${graph}/${wabaId}/message_templates?limit=100&fields=id,name,language,category,status,components,quality_score`;
      let pages = 0;
      while (url) {
        if (++pages > MAX_TEMPLATE_PAGES)
          throw new MetaApiRequestError(
            `Meta templates excedeu ${MAX_TEMPLATE_PAGES} páginas`,
            0,
            502,
          );
        const page = (await getJson(url)) as {
          data?: MetaTemplate[];
          paging?: { next?: string };
        };
        if (!Array.isArray(page.data))
          throw new MetaApiRequestError(
            "Meta templates retornou payload inválido",
            0,
            502,
          );
        out.push(...page.data);
        url = page.paging?.next ?? null;
      }
      return out;
    },

    async createTemplate(
      wabaId: string,
      template: {
        name: string;
        language: string;
        category: string;
        components: unknown[];
      },
    ) {
      return mutateJson(
        `${graph}/${wabaId}/message_templates`,
        "POST",
        template,
      );
    },

    async deleteTemplate(wabaId: string, name: string) {
      const url = new URL(`${graph}/${wabaId}/message_templates`);
      url.searchParams.set("name", name);
      return mutateJson(url.toString(), "DELETE");
    },

    async checkOperational(wabaId: string): Promise<MetaOperationalHealth> {
      if (!wabaId) throw new MetaApiRequestError("WABA ID ausente", 0, 400);
      if (!creds.appId || !creds.appSecret)
        throw new MetaApiRequestError("App ID ou App Secret ausente", 0, 400);
      const phoneUrl = `${graph}/${creds.phoneId}?fields=id,status,platform_type,account_mode,quality_rating,throughput,code_verification_status,whatsapp_business_manager_messaging_limit,webhook_configuration`;
      const wabaUrl = `${graph}/${wabaId}?fields=id`;
      const wabaPhonesUrl = `${graph}/${wabaId}/phone_numbers?limit=100&fields=id`;
      const subscriptionsUrl = `${graph}/${wabaId}/subscribed_apps`;
      const debugUrl = new URL(`${graph}/debug_token`);
      debugUrl.searchParams.set("input_token", creds.token);
      const appSubscriptionsUrl = `${graph}/${creds.appId}/subscriptions`;
      const appAccessToken = `${creds.appId}|${creds.appSecret}`;
      const [
        phone,
        waba,
        wabaPhones,
        subscriptions,
        tokenDebug,
        appSubscriptions,
      ] = await Promise.all([
        getJson(phoneUrl),
        getJson(wabaUrl),
        getJson(wabaPhonesUrl),
        getJson(subscriptionsUrl),
        getJson(debugUrl.toString(), appAccessToken),
        getJson(appSubscriptionsUrl, appAccessToken),
      ]);
      if (String(phone.id ?? "") !== creds.phoneId)
        throw new MetaApiRequestError(
          "Phone Number ID não confere com a resposta da Meta",
          0,
          409,
        );
      if (String(waba.id ?? "") !== wabaId)
        throw new MetaApiRequestError(
          "WABA ID não confere com a resposta da Meta",
          0,
          409,
        );
      if (!Array.isArray(wabaPhones.data))
        throw new MetaApiRequestError(
          "Meta retornou lista de telefones da WABA inválida",
          0,
          502,
        );
      const phoneBelongsToWaba = wabaPhones.data.some((item) =>
        Boolean(
          item &&
          typeof item === "object" &&
          String((item as Record<string, unknown>).id ?? "") === creds.phoneId,
        ),
      );
      const parsedSubscriptions = Array.isArray(subscriptions.data)
        ? subscriptions.data.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const subscription = item as {
              id?: unknown;
              whatsapp_business_api_data?: { id?: unknown };
              override_callback_uri?: unknown;
            };
            // Shape documentado pela coleção oficial da Meta. O ID no topo é
            // aceito apenas como compatibilidade defensiva entre versões Graph.
            const id =
              subscription.whatsapp_business_api_data?.id ?? subscription.id;
            return typeof id === "string"
              ? [
                  {
                    id,
                    callbackUrl:
                      typeof subscription.override_callback_uri === "string"
                        ? subscription.override_callback_uri
                        : null,
                  },
                ]
              : [];
          })
        : [];
      const subscribedAppIds = parsedSubscriptions.map(
        (subscription) => subscription.id,
      );
      const expectedSubscription = parsedSubscriptions.find(
        (subscription) => subscription.id === creds.appId,
      );
      const debugData =
        tokenDebug.data && typeof tokenDebug.data === "object"
          ? (tokenDebug.data as Record<string, unknown>)
          : {};
      const tokenAppId =
        typeof debugData.app_id === "string" ? debugData.app_id : null;
      const tokenScopes = Array.isArray(debugData.scopes)
        ? debugData.scopes.filter(
            (scope): scope is string => typeof scope === "string",
          )
        : [];
      const requiredScopes = [
        "whatsapp_business_management",
        "whatsapp_business_messaging",
      ];
      const tokenRequiredScopesPresent = requiredScopes.every((scope) =>
        tokenScopes.includes(scope),
      );
      const granularScopes = Array.isArray(debugData.granular_scopes)
        ? debugData.granular_scopes.filter(
            (scope): scope is Record<string, unknown> =>
              Boolean(scope && typeof scope === "object"),
          )
        : [];
      const granularWhatsappScopes = granularScopes.filter(
        (item) =>
          typeof item.scope === "string" && requiredScopes.includes(item.scope),
      );
      const explicitTargets = granularWhatsappScopes.flatMap((item) =>
        Array.isArray(item.target_ids)
          ? item.target_ids.filter((id): id is string => typeof id === "string")
          : [],
      );
      const tokenWabaTargeted = explicitTargets.length
        ? explicitTargets.includes(wabaId)
        : null;
      const parsedAppSubscriptions = Array.isArray(appSubscriptions.data)
        ? appSubscriptions.data.filter(
            (item): item is Record<string, unknown> =>
              Boolean(item && typeof item === "object"),
          )
        : [];
      const whatsappAppSubscription = parsedAppSubscriptions.find(
        (item) => item.object === "whatsapp_business_account",
      );
      const appWebhookFields = Array.isArray(whatsappAppSubscription?.fields)
        ? whatsappAppSubscription.fields.flatMap((field) => {
            if (typeof field === "string") return [field];
            if (!field || typeof field !== "object") return [];
            const name = (field as Record<string, unknown>).name;
            return typeof name === "string" ? [name] : [];
          })
        : [];
      const appWebhookActive =
        Boolean(whatsappAppSubscription) &&
        whatsappAppSubscription?.active !== false;
      const webhookConfiguration =
        phone.webhook_configuration &&
        typeof phone.webhook_configuration === "object"
          ? (phone.webhook_configuration as Record<string, unknown>)
          : {};
      const phoneWebhookCallbackUrl =
        typeof webhookConfiguration.phone_number === "string"
          ? webhookConfiguration.phone_number
          : null;
      const effectiveWebhookCallbackUrl =
        phoneWebhookCallbackUrl ??
        (typeof webhookConfiguration.whatsapp_business_account === "string"
          ? webhookConfiguration.whatsapp_business_account
          : null) ??
        (typeof webhookConfiguration.application === "string"
          ? webhookConfiguration.application
          : null);
      return {
        phoneId: creds.phoneId,
        wabaId,
        phoneBelongsToWaba,
        phoneWebhookCallbackUrl,
        effectiveWebhookCallbackUrl,
        effectiveWebhookCallbackMatches: Boolean(
          creds.callbackUrl &&
          effectiveWebhookCallbackUrl === creds.callbackUrl,
        ),
        phoneStatus: typeof phone.status === "string" ? phone.status : null,
        platformType:
          typeof phone.platform_type === "string" ? phone.platform_type : null,
        accountMode:
          typeof phone.account_mode === "string" ? phone.account_mode : null,
        qualityRating:
          typeof phone.quality_rating === "string"
            ? phone.quality_rating
            : null,
        codeVerificationStatus:
          typeof phone.code_verification_status === "string"
            ? phone.code_verification_status
            : null,
        messagingLimit:
          typeof phone.whatsapp_business_manager_messaging_limit === "string" ||
          typeof phone.whatsapp_business_manager_messaging_limit === "number"
            ? phone.whatsapp_business_manager_messaging_limit
            : null,
        throughputLevel: resolveMetaThroughput(phone.throughput).level,
        throughputMps: resolveMetaThroughput(phone.throughput).maxMps,
        subscribedAppIds,
        webhookSubscribed: Boolean(expectedSubscription),
        webhookCallbackUrl: expectedSubscription?.callbackUrl ?? null,
        webhookCallbackMatches: Boolean(
          creds.callbackUrl &&
          expectedSubscription?.callbackUrl === creds.callbackUrl,
        ),
        tokenAppId,
        tokenAppMatches: tokenAppId === creds.appId,
        tokenValid: debugData.is_valid === true,
        tokenType: typeof debugData.type === "string" ? debugData.type : null,
        tokenScopes,
        tokenRequiredScopesPresent,
        tokenWabaTargeted,
        tokenExpiresAt:
          typeof debugData.expires_at === "number"
            ? debugData.expires_at
            : null,
        tokenDataAccessExpiresAt:
          typeof debugData.data_access_expires_at === "number"
            ? debugData.data_access_expires_at
            : null,
        appWebhookActive,
        appWebhookFields,
        appWebhookMessagesSubscribed:
          appWebhookActive && appWebhookFields.includes("messages"),
        appWebhookCallbackUrl:
          typeof whatsappAppSubscription?.callback_url === "string"
            ? whatsappAppSubscription.callback_url
            : null,
      };
    },
  };
}
