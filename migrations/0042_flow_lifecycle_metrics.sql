ALTER TABLE flows ADD COLUMN published_meta_id TEXT;
ALTER TABLE flows ADD COLUMN published_revision INTEGER NOT NULL DEFAULT 0;

UPDATE flows
SET published_meta_id = meta_id,
    published_revision = synced_revision
WHERE meta_status = 'PUBLISHED' AND meta_id IS NOT NULL;

CREATE TABLE flow_meta_versions (
  id TEXT PRIMARY KEY,
  flow_local_id TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  meta_flow_id TEXT NOT NULL,
  status TEXT,
  local_revision INTEGER NOT NULL,
  definition_json TEXT NOT NULL DEFAULT '{}',
  replaced_by_meta_flow_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(flow_local_id, meta_flow_id)
);

CREATE TABLE flow_endpoint_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  success INTEGER NOT NULL CHECK (success IN (0,1)),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  error_code TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_flow_meta_versions_local
ON flow_meta_versions(flow_local_id, created_at DESC);

CREATE INDEX idx_flow_endpoint_metrics_time
ON flow_endpoint_metrics(recorded_at DESC);
