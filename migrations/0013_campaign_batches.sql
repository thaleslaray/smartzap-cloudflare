-- Lotes e traces persistidos. Payload renderizado é o mesmo produzido pelo preview.

CREATE TABLE campaign_batches (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  recipient_count INTEGER NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  accepted_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  delivered_count INTEGER NOT NULL DEFAULT 0 CHECK (delivered_count >= 0),
  read_count INTEGER NOT NULL DEFAULT 0 CHECK (read_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campaign_id, sequence)
);

CREATE INDEX idx_campaign_batches_status
ON campaign_batches(campaign_id, status, sequence);

CREATE TABLE campaign_trace_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  batch_id TEXT REFERENCES campaign_batches(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 64),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'error')),
  detail_json TEXT CHECK (detail_json IS NULL OR json_valid(detail_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_campaign_trace_timeline
ON campaign_trace_events(campaign_id, created_at DESC, id DESC);

ALTER TABLE campaign_contacts ADD COLUMN batch_id TEXT REFERENCES campaign_batches(id) ON DELETE SET NULL;
ALTER TABLE campaign_contacts ADD COLUMN rendered_payload_json TEXT CHECK (
  rendered_payload_json IS NULL OR json_valid(rendered_payload_json)
);
ALTER TABLE campaign_contacts ADD COLUMN rendered_payload_hash TEXT CHECK (
  rendered_payload_hash IS NULL OR length(rendered_payload_hash) = 64
);
ALTER TABLE campaign_contacts ADD COLUMN claimed_at TEXT;
ALTER TABLE campaign_contacts ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0
  CHECK (attempt_count >= 0);

CREATE INDEX idx_campaign_contacts_claim
ON campaign_contacts(campaign_id, status, claimed_at);

