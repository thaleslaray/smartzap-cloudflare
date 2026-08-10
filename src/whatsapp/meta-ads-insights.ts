import { sanitizeMetaDetail } from "./client";

const GRAPH_ORIGIN = "https://graph.facebook.com";
const TIMEOUT_MS = 20_000;
const MAX_PAGES = 20;

type Fetcher = typeof fetch;

type ActionValue = { action_type?: unknown; value?: unknown };

export type MetaAdInsight = {
  day: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  currency: string;
  spendMinor: number;
  impressions: number;
  reach: number;
  clicks: number;
  inlineLinkClicks: number;
  messagingConnections: number;
  conversationsStarted: number;
  leads: number;
  qualifiedLeads: number;
  purchases: number;
  purchaseValueMinor: number;
  actionTypes: Array<{ type: string; value: number }>;
};

export type MetaAdsInsightsResult =
  | { ok: true; rows: MetaAdInsight[]; pages: number }
  | {
      ok: false;
      retryable: boolean;
      httpStatus: number;
      code: string | null;
      detail: string;
    };

const METRIC_ALIASES = {
  messagingConnections: ["onsite_conversion.total_messaging_connection"],
  conversationsStarted: ["onsite_conversion.messaging_conversation_started_7d"],
  leads: ["onsite_conversion.lead"],
  qualifiedLeads: [
    "onsite_conversion.qualified_lead",
    "onsite_conversion.messaging_qualified_lead",
    "qualified_lead",
  ],
  purchases: [
    "onsite_conversion.messaging_purchase",
    "onsite_conversion.purchase",
    "purchase",
  ],
} as const;

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function safeId(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d{5,32}$/.test(value))
    throw new Error(`${label} inválido no Ads Insights`);
  return value;
}

function safeName(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 240);
  return clean || fallback;
}

function integer(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(parsed));
}

function decimalMinor(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  const minor = Math.round((parsed + Number.EPSILON) * 100);
  return Number.isSafeInteger(minor) ? minor : 0;
}

function actionMap(value: unknown) {
  const result = new Map<string, number>();
  if (!Array.isArray(value)) return result;
  for (const item of value as ActionValue[]) {
    if (!item || typeof item !== "object" || typeof item.action_type !== "string") continue;
    const type = item.action_type.slice(0, 160);
    const amount = Number(item.value ?? 0);
    if (!Number.isFinite(amount) || amount < 0) continue;
    result.set(type, amount);
  }
  return result;
}

function firstMetric(actions: Map<string, number>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = actions.get(alias);
    if (value !== undefined) return Math.max(0, Math.round(value));
  }
  return 0;
}

function firstMoney(actions: Map<string, number>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = actions.get(alias);
    if (value !== undefined) return decimalMinor(value);
  }
  return 0;
}

function parseRow(value: unknown): MetaAdInsight {
  if (!value || typeof value !== "object") throw new Error("linha inválida no Ads Insights");
  const row = value as Record<string, unknown>;
  const day = typeof row.date_start === "string" ? row.date_start : "";
  if (!validDate(day)) throw new Error("data inválida no Ads Insights");
  const currency = typeof row.account_currency === "string"
    ? row.account_currency.toUpperCase()
    : "";
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("moeda inválida no Ads Insights");
  const actions = actionMap(row.actions);
  const actionValues = actionMap(row.action_values);
  const actionTypes = [...actions.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 80)
    .map(([type, amount]) => ({ type, value: Math.max(0, amount) }));
  const campaignId = safeId(row.campaign_id, "campaign_id");
  const adsetId = safeId(row.adset_id, "adset_id");
  const adId = safeId(row.ad_id, "ad_id");
  return {
    day,
    campaignId,
    campaignName: safeName(row.campaign_name, `Campanha ${campaignId}`),
    adsetId,
    adsetName: safeName(row.adset_name, `Conjunto ${adsetId}`),
    adId,
    adName: safeName(row.ad_name, `Anúncio ${adId}`),
    currency,
    spendMinor: decimalMinor(row.spend),
    impressions: integer(row.impressions),
    reach: integer(row.reach),
    clicks: integer(row.clicks),
    inlineLinkClicks: integer(row.inline_link_clicks),
    messagingConnections: firstMetric(actions, METRIC_ALIASES.messagingConnections),
    conversationsStarted: firstMetric(actions, METRIC_ALIASES.conversationsStarted),
    leads: firstMetric(actions, METRIC_ALIASES.leads),
    qualifiedLeads: firstMetric(actions, METRIC_ALIASES.qualifiedLeads),
    purchases: firstMetric(actions, METRIC_ALIASES.purchases),
    purchaseValueMinor: firstMoney(actionValues, METRIC_ALIASES.purchases),
    actionTypes,
  };
}

function graphError(response: Response, payload: Record<string, unknown> | null) {
  const error = payload?.error && typeof payload.error === "object"
    ? payload.error as Record<string, unknown>
    : null;
  const code = typeof error?.code === "number" ? error.code : null;
  return {
    retryable: [1, 2, 4, 17, 32, 613].includes(code ?? -1) ||
      response.status === 408 || response.status === 429 || response.status >= 500,
    httpStatus: response.status,
    code: code === null ? null : String(code),
    detail: sanitizeMetaDetail(
      error?.error_user_msg ?? error?.message ?? `HTTP ${response.status}`,
    ),
  };
}

async function json(response: Response) {
  try {
    const value = await response.json();
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function fetchMetaAdInsights(input: {
  token: string;
  graphVersion: string;
  adAccountId: string;
  since: string;
  until: string;
  fetcher?: Fetcher;
}): Promise<MetaAdsInsightsResult> {
  if (!input.token) throw new Error("token Meta ausente");
  if (!/^v\d+\.\d+$/.test(input.graphVersion)) throw new Error("versão Graph inválida");
  if (!/^\d{5,32}$/.test(input.adAccountId)) throw new Error("conta de anúncios inválida");
  if (!validDate(input.since) || !validDate(input.until) || input.since > input.until)
    throw new Error("período do Ads Insights inválido");

  const fetcher = input.fetcher ?? fetch;
  const rows: MetaAdInsight[] = [];
  let after: string | null = null;
  let pages = 0;
  do {
    const url = new URL(
      `${GRAPH_ORIGIN}/${input.graphVersion}/act_${input.adAccountId}/insights`,
    );
    url.searchParams.set("fields", [
      "account_currency", "campaign_id", "campaign_name", "adset_id", "adset_name",
      "ad_id", "ad_name", "date_start", "date_stop", "spend", "impressions",
      "reach", "clicks", "inline_link_clicks", "actions", "action_values",
    ].join(","));
    url.searchParams.set("level", "ad");
    url.searchParams.set("time_range", JSON.stringify({ since: input.since, until: input.until }));
    url.searchParams.set("time_increment", "1");
    url.searchParams.set("action_report_time", "conversion");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    let response: Response;
    try {
      response = await fetcher(url, {
        headers: { authorization: `Bearer ${input.token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return {
        ok: false,
        retryable: true,
        httpStatus: 0,
        code: null,
        detail: "Meta indisponível ou timeout ao consultar Ads Insights",
      };
    }
    const payload = await json(response);
    if (!response.ok || payload?.error) return { ok: false, ...graphError(response, payload) };
    if (!Array.isArray(payload?.data)) {
      return {
        ok: false,
        retryable: false,
        httpStatus: response.status,
        code: null,
        detail: "Meta respondeu Ads Insights em formato inesperado",
      };
    }
    try {
      rows.push(...payload.data.map(parseRow));
    } catch (error) {
      return {
        ok: false,
        retryable: false,
        httpStatus: response.status,
        code: null,
        detail: sanitizeMetaDetail(error instanceof Error ? error.message : error),
      };
    }
    pages += 1;
    const paging = payload.paging && typeof payload.paging === "object"
      ? payload.paging as Record<string, unknown>
      : null;
    const cursors = paging?.cursors && typeof paging.cursors === "object"
      ? paging.cursors as Record<string, unknown>
      : null;
    after = typeof cursors?.after === "string" && cursors.after.length <= 2048
      ? cursors.after
      : null;
  } while (after && pages < MAX_PAGES);

  if (after) {
    return {
      ok: false,
      retryable: false,
      httpStatus: 200,
      code: "pagination_limit",
      detail: "Ads Insights excedeu o limite seguro de paginação",
    };
  }
  return { ok: true, rows, pages };
}
