CREATE TABLE template_drafts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  category TEXT NOT NULL CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  components TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTING','FAILED')),
  error_detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_template_drafts_updated ON template_drafts(updated_at DESC, id);
