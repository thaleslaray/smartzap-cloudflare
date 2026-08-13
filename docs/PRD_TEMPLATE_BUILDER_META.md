# PRD Técnico — Template Builder (estilo Meta) dentro do SmartZap

Data: 2025-12-14  
Autor: Copilot (GPT-5.2 Preview)

> Objetivo: definir, com detalhe técnico suficiente, o que precisamos para construir uma interface de **criação/edição de Message Templates** no SmartZap com UX semelhante ao **WhatsApp Manager (Meta)**, usando a **WhatsApp Business Management API**.

---

## 1) Contexto e motivação

Hoje o SmartZap já:

- lista templates da Meta (`GET /api/templates`) e sincroniza em background para o Supabase;
- busca por nome e permite deletar (`/api/templates/[name]`);
- cria templates na Meta (`POST /api/templates/create` via `TemplateService.create()`);
- possui preview e validadores (Zod e validação pré-disparo).

Porém, a UX atual é orientada a “fábrica/IA” (projetos e geração), e não oferece um **builder manual** por componentes igual o da Meta.

### Resultado esperado

- Usuário cria um template manualmente (MARKETING/UTILITY/AUTHENTICATION) com header/body/footer/buttons.
- UI valida regras de composição e exige exemplos de variáveis (quando necessário).
- UI permite upload de mídia para header (gerando `header_handle`) e mostra preview.
- Submissão para a Meta retorna status `PENDING` e o sistema acompanha até `APPROVED/REJECTED`.

---

## 2) Escopo

### 2.1 In-scope (MVP)

1) **Builder manual** para templates padrão:
   - `HEADER` (TEXT, IMAGE, VIDEO, DOCUMENT, LOCATION)
   - `BODY` (obrigatório)
   - `FOOTER`
   - `BUTTONS` (URL, PHONE_NUMBER, QUICK_REPLY, COPY_CODE)

2) **Suporte a variáveis** (positional por padrão):
   - Inserção assistida de `{{1}}`, `{{2}}`...
   - Painel de variáveis detectadas + inputs de exemplos obrigatórios

3) **Preview** estilo WhatsApp (reaproveitar renderer atual).

4) **Submit** para a Meta + rastreio de status:
   - listagem local de drafts/submissions
   - refresh manual (poll) e/ou atualização via webhook.

5) **Upload de mídia** para header via **Resumable Upload API** → retorno de `header_handle`.

### 2.2 Out-of-scope (para fase 2)

- Carousel templates (CAROUSEL)
- Limited-time offer
- Botões avançados (FLOW/MPM/CATALOG/VOICE_CALL)
- Named parameters (`{{first_name}}`) como padrão (podemos adicionar depois)
- Editor WYSIWYG “arrasta-e-solta”

---

## 3) UX/IA (wireframe textual) — Template Builder

### 3.1 Navegação

- Menu: `Templates` → botão **Criar template (Manual)**
- Rota sugerida: `app/(dashboard)/templates/builder/page.tsx`

### 3.2 Layout (similar ao WhatsApp Manager)

Tela em 2 colunas:

- **Coluna A (Editor)**
  1. Config:
     - Nome (snake_case)
     - Categoria (UTILITY/MARKETING/AUTHENTICATION)
     - Idioma (pt_BR/en_US/es_ES)
     - (Avançado, opcional) `parameter_format`: positional/named

  2. Componentes:
     - HEADER
       - Toggle: Nenhum / Texto / Mídia / Localização
       - Texto: input + contador (60)
       - Mídia: seletor (image/video/document) + upload + preview + validação de tipo
       - Localização: somente seleção do tipo (valores são enviados no disparo, não na criação)

     - BODY (obrigatório)
       - textarea + contador (1024)
       - botão “Inserir variável” (insere `{{n}}` na posição do cursor)

     - FOOTER (opcional)
       - input + contador (60)

     - BUTTONS (opcional)
       - lista de botões
       - adicionar/remover
       - suporte (MVP): URL / PHONE_NUMBER / QUICK_REPLY / COPY_CODE
       - regras:
         - max 10 total
         - URL max 2
         - PHONE_NUMBER max 1
         - COPY_CODE max 1
         - QUICK_REPLY max 10
         - agrupamento: quick replies devem estar juntos (quick replies e não-quick replies em blocos)

  3. Variáveis & Exemplos
     - lista detectada (header/body/url) com origem e índice
     - inputs para exemplos obrigatórios:
       - Header text: `example.header_text` (se houver variável)
       - Body: `example.body_text` (matriz; usar 1 linha no MVP)
       - URL: `example` (quando URL tem variável)

  4. Ações
     - Salvar rascunho
     - Submeter para Meta
     - “Testar payload” (mostra JSON final)

- **Coluna B (Preview)**
  - Preview do template no telefone
  - Toggle “substituir variáveis por exemplos”
  - Mostra botões e header conforme formato

### 3.3 Estados

- Draft (local): editável, ainda não enviado
- Submitted/Pending: enviado, aguardando review
- Approved: aprovado
- Rejected: rejeitado + motivo/recomendação (quando disponível)

---

## 4) Contrato de dados do Builder

### 4.1 Estrutura base (state do form)

O builder deve trabalhar com um JSON compatível com `CreateTemplateSchema` (já existe em `lib/whatsapp/validators/template.schema.ts`).

Proposta (MVP):

```ts
type TemplateBuilderDraft = {
  id: string
  workspaceId: string

  name: string
  language: 'pt_BR' | 'en_US' | 'es_ES'
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'

  // MVP: vamos usar positional por padrão
  parameter_format?: 'positional' | 'named'

  header?: {
    format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION'
    text?: string
    example?: {
      header_text?: string[]
      header_handle?: string[]
    } | null
  } | null

  body: {
    text: string
    example?: {
      body_text?: string[][]
    }
  }

  footer?: { text: string } | null

  buttons?: Array<
    | { type: 'URL'; text: string; url: string; example?: string[] }
    | { type: 'PHONE_NUMBER'; text: string; phone_number: string }
    | { type: 'QUICK_REPLY'; text: string }
    | { type: 'COPY_CODE'; example?: string }
  > | null

  // Meta tracking
  meta_id?: string | null
  meta_status?: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISABLED' | null
  meta_rejected_reason?: string | null
  meta_rejection_info?: {
    reason?: string
    recommendation?: string
  } | null

  created_at: string
  updated_at: string
}
```

Observações:

- O schema atual permite `content` ou `body`. Para builder, preferir `body.text`.
- Para header de mídia, a Meta exige `example.header_handle` com **handle** obtido pelo Resumable Upload API.

### 4.2 Normalização de variáveis

- MVP: padrão `positional`.
- Regra: quando usuário escreve `{{qualquer_coisa}}`, o service hoje renumera para `{{1}}...`.
- Para UX tipo Meta, preferimos:
  - inserir sempre `{{n}}` e bloquear padrões inválidos
  - (Opcional) permitir tokens “amigáveis” e renumerar, mas sempre mostrando ao usuário o resultado final.

---

## 5) APIs necessárias

### 5.1 APIs já existentes (reaproveitar)

- `GET /api/templates` (lista Meta + sync local)
- `GET /api/templates/[name]`
- `DELETE /api/templates/[name]`
- `POST /api/templates/create` (criação via `TemplateService`)

### 5.2 Novas APIs (MVP)

#### A) Drafts (Supabase)

> Precisamos persistir drafts para não depender apenas do estado do client.

- `GET /api/template-drafts` — lista drafts do workspace
- `POST /api/template-drafts` — cria draft
- `GET /api/template-drafts/[id]` — detalhe
- `PATCH /api/template-drafts/[id]` — atualiza
- `POST /api/template-drafts/[id]/submit` — valida + chama `/api/templates/create` + salva `meta_id`/`meta_status=PENDING`

#### B) Upload de mídia para header (Resumable Upload API)

A Meta recomenda Resumable Upload para obter `header_handle`.

APIs sugeridas (server-side, nunca expor token no browser):

- `POST /api/meta/uploads/resumable/start`
  - input: `{ fileName, mimeType, fileSize }`
  - output: `{ uploadSessionId, uploadUrl? }` (dependendo do protocolo do Graph)

- `POST /api/meta/uploads/resumable/transfer`
  - input: `{ uploadSessionId, chunkBase64, offset }` **ou** usar upload direto com streaming (preferível)

- `POST /api/meta/uploads/resumable/finish`
  - output: `{ handle: "4::..." }`

Obs.: o design exato depende do formato do endpoint de upload do Graph API.

#### C) Webhook de status (já existe infra de webhooks no projeto)

- Consumir `message_template_status_update` e atualizar:
  - `template_drafts.meta_status`
  - `meta_rejection_info` / `reason`

---

## 6) Ajustes necessários no backend existente

### 6.1 `TemplateService.buildMetaPayload()` precisa ficar 100% compatível

Arquivo: `lib/whatsapp/template.service.ts`

Itens:

1) Suportar `parameter_format`:
   - enviar `parameter_format: 'positional' | 'named'` quando selecionado

2) Corrigir `example` de URL variável:
   - Meta costuma esperar `example: ["valor_da_variavel"]` (não uma URL inteira)

3) Mapear campos de AUTHENTICATION (fase 1.5):
   - `message_send_ttl_seconds`
   - `code_expiration_minutes`
   - etc.

4) Botões: garantir regras de contagem/grupo (validar antes de enviar)

### 6.2 Validação compartilhada

- Backend: já valida com `CreateTemplateSchema`.
- Frontend: deve reutilizar o mesmo schema (ou gerar tipos) para mostrar erros iguais ao server.

---

## 7) Modelo de dados (Supabase)

### 7.1 Nova tabela sugerida: `template_drafts`

Campos mínimos:

- `id uuid pk`
- `workspace_id uuid`
- `name text`
- `language text`
- `category text`
- `parameter_format text null`
- `components jsonb` (ou colunas separadas + jsonb)
- `meta_id text null`
- `meta_status text null`
- `meta_rejected_reason text null`
- `meta_rejection_info jsonb null`
- `created_at timestamptz`
- `updated_at timestamptz`

Índices:
- `(workspace_id, updated_at desc)`
- unique opcional: `(workspace_id, name, language)` para evitar duplicatas internas

### 7.2 Sincronização

- `GET /api/templates` continua fazendo sync para `templates` (tabela já existente).
- Drafts são “do SmartZap”; quando submetidos, passam a apontar para `meta_id` e acompanham status.

---

## 8) Checklist de compatibilidade Meta (MVP)

### 8.1 Regras de nome e texto

- Nome: `^[a-z0-9_]+$`, até 512
- Header text: até 60
- Body: até 1024
- Footer: até 60

### 8.2 Variáveis e exemplos

- Se houver variáveis em qualquer componente que suporte, **exigir examples**.
- Posicional:
  - placeholders `{{1}}..{{n}}` em ordem
  - `body.example.body_text` deve ter valores na ordem
- URL com variável:
  - URL não pode ser só `{{1}}` (domínio obrigatório)
  - `example` obrigatório

### 8.3 Botões

- max 10
- quick replies devem vir juntos (bloco)
- se 4+ botões ou quick reply + outro tipo, desktop pode não renderizar (mostrar warning)

### 8.4 Mídia header

- header_handle deve vir do Resumable Upload API
- validar MIME/type e tamanho antes de enviar

### 8.5 Status/review

- Template só utilizável quando `APPROVED`.
- Capturar `REJECTED` com reason/recommendation quando disponível.

---

## 9) Observabilidade e DX

- Logar:
  - payload final enviado para Meta (redigindo tokens)
  - resposta da Meta (id/status)
  - erros tipados (`MetaAPIError`)

- UI:
  - tela “JSON do payload” para debug
  - histórico de tentativas de submissão por draft

---

## 10) Plano de implementação (sprints)

### Sprint 1 (MVP básico)

- Tabela `template_drafts` + CRUD API
- Página `templates/builder` com header/body/footer/buttons + preview
- Submit usando `/api/templates/create`

### Sprint 2 (mídia header)

- Resumable Upload API endpoints
- UI upload + preencher `header_handle`

### Sprint 3 (status e qualidade)

- consumir `message_template_status_update`
- atualizar drafts + UI “linha do tempo”

---

## 11) Referências (Meta)

- Templates (criação/variáveis/status):
  - https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
- Componentes:
  - https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components
- Gestão (listar/editar/deletar):
  - https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/template-management
- Webhook status:
  - https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/message_template_status_update
- Tokens e permissões:
  - https://developers.facebook.com/docs/whatsapp/access-tokens

