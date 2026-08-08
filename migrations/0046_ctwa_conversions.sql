-- Atribuição Click-to-WhatsApp e CAPI for Business Messaging.
-- O conteúdo da conversa permanece nas tabelas da Inbox; aqui ficam apenas
-- identificadores técnicos mínimos e fatos comerciais explícitos.

CREATE TABLE conversation_attributions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  waba_id TEXT NOT NULL CHECK (length(waba_id) BETWEEN 5 AND 32),
  phone_number_id TEXT NOT NULL CHECK (length(phone_number_id) BETWEEN 5 AND 32),
  source_message_id TEXT NOT NULL CHECK (length(source_message_id) BETWEEN 1 AND 512),
  attribution_kind TEXT NOT NULL CHECK (
    attribution_kind IN ('ctwa', 'referral_without_click_id')
  ),
  ctwa_clid TEXT CHECK (ctwa_clid IS NULL OR length(ctwa_clid) BETWEEN 1 AND 2048),
  source_id TEXT CHECK (source_id IS NULL OR length(source_id) <= 512),
  source_type TEXT CHECK (source_type IS NULL OR length(source_type) <= 64),
  source_url TEXT CHECK (source_url IS NULL OR length(source_url) <= 2048),
  occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (waba_id, source_message_id)
);

CREATE UNIQUE INDEX idx_conversation_attributions_click
ON conversation_attributions(waba_id, ctwa_clid)
WHERE ctwa_clid IS NOT NULL;

CREATE INDEX idx_conversation_attributions_timeline
ON conversation_attributions(conversation_id, occurred_at DESC, id DESC);

CREATE TABLE conversion_events (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE CHECK (length(event_id) BETWEEN 16 AND 128),
  request_key TEXT NOT NULL UNIQUE CHECK (length(request_key) BETWEEN 16 AND 128),
  dedupe_key TEXT NOT NULL UNIQUE CHECK (length(dedupe_key) BETWEEN 16 AND 128),
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  attribution_id TEXT NOT NULL REFERENCES conversation_attributions(id) ON DELETE RESTRICT,
  event_name TEXT NOT NULL CHECK (
    event_name IN ('LeadSubmitted', 'QualifiedLead', 'Purchase')
  ),
  event_time INTEGER NOT NULL CHECK (event_time >= 0),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'crm', 'checkout')),
  business_object_type TEXT NOT NULL CHECK (length(business_object_type) BETWEEN 1 AND 64),
  business_object_id TEXT NOT NULL CHECK (length(business_object_id) BETWEEN 1 AND 256),
  value_minor INTEGER CHECK (value_minor IS NULL OR value_minor >= 0),
  currency TEXT CHECK (currency IS NULL OR length(currency) = 3),
  created_by TEXT NOT NULL CHECK (length(created_by) BETWEEN 1 AND 128),
  match_status TEXT NOT NULL DEFAULT 'unknown' CHECK (
    match_status IN ('unknown', 'matched', 'unmatched')
  ),
  attribution_status TEXT NOT NULL DEFAULT 'unknown' CHECK (
    attribution_status IN ('unknown', 'attributed', 'unattributed')
  ),
  correction_of TEXT REFERENCES conversion_events(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (event_name = 'Purchase' AND value_minor IS NOT NULL AND currency IS NOT NULL)
    OR (event_name <> 'Purchase' AND value_minor IS NULL AND currency IS NULL)
  )
);

CREATE INDEX idx_conversion_events_timeline
ON conversion_events(event_time DESC, id DESC);
CREATE INDEX idx_conversion_events_conversation
ON conversion_events(conversation_id, event_time DESC, id DESC);
CREATE INDEX idx_conversion_events_funnel
ON conversion_events(event_name, event_time DESC);

CREATE TABLE conversion_outbox (
  event_id TEXT PRIMARY KEY REFERENCES conversion_events(id) ON DELETE CASCADE,
  dataset_id TEXT NOT NULL CHECK (length(dataset_id) BETWEEN 5 AND 32),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending', 'sending', 'accepted', 'unknown',
      'temporary_failed', 'permanent_failed', 'dead_letter', 'cancelled'
    )
  ),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at INTEGER,
  lease_id TEXT,
  lease_expires_at INTEGER,
  last_http_status INTEGER,
  last_error_code TEXT CHECK (last_error_code IS NULL OR length(last_error_code) <= 64),
  last_error_subcode TEXT CHECK (last_error_subcode IS NULL OR length(last_error_subcode) <= 64),
  last_error_detail TEXT CHECK (last_error_detail IS NULL OR length(last_error_detail) <= 500),
  fbtrace_id TEXT CHECK (fbtrace_id IS NULL OR length(fbtrace_id) <= 256),
  events_received INTEGER,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_conversion_outbox_due
ON conversion_outbox(status, next_attempt_at, lease_expires_at);

CREATE TABLE conversion_attempts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES conversion_events(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  outcome TEXT NOT NULL CHECK (
    outcome IN ('accepted', 'unknown', 'temporary_failed', 'permanent_failed', 'dead_letter')
  ),
  http_status INTEGER,
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 64),
  error_subcode TEXT CHECK (error_subcode IS NULL OR length(error_subcode) <= 64),
  error_detail TEXT CHECK (error_detail IS NULL OR length(error_detail) <= 500),
  fbtrace_id TEXT CHECK (fbtrace_id IS NULL OR length(fbtrace_id) <= 256),
  events_received INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (event_id, attempt)
);

CREATE INDEX idx_conversion_attempts_event
ON conversion_attempts(event_id, attempt DESC);
