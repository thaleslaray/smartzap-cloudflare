CREATE TABLE IF NOT EXISTS secret_vault (
  name TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS setup_checks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'passed', 'failed')),
  detail TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
