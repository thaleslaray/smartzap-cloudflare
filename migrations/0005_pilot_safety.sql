-- Travas do piloto real: cada reserva conta como tentativa, inclusive quando a
-- Meta rejeita a mensagem ou o resultado remoto fica ambíguo.
CREATE TABLE pilot_send_ledger (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  phone_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved', 'accepted', 'rejected', 'ambiguous')),
  message_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(campaign_id, contact_id)
);

CREATE INDEX idx_pilot_send_ledger_created_at
ON pilot_send_ledger(created_at);
