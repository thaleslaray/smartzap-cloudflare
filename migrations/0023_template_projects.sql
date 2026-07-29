CREATE TABLE template_projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'marketing' CHECK (strategy IN ('marketing','utility','bypass')),
  template_count INTEGER NOT NULL DEFAULT 0,
  approved_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_template_projects_updated ON template_projects(updated_at DESC,id);
