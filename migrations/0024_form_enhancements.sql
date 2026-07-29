ALTER TABLE lead_forms ADD COLUMN collect_email INTEGER NOT NULL DEFAULT 0 CHECK (collect_email IN (0,1));
ALTER TABLE lead_forms ADD COLUMN success_message TEXT;
