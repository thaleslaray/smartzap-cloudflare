-- Schema smartzap-cf (spec §6). SQLite/D1.
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('opt_in','opt_out','unknown')),
  custom_fields TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE contact_tags (
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);
CREATE TABLE custom_field_defs (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text'
);
CREATE TABLE templates (
  name TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  components TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','scheduled','sending','completed','paused','failed','cancelled')),
  scheduled_at TEXT,
  workflow_id TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  read INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE TABLE campaign_contacts (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','skipped','sending','sent','delivered','read','failed')),
  message_id TEXT,
  error_code TEXT,
  error_detail TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, contact_id)
);
CREATE INDEX idx_cc_message_id ON campaign_contacts(message_id);
CREATE INDEX idx_cc_status ON campaign_contacts(campaign_id, status);
CREATE TABLE suppressions (
  phone TEXT PRIMARY KEY,
  reason TEXT,
  expires_at TEXT
);
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT,
  status TEXT NOT NULL,
  raw TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_se_message_id ON status_events(message_id);
-- Evidência de consentimento (LGPD art. 8º: ônus da prova é do controlador).
-- Cada import/cadastro grava a declaração aceita, a origem e a contagem.
CREATE TABLE consent_events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('import','manual')),
  declaration_text TEXT NOT NULL,
  contact_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
