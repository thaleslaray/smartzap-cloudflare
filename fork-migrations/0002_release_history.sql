-- SmartZap schema 1 -> 2
-- Expansiva, sem downtime e compatível com o código do schema anterior.
-- A remoção desta tabela não faz parte desta release.

CREATE TABLE IF NOT EXISTS smartzap_release_history (
  release_key TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('stable', 'rc', 'beta')),
  transition TEXT NOT NULL CHECK (transition IN ('install', 'upgrade')),
  previous_version TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_smartzap_release_history_recorded_at
  ON smartzap_release_history(recorded_at DESC);
