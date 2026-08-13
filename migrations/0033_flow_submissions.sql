CREATE TABLE flow_submissions (
  id TEXT PRIMARY KEY,
  message_id TEXT UNIQUE,
  flow_local_id TEXT REFERENCES flows(id) ON DELETE SET NULL,
  meta_flow_id TEXT,
  flow_token TEXT,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  from_phone TEXT,
  response_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','completed','rejected','ambiguous')),
  message_timestamp TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_flow_submissions_created ON flow_submissions(created_at DESC,id);
CREATE INDEX idx_flow_submissions_token ON flow_submissions(flow_token);
CREATE INDEX idx_flow_submissions_flow ON flow_submissions(flow_local_id,created_at DESC);
