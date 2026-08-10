-- IA assistiva e automação controlada: o modo assistivo exige revisão humana;
-- o caminho autônomo só opera atrás das travas da Inbox e do piloto.
ALTER TABLE conversations ADD COLUMN ai_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (ai_enabled IN (0, 1));

CREATE TABLE ai_drafts (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  source_message_id TEXT REFERENCES conversation_messages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating','pending_review','approved','discarded','failed')),
  text_body TEXT CHECK (text_body IS NULL OR length(text_body) <= 4096),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 128),
  prompt_version TEXT NOT NULL CHECK (length(prompt_version) BETWEEN 1 AND 64),
  prompt_tokens INTEGER CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 64),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ai_drafts_conversation
ON ai_drafts(conversation_id, created_at DESC, id DESC);
CREATE INDEX idx_ai_drafts_created ON ai_drafts(created_at);
