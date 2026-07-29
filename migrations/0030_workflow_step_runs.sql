CREATE TABLE workflow_step_runs (
  execution_id TEXT NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('running','succeeded','failed')),
  output_json TEXT,
  message_id TEXT,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT(datetime('now')),
  finished_at TEXT,
  PRIMARY KEY(execution_id,node_id)
);

CREATE INDEX idx_workflow_step_runs_status
  ON workflow_step_runs(execution_id,status);
