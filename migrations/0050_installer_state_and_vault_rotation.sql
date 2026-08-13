CREATE TABLE IF NOT EXISTS vault_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL CHECK (status IN ('idle', 'rotating', 'awaiting_promotion')),
  active_key_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO vault_control(id, status, active_key_version)
VALUES(1, 'idle', 1);

CREATE TABLE IF NOT EXISTS setup_installation (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL CHECK (status IN ('configuring', 'ready', 'failed')),
  last_step TEXT NOT NULL DEFAULT 'infrastructure',
  last_error TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO setup_installation(id, status, last_step)
VALUES(1, 'configuring', 'infrastructure');
