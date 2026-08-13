import { conversionReconciliationDb, type ReconciliationTrigger } from "../db/conversion-reconciliation";
import { settingsDb } from "../db/settings";
import { redactOperationalDetail } from "../domain/redaction";
import { fetchMetaAdInsights } from "../whatsapp/meta-ads-insights";
import { getCredentials } from "../whatsapp/credentials";

const DEFAULT_LOOKBACK_DAYS = 90;
const CRON_INTERVAL_MS = 6 * 60 * 60 * 1000;

function utcDay(epochMs: number) {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function safeGraphVersion(value: string | undefined) {
  return value && /^v\d+\.\d+$/.test(value) ? value : "v25.0";
}

function safeAdAccountId(value: string | undefined) {
  const normalized = value?.replace(/^act_/, "").trim() ?? "";
  return /^\d{5,32}$/.test(normalized) ? normalized : null;
}

export type ConversionReconciliationResult = {
  status: "succeeded" | "failed" | "skipped";
  runId: string | null;
  rows: number;
  pages: number;
  since: string;
  until: string;
  reason?: "throttled" | "configuration_missing";
  retryable?: boolean;
  detail?: string;
};

export async function reconcileMetaConversions(
  env: Env,
  options: {
    trigger: ReconciliationTrigger;
    force?: boolean;
    now?: number;
    fetcher?: typeof fetch;
  },
): Promise<ConversionReconciliationResult> {
  const now = options.now ?? Date.now();
  const until = utcDay(now);
  const since = utcDay(now - (DEFAULT_LOOKBACK_DAYS - 1) * 86_400_000);
  const credentials = await getCredentials(env).catch(() => null);
  const graphVersion = safeGraphVersion(credentials?.graphVersion ?? env.META_GRAPH_VERSION);
  const adAccountId = safeAdAccountId(env.META_AD_ACCOUNT_ID);
  const token = credentials?.token.trim() ?? "";
  const db = conversionReconciliationDb(env.DB);

  if (!adAccountId || !token) {
    return {
      status: "skipped",
      runId: null,
      rows: 0,
      pages: 0,
      since,
      until,
      reason: "configuration_missing",
      detail: "Conta de anúncios ou credencial Meta não configurada.",
    };
  }

  if (!options.force) {
    const lastSuccess = await db.latestSuccessfulRun();
    const completedAt = lastSuccess?.completed_at
      ? Date.parse(`${lastSuccess.completed_at.replace(" ", "T")}Z`)
      : Number.NaN;
    if (Number.isFinite(completedAt) && now - completedAt < CRON_INTERVAL_MS) {
      return {
        status: "skipped",
        runId: null,
        rows: 0,
        pages: 0,
        since,
        until,
        reason: "throttled",
      };
    }
  }

  const datasetId = await settingsDb(env.DB).get("capi_dataset_id");
  const runId = await db.beginRun({
    trigger: options.trigger,
    graphVersion,
    adAccountId,
    datasetId,
    since,
    until,
  });
  const result = await fetchMetaAdInsights({
    token,
    graphVersion,
    adAccountId,
    since,
    until,
    fetcher: options.fetcher,
  });
  if (!result.ok) {
    const detail = redactOperationalDetail(result.detail);
    await db.finishRun({
      id: runId,
      status: "failed",
      errorCode: result.code ?? (result.httpStatus ? `http_${result.httpStatus}` : "network"),
      errorDetail: detail,
    });
    return {
      status: "failed",
      runId,
      rows: 0,
      pages: 0,
      since,
      until,
      retryable: result.retryable,
      detail,
    };
  }

  try {
    await db.replaceInsights(runId, adAccountId, result.rows);
    await db.finishRun({ id: runId, status: "succeeded", insightRows: result.rows.length });
  } catch (error) {
    const detail = redactOperationalDetail(error instanceof Error ? error.message : error);
    await db.finishRun({
      id: runId,
      status: "failed",
      errorCode: "persistence_failed",
      errorDetail: detail,
    });
    return {
      status: "failed",
      runId,
      rows: 0,
      pages: result.pages,
      since,
      until,
      retryable: true,
      detail,
    };
  }

  return {
    status: "succeeded",
    runId,
    rows: result.rows.length,
    pages: result.pages,
    since,
    until,
  };
}
