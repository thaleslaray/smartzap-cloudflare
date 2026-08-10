-- Inbox mínima e fail-closed. Receber uma mensagem nunca concede opt-in de
-- marketing; contatos novos entram como `unknown`.
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  wa_id TEXT NOT NULL UNIQUE,
  last_message_at INTEGER,
  last_message_preview TEXT CHECK (last_message_preview IS NULL OR length(last_message_preview) <= 240),
  unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  message_type TEXT NOT NULL CHECK (length(message_type) BETWEEN 1 AND 64),
  text_body TEXT CHECK (text_body IS NULL OR length(text_body) <= 4096),
  content_json TEXT CHECK (content_json IS NULL OR length(content_json) <= 8192),
  phone_number_id TEXT NOT NULL,
  meta_timestamp INTEGER NOT NULL CHECK (meta_timestamp >= 0),
  read_at TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_conversation_messages_timeline
ON conversation_messages(conversation_id, meta_timestamp DESC, id DESC);
CREATE INDEX idx_conversations_recent
ON conversations(last_message_at DESC, id DESC);
