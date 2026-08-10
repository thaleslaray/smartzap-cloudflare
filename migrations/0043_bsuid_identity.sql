-- Username/BSUID rollout (Meta, 2026): o telefone pode ser omitido dos
-- webhooks. Mantemos a coluna phone por compatibilidade e associamos a
-- identidade estável do usuário em colunas próprias.
ALTER TABLE contacts ADD COLUMN user_id TEXT;
ALTER TABLE contacts ADD COLUMN parent_user_id TEXT;
ALTER TABLE contacts ADD COLUMN username TEXT;

CREATE UNIQUE INDEX idx_contacts_user_id
ON contacts(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX idx_contacts_parent_user_id
ON contacts(parent_user_id) WHERE parent_user_id IS NOT NULL;
