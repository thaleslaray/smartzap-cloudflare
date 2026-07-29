CREATE TABLE flow_endpoint_actions (
  id TEXT PRIMARY KEY,
  flow_token_hash TEXT NOT NULL,
  screen TEXT NOT NULL,
  action TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing','completed','failed')),
  response_json TEXT,
  error_code TEXT,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(flow_token_hash, screen, action, request_hash)
);

ALTER TABLE flows ADD COLUMN meta_status TEXT;
ALTER TABLE flows ADD COLUMN meta_health_json TEXT;
ALTER TABLE flows ADD COLUMN meta_endpoint_uri TEXT;
ALTER TABLE flows ADD COLUMN meta_data_api_version TEXT;
ALTER TABLE flows ADD COLUMN meta_application_id TEXT;
ALTER TABLE flows ADD COLUMN local_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE flows ADD COLUMN synced_revision INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_flow_endpoint_actions_status
ON flow_endpoint_actions(status, claimed_at);
