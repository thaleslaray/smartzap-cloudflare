PRAGMA foreign_keys=OFF;
CREATE TABLE knowledge_documents_new (
  id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 255),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('text/plain','text/markdown','text/html','application/pdf')),
  r2_key TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL CHECK (length(checksum) = 64), ai_search_item_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','indexing','ready','failed','deleted')),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 64), created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT
);
INSERT INTO knowledge_documents_new SELECT * FROM knowledge_documents;
DROP TABLE knowledge_documents;
ALTER TABLE knowledge_documents_new RENAME TO knowledge_documents;
CREATE INDEX idx_knowledge_documents_status ON knowledge_documents(status, created_at DESC);
PRAGMA foreign_keys=ON;
