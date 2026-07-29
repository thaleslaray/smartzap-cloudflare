-- Cópias privadas de mídia inbound. A URL temporária da Meta nunca é a fonte
-- permanente do operador; o objeto fica no R2 e a referência no D1.
CREATE TABLE conversation_media (
  message_id TEXT PRIMARY KEY REFERENCES conversation_messages(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (length(mime_type) BETWEEN 1 AND 255),
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0 AND byte_size <= 26214400),
  checksum TEXT NOT NULL CHECK (length(checksum) = 64),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_conversation_media_conversation ON conversation_media(conversation_id, created_at DESC);
