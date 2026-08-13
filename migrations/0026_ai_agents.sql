CREATE TABLE ai_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_ai_agents_default ON ai_agents(is_default) WHERE is_default=1;
CREATE TABLE ai_agent_documents (
  agent_id TEXT NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  PRIMARY KEY(agent_id,document_id)
);
INSERT INTO ai_agents(id,name,description,instructions,active,is_default) VALUES('agent_commercial','Agente Comercial','Respondendo automaticamente','Atenda com objetividade, use apenas a base de conhecimento e encaminhe para uma pessoa quando faltar informação.',1,1);
INSERT OR IGNORE INTO settings(key,value) VALUES('ai_global_enabled','true');
