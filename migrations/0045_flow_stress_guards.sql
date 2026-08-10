ALTER TABLE flows ADD COLUMN publish_claim_token TEXT;
ALTER TABLE flows ADD COLUMN publish_claimed_at TEXT;

CREATE INDEX idx_flows_publish_claim
ON flows(publish_claimed_at)
WHERE publish_claim_token IS NOT NULL;

ALTER TABLE flow_endpoint_actions ADD COLUMN claim_token TEXT;
