import type { MetaAdInsight } from "../whatsapp/meta-ads-insights";

export type ReconciliationRunStatus =
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "skipped";

export type ReconciliationTrigger = "cron" | "manual" | "test";

export type ReconciliationRun = {
  id: string;
  status: ReconciliationRunStatus;
  trigger_source: ReconciliationTrigger;
  graph_version: string | null;
  ad_account_id: string | null;
  dataset_id: string | null;
  scope_start: string;
  scope_end: string;
  insight_rows: number;
  dataset_quality_status: "not_applicable" | "available" | "unavailable" | "failed";
  dataset_quality_detail: string | null;
  error_code: string | null;
  error_detail: string | null;
  started_at: string;
  completed_at: string | null;
};

const DATASET_QUALITY_DETAIL =
  "Dataset Quality documenta métricas web; não é usado como EMQ do WhatsApp.";

function chunk<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    output.push(items.slice(index, index + size));
  return output;
}

export function conversionReconciliationDb(db: D1Database) {
  const latestRun = () => db.prepare(
    `SELECT * FROM conversion_reconciliation_runs
     ORDER BY started_at DESC,rowid DESC LIMIT 1`,
  ).first<ReconciliationRun>();
  const latestSuccessfulRun = () => db.prepare(
    `SELECT * FROM conversion_reconciliation_runs
     WHERE status='succeeded'
     ORDER BY completed_at DESC,rowid DESC LIMIT 1`,
  ).first<ReconciliationRun>();

  return {
    async beginRun(input: {
      trigger: ReconciliationTrigger;
      graphVersion: string | null;
      adAccountId: string | null;
      datasetId: string | null;
      since: string;
      until: string;
    }) {
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO conversion_reconciliation_runs
         (id,status,trigger_source,graph_version,ad_account_id,dataset_id,
          scope_start,scope_end,dataset_quality_status,dataset_quality_detail)
         VALUES (?1,'running',?2,?3,?4,?5,?6,?7,'not_applicable',?8)`,
      ).bind(
        id,
        input.trigger,
        input.graphVersion,
        input.adAccountId,
        input.datasetId,
        input.since,
        input.until,
        DATASET_QUALITY_DETAIL,
      ).run();
      return id;
    },

    async finishRun(input: {
      id: string;
      status: Exclude<ReconciliationRunStatus, "running">;
      insightRows?: number;
      errorCode?: string | null;
      errorDetail?: string | null;
    }) {
      await db.prepare(
        `UPDATE conversion_reconciliation_runs
         SET status=?2,insight_rows=?3,error_code=?4,error_detail=?5,
             completed_at=datetime('now')
         WHERE id=?1 AND status='running'`,
      ).bind(
        input.id,
        input.status,
        input.insightRows ?? 0,
        input.errorCode ?? null,
        input.errorDetail?.slice(0, 500) ?? null,
      ).run();
    },

    async replaceInsights(runId: string, adAccountId: string, rows: MetaAdInsight[]) {
      for (const group of chunk(rows, 60)) {
        await db.batch(group.map((row) => db.prepare(
          `INSERT INTO conversion_ad_insights
           (run_id,ad_account_id,day,campaign_id,campaign_name,adset_id,adset_name,
            ad_id,ad_name,currency,spend_minor,impressions,reach,clicks,
            inline_link_clicks,messaging_connections,conversations_started,
            leads,qualified_leads,purchases,purchase_value_minor,
            action_types_json,fetched_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,
                   ?15,?16,?17,?18,?19,?20,?21,?22,datetime('now'))`,
        ).bind(
          runId,
          adAccountId,
          row.day,
          row.campaignId,
          row.campaignName,
          row.adsetId,
          row.adsetName,
          row.adId,
          row.adName,
          row.currency,
          row.spendMinor,
          row.impressions,
          row.reach,
          row.clicks,
          row.inlineLinkClicks,
          row.messagingConnections,
          row.conversationsStarted,
          row.leads,
          row.qualifiedLeads,
          row.purchases,
          row.purchaseValueMinor,
          JSON.stringify(row.actionTypes),
        )));
      }
    },

    latestRun,

    latestSuccessfulRun,

    async summary(days: 7 | 30 | 90) {
      const sinceEpoch = Math.floor(Date.now() / 1000) - days * 86400;
      const sinceDay = new Date(sinceEpoch * 1000).toISOString().slice(0, 10);
      const [lastRun, lastSuccessfulRun] = await Promise.all([
        latestRun(),
        latestSuccessfulRun(),
      ]);
      const snapshotRunId = lastSuccessfulRun?.id ?? "__none__";
      const [providerTotals, providerAds, localAttributions, localEvents] = await Promise.all([
        db.prepare(
          `SELECT currency,
                  COALESCE(SUM(spend_minor),0) AS spend_minor,
                  COALESCE(SUM(impressions),0) AS impressions,
                  COALESCE(SUM(reach),0) AS reach,
                  COALESCE(SUM(clicks),0) AS clicks,
                  COALESCE(SUM(inline_link_clicks),0) AS inline_link_clicks,
                  COALESCE(SUM(messaging_connections),0) AS messaging_connections,
                  COALESCE(SUM(conversations_started),0) AS conversations_started,
                  COALESCE(SUM(leads),0) AS leads,
                  COALESCE(SUM(qualified_leads),0) AS qualified_leads,
                  COALESCE(SUM(purchases),0) AS purchases,
                  COALESCE(SUM(purchase_value_minor),0) AS purchase_value_minor
           FROM conversion_ad_insights
           WHERE run_id=?1 AND day>=?2 GROUP BY currency ORDER BY currency`,
        ).bind(snapshotRunId, sinceDay).all(),
        db.prepare(
          `SELECT campaign_id,MAX(campaign_name) AS campaign_name,
                  adset_id,MAX(adset_name) AS adset_name,
                  ad_id,MAX(ad_name) AS ad_name,currency,
                  MIN(day) AS first_day,MAX(day) AS last_day,
                  COALESCE(SUM(spend_minor),0) AS spend_minor,
                  COALESCE(SUM(impressions),0) AS impressions,
                  COALESCE(SUM(reach),0) AS reach,
                  COALESCE(SUM(clicks),0) AS clicks,
                  COALESCE(SUM(inline_link_clicks),0) AS inline_link_clicks,
                  COALESCE(SUM(messaging_connections),0) AS messaging_connections,
                  COALESCE(SUM(conversations_started),0) AS conversations_started,
                  COALESCE(SUM(leads),0) AS leads,
                  COALESCE(SUM(qualified_leads),0) AS qualified_leads,
                  COALESCE(SUM(purchases),0) AS purchases,
                  COALESCE(SUM(purchase_value_minor),0) AS purchase_value_minor,
                  MAX(fetched_at) AS fetched_at
           FROM conversion_ad_insights
           WHERE run_id=?1 AND day>=?2
           GROUP BY campaign_id,adset_id,ad_id,currency
           ORDER BY spend_minor DESC,ad_id`,
        ).bind(snapshotRunId, sinceDay).all(),
        db.prepare(
          `SELECT source_id AS ad_id,COUNT(DISTINCT conversation_id) AS conversations,
                  MIN(occurred_at) AS first_at,MAX(occurred_at) AS last_at
           FROM conversation_attributions
           WHERE source_type='ad' AND source_id GLOB '[0-9]*'
             AND occurred_at>=?1
           GROUP BY source_id`,
        ).bind(sinceEpoch).all(),
        db.prepare(
          `SELECT a.source_id AS ad_id,e.event_name,
                  COUNT(*) AS recorded,
                  COALESCE(SUM(o.status='accepted'),0) AS accepted,
                  COALESCE(SUM(CASE WHEN e.event_name='Purchase'
                    THEN e.value_minor ELSE 0 END),0) AS value_minor,
                  MAX(e.event_time) AS latest_event_at
           FROM conversion_events e
           JOIN conversion_outbox o ON o.event_id=e.id
           JOIN conversation_attributions a ON a.id=e.attribution_id
           WHERE e.event_time>=?1 AND e.lifecycle_status='active'
             AND o.status<>'cancelled' AND a.source_type='ad'
             AND a.source_id GLOB '[0-9]*'
           GROUP BY a.source_id,e.event_name`,
        ).bind(sinceEpoch).all(),
      ]);
      return {
        days,
        latestRun: lastRun,
        latestSuccessfulRun: lastSuccessfulRun,
        datasetQuality: {
          status: "not_applicable" as const,
          detail: DATASET_QUALITY_DETAIL,
        },
        providerTotals: providerTotals.results,
        providerAds: providerAds.results,
        localAttributions: localAttributions.results,
        localEvents: localEvents.results,
      };
    },
  };
}
