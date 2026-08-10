CREATE TABLE pricing_tiers (
  id TEXT PRIMARY KEY,
  waba_id TEXT NOT NULL,
  region TEXT NOT NULL,
  pricing_category TEXT NOT NULL,
  effective_month TEXT NOT NULL,
  tier TEXT NOT NULL,
  tier_from INTEGER,
  tier_to INTEGER,
  tier_update_time INTEGER NOT NULL,
  source_event_key TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(waba_id, region, pricing_category, effective_month)
);

CREATE TABLE pricing_analytics_points (
  id TEXT PRIMARY KEY,
  waba_id TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  granularity TEXT NOT NULL,
  country TEXT,
  pricing_category TEXT,
  pricing_type TEXT,
  tier TEXT,
  phone_number_id TEXT,
  volume INTEGER,
  cost REAL,
  currency TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(waba_id, period_start, period_end, granularity, country, pricing_category, pricing_type, tier, phone_number_id)
);

CREATE TABLE campaign_cost_snapshots (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('estimated','actual_from_meta','invoice','unavailable')),
  amount REAL,
  currency TEXT,
  breakdown_json TEXT NOT NULL DEFAULT '[]',
  assumptions_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL,
  effective_from TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE message_cost_reconciliation (
  message_id TEXT PRIMARY KEY,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  pricing_model TEXT,
  pricing_type TEXT,
  pricing_category TEXT,
  country_iso TEXT,
  tier TEXT,
  state TEXT NOT NULL CHECK (state IN ('pending','actual_from_meta','invoice','free','unavailable')),
  amount REAL,
  currency TEXT,
  source_event_key TEXT,
  reconciled_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_pricing_tiers_current
ON pricing_tiers(waba_id, effective_month, region, pricing_category);
CREATE INDEX idx_pricing_analytics_period
ON pricing_analytics_points(waba_id, period_start, period_end);
CREATE INDEX idx_campaign_cost_snapshots
ON campaign_cost_snapshots(campaign_id, created_at DESC);
