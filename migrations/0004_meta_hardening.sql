-- Endurecimento do contrato Meta (Graph v25 / webhooks / consentimento).

-- Identidade retornada pela Meta. O wa_id pode divergir do telefone informado.
ALTER TABLE contacts ADD COLUMN wa_id TEXT;
CREATE UNIQUE INDEX idx_contacts_wa_id_unique
ON contacts(wa_id) WHERE wa_id IS NOT NULL;

-- Estado de aceite/pacing devolvido no POST /messages.
ALTER TABLE campaign_contacts ADD COLUMN acceptance_status TEXT;

-- Qualidade viva do template, usada no preflight e na operação.
ALTER TABLE templates ADD COLUMN quality_score TEXT;
ALTER TABLE templates ADD COLUMN quality_updated_at TEXT;

-- Prova de consentimento individual e revogável.
ALTER TABLE consent_events ADD COLUMN contact_id TEXT;
ALTER TABLE consent_events ADD COLUMN source_detail TEXT;
ALTER TABLE consent_events ADD COLUMN purpose TEXT;
ALTER TABLE consent_events ADD COLUMN declaration_version TEXT;
ALTER TABLE consent_events ADD COLUMN revoked_at TEXT;
ALTER TABLE consent_events ADD COLUMN revoked_reason TEXT;
CREATE INDEX idx_consent_events_contact
ON consent_events(contact_id, created_at);

-- Envelope técnico do webhook. O payload bruto persistido passa a ser sanitizado.
ALTER TABLE status_events ADD COLUMN event_kind TEXT;
ALTER TABLE status_events ADD COLUMN event_key TEXT;
ALTER TABLE status_events ADD COLUMN waba_id TEXT;
ALTER TABLE status_events ADD COLUMN phone_number_id TEXT;
ALTER TABLE status_events ADD COLUMN error_code TEXT;
ALTER TABLE status_events ADD COLUMN error_detail TEXT;
ALTER TABLE status_events ADD COLUMN fbtrace_id TEXT;

DROP INDEX IF EXISTS idx_se_message_status_unique;
CREATE UNIQUE INDEX idx_se_event_key_unique
ON status_events(event_key) WHERE event_key IS NOT NULL;
