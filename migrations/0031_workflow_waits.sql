CREATE TABLE workflow_waits (
  execution_id TEXT NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  variable_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('preparing','waiting','resuming','answered','expired','failed')),
  message_id TEXT,
  source_message_id TEXT,
  response_text TEXT,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  answered_at TEXT,
  PRIMARY KEY(execution_id,node_id)
);

CREATE INDEX idx_workflow_waits_conversation
  ON workflow_waits(conversation_id,status,expires_at);
