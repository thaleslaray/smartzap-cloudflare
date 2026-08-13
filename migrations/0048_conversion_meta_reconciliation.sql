-- Snapshots agregados e sanitizados da Marketing API. Nenhuma linha desta
-- migração contém ctwa_clid, telefone, conteúdo de conversa ou token.

CREATE TABLE conversion_reconciliation_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'meta' CHECK (provider = 'meta'),
  status TEXT NOT NULL CHECK (
    status IN ('running', 'succeeded', 'partial', 'failed', 'skipped')
  ),
  trigger_source TEXT NOT NULL CHECK (
    trigger_source IN ('cron', 'manual', 'test')
  ),
  graph_version TEXT,
  ad_account_id TEXT,
  dataset_id TEXT,
  scope_start TEXT NOT NULL,
  scope_end TEXT NOT NULL,
  insight_rows INTEGER NOT NULL DEFAULT 0 CHECK (insight_rows >= 0),
  dataset_quality_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK (
    dataset_quality_status IN ('not_applicable', 'available', 'unavailable', 'failed')
  ),
  dataset_quality_detail TEXT,
  error_code TEXT,
  error_detail TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX idx_conversion_reconciliation_runs_latest
ON conversion_reconciliation_runs(started_at DESC, id DESC);

CREATE TABLE conversion_ad_insights (
  run_id TEXT NOT NULL REFERENCES conversion_reconciliation_runs(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  day TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  adset_id TEXT NOT NULL,
  adset_name TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  ad_name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  spend_minor INTEGER NOT NULL DEFAULT 0 CHECK (spend_minor >= 0),
  impressions INTEGER NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  reach INTEGER NOT NULL DEFAULT 0 CHECK (reach >= 0),
  clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  inline_link_clicks INTEGER NOT NULL DEFAULT 0 CHECK (inline_link_clicks >= 0),
  messaging_connections INTEGER NOT NULL DEFAULT 0 CHECK (messaging_connections >= 0),
  conversations_started INTEGER NOT NULL DEFAULT 0 CHECK (conversations_started >= 0),
  leads INTEGER NOT NULL DEFAULT 0 CHECK (leads >= 0),
  qualified_leads INTEGER NOT NULL DEFAULT 0 CHECK (qualified_leads >= 0),
  purchases INTEGER NOT NULL DEFAULT 0 CHECK (purchases >= 0),
  purchase_value_minor INTEGER NOT NULL DEFAULT 0 CHECK (purchase_value_minor >= 0),
  action_types_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(action_types_json)),
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (run_id, day, ad_id)
);

CREATE INDEX idx_conversion_ad_insights_period
ON conversion_ad_insights(run_id, day DESC, ad_id);

CREATE INDEX idx_conversion_ad_insights_campaign
ON conversion_ad_insights(campaign_id, day DESC);
