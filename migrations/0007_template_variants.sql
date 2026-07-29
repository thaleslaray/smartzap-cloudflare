-- A Meta identifica uma variante de template por nome + idioma. Preserva todas
-- as traduções em vez de sobrescrever a última durante a sincronização.
ALTER TABLE campaigns ADD COLUMN template_language TEXT NOT NULL DEFAULT 'pt_BR';

UPDATE campaigns
SET template_language = COALESCE(
  (SELECT language FROM templates WHERE templates.name = campaigns.template_name LIMIT 1),
  'pt_BR'
);

CREATE TABLE templates_v2 (
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  meta_id TEXT,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  components TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  quality_score TEXT,
  quality_updated_at TEXT,
  PRIMARY KEY (name, language)
);

INSERT INTO templates_v2
  (name, language, category, status, components, synced_at, quality_score, quality_updated_at)
SELECT name, language, category, status, components, synced_at, quality_score, quality_updated_at
FROM templates;

DROP TABLE templates;
ALTER TABLE templates_v2 RENAME TO templates;

CREATE UNIQUE INDEX idx_templates_meta_id
ON templates(meta_id) WHERE meta_id IS NOT NULL;
CREATE INDEX idx_templates_status ON templates(status);

