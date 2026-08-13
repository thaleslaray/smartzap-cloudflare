-- Segmentação avançada e histórico auditável de contatos.
-- Regras de segmentos são JSON validado pela aplicação; nunca SQL fornecido pelo cliente.

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag_contact ON contact_tags(tag_id, contact_id);

CREATE TABLE contact_custom_values (
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL REFERENCES custom_field_defs(id) ON DELETE CASCADE,
  value_text TEXT,
  value_number REAL,
  value_date TEXT,
  value_boolean INTEGER CHECK (value_boolean IS NULL OR value_boolean IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (contact_id, field_id),
  CHECK (
    (value_text IS NOT NULL) +
    (value_number IS NOT NULL) +
    (value_date IS NOT NULL) +
    (value_boolean IS NOT NULL) = 1
  )
);

CREATE INDEX idx_contact_custom_values_field_text
ON contact_custom_values(field_id, value_text);
CREATE INDEX idx_contact_custom_values_field_number
ON contact_custom_values(field_id, value_number);
CREATE INDEX idx_contact_custom_values_field_date
ON contact_custom_values(field_id, value_date);

CREATE TABLE saved_segments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE contact_history_events (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 64),
  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('system', 'admin', 'contact', 'meta', 'automation')),
  actor_id TEXT CHECK (actor_id IS NULL OR length(actor_id) <= 128),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 500),
  metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_contact_history_timeline
ON contact_history_events(contact_id, created_at DESC, id DESC);

