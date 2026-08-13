ALTER TABLE vault_control ADD COLUMN rotation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_vault_control_rotation
ON vault_control(status, updated_at);
