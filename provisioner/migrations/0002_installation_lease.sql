ALTER TABLE provisioner_installations ADD COLUMN lease_token TEXT;
ALTER TABLE provisioner_installations ADD COLUMN lease_expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_provisioner_installations_lease
ON provisioner_installations(lease_expires_at);
