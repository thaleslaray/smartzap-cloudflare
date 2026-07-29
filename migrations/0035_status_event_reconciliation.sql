-- O callback da Meta pode chegar antes de o envio persistir `message_id` em
-- campaign_contacts. A caixa durável precisa distinguir eventos aplicados de
-- eventos ainda órfãos para que o cron possa reconciliá-los depois.
ALTER TABLE status_events ADD COLUMN apply_state TEXT NOT NULL DEFAULT 'pending'
  CHECK (apply_state IN ('pending', 'applied', 'ignored'));
ALTER TABLE status_events ADD COLUMN apply_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE status_events ADD COLUMN last_apply_error TEXT;
ALTER TABLE status_events ADD COLUMN applied_at TEXT;
ALTER TABLE status_events ADD COLUMN campaign_id TEXT;
ALTER TABLE status_events ADD COLUMN campaign_contact_id TEXT;

UPDATE status_events
SET apply_state = 'ignored'
WHERE event_kind IS NULL OR event_kind <> 'message_status'
   OR status NOT IN ('delivered', 'read', 'failed');

CREATE INDEX idx_status_events_pending_application
ON status_events(received_at, id)
WHERE apply_state = 'pending' AND event_kind = 'message_status';
