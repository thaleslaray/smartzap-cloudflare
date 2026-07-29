-- Sessões administrativas com consistência forte e revogação imediata.
-- O cookie contém o token aleatório; o banco guarda somente SHA-256(token).
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
