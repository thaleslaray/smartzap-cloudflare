CREATE TABLE IF NOT EXISTS oauth_sessions (
  id TEXT PRIMARY KEY,
  state_hash TEXT NOT NULL UNIQUE,
  pkce_verifier_ciphertext TEXT NOT NULL,
  token_ciphertext TEXT,
  account_id TEXT,
  account_name TEXT,
  status TEXT NOT NULL CHECK(status IN ('authorizing','authorized','account_selected','revoked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_sessions_expires ON oauth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS provisioner_installations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES oauth_sessions(id),
  account_id TEXT NOT NULL,
  prefix TEXT NOT NULL,
  release_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('planned','running','failed','rolled_back','complete')),
  plan_json TEXT NOT NULL,
  progress_json TEXT NOT NULL DEFAULT '[]',
  error_code TEXT,
  error_detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id, prefix)
);

CREATE TABLE IF NOT EXISTS provisioner_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  installation_id TEXT NOT NULL REFERENCES provisioner_installations(id),
  level TEXT NOT NULL CHECK(level IN ('info','warning','error')),
  code TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
