ALTER TABLE conversations ADD COLUMN ai_agent_id TEXT REFERENCES ai_agents(id) ON DELETE SET NULL;
UPDATE conversations SET ai_agent_id=(SELECT id FROM ai_agents WHERE is_default=1 LIMIT 1) WHERE ai_agent_id IS NULL;
CREATE INDEX idx_conversations_agent ON conversations(ai_agent_id,status,mode,last_message_at DESC);
