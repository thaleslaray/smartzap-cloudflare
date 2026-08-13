-- Operação humana da Inbox: estado, handoff, labels, respostas rápidas e notas internas.

ALTER TABLE conversations ADD COLUMN status TEXT NOT NULL DEFAULT 'open'
  CHECK (status IN ('open', 'closed'));
ALTER TABLE conversations ADD COLUMN mode TEXT NOT NULL DEFAULT 'human'
  CHECK (mode IN ('human', 'bot'));
ALTER TABLE conversations ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE conversations ADD COLUMN automation_paused_until INTEGER;
ALTER TABLE conversations ADD COLUMN handoff_reason TEXT CHECK (
  handoff_reason IS NULL OR length(handoff_reason) <= 500
);
ALTER TABLE conversations ADD COLUMN handoff_at TEXT;

CREATE INDEX idx_conversations_operations
ON conversations(status, mode, priority, last_message_at DESC);

CREATE TABLE inbox_labels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
  color TEXT CHECK (color IS NULL OR (
    length(color) = 7 AND substr(color, 1, 1) = '#'
    AND lower(substr(color, 2)) NOT GLOB '*[^0-9a-f]*'
  )),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE conversation_labels (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES inbox_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, label_id)
);

CREATE INDEX idx_conversation_labels_label ON conversation_labels(label_id, conversation_id);

CREATE TABLE quick_replies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  shortcut TEXT NOT NULL UNIQUE CHECK (length(shortcut) BETWEEN 1 AND 64),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4096),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE conversation_notes (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4096),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_conversation_notes_timeline
ON conversation_notes(conversation_id, created_at DESC, id DESC);
