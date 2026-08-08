INSERT OR IGNORE INTO templates (name, language, category, status, components)
VALUES ('e2e_marketing_simples', 'pt_BR', 'MARKETING', 'APPROVED', '[]');

INSERT OR IGNORE INTO templates (name, language, category, status, components)
VALUES (
  'e2e_template_variaveis', 'pt_BR', 'UTILITY', 'APPROVED',
  '[{"type":"HEADER","text":"Olá {{1}}"},{"type":"BODY","text":"Telefone: {{1}}"},{"type":"BUTTONS","buttons":[{"type":"URL","url":"https://example.test/{{1}}"}]}]'
);

INSERT OR REPLACE INTO templates (
  name, language, meta_id, category, status, components, quality_score,
  status_reason, status_detail, status_recommendation, status_event_at,
  pending_category, category_update_at, category_event_at
) VALUES (
  'e2e_template_ciclo_meta', 'pt_BR', '9000000000001', 'UTILITY', 'REJECTED',
  '[{"type":"BODY","text":"Olá {{1}}, acompanhe seu pedido."}]', 'YELLOW',
  'INVALID_FORMAT', 'As variáveis do corpo precisam de contexto descritivo.',
  'Inclua texto antes e depois de cada variável.', 1754000000,
  'MARKETING', 1754086400, 1754000000
);

-- Garante que o smoke jamais consiga ultrapassar o preflight de disparo.
DELETE FROM settings WHERE key IN ('whatsapp_phone_id', 'whatsapp_waba_id');

-- O E2E determinístico não consulta provedores públicos de câmbio.
INSERT OR REPLACE INTO settings (key, value) VALUES
  ('exchange_rate_usd_brl', '5.50'),
  ('exchange_rate_usd_brl_fetched_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('pricing_currency', 'BRL');

INSERT OR IGNORE INTO pricing_rate_card_imports
  (id, source, checksum, currency, effective_from, status, row_count)
VALUES
  ('e2e-pricing-import', 'https://developers.facebook.com/pricing/e2e',
   'e2e-pricing-checksum', 'BRL', '2026-07-01', 'active', 1);

UPDATE pricing_rate_card_imports
SET status='active', row_count=1, effective_from='2026-07-01'
WHERE id='e2e-pricing-import';

INSERT OR REPLACE INTO pricing_rate_cards
  (id, import_id, source, checksum, effective_from, currency, market,
   country_iso, category, tier_from, unit_price)
VALUES
  ('e2e-pricing-card-br-marketing', 'e2e-pricing-import',
   'https://developers.facebook.com/pricing/e2e', 'e2e-pricing-checksum',
   '2026-07-01', 'BRL', 'Brazil', 'BR', 'MARKETING', 0, 0.3217);

INSERT OR REPLACE INTO campaigns (
  id, name, template_name, status, workflow_id, total, sent, delivered, read, failed
) VALUES (
  'e2e-campaign-control', 'Controle E2E', 'e2e_marketing_simples',
  'sending', 'e2e-workflow-inexistente', 0, 0, 0, 0, 0
);

INSERT OR REPLACE INTO campaigns (
  id, name, template_name, status, workflow_id, total, sent, delivered, read, failed
) VALUES
  ('e2e-campaign-control-chromium', 'Controle E2E', 'e2e_marketing_simples', 'sending', 'e2e-workflow-inexistente-chromium', 0, 0, 0, 0, 0),
  ('e2e-campaign-control-firefox', 'Controle E2E', 'e2e_marketing_simples', 'sending', 'e2e-workflow-inexistente-firefox', 0, 0, 0, 0, 0),
  ('e2e-campaign-control-webkit', 'Controle E2E', 'e2e_marketing_simples', 'sending', 'e2e-workflow-inexistente-webkit', 0, 0, 0, 0, 0);

INSERT OR REPLACE INTO campaign_folders (id, name, color) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Pasta Org chromium', '#10B981'),
  ('10000000-0000-4000-8000-000000000002', 'Pasta Org firefox', '#10B981'),
  ('10000000-0000-4000-8000-000000000003', 'Pasta Org webkit', '#10B981');

INSERT OR REPLACE INTO campaign_tags (id, name, color) VALUES
  ('20000000-0000-4000-8000-000000000001', 'Tag Org chromium', '#3B82F6'),
  ('20000000-0000-4000-8000-000000000002', 'Tag Org firefox', '#3B82F6'),
  ('20000000-0000-4000-8000-000000000003', 'Tag Org webkit', '#3B82F6');

INSERT OR REPLACE INTO campaigns (
  id, name, template_name, status, total, sent, delivered, read, failed
) VALUES
  ('30000000-0000-4000-8000-000000000001', 'Organização E2E chromium', 'e2e_marketing_simples', 'draft', 0, 0, 0, 0, 0),
  ('30000000-0000-4000-8000-000000000002', 'Organização E2E firefox', 'e2e_marketing_simples', 'draft', 0, 0, 0, 0, 0),
  ('30000000-0000-4000-8000-000000000003', 'Organização E2E webkit', 'e2e_marketing_simples', 'draft', 0, 0, 0, 0, 0);

DELETE FROM campaign_tag_assignments
WHERE campaign_id IN (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003'
);

INSERT INTO contacts (id, phone, name, status, wa_id)
VALUES (
  '11111111-1111-4111-8111-111111111111', '+5511999999999',
  'Contato Piloto E2E', 'opt_in', '5511999999999'
)
ON CONFLICT(id) DO UPDATE SET
  phone=excluded.phone,
  name=excluded.name,
  status=excluded.status,
  wa_id=excluded.wa_id;

-- O cenário de campanha precisa de um destinatário elegível real: além do
-- status opt-in, a audiência exige uma evidência de consentimento ativa.
INSERT OR REPLACE INTO consent_events (
  id, source, declaration_text, contact_count, contact_id, source_detail,
  purpose, declaration_version, revoked_at, revoked_reason
) VALUES (
  '66666666-6666-4666-8666-666666666666', 'manual',
  'Consentimento sintético exclusivo para o fixture determinístico de QA.', 1,
  '11111111-1111-4111-8111-111111111111', 'e2e_fixture',
  'marketing_messages', 'e2e-fixture-v1', NULL, NULL
);

-- O contato corrigido pertence a outro cenário. Mantê-lo separado evita que
-- a alteração de nome desse teste contamine a conversa fixa da Inbox.
INSERT INTO contacts (id, phone, name, status, wa_id)
VALUES (
  '55555555-5555-4555-8555-555555555555', '+5511888888888',
  'Contato para Correção E2E', 'unknown', '5511888888888'
)
ON CONFLICT(id) DO UPDATE SET
  phone=excluded.phone,
  name=excluded.name,
  status=excluded.status,
  wa_id=excluded.wa_id;

INSERT OR REPLACE INTO campaigns (
  id, name, template_name, status, workflow_id, total, sent, delivered, read, failed
) VALUES (
  'e2e-campaign-correction', 'Correção E2E', 'e2e_marketing_simples',
  'completed', NULL, 1, 0, 0, 0, 0
);

INSERT OR REPLACE INTO campaign_contacts (
  campaign_id, contact_id, phone, status, error_code, error_detail
) VALUES (
  'e2e-campaign-correction', '55555555-5555-4555-8555-555555555555',
  '+5511888888888', 'skipped', 'MISSING_TEMPLATE_DATA', 'missing_template_data'
);

INSERT OR REPLACE INTO campaigns (
  id, name, template_name, status, total, sent, delivered, read, failed
) VALUES (
  '77777777-7777-4777-8777-777777777777', 'Pricing E2E',
  'e2e_marketing_simples', 'completed', 1, 1, 1, 0, 0
);

INSERT OR REPLACE INTO campaign_contacts (
  campaign_id, contact_id, phone, status, message_id
) VALUES (
  '77777777-7777-4777-8777-777777777777',
  '11111111-1111-4111-8111-111111111111', '+5511999999999', 'delivered',
  'wamid.e2e.pricing'
);

INSERT OR REPLACE INTO campaign_cost_snapshots
  (id, campaign_id, state, amount, currency, breakdown_json, assumptions_json,
   source, effective_from)
VALUES
  ('e2e-pricing-confirmed', '77777777-7777-4777-8777-777777777777', 'actual_from_meta',
   0.3300, 'BRL', '[]', '[]', 'meta_pricing_analytics', '2026-07-01');

INSERT INTO conversations (
  id, contact_id, wa_id, last_message_at, last_message_preview, unread_count, ai_enabled
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111', '5511999999999', unixepoch(),
  'Quero saber mais', 0, 1
)
ON CONFLICT(id) DO UPDATE SET
  contact_id=excluded.contact_id,
  wa_id=excluded.wa_id,
  last_message_at=excluded.last_message_at,
  last_message_preview=excluded.last_message_preview,
  unread_count=excluded.unread_count,
  ai_enabled=excluded.ai_enabled;

INSERT OR REPLACE INTO conversation_messages (
  id, conversation_id, contact_id, direction, message_type, text_body,
  phone_number_id, meta_timestamp
) VALUES (
  'wamid.e2e.inbound', '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111', 'inbound', 'text',
  'Quero saber mais', '11111', unixepoch()
);

INSERT OR REPLACE INTO ai_drafts (
  id, request_key, conversation_id, source_message_id, status, text_body,
  model, prompt_version, reviewed_at
) VALUES (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222', 'wamid.e2e.inbound', 'approved',
  'Olá! Posso explicar. Qual é a sua principal dúvida?',
  '@cf/meta/llama-3.2-3b-instruct', 'draft-v2', datetime('now')
);

INSERT INTO conversation_attributions (
  id, conversation_id, waba_id, phone_number_id, source_message_id,
  attribution_kind, ctwa_clid, source_id, source_type, source_url, occurred_at
) VALUES (
  '88888888-8888-4888-8888-888888888888',
  '22222222-2222-4222-8222-222222222222', '22222', '11111',
  'wamid.e2e.inbound', 'ctwa', 'e2e-ctwa-click-id-private',
  '120000000001', 'ad', 'https://facebook.com/ads/e2e', unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  conversation_id=excluded.conversation_id,
  waba_id=excluded.waba_id,
  phone_number_id=excluded.phone_number_id,
  source_message_id=excluded.source_message_id,
  attribution_kind=excluded.attribution_kind,
  ctwa_clid=excluded.ctwa_clid,
  source_id=excluded.source_id,
  source_type=excluded.source_type,
  source_url=excluded.source_url,
  occurred_at=excluded.occurred_at;

INSERT INTO conversion_events (
  id, event_id, request_key, dedupe_key, conversation_id, attribution_id,
  event_name, event_time, source, business_object_type, business_object_id,
  created_by
) VALUES (
  '99999999-9999-4999-8999-999999999999',
  'sz_e2e_lead_event_0000000000000000000000000000000000000000',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'e2e_dedupe_lead_000000000000000000000000000000000000000000',
  '22222222-2222-4222-8222-222222222222',
  '88888888-8888-4888-8888-888888888888',
  'LeadSubmitted', unixepoch(), 'manual', 'lead', 'lead-e2e-001', 'e2e'
)
ON CONFLICT(id) DO UPDATE SET
  event_id=excluded.event_id,
  request_key=excluded.request_key,
  dedupe_key=excluded.dedupe_key,
  conversation_id=excluded.conversation_id,
  attribution_id=excluded.attribution_id,
  event_name=excluded.event_name,
  event_time=excluded.event_time,
  source=excluded.source,
  business_object_type=excluded.business_object_type,
  business_object_id=excluded.business_object_id,
  created_by=excluded.created_by;

INSERT OR REPLACE INTO conversion_outbox (event_id, dataset_id, status)
VALUES ('99999999-9999-4999-8999-999999999999', '555555555555555', 'pending');
