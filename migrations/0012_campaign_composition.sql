-- Composição determinística, organização e agendamento de campanhas.

CREATE TABLE campaign_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE campaign_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
  color TEXT CHECK (color IS NULL OR (
    length(color) = 7 AND substr(color, 1, 1) = '#'
    AND lower(substr(color, 2)) NOT GLOB '*[^0-9a-f]*'
  ))
);

CREATE TABLE campaign_tag_assignments (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES campaign_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, tag_id)
);

CREATE INDEX idx_campaign_tag_assignments_tag
ON campaign_tag_assignments(tag_id, campaign_id);

ALTER TABLE campaigns ADD COLUMN folder_id TEXT REFERENCES campaign_folders(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
ALTER TABLE campaigns ADD COLUMN audience_definition_json TEXT CHECK (
  audience_definition_json IS NULL OR json_valid(audience_definition_json)
);
ALTER TABLE campaigns ADD COLUMN variable_mapping_json TEXT CHECK (
  variable_mapping_json IS NULL OR json_valid(variable_mapping_json)
);
ALTER TABLE campaigns ADD COLUMN audience_snapshot_hash TEXT CHECK (
  audience_snapshot_hash IS NULL OR length(audience_snapshot_hash) = 64
);
ALTER TABLE campaigns ADD COLUMN estimated_cost_brl REAL CHECK (
  estimated_cost_brl IS NULL OR estimated_cost_brl >= 0
);
ALTER TABLE campaigns ADD COLUMN cancelled_at TEXT;

CREATE INDEX idx_campaigns_folder_created
ON campaigns(folder_id, created_at DESC);
CREATE INDEX idx_campaigns_scheduled
ON campaigns(status, scheduled_at) WHERE status = 'scheduled';
