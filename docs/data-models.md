# Schema do Banco de Dados - SmartZap

Documentação completa do schema PostgreSQL via Supabase. O projeto usa 38 tabelas com RLS habilitado em todas, 16 funções SECURITY DEFINER, 102 índices, 9 triggers e 29 foreign keys.

## Arquitetura Geral

- **ORM**: Nenhum - queries diretas via Supabase Client
- **RLS**: Habilitado em todas as tabelas. `service_role` bypassa RLS automaticamente
- **Realtime**: 11 tabelas com publicação habilitada
- **REPLICA IDENTITY FULL**: 4 tabelas para filtros Realtime por qualquer coluna
- **Autovacuum**: Tuning personalizado para 5 tabelas de alto volume

## Índice

1. [Domínio Core](#domínio-core)
2. [Inbox](#inbox)
3. [Inteligência Artificial](#inteligência-artificial)
4. [Workflow](#workflow)
5. [Fábrica de Templates](#fábrica-de-templates)
6. [Organização](#organização)
7. [Monitoramento](#monitoramento)
8. [Outros](#outros)
9. [Funções do Banco](#funções-do-banco)
10. [Views](#views)
11. [Realtime](#realtime)
12. [Segurança](#segurança)

---

## Domínio Core

### campaigns

Tabela central de campanhas com contadores e scheduling.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT 'c_' + uuid | ID prefixado |
| name | TEXT | NOT NULL | Nome da campanha |
| status | TEXT | NOT NULL, DEFAULT 'Rascunho' | rascunho/agendado/enviando/concluida/pausado/falhou/cancelado |
| template_name | TEXT | | Nome do template Meta |
| template_id | TEXT | | ID interno do template |
| template_variables | JSONB | | Variáveis do template (header, body, buttons) |
| template_snapshot | JSONB | | Snapshot completo do template |
| template_spec_hash | TEXT | | Hash da spec do template |
| template_parameter_format | TEXT | | positional/named |
| template_fetched_at | TIMESTAMPTZ | | Quando foi buscado da Meta |
| scheduled_date | TIMESTAMPTZ | | Data de agendamento |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | | Última atualização |
| started_at | TIMESTAMPTZ | | Quando começou a enviar |
| completed_at | TIMESTAMPTZ | | Quando terminou |
| total_recipients | INTEGER | DEFAULT 0 | Total de destinatários |
| sent | INTEGER | DEFAULT 0 | Total enviados |
| delivered | INTEGER | DEFAULT 0 | Total entregues |
| read | INTEGER | DEFAULT 0 | Total lidos |
| failed | INTEGER | DEFAULT 0 | Total falhados |
| skipped | INTEGER | DEFAULT 0 | Total ignorados |
| last_sent_at | TIMESTAMPTZ | | Último envio |
| first_dispatch_at | TIMESTAMPTZ | | Primeiro dispatch |
| cancelled_at | TIMESTAMPTZ | | Quando foi cancelada |
| qstash_schedule_message_id | TEXT | | ID de agendamento QStash |
| qstash_schedule_enqueued_at | TIMESTAMPTZ | | Quando foi enfileirado |
| flow_id | TEXT | | ID do Flow (MiniApp) |
| flow_name | TEXT | | Nome do Flow |
| folder_id | UUID | FK campaign_folders(id) SET NULL | Pasta de organização |

**Índices:**
- `campaigns_pkey` (id)
- `idx_campaigns_status` (status)
- `idx_campaigns_created_at` (created_at DESC)
- `idx_campaigns_folder_id` (folder_id)
- `idx_campaigns_flow_id` (flow_id) WHERE flow_id IS NOT NULL
- `idx_campaigns_qstash_schedule_message_id` (qstash_schedule_message_id)
- `idx_campaigns_active` (status, scheduled_date) WHERE status IN ('Enviando', 'Agendado')
- `campaigns_cancelled_at_idx` (cancelled_at)
- `campaigns_first_dispatch_at_idx` (first_dispatch_at DESC)
- `campaigns_last_sent_at_idx` (last_sent_at DESC)

**Triggers:**
- `set_updated_at` - Atualiza updated_at automaticamente

**Foreign Keys:**
- `campaigns_folder_id_fkey` → campaign_folders(id) ON DELETE SET NULL

**Realtime:** Sim (SELECT policy para anon)

**Interface TypeScript:** `Campaign` (types.ts)

---

### campaign_contacts

Relacionamento N:N entre campanhas e contatos com status por destinatário.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT 'cc_' + uuid | ID prefixado |
| campaign_id | TEXT | NOT NULL, FK CASCADE | ID da campanha |
| contact_id | TEXT | FK SET NULL | ID do contato |
| phone | TEXT | NOT NULL | Telefone do destinatário |
| name | TEXT | | Nome do destinatário |
| email | TEXT | | Email do destinatário |
| custom_fields | JSONB | DEFAULT '{}' | Campos customizados |
| status | TEXT | DEFAULT 'pending' | pending/sending/sent/delivered/read/skipped/failed |
| message_id | TEXT | | ID da mensagem WhatsApp |
| sending_at | TIMESTAMPTZ | | Quando começou a enviar |
| sent_at | TIMESTAMPTZ | | Quando foi enviado |
| delivered_at | TIMESTAMPTZ | | Quando foi entregue |
| read_at | TIMESTAMPTZ | | Quando foi lido |
| failed_at | TIMESTAMPTZ | | Quando falhou |
| skipped_at | TIMESTAMPTZ | | Quando foi ignorado |
| error | TEXT | | Mensagem de erro |
| skip_code | TEXT | | Código de skip |
| skip_reason | TEXT | | Razão do skip |
| failure_code | INTEGER | | Código de falha Meta |
| failure_reason | TEXT | | Razão da falha |
| trace_id | TEXT | | ID de rastreamento |
| failure_title | TEXT | | Título da falha |
| failure_details | TEXT | | Detalhes da falha |
| failure_fbtrace_id | TEXT | | Facebook trace ID |
| failure_subcode | INTEGER | | Subcódigo de erro |
| failure_href | TEXT | | Link de documentação |

**Constraints:**
- `campaign_contacts_skipped_reason_check` - Se status=skipped, deve ter failure_reason ou error

**Índices:**
- `campaign_contacts_pkey` (id)
- `campaign_contacts_campaign_id_contact_id_key` UNIQUE (campaign_id, contact_id)
- `idx_campaign_contacts_campaign_status` (campaign_id, status)
- `idx_campaign_contacts_campaign_phone` (campaign_id, phone)
- `idx_campaign_contacts_contact_id` (contact_id)
- `idx_campaign_contacts_status` (status)
- `idx_campaign_contacts_message_id` (message_id)
- `idx_campaign_contacts_trace_id` (trace_id)
- `idx_campaign_contacts_failed_recent` (campaign_id, failed_at DESC) WHERE status='failed'
- `idx_campaign_contacts_failure` (failure_code)
- `idx_campaign_contacts_failure_subcode` (failure_subcode)
- `idx_campaign_contacts_failure_title` (failure_title)
- `idx_campaign_contacts_failure_fbtrace_id` (failure_fbtrace_id)
- `idx_campaign_contacts_sending_at` (sending_at DESC)
- `idx_campaign_contacts_skipped_at` (skipped_at DESC)

**Foreign Keys:**
- `campaign_contacts_campaign_id_fkey` → campaigns(id) ON DELETE CASCADE
- `campaign_contacts_contact_id_fkey` → contacts(id) ON DELETE SET NULL

**Realtime:** Sim (REPLICA IDENTITY FULL, GRANT SELECT to anon + deny_anon_select policy)

**Autovacuum:** Tuning agressivo (scale_factor=0.05, analyze_scale_factor=0.02)

**Interface TypeScript:** `Message` (types.ts)

---

### contacts

Base de contatos com campos customizados e tags.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT 'ct_' + uuid | ID prefixado |
| name | TEXT | NOT NULL, DEFAULT '' | Nome do contato |
| phone | TEXT | NOT NULL, UNIQUE | Telefone E.164 |
| email | TEXT | | Email |
| status | TEXT | DEFAULT 'Opt-in' | Opt-in/Opt-out/Desconhecido |
| tags | JSONB | DEFAULT '[]' | Array de tags |
| notes | TEXT | | Notas internas |
| custom_fields | JSONB | DEFAULT '{}' | Campos customizados |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | | Última atualização |

**Índices:**
- `contacts_pkey` (id)
- `contacts_phone_key` UNIQUE (phone)
- `idx_contacts_status` (status)
- `idx_contacts_custom_fields` GIN (custom_fields)

**Triggers:**
- `set_updated_at` - Atualiza updated_at automaticamente

**Realtime:** Sim (SELECT policy para anon)

**Autovacuum:** Padrão

**Interface TypeScript:** `Contact` (types.ts)

---

### templates

Cache local de templates sincronizados da Meta.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT 'tpl_' + uuid | ID prefixado |
| name | TEXT | NOT NULL, UNIQUE (name, language) | Nome do template |
| category | TEXT | | MARKETING/UTILITY/AUTHENTICATION |
| language | TEXT | DEFAULT 'pt_BR' | Código do idioma |
| status | TEXT | | Status do template na Meta |
| parameter_format | TEXT | DEFAULT 'positional' | positional/named |
| components | JSONB | | Componentes completos (Meta API) |
| spec_hash | TEXT | | Hash da especificação |
| fetched_at | TIMESTAMPTZ | | Última sincronização |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | | Última atualização |
| header_media_preview_url | TEXT | | URL de preview de mídia |
| header_media_preview_expires_at | TIMESTAMPTZ | | Expiração do preview |
| header_media_preview_updated_at | TIMESTAMPTZ | | Última atualização do preview |

**Índices:**
- `templates_pkey` (id)
- `templates_name_language_key` UNIQUE (name, language)
- `idx_templates_status` (status)

**Triggers:**
- `set_updated_at` - Atualiza updated_at automaticamente

**Realtime:** Sim (SELECT policy para anon)

**Interface TypeScript:** `Template` (types.ts)

---

### settings

Store de configurações chave-valor (credenciais, tokens, feature flags).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| key | TEXT | PK | Chave da configuração |
| value | TEXT | NOT NULL | Valor (pode ser JSON stringificado) |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Última atualização |

**Índices:**
- `settings_pkey` (key)

**Cache:** Redis (60s TTL via lib/whatsapp-credentials.ts)

**Realtime:** Não

**Interface TypeScript:** `AppSettings` (types.ts)

---

## Inbox

### inbox_conversations

Conversas no inbox com modo bot/humano e contadores.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID da conversa |
| contact_id | TEXT | FK SET NULL | ID do contato vinculado |
| ai_agent_id | UUID | FK SET NULL | Agente de IA ativo |
| phone | TEXT | NOT NULL | Telefone do usuário |
| status | TEXT | NOT NULL, DEFAULT 'open' | open/closed |
| mode | TEXT | NOT NULL, DEFAULT 'bot' | bot/human |
| priority | TEXT | NOT NULL, DEFAULT 'normal' | low/normal/high/urgent |
| unread_count | INTEGER | NOT NULL, DEFAULT 0 | Mensagens não lidas |
| total_messages | INTEGER | NOT NULL, DEFAULT 0 | Total de mensagens |
| last_message_at | TIMESTAMPTZ | | Última mensagem |
| last_message_preview | TEXT | | Preview da última msg |
| automation_paused_until | TIMESTAMPTZ | | Pausa temporária de bot |
| automation_paused_by | TEXT | | Quem pausou |
| handoff_summary | TEXT | | Resumo do handoff |
| human_mode_expires_at | TIMESTAMPTZ | | Expiração do modo humano |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Última atualização |

**Constraints:**
- `chk_inbox_conversations_mode` - mode IN ('bot', 'human')
- `chk_inbox_conversations_status` - status IN ('open', 'closed')
- `chk_inbox_conversations_priority` - priority IN ('low', 'normal', 'high', 'urgent')

**Índices:**
- `inbox_conversations_pkey` (id)
- `idx_inbox_conversations_phone_status` (phone, status)
- `idx_inbox_conversations_phone_covering` (phone) INCLUDE (id, status, mode, ai_agent_id, contact_id, human_mode_expires_at, automation_paused_until, total_messages, unread_count, last_message_at)
- `idx_inbox_conversations_contact_id` (contact_id)
- `idx_inbox_conversations_ai_agent_id` (ai_agent_id)
- `idx_inbox_conversations_mode_status` (mode, status)
- `idx_inbox_conversations_last_message_at` (last_message_at DESC NULLS LAST)
- `idx_inbox_conversations_human_mode_expires` (human_mode_expires_at) WHERE mode='human' AND human_mode_expires_at IS NOT NULL

**Triggers:**
- `set_updated_at` - Atualiza updated_at automaticamente

**Foreign Keys:**
- `inbox_conversations_contact_id_fkey` → contacts(id) ON DELETE SET NULL
- `inbox_conversations_ai_agent_id_fkey` → ai_agents(id) ON DELETE SET NULL

**Realtime:** Sim (SELECT policy para anon)

**Autovacuum:** Tuning agressivo (scale_factor=0.05, analyze_scale_factor=0.02)

**Interface TypeScript:** `InboxConversation` (types.ts)

---

### inbox_messages

Mensagens individuais do inbox (inbound/outbound).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID da mensagem |
| conversation_id | UUID | NOT NULL, FK CASCADE | ID da conversa |
| direction | TEXT | NOT NULL | inbound/outbound |
| content | TEXT | NOT NULL | Conteúdo da mensagem |
| message_type | TEXT | NOT NULL, DEFAULT 'text' | text/image/audio/video/document/template/interactive/internal_note |
| media_url | TEXT | | URL de mídia |
| whatsapp_message_id | TEXT | | ID da mensagem WhatsApp |
| delivery_status | TEXT | NOT NULL, DEFAULT 'pending' | pending/sent/delivered/read/failed |
| ai_response_id | UUID | | ID do log do agente |
| ai_sentiment | TEXT | | positive/neutral/negative/frustrated |
| ai_sources | JSONB | | Fontes usadas pelo RAG |
| payload | JSONB | | Payload completo |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| delivered_at | TIMESTAMPTZ | | Quando foi entregue |
| read_at | TIMESTAMPTZ | | Quando foi lida |
| failed_at | TIMESTAMPTZ | | Quando falhou |
| failure_reason | TEXT | | Razão da falha |

**Constraints:**
- `chk_inbox_messages_direction` - direction IN ('inbound', 'outbound')
- `chk_inbox_messages_type` - message_type IN (text, image, audio, video, document, template, interactive, internal_note)
- `chk_inbox_messages_delivery_status` - delivery_status IN (pending, sent, delivered, read, failed)
- `chk_inbox_messages_sentiment` - ai_sentiment IS NULL OR ai_sentiment IN (positive, neutral, negative, frustrated)

**Índices:**
- `inbox_messages_pkey` (id)
- `idx_inbox_messages_conversation_created` (conversation_id, created_at DESC)
- `idx_inbox_messages_created_at` (created_at)
- `idx_inbox_messages_whatsapp_msg_id` (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL

**Foreign Keys:**
- `inbox_messages_conversation_id_fkey` → inbox_conversations(id) ON DELETE CASCADE

**Realtime:** Sim (REPLICA IDENTITY FULL, SELECT policy para anon)

**Autovacuum:** Tuning agressivo (scale_factor=0.05, analyze_scale_factor=0.02)

**Interface TypeScript:** `InboxMessage` (types.ts)

---

### inbox_labels

Etiquetas para organização de conversas.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID da label |
| name | TEXT | NOT NULL, UNIQUE | Nome da label |
| color | TEXT | NOT NULL, DEFAULT 'gray' | Cor da label |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |

**Índices:**
- `inbox_labels_pkey` (id)
- `inbox_labels_name_key` UNIQUE (name)

**Realtime:** Não

**Interface TypeScript:** `InboxLabel` (types.ts)

---

### inbox_conversation_labels

Tabela de junção N:N entre conversas e labels.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| conversation_id | UUID | PK, FK CASCADE | ID da conversa |
| label_id | UUID | PK, FK CASCADE | ID da label |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |

**Índices:**
- `inbox_conversation_labels_pkey` (conversation_id, label_id)
- `idx_inbox_conversation_labels_label_id` (label_id)

**Foreign Keys:**
- `inbox_conversation_labels_conversation_id_fkey` → inbox_conversations(id) ON DELETE CASCADE
- `inbox_conversation_labels_label_id_fkey` → inbox_labels(id) ON DELETE CASCADE

**Realtime:** Não

**GRANT SELECT to anon + deny_anon_select policy** (para JOINs em Server Actions)

---

### inbox_quick_replies

Respostas rápidas pré-definidas para atendentes.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID da resposta rápida |
| title | TEXT | NOT NULL | Título |
| content | TEXT | NOT NULL | Conteúdo |
| shortcut | TEXT | UNIQUE | Atalho (ex: /oi) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |

**Índices:**
- `inbox_quick_replies_pkey` (id)
- `inbox_quick_replies_shortcut_key` UNIQUE (shortcut)

**Realtime:** Não

**Interface TypeScript:** `InboxQuickReply` (types.ts)

---

## Inteligência Artificial

### ai_agents

Configuração de agentes de IA para inbox.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID do agente |
| name | TEXT | NOT NULL | Nome do agente |
| system_prompt | TEXT | NOT NULL | System prompt |
| model | TEXT | NOT NULL, DEFAULT 'gemini-2.5-flash' | Modelo de IA |
| temperature | REAL | NOT NULL, DEFAULT 0.7 | Temperatura |
| max_tokens | INTEGER | NOT NULL, DEFAULT 1024 | Max tokens |
| embedding_provider | TEXT | DEFAULT 'google' | google/openai/voyage/cohere |
| embedding_model | TEXT | DEFAULT 'gemini-embedding-001' | Modelo de embedding |
| embedding_dimensions | INTEGER | DEFAULT 768 | Dimensões do embedding |
| rerank_enabled | BOOLEAN | DEFAULT false | Reranking habilitado |
| rerank_provider | TEXT | | cohere/together |
| rerank_model | TEXT | | Modelo de rerank |
| rerank_top_k | INTEGER | DEFAULT 5 | Top K para rerank |
| rag_similarity_threshold | REAL | DEFAULT 0.5 | Threshold de similaridade |
| rag_max_results | INTEGER | DEFAULT 5 | Máx resultados RAG |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Agente ativo |
| is_default | BOOLEAN | NOT NULL, DEFAULT false | Agente padrão |
| debounce_ms | INTEGER | NOT NULL, DEFAULT 5000 | Debounce em ms |
| handoff_enabled | BOOLEAN | NOT NULL, DEFAULT true | Handoff habilitado |
| handoff_instructions | TEXT | DEFAULT (instruções padrão) | Instruções de handoff |
| booking_tool_enabled | BOOLEAN | NOT NULL, DEFAULT false | Ferramenta de agendamento |
| allow_reactions | BOOLEAN | DEFAULT true | Permite enviar reações |
| allow_quotes | BOOLEAN | DEFAULT true | Permite citar mensagens |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Última atualização |

**Índices:**
- `ai_agents_pkey` (id)
- `idx_ai_agents_single_default` UNIQUE (is_default) WHERE is_default=true

**Triggers:**
- `set_updated_at` - Atualiza updated_at automaticamente
- `ensure_default_ai_agent_trigger` - Marca primeiro agente como default

**Realtime:** Não

**GRANT SELECT to anon + deny_anon_select policy** (para JOINs)

**Interface TypeScript:** `AIAgent` (types.ts)

---

### ai_agent_logs

Logs de interações de agentes de IA.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID do log |
| ai_agent_id | UUID | NOT NULL, FK CASCADE | ID do agente |
| conversation_id | UUID | FK SET NULL | ID da conversa |
| input_message | TEXT | NOT NULL | Mensagem de entrada |
| output_message | TEXT | | Mensagem de saída |
| response_time_ms | INTEGER | | Tempo de resposta |
| model_used | TEXT | | Modelo usado |
| tokens_used | INTEGER | | Tokens consumidos |
| sources_used | JSONB | | Fontes RAG usadas |
| error_message | TEXT | | Mensagem de erro |
| metadata | JSONB | | Metadata adicional |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |

**Índices:**
- `ai_agent_logs_pkey` (id)
- `idx_ai_agent_logs_agent_id` (ai_agent_id)
- `idx_ai_agent_logs_conversation_id` (conversation_id)
- `idx_ai_agent_logs_created_at` (created_at)

**Foreign Keys:**
- `ai_agent_logs_ai_agent_id_fkey` → ai_agents(id) ON DELETE CASCADE
- `ai_agent_logs_conversation_id_fkey` → inbox_conversations(id) ON DELETE SET NULL

**Realtime:** Não

**Interface TypeScript:** `AIAgentLog` (types.ts)

---

### ai_embeddings

Embeddings vetoriais para RAG (pgvector).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID do embedding |
| agent_id | UUID | NOT NULL, FK CASCADE | ID do agente |
| file_id | UUID | FK CASCADE | ID do arquivo de origem |
| content | TEXT | NOT NULL | Conteúdo original |
| embedding | VECTOR(768) | NOT NULL | Vetor de embedding |
| dimensions | INTEGER | NOT NULL | Dimensões do vetor |
| metadata | JSONB | DEFAULT '{}' | Metadata adicional |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criação |

**Índices:**
- `ai_embeddings_pkey` (id)
- `ai_embeddings_agent_dimensions_idx` (agent_id, dimensions)
- `ai_embeddings_file_id_idx` (file_id)
- `ai_embeddings_embedding_idx` HNSW (embedding vector_cosine_ops)

**Foreign Keys:**
- `ai_embeddings_agent_id_fkey` → ai_agents(id) ON DELETE CASCADE
- `ai_embeddings_file_id_fkey` → ai_knowledge_files(id) ON DELETE CASCADE

**Realtime:** Não

**Interface TypeScript:** `AIEmbedding` (types.ts)

---

### ai_knowledge_files

Arquivos da base de conhecimento (RAG local via pgvector).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID do arquivo |
| agent_id | UUID | NOT NULL, FK CASCADE | ID do agente |
| name | TEXT | NOT NULL | Nome do arquivo |
| mime_type | TEXT | NOT NULL, DEFAULT 'text/plain' | Tipo MIME |
| size_bytes | INTEGER | NOT NULL, DEFAULT 0 | Tamanho em bytes |
| content | TEXT | | Conteúdo extraído |
| external_file_id | TEXT | | DEPRECATED (era Google File Search) |
| external_file_uri | TEXT | | DEPRECATED |
| indexing_status | TEXT | NOT NULL, DEFAULT 'pending' | pending/processing/completed/failed/local_only |
| chunks_count | INTEGER | DEFAULT 0 | Número de chunks indexados |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Última atualização |

**Constraints:**
- `chk_ai_knowledge_files_indexing_status` - indexing_status IN (pending, processing, completed, failed, local_only)

**Índices:**
- `ai_knowledge_files_pkey` (id)
- `idx_ai_knowledge_files_agent_id` (agent_id)
- `idx_ai_knowledge_files_created_at` (created_at DESC)

**Foreign Keys:**
- `ai_knowledge_files_agent_id_fkey` → ai_agents(id) ON DELETE CASCADE

**Realtime:** Não

**Interface TypeScript:** `AIKnowledgeFile` (types.ts)

---

## Workflow

### flows

Definições de Flows (MiniApps da Meta).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT 'fl_' + uuid | ID prefixado |
| name | TEXT | NOT NULL | Nome do flow |
| status | TEXT | NOT NULL, DEFAULT 'DRAFT' | DRAFT/PUBLISHED |
| meta_flow_id | TEXT | | ID do flow na Meta |
| spec | JSONB | NOT NULL, DEFAULT '{}' | Especificação do flow |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | | Última atualização |
| template_key | TEXT | | Chave do template |
| flow_json | JSONB | | JSON completo do flow |
| flow_version | TEXT | | Versão do flow |
| mapping | JSONB | NOT NULL, DEFAULT '{}' | Mapeamento de campos |
| meta_status | TEXT | | Status na Meta |
| meta_preview_url | TEXT | | URL de preview |
| meta_validation_errors | JSONB | | Erros de validação |
| meta_last_checked_at | TIMESTAMPTZ | | Última checagem |
| meta_published_at | TIMESTAMPTZ | | Quando foi publicado |

**Índices:**
- `flows_pkey` (id)
- `idx_flows_status` (status)
- `idx_flows_meta_flow_id` (meta_flow_id)
- `idx_flows_meta_status` (meta_status)
- `idx_flows_template_key` (template_key)
- `idx_flows_created_at` (created_at DESC)

**Triggers:**
- `set_updated_at` - Atualiza updated_at automaticamente

**Realtime:** Sim (SELECT policy para anon)

---

### flow_submissions

Submissões de flows (respostas de usuários).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT 'fs_' + uuid | ID prefixado |
| message_id | TEXT | NOT NULL, UNIQUE | ID da mensagem WhatsApp |
| from_phone | TEXT | NOT NULL | Telefone do usuário |
| contact_id | TEXT | FK SET NULL | ID do contato |
| flow_id | TEXT | | ID do flow na Meta |
| flow_name | TEXT | | Nome do flow |
| flow_token | TEXT | | Token do flow |
| response_json_raw | TEXT | NOT NULL | JSON bruto da resposta |
| response_json | JSONB | | JSON parseado |
| waba_id | TEXT | | WhatsApp Business Account ID |
| phone_number_id | TEXT | | Phone Number ID |
| message_timestamp | TIMESTAMPTZ | | Timestamp da mensagem |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| flow_local_id | TEXT | FK SET NULL | ID do flow local |
| mapped_data | JSONB | | Dados mapeados |
| mapped_at | TIMESTAMPTZ | | Quando foi mapeado |
| campaign_id | TEXT | FK SET NULL | ID da campanha |

**Índices:**
- `flow_submissions_pkey` (id)
- `flow_submissions_message_id_key` UNIQUE (message_id)
- `idx_flow_submissions_flow_id` (flow_id)
- `idx_flow_submissions_flow_local_id` (flow_local_id)
- `idx_flow_submissions_contact_id` (contact_id)
- `idx_flow_submissions_campaign_id` (campaign_id)
- `idx_flow_submissions_from_phone` (from_phone)
- `idx_flow_submissions_created_at` (created_at DESC)

**Foreign Keys:**
- `flow_submissions_contact_id_fkey` → contacts(id) ON DELETE SET NULL
- `flow_submissions_flow_local_id_fkey` → flows(id) ON DELETE SET NULL
- `flow_submissions_campaign_id_fkey` → campaigns(id) ON DELETE SET NULL

**Realtime:** Sim (REPLICA IDENTITY FULL, GRANT SELECT to anon + deny_anon_select policy)

---

### workflows

Workflows do builder (definições).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK | ID do workflow |
| name | TEXT | NOT NULL | Nome do workflow |
| description | TEXT | | Descrição |
| status | TEXT | NOT NULL, DEFAULT 'draft' | draft/active |
| owner_company_id | TEXT | | ID da empresa |
| active_version_id | TEXT | FK SET NULL | Versão ativa |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Última atualização |

**Índices:**
- `workflows_pkey` (id)
- `idx_workflows_active_version_id` (active_version_id)

**Triggers:**
- `set_updated_at` - Atualiza updated_at automaticamente

**Foreign Keys:**
- `workflows_active_version_fk` → workflow_versions(id) ON DELETE SET NULL

**Realtime:** Não

---

### workflow_versions

Versionamento de workflows.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK | ID da versão |
| workflow_id | TEXT | NOT NULL, FK CASCADE | ID do workflow |
| version | INTEGER | NOT NULL | Número da versão |
| status | TEXT | NOT NULL, DEFAULT 'draft' | draft/published |
| nodes | JSONB | NOT NULL | Nodes do workflow |
| edges | JSONB | NOT NULL | Edges do workflow |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Última atualização |
| published_at | TIMESTAMPTZ | | Quando foi publicado |

**Índices:**
- `workflow_versions_pkey` (id)
- `workflow_versions_workflow_version_idx` UNIQUE (workflow_id, version)
- `workflow_versions_workflow_id_idx` (workflow_id, created_at DESC)

**Foreign Keys:**
- `workflow_versions_workflow_id_fkey` → workflows(id) ON DELETE CASCADE

**Realtime:** Não

---

### workflow_runs

Execuções de workflows.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK | ID da execução |
| workflow_id | TEXT | NOT NULL, FK CASCADE | ID do workflow |
| version_id | TEXT | FK SET NULL | ID da versão |
| status | TEXT | NOT NULL, DEFAULT 'running' | running/completed/failed |
| trigger_type | TEXT | | Tipo de trigger |
| input | JSONB | | Input da execução |
| output | JSONB | | Output da execução |
| error | TEXT | | Mensagem de erro |
| started_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Quando começou |
| finished_at | TIMESTAMPTZ | | Quando terminou |

**Índices:**
- `workflow_runs_pkey` (id)
- `workflow_runs_workflow_id_idx` (workflow_id, started_at DESC)
- `workflow_runs_version_id_idx` (version_id, started_at DESC)

**Foreign Keys:**
- `workflow_runs_workflow_id_fkey` → workflows(id) ON DELETE CASCADE
- `workflow_runs_version_id_fkey` → workflow_versions(id) ON DELETE SET NULL

**Realtime:** Não

---

### workflow_run_logs

Logs detalhados por node de execução.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | BIGSERIAL | PK | ID do log |
| run_id | TEXT | NOT NULL, FK CASCADE | ID da execução |
| node_id | TEXT | NOT NULL | ID do node |
| node_name | TEXT | | Nome do node |
| node_type | TEXT | | Tipo do node |
| status | TEXT | NOT NULL | success/failed |
| input | JSONB | | Input do node |
| output | JSONB | | Output do node |
| error | TEXT | | Mensagem de erro |
| started_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Quando começou |
| completed_at | TIMESTAMPTZ | | Quando completou |

**Índices:**
- `workflow_run_logs_pkey` (id)
- `workflow_run_logs_run_id_idx` (run_id, started_at DESC)

**Foreign Keys:**
- `workflow_run_logs_run_id_fkey` → workflow_runs(id) ON DELETE CASCADE

**Realtime:** Não

---

### workflow_conversations

Conversas stateful de workflows (para input nodes).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK | ID da conversa |
| workflow_id | TEXT | NOT NULL, FK CASCADE | ID do workflow |
| phone | TEXT | NOT NULL | Telefone do usuário |
| status | TEXT | NOT NULL, DEFAULT 'waiting' | waiting/completed |
| resume_node_id | TEXT | | Node onde deve retomar |
| variable_key | TEXT | | Chave da variável esperada |
| variables | JSONB | | Variáveis coletadas |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Última atualização |

**Índices:**
- `workflow_conversations_pkey` (id)
- `workflow_conversations_workflow_id_idx` (workflow_id, updated_at DESC)
- `workflow_conversations_phone_idx` (phone, updated_at DESC)

**Foreign Keys:**
- `workflow_conversations_workflow_id_fkey` → workflows(id) ON DELETE CASCADE

**Realtime:** Não

---

### workflow_builder_executions

Execuções legacy do builder (deprecated).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK | ID da execução |
| workflow_id | TEXT | NOT NULL | ID do workflow |
| status | TEXT | NOT NULL, DEFAULT 'running' | running/completed/failed |
| input | JSONB | | Input |
| output | JSONB | | Output |
| error | TEXT | | Erro |
| started_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Início |
| finished_at | TIMESTAMPTZ | | Fim |

**Índices:**
- `workflow_builder_executions_pkey` (id)
- `workflow_builder_executions_workflow_id_idx` (workflow_id, started_at DESC)

**Realtime:** Não

---

### workflow_builder_logs

Logs legacy do builder (deprecated).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | BIGSERIAL | PK | ID do log |
| execution_id | TEXT | NOT NULL, FK CASCADE | ID da execução |
| node_id | TEXT | NOT NULL | ID do node |
| node_name | TEXT | | Nome |
| node_type | TEXT | | Tipo |
| status | TEXT | NOT NULL | Status |
| input | JSONB | | Input |
| output | JSONB | | Output |
| error | TEXT | | Erro |
| started_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Início |
| completed_at | TIMESTAMPTZ | | Fim |

**Índices:**
- `workflow_builder_logs_pkey` (id)
- `workflow_builder_logs_execution_id_idx` (execution_id, started_at DESC)

**Foreign Keys:**
- `workflow_builder_logs_execution_id_fkey` → workflow_builder_executions(id) ON DELETE CASCADE

**Realtime:** Não

---

## Fábrica de Templates

### template_projects

Projetos de geração em lote de templates.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT 'tp_' + uuid | ID prefixado |
| user_id | TEXT | | ID do usuário |
| title | TEXT | NOT NULL | Título do projeto |
| prompt | TEXT | | Prompt usado para geração |
| status | TEXT | DEFAULT 'draft' | draft/submitted/completed |
| template_count | INTEGER | DEFAULT 0 | Total de templates |
| approved_count | INTEGER | DEFAULT 0 | Total aprovados |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | | Última atualização |
| source | TEXT | DEFAULT 'ai' | ai/manual |
| strategy | TEXT | DEFAULT 'utility' | marketing/utility/bypass |

**Índices:**
- `template_projects_pkey` (id)
- `idx_template_projects_status` (status)

**Realtime:** Sim (GRANT SELECT to anon + deny_anon_select policy)

**Interface TypeScript:** `TemplateProject` (types.ts)

---

### template_project_items

Templates individuais dentro de um projeto.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT 'tpi_' + uuid | ID prefixado |
| project_id | TEXT | NOT NULL, FK CASCADE | ID do projeto |
| name | TEXT | NOT NULL | Nome do template |
| content | TEXT | NOT NULL | Conteúdo do body |
| language | TEXT | DEFAULT 'pt_BR' | Idioma |
| category | TEXT | DEFAULT 'UTILITY' | MARKETING/UTILITY/AUTHENTICATION |
| status | TEXT | DEFAULT 'draft' | draft/submitted/approved/rejected |
| meta_id | TEXT | | ID na Meta |
| meta_status | TEXT | | Status na Meta |
| rejected_reason | TEXT | | Motivo de rejeição |
| submitted_at | TIMESTAMPTZ | | Quando foi submetido |
| components | JSONB | | Componentes completos |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | | Última atualização |
| sample_variables | JSONB | | Variáveis comportadas (BYPASS) |
| marketing_variables | JSONB | | Variáveis promocionais (BYPASS) |
| header | JSONB | | Header component |
| footer | JSONB | | Footer component |
| buttons | JSONB | | Buttons component |
| variables | JSONB | | Variáveis genéricas |

**Índices:**
- `template_project_items_pkey` (id)
- `idx_template_project_items_project` (project_id)
- `idx_template_project_items_status` (status)

**Foreign Keys:**
- `template_project_items_project_id_fkey` → template_projects(id) ON DELETE CASCADE

**Realtime:** Sim (REPLICA IDENTITY FULL, GRANT SELECT to anon + deny_anon_select policy)

**Interface TypeScript:** `TemplateProjectItem` (types.ts)

---

## Organização

### campaign_folders

Pastas para organização de campanhas.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID da pasta |
| name | TEXT | NOT NULL, UNIQUE | Nome da pasta |
| color | TEXT | NOT NULL, DEFAULT '#6B7280' | Cor da pasta |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Última atualização |

**Índices:**
- `campaign_folders_pkey` (id)
- `campaign_folders_name_unique` UNIQUE (name)

**Triggers:**
- `update_campaign_folders_updated_at_trigger` - Atualiza updated_at

**Realtime:** Não

**GRANT SELECT to anon + deny_anon_select policy**

**Interface TypeScript:** `CampaignFolder` (types.ts)

---

### campaign_tags

Tags para categorização de campanhas.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID da tag |
| name | TEXT | NOT NULL, UNIQUE | Nome da tag |
| color | TEXT | NOT NULL, DEFAULT '#6B7280' | Cor da tag |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |

**Índices:**
- `campaign_tags_pkey` (id)
- `campaign_tags_name_unique` UNIQUE (name)

**Realtime:** Não

**GRANT SELECT to anon + deny_anon_select policy**

**Interface TypeScript:** `CampaignTag` (types.ts)

---

### campaign_tag_assignments

Tabela de junção N:N entre campanhas e tags.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| campaign_id | TEXT | PK, FK CASCADE | ID da campanha |
| tag_id | UUID | PK, FK CASCADE | ID da tag |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |

**Índices:**
- `campaign_tag_assignments_pkey` (campaign_id, tag_id)
- `idx_campaign_tag_assignments_tag` (tag_id)

**Foreign Keys:**
- `campaign_tag_assignments_campaign_id_fkey` → campaigns(id) ON DELETE CASCADE
- `campaign_tag_assignments_tag_id_fkey` → campaign_tags(id) ON DELETE CASCADE

**Realtime:** Não

**GRANT SELECT to anon + deny_anon_select policy**

---

### custom_field_definitions

Definições de campos customizados para entidades.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT 'cfd_' + uuid | ID prefixado |
| key | TEXT | NOT NULL, UNIQUE (entity_type, key) | Chave do campo |
| label | TEXT | NOT NULL | Label exibido |
| type | TEXT | NOT NULL, DEFAULT 'text' | text/number/date/select |
| options | JSONB | | Opções para select |
| entity_type | TEXT | NOT NULL, DEFAULT 'contact' | contact/deal |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |

**Índices:**
- `custom_field_definitions_pkey` (id)
- `custom_field_definitions_entity_type_key_key` UNIQUE (entity_type, key)

**Realtime:** Não

**Interface TypeScript:** `CustomFieldDefinition` (types.ts)

---

## Monitoramento

### account_alerts

Alertas de saúde da conta (pagamento, qualidade, etc).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT 'alert_' + uuid | ID prefixado |
| type | TEXT | NOT NULL | payment/quality/other |
| code | INTEGER | | Código do erro Meta |
| message | TEXT | NOT NULL | Mensagem do alerta |
| details | JSONB | | Detalhes adicionais |
| dismissed | BOOLEAN | DEFAULT false | Se foi dispensado |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |

**Índices:**
- `account_alerts_pkey` (id)
- `idx_account_alerts_type` (type)
- `idx_account_alerts_dismissed_created` (dismissed, created_at DESC)

**Realtime:** Sim (SELECT policy para anon)

---

### whatsapp_status_events

Eventos de webhook da Meta (sent, delivered, read, failed).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT 'wse_' + uuid | ID prefixado |
| message_id | TEXT | NOT NULL | ID da mensagem WhatsApp |
| status | TEXT | NOT NULL | sent/delivered/read/failed |
| event_ts | TIMESTAMPTZ | | Timestamp do evento |
| event_ts_raw | TEXT | | Timestamp bruto |
| dedupe_key | TEXT | NOT NULL, UNIQUE | message_id + status (deduplicação) |
| recipient_id | TEXT | | ID do destinatário |
| errors | JSONB | | Erros da Meta |
| payload | JSONB | | Payload completo |
| apply_state | TEXT | NOT NULL, DEFAULT 'pending' | pending/applied/failed |
| applied | BOOLEAN | NOT NULL, DEFAULT false | Se foi aplicado |
| applied_at | TIMESTAMPTZ | | Quando foi aplicado |
| apply_error | TEXT | | Erro ao aplicar |
| attempts | INTEGER | NOT NULL, DEFAULT 0 | Tentativas de aplicação |
| last_attempt_at | TIMESTAMPTZ | | Última tentativa |
| campaign_contact_id | TEXT | FK SET NULL | ID do campaign_contact |
| campaign_id | TEXT | FK SET NULL | ID da campanha |
| first_received_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Primeira recepção |
| last_received_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Última recepção |

**Índices:**
- `whatsapp_status_events_pkey` (id)
- `ux_whatsapp_status_events_dedupe_key` UNIQUE (dedupe_key)
- `idx_whatsapp_status_events_message_id` (message_id)
- `idx_whatsapp_status_events_apply_state` (apply_state)
- `idx_whatsapp_status_events_campaign_contact_id` (campaign_contact_id)
- `idx_whatsapp_status_events_campaign_id` (campaign_id)
- `idx_whatsapp_status_events_last_received_at` (last_received_at DESC)

**Foreign Keys:**
- `whatsapp_status_events_campaign_contact_id_fkey` → campaign_contacts(id) ON DELETE SET NULL
- `whatsapp_status_events_campaign_id_fkey` → campaigns(id) ON DELETE SET NULL

**Autovacuum:** Tuning agressivo (scale_factor=0.05, analyze_scale_factor=0.02)

**Realtime:** Não

---

### campaign_run_metrics

Métricas de desempenho por execução de campanha.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID da métrica |
| campaign_id | TEXT | NOT NULL, UNIQUE (campaign_id, trace_id) | ID da campanha |
| trace_id | TEXT | NOT NULL | ID de rastreamento |
| template_name | TEXT | | Nome do template |
| recipients | INTEGER | | Total de destinatários |
| sent_total | INTEGER | | Total enviados |
| failed_total | INTEGER | | Total falhados |
| skipped_total | INTEGER | | Total ignorados |
| first_dispatch_at | TIMESTAMPTZ | | Primeiro dispatch |
| last_sent_at | TIMESTAMPTZ | | Último envio |
| dispatch_duration_ms | INTEGER | | Duração do dispatch |
| throughput_mps | NUMERIC | | Throughput (msgs/segundo) |
| meta_avg_ms | NUMERIC | | Média de latência Meta API |
| db_avg_ms | NUMERIC | | Média de latência DB |
| saw_throughput_429 | BOOLEAN | NOT NULL, DEFAULT false | Se houve rate limit 429 |
| config | JSONB | | Configuração usada |
| config_hash | TEXT | | Hash da configuração |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |

**Índices:**
- `campaign_run_metrics_pkey` (id)
- `campaign_run_metrics_campaign_id_trace_id_key` UNIQUE (campaign_id, trace_id)
- `campaign_run_metrics_campaign_idx` (campaign_id, created_at DESC)
- `campaign_run_metrics_config_hash_idx` (config_hash, created_at DESC)
- `campaign_run_metrics_created_idx` (created_at DESC)

**Realtime:** Não

---

### campaign_batch_metrics

Métricas por batch de campanha (granularidade mais fina).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID da métrica |
| campaign_id | TEXT | NOT NULL | ID da campanha |
| trace_id | TEXT | NOT NULL | ID de rastreamento |
| batch_index | INTEGER | NOT NULL | Índice do batch |
| configured_batch_size | INTEGER | | Tamanho configurado |
| batch_size | INTEGER | NOT NULL | Tamanho real |
| concurrency | INTEGER | NOT NULL | Concorrência usada |
| adaptive_enabled | BOOLEAN | NOT NULL, DEFAULT false | Se adaptativo estava habilitado |
| target_mps | INTEGER | | Target msgs/segundo |
| floor_delay_ms | INTEGER | | Delay mínimo |
| sent_count | INTEGER | NOT NULL, DEFAULT 0 | Enviados |
| failed_count | INTEGER | NOT NULL, DEFAULT 0 | Falhados |
| skipped_count | INTEGER | NOT NULL, DEFAULT 0 | Ignorados |
| meta_requests | INTEGER | NOT NULL, DEFAULT 0 | Requests à Meta |
| meta_time_ms | INTEGER | NOT NULL, DEFAULT 0 | Tempo total Meta |
| db_time_ms | INTEGER | NOT NULL, DEFAULT 0 | Tempo total DB |
| saw_throughput_429 | BOOLEAN | NOT NULL, DEFAULT false | Rate limit |
| batch_ok | BOOLEAN | NOT NULL, DEFAULT true | Se batch foi OK |
| error | TEXT | | Mensagem de erro |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |

**Índices:**
- `campaign_batch_metrics_pkey` (id)
- `campaign_batch_metrics_campaign_idx` (campaign_id, created_at DESC)
- `campaign_batch_metrics_trace_idx` (trace_id, batch_index)

**Realtime:** Não

---

### campaign_trace_events

Log detalhado de eventos de campanha (debug).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID do evento |
| trace_id | TEXT | NOT NULL | ID de rastreamento |
| ts | TIMESTAMPTZ | NOT NULL | Timestamp do evento |
| campaign_id | TEXT | | ID da campanha |
| step | TEXT | | Step do evento |
| phase | TEXT | NOT NULL | Fase do evento |
| ok | BOOLEAN | | Se foi sucesso |
| ms | INTEGER | | Duração em ms |
| batch_index | INTEGER | | Índice do batch |
| contact_id | TEXT | | ID do contato |
| phone_masked | TEXT | | Telefone mascarado |
| extra | JSONB | | Dados adicionais |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |

**Índices:**
- `campaign_trace_events_pkey` (id)
- `campaign_trace_events_trace_idx` (trace_id, ts DESC)
- `campaign_trace_events_trace_phase_idx` (trace_id, phase, ts DESC)
- `campaign_trace_events_campaign_idx` (campaign_id, ts DESC)

**Realtime:** Não

---

## Outros

### phone_suppressions

Lista de supressão de telefones (opt-out, bloqueios).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT 'ps_' + uuid | ID prefixado |
| phone | TEXT | NOT NULL, UNIQUE | Telefone E.164 |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Se está ativo |
| reason | TEXT | | Motivo da supressão |
| source | TEXT | | Fonte (webhook, manual) |
| metadata | JSONB | NOT NULL, DEFAULT '{}' | Metadata adicional |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| last_seen_at | TIMESTAMPTZ | | Última ocorrência |
| expires_at | TIMESTAMPTZ | | Expiração (opcional) |

**Índices:**
- `phone_suppressions_pkey` (id)
- `phone_suppressions_phone_key` UNIQUE (phone)
- `idx_phone_suppressions_phone` (phone)
- `idx_phone_suppressions_active` (is_active) WHERE is_active=true
- `idx_phone_suppressions_expires` (expires_at) WHERE expires_at IS NOT NULL

**Realtime:** Não

---

### lead_forms

Formulários públicos de captação de leads.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | TEXT | PK, DEFAULT 'lf_' + uuid | ID prefixado |
| name | TEXT | NOT NULL | Nome do formulário |
| slug | TEXT | NOT NULL, UNIQUE | Slug para URL |
| tag | TEXT | NOT NULL | Tag aplicada aos leads |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Se está ativo |
| success_message | TEXT | | Mensagem de sucesso |
| webhook_token | TEXT | UNIQUE | Token para webhook |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | | Última atualização |
| fields | JSONB | NOT NULL, DEFAULT '[]' | Campos do formulário |
| collect_email | BOOLEAN | NOT NULL, DEFAULT true | Se coleta email |

**Índices:**
- `lead_forms_pkey` (id)
- `lead_forms_slug_key` UNIQUE (slug)
- `lead_forms_webhook_token_key` UNIQUE (webhook_token)
- `idx_lead_forms_slug` (slug)
- `idx_lead_forms_is_active` (is_active)
- `idx_lead_forms_collect_email` (collect_email)
- `lead_forms_fields_gin_idx` GIN (fields)

**Realtime:** Não

**Interface TypeScript:** `LeadForm` (types.ts)

---

### attendant_tokens

Tokens de acesso para atendentes (web monitor).

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID do token |
| name | TEXT | NOT NULL | Nome do atendente |
| token | TEXT | NOT NULL, UNIQUE | Token de acesso |
| permissions | JSONB | NOT NULL, DEFAULT '{"canView":true,"canReply":true,"canHandoff":false}' | Permissões |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Se está ativo |
| last_used_at | TIMESTAMPTZ | | Último uso |
| access_count | INTEGER | NOT NULL, DEFAULT 0 | Contador de acessos |
| expires_at | TIMESTAMPTZ | | Expiração (opcional) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Última atualização |

**Índices:**
- `attendant_tokens_pkey` (id)
- `attendant_tokens_token_key` UNIQUE (token)
- `idx_attendant_tokens_active` (is_active) WHERE is_active=true

**Triggers:**
- `update_attendant_tokens_updated_at_trigger` - Atualiza updated_at

**Realtime:** Não

**Interface TypeScript:** `AttendantToken` (types.ts)

---

### push_subscriptions

Subscrições Web Push para notificações.

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| id | UUID | PK, DEFAULT gen_random_uuid() | ID da subscrição |
| endpoint | TEXT | NOT NULL, UNIQUE | Endpoint do push |
| keys | JSONB | NOT NULL | Chaves p256dh e auth |
| attendant_token_id | UUID | FK CASCADE | ID do token do atendente |
| user_agent | TEXT | | User agent do navegador |
| last_used_at | TIMESTAMPTZ | | Último uso |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criação |

**Constraints:**
- `push_subscriptions_keys_check` - keys deve conter 'p256dh' e 'auth'

**Índices:**
- `push_subscriptions_pkey` (id)
- `push_subscriptions_endpoint_key` UNIQUE (endpoint)
- `idx_push_subscriptions_attendant` (attendant_token_id)
- `idx_push_subscriptions_created` (created_at DESC)

**Foreign Keys:**
- `push_subscriptions_attendant_token_id_fkey` → attendant_tokens(id) ON DELETE CASCADE

**Realtime:** Não

---

## Funções do Banco

Todas as funções são `SECURITY DEFINER` com `SET search_path TO 'public'` (ou empty) e executáveis apenas por `service_role`.

### Contadores Atômicos (Inbox)

| Função | Descrição |
|--------|-----------|
| `increment_conversation_counters(p_conversation_id UUID, p_direction TEXT, p_message_preview TEXT)` | Incrementa total_messages e unread_count (se inbound), atualiza last_message_at/preview. Retorna row completo. |
| `decrement_unread_count(p_conversation_id UUID, p_amount INT)` | Decrementa unread_count (nunca fica negativo). Retorna row. |
| `reset_unread_count(p_conversation_id UUID)` | Zera unread_count. Retorna row. |

### Processamento Atômico (Inbox)

| Função | Descrição |
|--------|-----------|
| `process_inbound_message(p_phone TEXT, p_content TEXT, ...)` | Busca/cria conversa + cria mensagem + atualiza contadores em 1 RPC. Auto-vincula contact_id pelo telefone. Retorna JSON com conversation_id, message_id, is_new_conversation, conversation_status, conversation_mode, ai_agent_id, human_mode_expires_at, automation_paused_until. |
| `get_agent_config(p_conversation_id UUID)` | Busca config do agente (debounce_ms, agent_name) em 1 query. Retorna JSON. |

### Estatísticas (Dashboard)

| Função | Descrição |
|--------|-----------|
| `get_campaign_contact_stats(p_campaign_id TEXT)` | Retorna JSON com total, pending, sent, delivered, read, skipped, failed de campaign_contacts. |
| `get_campaigns_with_all_tags(p_tag_ids UUID[])` | Retorna array de campaign_ids que possuem TODAS as tags informadas (AND). |
| `get_contact_stats()` | Retorna JSON com total, optIn, optOut de contacts. |
| `get_contact_tags()` | Retorna JSON array com todas as tags únicas em contacts.tags. |
| `get_dashboard_stats()` | Retorna TABLE com total_campaigns, total_contacts, total_sent, total_delivered, total_read, total_failed. |

### Incremento de Contadores (Campanhas)

| Função | Descrição |
|--------|-----------|
| `increment_campaign_stat(campaign_id_input TEXT, field TEXT)` | Incrementa campaigns.sent/delivered/read/failed. |
| `increment_campaign_stat(p_campaign_id UUID, p_stat TEXT, p_value INTEGER)` | Versão genérica (UUID + dinâmico). |

### RAG (Embeddings)

| Função | Descrição |
|--------|-----------|
| `search_embeddings(query_embedding VECTOR, match_threshold FLOAT, match_count INT, p_agent_id UUID)` | Busca por similaridade cosseno, retorna TABLE (id, content, metadata, similarity). |
| `search_embeddings(query_embedding VECTOR, agent_id_filter UUID, expected_dimensions INT, match_threshold FLOAT, match_count INT)` | Versão com filtro de dimensões. |

### Manutenção

| Função | Descrição |
|--------|-----------|
| `analyze_table(table_name TEXT)` | Executa ANALYZE em tabelas whitelistadas (campaign_contacts, contacts, inbox_messages, whatsapp_status_events). |

### Triggers

| Função | Trigger | Descrição |
|--------|---------|-----------|
| `update_updated_at_column()` | BEFORE UPDATE em 7 tabelas | Atualiza updated_at=NOW() |
| `ensure_default_ai_agent()` | BEFORE INSERT em ai_agents | Marca primeiro agente como is_default=true |
| `update_attendant_tokens_updated_at()` | BEFORE UPDATE em attendant_tokens | Atualiza updated_at |
| `update_campaign_dispatch_metrics()` | (não referenciado) | Atualiza contadores campaigns baseado em campaign_contacts |
| `update_campaign_folders_updated_at()` | BEFORE UPDATE em campaign_folders | Atualiza updated_at |

---

## Views

### campaign_stats_summary

View agregada com estatísticas gerais de campanhas. `SECURITY INVOKER` (respeita RLS do role que chama).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| total_campaigns | INTEGER | Total de campanhas |
| total_sent | INTEGER | Total enviados |
| total_delivered | INTEGER | Total entregues |
| total_read | INTEGER | Total lidos |
| total_failed | INTEGER | Total falhados |
| active_campaigns | INTEGER | Campanhas em 'enviando' |
| completed_campaigns | INTEGER | Campanhas 'concluida' |
| draft_campaigns | INTEGER | Campanhas 'rascunho' |
| paused_campaigns | INTEGER | Campanhas 'pausado' |
| scheduled_campaigns | INTEGER | Campanhas 'agendado' |
| failed_campaigns | INTEGER | Campanhas 'falhou' |
| sent_24h | INTEGER | Enviados últimas 24h |
| delivered_24h | INTEGER | Entregues últimas 24h |
| failed_24h | INTEGER | Falhados últimas 24h |

**Realtime:** Não

**GRANT:** REVOKE ALL de anon/authenticated

---

## Realtime

Tabelas com publicação habilitada via `ALTER PUBLICATION supabase_realtime ADD TABLE`:

1. **campaigns** - SELECT policy para anon
2. **campaign_contacts** - REPLICA IDENTITY FULL, GRANT SELECT + deny_anon_select policy
3. **inbox_conversations** - SELECT policy para anon
4. **inbox_messages** - REPLICA IDENTITY FULL, SELECT policy para anon
5. **contacts** - SELECT policy para anon
6. **templates** - SELECT policy para anon
7. **flows** - SELECT policy para anon
8. **account_alerts** - SELECT policy para anon
9. **template_project_items** - REPLICA IDENTITY FULL, GRANT SELECT + deny_anon_select policy
10. **template_projects** - GRANT SELECT + deny_anon_select policy
11. **flow_submissions** - REPLICA IDENTITY FULL, GRANT SELECT + deny_anon_select policy

**REPLICA IDENTITY FULL** permite filtros Realtime por qualquer coluna (não apenas PK).

**GRANT SELECT to anon + deny_anon_select policy** permite JOINs em Server Actions via Supabase Client (anon), mas bloqueia leitura direta via REST API.

---

## Segurança

### Row Level Security (RLS)

- **Habilitado em TODAS as 38 tabelas**
- `service_role` bypassa RLS automaticamente
- **7 tabelas com policy SELECT para anon** (frontend Realtime): campaigns, campaign_contacts, inbox_conversations, inbox_messages, contacts, templates, flows, account_alerts
- **10 tabelas com GRANT SELECT to anon + deny_anon_select policy** (para JOINs): campaign_contacts, inbox_conversation_labels, inbox_labels, ai_agents, campaign_folders, campaign_tag_assignments, campaign_tags, template_project_items, template_projects, flow_submissions

### Funções SECURITY DEFINER

Todas as 16 funções são protegidas:

```sql
REVOKE ALL ON FUNCTION func_name FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION func_name TO service_role;
```

Isto impede que a `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` seja usada para chamar funções privilegiadas via PostgREST `/rpc/`.

### Table-level Grants

- **31 tabelas sem policies**: `REVOKE ALL ON TABLE ... FROM anon, authenticated`
- **7 tabelas com SELECT policy**: `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE ... FROM anon, authenticated`
- **Sequences**: `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated`
- **Default privileges**: `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ... FROM anon, authenticated`

### Autovacuum Tuning

Tabelas de alto volume com tuning agressivo (scale_factor=0.05, analyze_scale_factor=0.02, vacuum_cost_delay=2):

1. campaign_contacts
2. inbox_messages
3. inbox_conversations
4. whatsapp_status_events
5. campaigns (scale_factor=0.10, analyze_scale_factor=0.05)

---

## Convenções de Naming

- **Prefixos de ID**: `c_` (campaigns), `cc_` (campaign_contacts), `ct_` (contacts), `tpl_` (templates), `tp_` (template_projects), `tpi_` (template_project_items), `fl_` (flows), `fs_` (flow_submissions), `cfd_` (custom_field_definitions), `lf_` (lead_forms), `ps_` (phone_suppressions), `alert_` (account_alerts), `wse_` (whatsapp_status_events)
- **UUIDs puros**: inbox_*, ai_*, workflow_*, attendant_tokens, push_subscriptions
- **Timestamps**: `created_at`, `updated_at`, `sent_at`, `delivered_at`, `read_at`, `failed_at`, etc.
- **JSONB fields**: `custom_fields`, `tags`, `components`, `variables`, `metadata`, `payload`

---

## Extensões

- **vector** (schema extensions) - Para embeddings pgvector (RAG)

---

## Performance

- **102 índices** otimizados para queries principais
- **HNSW index** em ai_embeddings.embedding para busca vetorial
- **GIN indexes** em campos JSONB (custom_fields, fields)
- **Partial indexes** para queries condicionais frequentes (is_active, status filters)
- **Covering indexes** para index-only scans (idx_inbox_conversations_phone_covering)
- **Composite indexes** para filtros compostos (campaign_id + status, trace_id + batch_index)

---

Documentação gerada a partir do schema em `/Users/thaleslaray/code/projetos/smartzap/supabase/migrations/00000000000000_init.sql` e `/Users/thaleslaray/code/projetos/smartzap/types.ts`.
