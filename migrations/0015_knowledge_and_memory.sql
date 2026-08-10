-- Base de conhecimento e memória revisável; conteúdo fica no R2/AI Search,
-- D1 mantém apenas o ciclo de vida e referências necessárias à operação.

CREATE TABLE knowledge_documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 255),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('text/plain', 'text/markdown', 'text/html')),
  r2_key TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL CHECK (length(checksum) = 64),
  ai_search_item_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'indexing', 'ready', 'failed', 'deleted')),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 64),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX idx_knowledge_documents_status ON knowledge_documents(status, created_at DESC);

CREATE TABLE contact_memories (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 4096),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  source_message_at INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_contact_memories_one_current ON contact_memories(contact_id);

CREATE TABLE ai_runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('draft', 'automation', 'memory')),
  model TEXT NOT NULL,
  decision TEXT NOT NULL,
  source_document_ids_json TEXT CHECK (source_document_ids_json IS NULL OR json_valid(source_document_ids_json)),
  prompt_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ai_runs_conversation ON ai_runs(conversation_id, created_at DESC);
