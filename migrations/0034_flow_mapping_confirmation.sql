ALTER TABLE contacts ADD COLUMN email TEXT;

ALTER TABLE flows ADD COLUMN mapping_json TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(mapping_json));

ALTER TABLE flow_submissions ADD COLUMN mapped_data_json TEXT
  CHECK (mapped_data_json IS NULL OR json_valid(mapped_data_json));
ALTER TABLE flow_submissions ADD COLUMN mapped_at TEXT;
ALTER TABLE flow_submissions ADD COLUMN confirmation_status TEXT
  CHECK (confirmation_status IS NULL OR confirmation_status IN ('sending','sent','rejected','ambiguous','disabled'));
ALTER TABLE flow_submissions ADD COLUMN confirmation_message_id TEXT;

CREATE INDEX idx_flow_submissions_confirmation
ON flow_submissions(confirmation_status, completed_at DESC);
