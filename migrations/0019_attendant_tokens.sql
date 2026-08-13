CREATE TABLE IF NOT EXISTS attendant_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  permissions_json TEXT NOT NULL DEFAULT '{"canView":true,"canReply":true,"canHandoff":false}',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_used_at TEXT,
  access_count INTEGER NOT NULL DEFAULT 0 CHECK (access_count >= 0),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attendant_tokens_active
  ON attendant_tokens(is_active, created_at DESC);
