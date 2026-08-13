-- Metadados operacionais para cancelamento seguro e substituicao de eventos.
-- O fato original permanece imutavel; somente seu estado operacional muda.

ALTER TABLE conversion_events ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'active'
  CHECK (lifecycle_status IN ('active', 'cancelled'));

ALTER TABLE conversion_events ADD COLUMN lifecycle_note TEXT
  CHECK (lifecycle_note IS NULL OR length(lifecycle_note) <= 500);

ALTER TABLE conversion_events ADD COLUMN lifecycle_changed_at TEXT;

ALTER TABLE conversion_outbox ADD COLUMN cancelled_at TEXT;

ALTER TABLE conversion_outbox ADD COLUMN cancel_reason TEXT
  CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 500);

CREATE INDEX idx_conversion_events_lifecycle
ON conversion_events(lifecycle_status, event_time DESC);
