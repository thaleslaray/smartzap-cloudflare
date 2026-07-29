ALTER TABLE ai_agents ADD COLUMN temperature REAL NOT NULL DEFAULT 0.7
  CHECK (temperature >= 0 AND temperature <= 2);
ALTER TABLE ai_agents ADD COLUMN max_tokens INTEGER NOT NULL DEFAULT 1024
  CHECK (max_tokens >= 100 AND max_tokens <= 8192);
ALTER TABLE ai_agents ADD COLUMN debounce_ms INTEGER NOT NULL DEFAULT 5000
  CHECK (debounce_ms >= 0 AND debounce_ms <= 30000);
ALTER TABLE ai_agents ADD COLUMN rag_similarity_threshold REAL NOT NULL DEFAULT 0.5
  CHECK (rag_similarity_threshold >= 0 AND rag_similarity_threshold <= 1);
ALTER TABLE ai_agents ADD COLUMN rag_max_results INTEGER NOT NULL DEFAULT 5
  CHECK (rag_max_results >= 1 AND rag_max_results <= 20);
ALTER TABLE ai_agents ADD COLUMN handoff_enabled INTEGER NOT NULL DEFAULT 1
  CHECK (handoff_enabled IN (0,1));
ALTER TABLE ai_agents ADD COLUMN handoff_instructions TEXT NOT NULL DEFAULT
  'Só transfira para humano quando o cliente pedir explicitamente ou quando a base não contiver uma resposta segura.';

-- Conversas criadas depois da migration 0028 podiam ficar sem agente.
UPDATE conversations
SET ai_agent_id=(SELECT id FROM ai_agents WHERE is_default=1 LIMIT 1)
WHERE ai_agent_id IS NULL;
