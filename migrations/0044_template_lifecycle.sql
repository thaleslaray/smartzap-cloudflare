-- Ciclo de vida oficial dos templates recebido por webhook Meta.
ALTER TABLE templates ADD COLUMN status_reason TEXT;
ALTER TABLE templates ADD COLUMN status_detail TEXT;
ALTER TABLE templates ADD COLUMN status_recommendation TEXT;
ALTER TABLE templates ADD COLUMN status_event_at INTEGER;
ALTER TABLE templates ADD COLUMN quality_event_at INTEGER;
ALTER TABLE templates ADD COLUMN pending_category TEXT;
ALTER TABLE templates ADD COLUMN category_update_at INTEGER;
ALTER TABLE templates ADD COLUMN category_event_at INTEGER;
