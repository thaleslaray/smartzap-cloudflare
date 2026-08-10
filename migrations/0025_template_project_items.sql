ALTER TABLE template_projects ADD COLUMN prompt TEXT;
ALTER TABLE template_projects ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE template_projects ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

CREATE TABLE template_project_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES template_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'pt_BR',
  category TEXT NOT NULL DEFAULT 'UTILITY' CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  status TEXT NOT NULL DEFAULT 'draft',
  meta_id TEXT,
  meta_status TEXT,
  rejected_reason TEXT,
  submitted_at TEXT,
  components_json TEXT NOT NULL DEFAULT '[]',
  sample_variables_json TEXT NOT NULL DEFAULT '{}',
  marketing_variables_json TEXT NOT NULL DEFAULT '{}',
  header_json TEXT,
  footer_json TEXT,
  buttons_json TEXT NOT NULL DEFAULT '[]',
  variables_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_template_project_items_project ON template_project_items(project_id,created_at,id);
CREATE INDEX idx_template_project_items_status ON template_project_items(project_id,meta_status,status);
