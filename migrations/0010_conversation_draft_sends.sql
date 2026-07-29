-- Envio manual de rascunhos aprovados. A reserva é criada antes do POST à Meta
-- e nunca é reutilizada: falha ambígua exige revisão humana, não retry automático.
CREATE TABLE conversation_draft_sends (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  draft_id TEXT NOT NULL UNIQUE REFERENCES ai_drafts(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL CHECK (length(phone_number_id) BETWEEN 5 AND 32),
  phone_hash TEXT NOT NULL CHECK (length(phone_hash) = 64),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN (
    'reserved','accepted','sent','delivered','read','failed','rejected','ambiguous'
  )),
  message_id TEXT UNIQUE,
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 64),
  error_detail TEXT CHECK (error_detail IS NULL OR length(error_detail) <= 500),
  accepted_at TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  failed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_conversation_draft_sends_conversation
ON conversation_draft_sends(conversation_id, created_at DESC);

CREATE INDEX idx_conversation_draft_sends_status
ON conversation_draft_sends(status, updated_at);
