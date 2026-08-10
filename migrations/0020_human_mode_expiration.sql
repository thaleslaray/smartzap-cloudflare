ALTER TABLE conversations ADD COLUMN human_mode_expires_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_conversations_human_mode_expiration
  ON conversations(human_mode_expires_at)
  WHERE human_mode_expires_at IS NOT NULL;
