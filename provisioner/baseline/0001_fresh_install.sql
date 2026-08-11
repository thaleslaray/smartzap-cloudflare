-- SmartZap fresh-install baseline. Generated; do not edit by hand.
-- Source: migrations/0001 through migrations/0051.
PRAGMA foreign_keys = ON;
CREATE TABLE ai_agent_documents (
  agent_id TEXT NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  PRIMARY KEY(agent_id,document_id)
);
CREATE TABLE ai_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, temperature REAL NOT NULL DEFAULT 0.7
  CHECK (temperature >= 0 AND temperature <= 2), max_tokens INTEGER NOT NULL DEFAULT 1024
  CHECK (max_tokens >= 100 AND max_tokens <= 8192), debounce_ms INTEGER NOT NULL DEFAULT 5000
  CHECK (debounce_ms >= 0 AND debounce_ms <= 30000), rag_similarity_threshold REAL NOT NULL DEFAULT 0.5
  CHECK (rag_similarity_threshold >= 0 AND rag_similarity_threshold <= 1), rag_max_results INTEGER NOT NULL DEFAULT 5
  CHECK (rag_max_results >= 1 AND rag_max_results <= 20), handoff_enabled INTEGER NOT NULL DEFAULT 1
  CHECK (handoff_enabled IN (0,1)), handoff_instructions TEXT NOT NULL DEFAULT
  'Só transfira para humano quando o cliente pedir explicitamente ou quando a base não contiver uma resposta segura.');
CREATE TABLE ai_drafts (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  source_message_id TEXT REFERENCES conversation_messages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating','pending_review','approved','discarded','failed')),
  text_body TEXT CHECK (text_body IS NULL OR length(text_body) <= 4096),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 128),
  prompt_version TEXT NOT NULL CHECK (length(prompt_version) BETWEEN 1 AND 64),
  prompt_tokens INTEGER CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 64),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE ai_runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('draft', 'automation', 'memory')),
  model TEXT NOT NULL,
  decision TEXT NOT NULL,
  source_document_ids_json TEXT CHECK (source_document_ids_json IS NULL OR json_valid(source_document_ids_json)),
  prompt_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE attendant_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  permissions_json TEXT NOT NULL DEFAULT '{"canView":true,"canReply":true,"canHandoff":false}',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_used_at TEXT,
  access_count INTEGER NOT NULL DEFAULT 0 CHECK (access_count >= 0),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
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
CREATE TABLE campaign_contacts (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','skipped','sending','sent','delivered','read','failed')),
  message_id TEXT,
  error_code TEXT,
  error_detail TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), acceptance_status TEXT, batch_id TEXT REFERENCES campaign_batches(id) ON DELETE SET NULL, rendered_payload_json TEXT CHECK (
  rendered_payload_json IS NULL OR json_valid(rendered_payload_json)
), rendered_payload_hash TEXT CHECK (
  rendered_payload_hash IS NULL OR length(rendered_payload_hash) = 64
), claimed_at TEXT, attempt_count INTEGER NOT NULL DEFAULT 0
  CHECK (attempt_count >= 0),
  PRIMARY KEY (campaign_id, contact_id)
);
CREATE TABLE campaign_cost_snapshots (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('estimated','actual_from_meta','invoice','unavailable')),
  amount REAL,
  currency TEXT,
  breakdown_json TEXT NOT NULL DEFAULT '[]',
  assumptions_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL,
  effective_from TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE campaign_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, color TEXT CHECK (color IS NULL OR (
  length(color) = 7 AND substr(color, 1, 1) = '#'
  AND lower(substr(color, 2)) NOT GLOB '*[^0-9a-f]*'
)));
CREATE TABLE campaign_tag_assignments (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES campaign_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, tag_id)
);
CREATE TABLE campaign_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
  color TEXT CHECK (color IS NULL OR (
    length(color) = 7 AND substr(color, 1, 1) = '#'
    AND lower(substr(color, 2)) NOT GLOB '*[^0-9a-f]*'
  ))
);
CREATE TABLE campaign_trace_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  batch_id TEXT REFERENCES campaign_batches(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 64),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'error')),
  detail_json TEXT CHECK (detail_json IS NULL OR json_valid(detail_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','scheduled','sending','completed','paused','failed','cancelled')),
  scheduled_at TEXT,
  workflow_id TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  read INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
, template_language TEXT NOT NULL DEFAULT 'pt_BR', folder_id TEXT REFERENCES campaign_folders(id) ON DELETE SET NULL, timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo', audience_definition_json TEXT CHECK (
  audience_definition_json IS NULL OR json_valid(audience_definition_json)
), variable_mapping_json TEXT CHECK (
  variable_mapping_json IS NULL OR json_valid(variable_mapping_json)
), audience_snapshot_hash TEXT CHECK (
  audience_snapshot_hash IS NULL OR length(audience_snapshot_hash) = 64
), estimated_cost_brl REAL CHECK (
  estimated_cost_brl IS NULL OR estimated_cost_brl >= 0
), cancelled_at TEXT);
CREATE TABLE consent_events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('import','manual')),
  declaration_text TEXT NOT NULL,
  contact_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, contact_id TEXT, source_detail TEXT, purpose TEXT, declaration_version TEXT, revoked_at TEXT, revoked_reason TEXT);
CREATE TABLE contact_custom_values (
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL REFERENCES custom_field_defs(id) ON DELETE CASCADE,
  value_text TEXT,
  value_number REAL,
  value_date TEXT,
  value_boolean INTEGER CHECK (value_boolean IS NULL OR value_boolean IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (contact_id, field_id),
  CHECK (
    (value_text IS NOT NULL) +
    (value_number IS NOT NULL) +
    (value_date IS NOT NULL) +
    (value_boolean IS NOT NULL) = 1
  )
);
CREATE TABLE contact_history_events (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 64),
  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('system', 'admin', 'contact', 'meta', 'automation')),
  actor_id TEXT CHECK (actor_id IS NULL OR length(actor_id) <= 128),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 500),
  metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE contact_memories (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 4096),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  source_message_at INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE contact_tags (
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('opt_in','opt_out','unknown')),
  custom_fields TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, wa_id TEXT, email TEXT, user_id TEXT, parent_user_id TEXT, username TEXT);
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
CREATE TABLE conversation_draft_sends (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  draft_id TEXT NOT NULL UNIQUE REFERENCES ai_drafts(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL CHECK (length(phone_number_id) BETWEEN 5 AND 32),
  phone_hash TEXT NOT NULL CHECK (length(phone_hash) = 64),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN (
    'reserved','accepted','sent','delivered','read','failed','rejected','ambiguous'
  )),
  message_id TEXT UNIQUE,
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 64),
  error_detail TEXT CHECK (error_detail IS NULL OR length(error_detail) <= 500),
  accepted_at TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  failed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE conversation_labels (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES inbox_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, label_id)
);
CREATE TABLE conversation_media (
  message_id TEXT PRIMARY KEY REFERENCES conversation_messages(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (length(mime_type) BETWEEN 1 AND 255),
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0 AND byte_size <= 26214400),
  checksum TEXT NOT NULL CHECK (length(checksum) = 64),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  message_type TEXT NOT NULL CHECK (length(message_type) BETWEEN 1 AND 64),
  text_body TEXT CHECK (text_body IS NULL OR length(text_body) <= 4096),
  content_json TEXT CHECK (content_json IS NULL OR length(content_json) <= 8192),
  phone_number_id TEXT NOT NULL,
  meta_timestamp INTEGER NOT NULL CHECK (meta_timestamp >= 0),
  read_at TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE conversation_notes (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4096),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  wa_id TEXT NOT NULL UNIQUE,
  last_message_at INTEGER,
  last_message_preview TEXT CHECK (last_message_preview IS NULL OR length(last_message_preview) <= 240),
  unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, ai_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (ai_enabled IN (0, 1)), status TEXT NOT NULL DEFAULT 'open'
  CHECK (status IN ('open', 'closed')), mode TEXT NOT NULL DEFAULT 'human'
  CHECK (mode IN ('human', 'bot')), priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('low', 'normal', 'high', 'urgent')), automation_paused_until INTEGER, handoff_reason TEXT CHECK (
  handoff_reason IS NULL OR length(handoff_reason) <= 500
), handoff_at TEXT, human_mode_expires_at INTEGER, ai_agent_id TEXT REFERENCES ai_agents(id) ON DELETE SET NULL);
CREATE TABLE conversion_ad_insights (
  run_id TEXT NOT NULL REFERENCES conversion_reconciliation_runs(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  day TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  adset_id TEXT NOT NULL,
  adset_name TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  ad_name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  spend_minor INTEGER NOT NULL DEFAULT 0 CHECK (spend_minor >= 0),
  impressions INTEGER NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  reach INTEGER NOT NULL DEFAULT 0 CHECK (reach >= 0),
  clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  inline_link_clicks INTEGER NOT NULL DEFAULT 0 CHECK (inline_link_clicks >= 0),
  messaging_connections INTEGER NOT NULL DEFAULT 0 CHECK (messaging_connections >= 0),
  conversations_started INTEGER NOT NULL DEFAULT 0 CHECK (conversations_started >= 0),
  leads INTEGER NOT NULL DEFAULT 0 CHECK (leads >= 0),
  qualified_leads INTEGER NOT NULL DEFAULT 0 CHECK (qualified_leads >= 0),
  purchases INTEGER NOT NULL DEFAULT 0 CHECK (purchases >= 0),
  purchase_value_minor INTEGER NOT NULL DEFAULT 0 CHECK (purchase_value_minor >= 0),
  action_types_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(action_types_json)),
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (run_id, day, ad_id)
);
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')), lifecycle_status TEXT NOT NULL DEFAULT 'active'
  CHECK (lifecycle_status IN ('active', 'cancelled')), lifecycle_note TEXT
  CHECK (lifecycle_note IS NULL OR length(lifecycle_note) <= 500), lifecycle_changed_at TEXT,
  CHECK (
    (event_name = 'Purchase' AND value_minor IS NOT NULL AND currency IS NOT NULL)
    OR (event_name <> 'Purchase' AND value_minor IS NULL AND currency IS NULL)
  )
);
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
, cancelled_at TEXT, cancel_reason TEXT
  CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 500));
CREATE TABLE conversion_reconciliation_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'meta' CHECK (provider = 'meta'),
  status TEXT NOT NULL CHECK (
    status IN ('running', 'succeeded', 'partial', 'failed', 'skipped')
  ),
  trigger_source TEXT NOT NULL CHECK (
    trigger_source IN ('cron', 'manual', 'test')
  ),
  graph_version TEXT,
  ad_account_id TEXT,
  dataset_id TEXT,
  scope_start TEXT NOT NULL,
  scope_end TEXT NOT NULL,
  insight_rows INTEGER NOT NULL DEFAULT 0 CHECK (insight_rows >= 0),
  dataset_quality_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK (
    dataset_quality_status IN ('not_applicable', 'available', 'unavailable', 'failed')
  ),
  dataset_quality_detail TEXT,
  error_code TEXT,
  error_detail TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE TABLE custom_field_defs (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text'
);
CREATE TABLE flow_endpoint_actions (
  id TEXT PRIMARY KEY,
  flow_token_hash TEXT NOT NULL,
  screen TEXT NOT NULL,
  action TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing','completed','failed')),
  response_json TEXT,
  error_code TEXT,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), claim_token TEXT,
  UNIQUE(flow_token_hash, screen, action, request_hash)
);
CREATE TABLE flow_endpoint_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  success INTEGER NOT NULL CHECK (success IN (0,1)),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  error_code TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE flow_meta_versions (
  id TEXT PRIMARY KEY,
  flow_local_id TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  meta_flow_id TEXT NOT NULL,
  status TEXT,
  local_revision INTEGER NOT NULL,
  definition_json TEXT NOT NULL DEFAULT '{}',
  replaced_by_meta_flow_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(flow_local_id, meta_flow_id)
);
CREATE TABLE flow_submissions (
  id TEXT PRIMARY KEY,
  message_id TEXT UNIQUE,
  flow_local_id TEXT REFERENCES flows(id) ON DELETE SET NULL,
  meta_flow_id TEXT,
  flow_token TEXT,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  from_phone TEXT,
  response_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','completed','rejected','ambiguous')),
  message_timestamp TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, mapped_data_json TEXT
  CHECK (mapped_data_json IS NULL OR json_valid(mapped_data_json)), mapped_at TEXT, confirmation_status TEXT
  CHECK (confirmation_status IS NULL OR confirmation_status IN ('sending','sent','rejected','ambiguous','disabled')), confirmation_message_id TEXT);
CREATE TABLE flows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','IN_REVIEW','ACTION_REQUIRED')),
  meta_id TEXT,
  definition_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, meta_preview_url TEXT, meta_validation_errors_json TEXT, meta_last_checked_at TEXT, meta_published_at TEXT, mapping_json TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(mapping_json)), meta_status TEXT, meta_health_json TEXT, meta_endpoint_uri TEXT, meta_data_api_version TEXT, meta_application_id TEXT, local_revision INTEGER NOT NULL DEFAULT 1, synced_revision INTEGER NOT NULL DEFAULT 0, published_meta_id TEXT, published_revision INTEGER NOT NULL DEFAULT 0, publish_claim_token TEXT, publish_claimed_at TEXT);
CREATE TABLE inbox_labels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
  color TEXT CHECK (color IS NULL OR (
    length(color) = 7 AND substr(color, 1, 1) = '#'
    AND lower(substr(color, 2)) NOT GLOB '*[^0-9a-f]*'
  )),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE "knowledge_documents" (
  id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 255),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('text/plain','text/markdown','text/html','application/pdf')),
  r2_key TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL CHECK (length(checksum) = 64), ai_search_item_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','indexing','ready','failed','deleted')),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 64), created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT
);
CREATE TABLE lead_form_submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES lead_forms(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE lead_forms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  tag_id TEXT REFERENCES tags(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  fields_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, collect_email INTEGER NOT NULL DEFAULT 0 CHECK (collect_email IN (0,1)), success_message TEXT);
CREATE TABLE message_cost_reconciliation (
  message_id TEXT PRIMARY KEY,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  pricing_model TEXT,
  pricing_type TEXT,
  pricing_category TEXT,
  country_iso TEXT,
  tier TEXT,
  state TEXT NOT NULL CHECK (state IN ('pending','actual_from_meta','invoice','free','unavailable')),
  amount REAL,
  currency TEXT,
  source_event_key TEXT,
  reconciled_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE pilot_runs (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'closed')),
  max_attempts INTEGER NOT NULL CHECK(max_attempts BETWEEN 1 AND 3),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);
CREATE TABLE pilot_send_ledger (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  phone_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved', 'accepted', 'rejected', 'ambiguous')),
  message_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), pilot_run_id TEXT REFERENCES pilot_runs(id),
  UNIQUE(campaign_id, contact_id)
);
CREATE TABLE pricing_analytics_points (
  id TEXT PRIMARY KEY,
  waba_id TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  granularity TEXT NOT NULL,
  country TEXT,
  pricing_category TEXT,
  pricing_type TEXT,
  tier TEXT,
  phone_number_id TEXT,
  volume INTEGER,
  cost REAL,
  currency TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')), point_key TEXT,
  UNIQUE(waba_id, period_start, period_end, granularity, country, pricing_category, pricing_type, tier, phone_number_id)
);
CREATE TABLE pricing_rate_card_imports (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  checksum TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'staging' CHECK (status IN ('staging','active','failed')),
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  row_count INTEGER NOT NULL CHECK (row_count >= 0)
);
CREATE TABLE pricing_rate_cards (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES pricing_rate_card_imports(id) ON DELETE RESTRICT,
  source TEXT NOT NULL,
  checksum TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  currency TEXT NOT NULL,
  market TEXT NOT NULL,
  country_iso TEXT,
  category TEXT NOT NULL CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION','AUTHENTICATION_INTERNATIONAL','SERVICE')),
  tier_from INTEGER NOT NULL DEFAULT 0 CHECK (tier_from >= 0),
  tier_to INTEGER CHECK (tier_to IS NULL OR tier_to >= tier_from),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(import_id, market, category, tier_from)
);
CREATE TABLE pricing_tiers (
  id TEXT PRIMARY KEY,
  waba_id TEXT NOT NULL,
  region TEXT NOT NULL,
  pricing_category TEXT NOT NULL,
  effective_month TEXT NOT NULL,
  tier TEXT NOT NULL,
  tier_from INTEGER,
  tier_to INTEGER,
  tier_update_time INTEGER NOT NULL,
  source_event_key TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(waba_id, region, pricing_category, effective_month)
);
CREATE TABLE quick_replies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  shortcut TEXT NOT NULL UNIQUE CHECK (length(shortcut) BETWEEN 1 AND 64),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4096),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE saved_segments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE secret_vault (
  name TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE setup_checks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'passed', 'failed')),
  detail TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE setup_installation (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL CHECK (status IN ('configuring', 'ready', 'failed')),
  last_step TEXT NOT NULL DEFAULT 'infrastructure',
  last_error TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT,
  status TEXT NOT NULL,
  raw TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
, event_kind TEXT, event_key TEXT, waba_id TEXT, phone_number_id TEXT, error_code TEXT, error_detail TEXT, fbtrace_id TEXT, apply_state TEXT NOT NULL DEFAULT 'pending'
  CHECK (apply_state IN ('pending', 'applied', 'ignored')), apply_attempts INTEGER NOT NULL DEFAULT 0, last_apply_error TEXT, applied_at TEXT, campaign_id TEXT, campaign_contact_id TEXT, pricing_model TEXT, pricing_type TEXT, pricing_category TEXT, pricing_billable INTEGER);
CREATE TABLE suppressions (
  phone TEXT PRIMARY KEY,
  reason TEXT,
  expires_at TEXT
);
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE template_drafts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  category TEXT NOT NULL CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  components TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTING','FAILED')),
  error_detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE template_project_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES template_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'pt_BR',
  category TEXT NOT NULL DEFAULT 'UTILITY' CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  status TEXT NOT NULL DEFAULT 'draft',
  meta_id TEXT,
  meta_status TEXT,
  rejected_reason TEXT,
  submitted_at TEXT,
  components_json TEXT NOT NULL DEFAULT '[]',
  sample_variables_json TEXT NOT NULL DEFAULT '{}',
  marketing_variables_json TEXT NOT NULL DEFAULT '{}',
  header_json TEXT,
  footer_json TEXT,
  buttons_json TEXT NOT NULL DEFAULT '[]',
  variables_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE template_projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'marketing' CHECK (strategy IN ('marketing','utility','bypass')),
  template_count INTEGER NOT NULL DEFAULT 0,
  approved_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, prompt TEXT, status TEXT NOT NULL DEFAULT 'draft', source TEXT NOT NULL DEFAULT 'manual');
CREATE TABLE "templates" (
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  meta_id TEXT,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  components TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  quality_score TEXT,
  quality_updated_at TEXT, status_reason TEXT, status_detail TEXT, status_recommendation TEXT, status_event_at INTEGER, quality_event_at INTEGER, pending_category TEXT, category_update_at INTEGER, category_event_at INTEGER,
  PRIMARY KEY (name, language)
);
CREATE TABLE vault_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL CHECK (status IN ('idle', 'rotating', 'awaiting_promotion')),
  active_key_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, rotation_id TEXT);
CREATE TABLE workflow_executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN('queued','running','succeeded','failed','cancelled')),
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  logs_json TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TABLE workflow_step_runs (
  execution_id TEXT NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('running','succeeded','failed')),
  output_json TEXT,
  message_id TEXT,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT(datetime('now')),
  finished_at TEXT,
  PRIMARY KEY(execution_id,node_id)
);
CREATE TABLE workflow_versions(id TEXT PRIMARY KEY,workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,version INTEGER NOT NULL,nodes_json TEXT NOT NULL,edges_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),UNIQUE(workflow_id,version));
CREATE TABLE workflow_waits (
  execution_id TEXT NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  variable_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('preparing','waiting','resuming','answered','expired','failed')),
  message_id TEXT,
  source_message_id TEXT,
  response_text TEXT,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  answered_at TEXT,
  PRIMARY KEY(execution_id,node_id)
);
CREATE TABLE workflows (
 id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','archived')),nodes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(nodes_json)),edges_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(edges_json)),version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),published_at TEXT
);
CREATE UNIQUE INDEX idx_ai_agents_default ON ai_agents(is_default) WHERE is_default=1;
CREATE INDEX idx_ai_drafts_conversation
ON ai_drafts(conversation_id, created_at DESC, id DESC);
CREATE INDEX idx_ai_drafts_created ON ai_drafts(created_at);
CREATE INDEX idx_ai_runs_conversation ON ai_runs(conversation_id, created_at DESC);
CREATE INDEX idx_attendant_tokens_active
  ON attendant_tokens(is_active, created_at DESC);
CREATE INDEX idx_campaign_batches_status
ON campaign_batches(campaign_id, status, sequence);
CREATE INDEX idx_campaign_contacts_claim
ON campaign_contacts(campaign_id, status, claimed_at);
CREATE INDEX idx_campaign_cost_snapshots
ON campaign_cost_snapshots(campaign_id, created_at DESC);
CREATE INDEX idx_campaign_tag_assignments_tag
ON campaign_tag_assignments(tag_id, campaign_id);
CREATE INDEX idx_campaign_trace_timeline
ON campaign_trace_events(campaign_id, created_at DESC, id DESC);
CREATE INDEX idx_campaigns_folder_created
ON campaigns(folder_id, created_at DESC);
CREATE INDEX idx_campaigns_scheduled
ON campaigns(status, scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_cc_message_id ON campaign_contacts(message_id);
CREATE INDEX idx_cc_status ON campaign_contacts(campaign_id, status);
CREATE INDEX idx_consent_events_contact
ON consent_events(contact_id, created_at);
CREATE INDEX idx_contact_custom_values_field_date
ON contact_custom_values(field_id, value_date);
CREATE INDEX idx_contact_custom_values_field_number
ON contact_custom_values(field_id, value_number);
CREATE INDEX idx_contact_custom_values_field_text
ON contact_custom_values(field_id, value_text);
CREATE INDEX idx_contact_history_timeline
ON contact_history_events(contact_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX idx_contact_memories_one_current ON contact_memories(contact_id);
CREATE INDEX idx_contact_tags_tag_contact ON contact_tags(tag_id, contact_id);
CREATE INDEX idx_contacts_parent_user_id
ON contacts(parent_user_id) WHERE parent_user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_contacts_user_id
ON contacts(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_contacts_wa_id_unique
ON contacts(wa_id) WHERE wa_id IS NOT NULL;
CREATE UNIQUE INDEX idx_conversation_attributions_click
ON conversation_attributions(waba_id, ctwa_clid)
WHERE ctwa_clid IS NOT NULL;
CREATE INDEX idx_conversation_attributions_timeline
ON conversation_attributions(conversation_id, occurred_at DESC, id DESC);
CREATE INDEX idx_conversation_draft_sends_conversation
ON conversation_draft_sends(conversation_id, created_at DESC);
CREATE INDEX idx_conversation_draft_sends_status
ON conversation_draft_sends(status, updated_at);
CREATE INDEX idx_conversation_labels_label ON conversation_labels(label_id, conversation_id);
CREATE INDEX idx_conversation_media_conversation ON conversation_media(conversation_id, created_at DESC);
CREATE INDEX idx_conversation_messages_timeline
ON conversation_messages(conversation_id, meta_timestamp DESC, id DESC);
CREATE INDEX idx_conversation_notes_timeline
ON conversation_notes(conversation_id, created_at DESC, id DESC);
CREATE INDEX idx_conversations_agent ON conversations(ai_agent_id,status,mode,last_message_at DESC);
CREATE INDEX idx_conversations_human_mode_expiration
  ON conversations(human_mode_expires_at)
  WHERE human_mode_expires_at IS NOT NULL;
CREATE INDEX idx_conversations_operations
ON conversations(status, mode, priority, last_message_at DESC);
CREATE INDEX idx_conversations_recent
ON conversations(last_message_at DESC, id DESC);
CREATE INDEX idx_conversion_ad_insights_campaign
ON conversion_ad_insights(campaign_id, day DESC);
CREATE INDEX idx_conversion_ad_insights_period
ON conversion_ad_insights(run_id, day DESC, ad_id);
CREATE INDEX idx_conversion_attempts_event
ON conversion_attempts(event_id, attempt DESC);
CREATE INDEX idx_conversion_events_conversation
ON conversion_events(conversation_id, event_time DESC, id DESC);
CREATE INDEX idx_conversion_events_funnel
ON conversion_events(event_name, event_time DESC);
CREATE INDEX idx_conversion_events_lifecycle
ON conversion_events(lifecycle_status, event_time DESC);
CREATE INDEX idx_conversion_events_timeline
ON conversion_events(event_time DESC, id DESC);
CREATE INDEX idx_conversion_outbox_due
ON conversion_outbox(status, next_attempt_at, lease_expires_at);
CREATE INDEX idx_conversion_reconciliation_runs_latest
ON conversion_reconciliation_runs(started_at DESC, id DESC);
CREATE INDEX idx_flow_endpoint_actions_status
ON flow_endpoint_actions(status, claimed_at);
CREATE INDEX idx_flow_endpoint_metrics_time
ON flow_endpoint_metrics(recorded_at DESC);
CREATE INDEX idx_flow_meta_versions_local
ON flow_meta_versions(flow_local_id, created_at DESC);
CREATE INDEX idx_flow_submissions_confirmation
ON flow_submissions(confirmation_status, completed_at DESC);
CREATE INDEX idx_flow_submissions_created ON flow_submissions(created_at DESC,id);
CREATE INDEX idx_flow_submissions_flow ON flow_submissions(flow_local_id,created_at DESC);
CREATE INDEX idx_flow_submissions_token ON flow_submissions(flow_token);
CREATE INDEX idx_flow_updated ON flows(updated_at DESC,id);
CREATE INDEX idx_flows_publish_claim
ON flows(publish_claimed_at)
WHERE publish_claim_token IS NOT NULL;
CREATE INDEX idx_form_submission ON lead_form_submissions(form_id,created_at DESC,id);
CREATE INDEX idx_knowledge_documents_status ON knowledge_documents(status, created_at DESC);
CREATE UNIQUE INDEX idx_pilot_runs_one_active
ON pilot_runs(status) WHERE status = 'active';
CREATE INDEX idx_pilot_send_ledger_created_at
ON pilot_send_ledger(created_at);
CREATE INDEX idx_pilot_send_ledger_run
ON pilot_send_ledger(pilot_run_id, created_at);
CREATE INDEX idx_pricing_analytics_period
ON pricing_analytics_points(waba_id, period_start, period_end);
CREATE UNIQUE INDEX idx_pricing_analytics_point_key
ON pricing_analytics_points(point_key);
CREATE INDEX idx_pricing_rate_cards_lookup
ON pricing_rate_cards(currency, market, category, effective_from, effective_to, tier_from);
CREATE INDEX idx_pricing_tiers_current
ON pricing_tiers(waba_id, effective_month, region, pricing_category);
CREATE UNIQUE INDEX idx_se_event_key_unique
ON status_events(event_key) WHERE event_key IS NOT NULL;
CREATE INDEX idx_se_message_id ON status_events(message_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_status_events_pending_application
ON status_events(received_at, id)
WHERE apply_state = 'pending' AND event_kind = 'message_status';
CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_template_drafts_updated ON template_drafts(updated_at DESC, id);
CREATE INDEX idx_template_project_items_project ON template_project_items(project_id,created_at,id);
CREATE INDEX idx_template_project_items_status ON template_project_items(project_id,meta_status,status);
CREATE INDEX idx_template_projects_updated ON template_projects(updated_at DESC,id);
CREATE UNIQUE INDEX idx_templates_meta_id
ON templates(meta_id) WHERE meta_id IS NOT NULL;
CREATE INDEX idx_templates_status ON templates(status);
CREATE INDEX idx_vault_control_rotation
ON vault_control(status, updated_at);
CREATE INDEX idx_workflow_executions_flow ON workflow_executions(workflow_id,created_at DESC,id);
CREATE INDEX idx_workflow_step_runs_status
  ON workflow_step_runs(execution_id,status);
CREATE INDEX idx_workflow_waits_conversation
  ON workflow_waits(conversation_id,status,expires_at);
CREATE INDEX idx_workflows_updated ON workflows(updated_at DESC,id);
INSERT INTO settings(key,value) VALUES('ai_global_enabled','true');
INSERT INTO ai_agents(id,name,description,instructions,active,is_default)
     VALUES('agent_commercial','Agente Comercial','Respondendo automaticamente',
       'Atenda com objetividade, use apenas a base de conhecimento e encaminhe para uma pessoa quando faltar informação.',1,1);
INSERT INTO vault_control(id,status,active_key_version) VALUES(1,'idle',1);
INSERT INTO setup_installation(id,status,last_step,revision) VALUES(1,'configuring','infrastructure',1);
