INSERT OR IGNORE INTO templates (name, language, category, status, components)
VALUES ('e2e_marketing_simples', 'pt_BR', 'MARKETING', 'APPROVED', '[]');

INSERT OR IGNORE INTO templates (name, language, category, status, components)
VALUES (
  'e2e_template_variaveis', 'pt_BR', 'UTILITY', 'APPROVED',
  '[{"type":"HEADER","text":"Olá {{1}}"},{"type":"BODY","text":"Telefone: {{1}}"},{"type":"BUTTONS","buttons":[{"type":"URL","url":"https://example.test/{{1}}"}]}]'
);

-- Garante que o smoke jamais consiga ultrapassar o preflight de disparo.
DELETE FROM settings WHERE key IN ('whatsapp_phone_id', 'whatsapp_waba_id');

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

INSERT OR REPLACE INTO contacts (id, phone, name, status, wa_id)
VALUES (
  '11111111-1111-4111-8111-111111111111', '+5511999999999',
  'Contato Piloto E2E', 'unknown', '5511999999999'
);

-- O contato corrigido pertence a outro cenário. Mantê-lo separado evita que
-- a alteração de nome desse teste contamine a conversa fixa da Inbox.
INSERT OR REPLACE INTO contacts (id, phone, name, status, wa_id)
VALUES (
  '55555555-5555-4555-8555-555555555555', '+5511888888888',
  'Contato para Correção E2E', 'unknown', '5511888888888'
);

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

INSERT OR REPLACE INTO conversations (
  id, contact_id, wa_id, last_message_at, last_message_preview, unread_count, ai_enabled
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111', '5511999999999', unixepoch(),
  'Quero saber mais', 0, 1
);

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
