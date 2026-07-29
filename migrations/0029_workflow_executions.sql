CREATE TABLE workflow_executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN('queued','running','succeeded','failed','cancelled')),
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  logs_json TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE INDEX idx_workflow_executions_flow ON workflow_executions(workflow_id,created_at DESC,id);
