-- Orçamento do piloto por rodada. O ledger anterior permanece íntegro e as
-- tentativas legadas ficam com pilot_run_id NULL.
CREATE TABLE pilot_runs (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'closed')),
  max_attempts INTEGER NOT NULL CHECK(max_attempts BETWEEN 1 AND 3),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

-- Só pode existir uma rodada ativa por vez.
CREATE UNIQUE INDEX idx_pilot_runs_one_active
ON pilot_runs(status) WHERE status = 'active';

ALTER TABLE pilot_send_ledger
ADD COLUMN pilot_run_id TEXT REFERENCES pilot_runs(id);

CREATE INDEX idx_pilot_send_ledger_run
ON pilot_send_ledger(pilot_run_id, created_at);
