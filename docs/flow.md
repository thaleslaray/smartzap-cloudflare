# SmartZap — Flows (WhatsApp Flows)

Este documento descreve **somente** a funcionalidade de **WhatsApp Flows** no SmartZap: como criamos, validamos, publicamos, enviamos e capturamos submissões via webhook.

> Contexto rápido: Flows são experiências interativas dentro do WhatsApp (telas, inputs e ações). O “código” do Flow é um JSON (Flow JSON) definido pela Meta.

## Links oficiais (Meta)

- Visão geral / docs: https://developers.facebook.com/docs/whatsapp/flows
- Flow JSON (schema, telas, ações, limitações): https://developers.facebook.com/docs/whatsapp/flows/reference/flowjson
- Flows API (criar/atualizar/publicar/preview): https://developers.facebook.com/docs/whatsapp/flows/reference/flowsapi
- Enviar Flow (Cloud API / Interactive “flow”): https://developers.facebook.com/docs/whatsapp/flows/guides/sendingaflow
- Receber resposta (webhook `nfm_reply`): https://developers.facebook.com/docs/whatsapp/flows/guides/receiveflowresponse
- Endpoints (data_exchange / criptografia / healthcheck): https://developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint
- Template com Flow (botão FLOW em template): https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/flows-templates

## Onde fica no SmartZap (código)

### UI (Dashboard)

- Lista de Flows/rascunhos: `components/features/flows/builder/FlowBuilderListView.tsx`
- Builder “Formulário” (gera Flow JSON): `components/features/flows/builder/FlowFormBuilder.tsx`
- Teste de envio de Flow: `components/features/flows/FlowTestPanel.tsx`

### API Routes (Next.js)

- CRUD: `app/api/flows/route.ts` e `app/api/flows/[id]/route.ts`
- Publicação na Meta (create/update asset/publish/preview): `app/api/flows/[id]/meta/publish/route.ts`
- Envio do Flow (Cloud API): `app/api/flows/send/route.ts`
- Listagem de submissões: `app/api/flows/submissions/route.ts`
- Webhook inbound (captura `nfm_reply`): `app/api/webhook/route.ts`

### Libs

- Construção do payload do envio: `lib/whatsapp/flows.ts` (`buildFlowMessage()`)
- Client da Meta Graph (Flows API): `lib/meta-flows-api.ts`
- Gerador de Flow JSON (modo formulário): `lib/flow-form.ts`
- Mapping da submissão → contato: `lib/flow-mapping.ts`

## Modelo de dados (Supabase)

### Tabelas

- `flows`: catálogo de flows do builder (rascunhos) + campos de integração com Meta.
  - Migration base: `supabase/migrations/0014_add_flows_builder.sql`
  - Colunas extras (json + mapping + status/preview): `supabase/migrations/0015_add_flow_json_and_mapping.sql`

- `flow_submissions`: submissões recebidas via webhook (`interactive.nfm_reply.response_json`).
  - Migration base: `supabase/migrations/0013_add_flow_submissions.sql`
  - Colunas extras (link ao flow local + mapping aplicado): `supabase/migrations/0015_add_flow_json_and_mapping.sql`

### Observação importante sobre compatibilidade

Algumas rotas usam **fallback** quando migrations ainda não foram aplicadas (ex.: tabela inexistente ou coluna faltando), para evitar quebrar a UI em ambientes desatualizados.

## Ciclo de vida no SmartZap

### 1) Criar Flow (rascunho local)

- Endpoint: `POST /api/flows`
- Implementação: `app/api/flows/route.ts`
- Cria um registro na tabela `flows` com `status: 'DRAFT'` e um `spec` inicial.
- Opcional: `templateKey` permite iniciar o flow com `flow_json` e `mapping` pré-definidos (via `getFlowTemplateByKey()` em `lib/flow-templates`).

### 2) Editar Flow (builder) e gerar Flow JSON

O builder tem um modo “Formulário” que produz um Flow JSON automaticamente.

- Normalização/validação do formulário: `lib/flow-form.ts`
  - `normalizeFlowFormSpec()`
  - `validateFlowFormSpec()`
  - `generateFlowJsonFromFormSpec()`

O `generateFlowJsonFromFormSpec()` gera um Flow JSON com:

- `version: '7.3'`
- `screens: [...]` com `layout.type = 'SingleColumnLayout'`
- `terminal: true` na tela
- um `Footer` final com ação `complete` (encerra o flow)

Isso está alinhado com a documentação da Meta:
- `version` e `screens` são obrigatórios.
- telas `terminal` devem ter componente `Footer`.

Referência: https://developers.facebook.com/docs/whatsapp/flows/reference/flowjson

### 3) Validar e publicar na Meta

- Endpoint: `POST /api/flows/[id]/meta/publish`
- Implementação: `app/api/flows/[id]/meta/publish/route.ts`

Passos (alto nível):

1. Carrega o registro na tabela `flows`.
2. Determina o Flow JSON a publicar:
   - Prioridade: `flows.flow_json`
   - Fallback: gera a partir de `flows.spec.form`
3. Validações locais (antes de chamar a Meta):
   - `validateFlowFormSpec()` (se houver `spec.form`)
   - `validateMetaFlowJson()` (schema “próximo do esperado pela Meta”)
   - Se `flows.flow_json` estiver inválido, tenta regenerar do `spec.form` automaticamente.
4. Integração com a Meta (Graph API, Flows API):
   - Se **não** existe `meta_flow_id`:
     - `metaCreateFlow()` (cria na Meta, opcionalmente já publica)
     - `metaGetFlowDetails()` (obtém `status`)
     - `metaGetFlowPreview()` (gera `preview_url`)
   - Se **já** existe `meta_flow_id`:
     - busca detalhes e impede alteração se `status === 'PUBLISHED'` (retorna 409)
     - se permitido e `updateIfExists === true`:
       - `metaUpdateFlowMetadata()`
       - `metaUploadFlowJsonAsset()` (multipart/form-data, asset `FLOW_JSON`)
       - `metaPublishFlow()` (opcional)
       - `metaGetFlowPreview()`

Ao final, o SmartZap persiste no Supabase:
- `meta_flow_id`, `meta_status`, `meta_preview_url`, `meta_validation_errors`, `meta_last_checked_at` e `meta_published_at` (quando aplicável).

Implementação do client Meta: `lib/meta-flows-api.ts` (usa Graph `v24.0`).

Referência: https://developers.facebook.com/docs/whatsapp/flows/reference/flowsapi

### 4) Enviar um Flow (mensagem interativa)

SmartZap envia Flow como **mensagem interactive do tipo `flow`** via Cloud API.

- Endpoint: `POST /api/flows/send`
- Implementação: `app/api/flows/send/route.ts`
- Builder do payload: `lib/whatsapp/flows.ts` (`buildFlowMessage()`)

Parâmetros obrigatórios (SmartZap):
- `to` (telefone)
- `flowId` (Meta Flow ID)
- `flowToken` (token para correlação)

Parâmetros opcionais:
- `body` (texto da mensagem)
- `ctaText` (texto do botão)
- `footer` (rodapé; SmartZap valida limite de 60 caracteres)
- `action` (`navigate` ou `data_exchange`)
- `actionPayload` (ex.: `{ screen, data }`)
- `flowMessageVersion` (default `'3'`)

O payload gerado segue este formato (resumo):
- `type: 'interactive'`
- `interactive.type: 'flow'`
- `interactive.action.name: 'flow'`
- `interactive.action.parameters`: `flow_message_version`, `flow_id`, `flow_token`, `flow_cta`, `flow_action`, `flow_action_payload?`

Referência (envio via Cloud API): https://developers.facebook.com/docs/whatsapp/flows/guides/sendingaflow

#### Observação sobre janela de conversa

Esse envio é um **interactive message**, portanto aplica-se às regras de conversa/janela e limites do WhatsApp. Para mensagens “business initiated”, a Meta recomenda usar **template com botão FLOW**.

Referência: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/flows-templates

### 5) Receber submissão do Flow (webhook `nfm_reply`)

Quando o usuário conclui o flow, a Meta envia uma mensagem inbound do tipo `interactive` com:
- `interactive.type = 'nfm_reply'`
- `interactive.nfm_reply.response_json` (string JSON)

No SmartZap:

- Endpoint: `POST /api/webhook`
- Implementação: `app/api/webhook/route.ts`

O handler:

1. Detecta submissões quando:
   - `message.type === 'interactive'`
   - `message.interactive.type === 'nfm_reply'`
   - existe `nfm_reply.response_json`

2. Normaliza telefone (`normalizePhoneNumber`) e tenta resolver `contact_id` pelo telefone (best-effort).

3. Persiste em `flow_submissions` usando `message_id` como idempotência (`onConflict: 'message_id'`).

4. Tenta aplicar mapping automaticamente (best-effort):
   - se houver `flow_id` no payload e o flow existir em `flows` com `meta_flow_id = flow_id` e tiver `mapping`
   - chama `applyFlowMappingToContact()` (`lib/flow-mapping.ts`) para atualizar `contacts` (ex.: `name`, `email` e `custom_fields`).
   - grava `flow_local_id`, `mapped_data`, `mapped_at` em `flow_submissions` (se colunas existirem).

Referência (webhook de resposta): https://developers.facebook.com/docs/whatsapp/flows/guides/receiveflowresponse

#### ⚠️ Correlacionamento: a resposta não inclui Flow ID

A própria Meta documenta que a resposta **não inclui o Flow ID**; ela inclui `response_json` (com `flow_token` + campos opcionais).

Isso impacta o mapping automático: se `flow_id` não vier no webhook, não dá para localizar o flow somente pelo payload.

Recomendação prática (Meta):
- inclua um identificador no `flow_token` ou inclua um campo customizado no payload do Flow.

Referência: https://developers.facebook.com/docs/whatsapp/flows/guides/receiveflowresponse

No SmartZap, como `flowToken` já é obrigatório no envio (`/api/flows/send`), o padrão recomendado é:

- Definir `flowToken` com informações suficientes para correlação (ex.: conter o `meta_flow_id` ou o `flows.id` local).
- Exemplo de convenção (string): `smartzap:<metaFlowId>:<timestamp>:<nonce>`

> Nota: hoje o webhook persiste `flow_token`, então dá para fazer uma rotina posterior (ou evolução do webhook) que faça o lookup pelo token e aplique mapping mesmo sem `flow_id`.

### 6) Visualizar submissões

- Endpoint: `GET /api/flows/submissions?limit=...&flowId=...&phone=...`
- Implementação: `app/api/flows/submissions/route.ts`

A UI usa React Query via `hooks/useFlowSubmissions.ts` (por padrão, `limit=100`).

## MVP “sem endpoint” vs Flow com endpoint

O SmartZap hoje é desenhado para funcionar bem no modo **MVP sem endpoint**:
- o Flow JSON gerado (modo Formulário) termina com `complete` e a resposta chega via webhook.

Já o modo “Flow com endpoint” (data_exchange) é **possível**, mas exige configuração completa do endpoint do lado da Meta:
- criptografia (chaves), URL do endpoint, health checks, etc.

Referência: https://developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint

> No envio, o SmartZap permite `action: 'data_exchange'`, mas isso só fará sentido se o Flow estiver configurado para endpoint (e com `routing_model`/`data_api_version` quando requerido).

## Checklist de configuração (para funcionar ponta a ponta)

1. Configurar credenciais do WhatsApp no SmartZap (preferencialmente em `settings` no Supabase; fallback em env vars):
   - `accessToken`
   - `phoneNumberId`
   - `businessAccountId` (WABA)

2. Criar/publicar o Flow na Meta pelo Builder do SmartZap (`/flows/builder/...`) e pegar o `meta_flow_id`.

3. Enviar um Flow para um número de teste (UI “Testar” ou `POST /api/flows/send`).

4. Garantir webhook ativo (Meta → seu `/api/webhook`) e observar a criação de registros em `flow_submissions`.

## Pontos de atenção

- `footer` do Flow message: SmartZap bloqueia > 60 caracteres (`buildFlowMessage`).
- Flows publicados (`meta_status === 'PUBLISHED'`) não podem ser alterados; o endpoint de publish retorna 409 e orienta clonar.
- Submissões são processadas em modo best-effort; falhas de persistência/migrations incompletas não devem derrubar o webhook.
