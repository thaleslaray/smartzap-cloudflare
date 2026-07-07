# SmartZap - Visão Geral do Projeto

## Descrição

SmartZap é uma plataforma SaaS single-tenant de automação de marketing via WhatsApp. O sistema permite o envio massivo de mensagens com templates, gestão de campanhas, workflows automatizados, atendimento via inbox com agentes de IA, e criação de flows interativos.

## Stack Tecnológica

### Frontend
- **Next.js 16** - App Router, Turbopack, standalone output
- **React 19** - Com React Compiler (memoização automática)
- **TypeScript 5.7** - Modo strict
- **Tailwind CSS v4** - Com shadcn/ui (tema new-york, dark)
- **React Query** - Gerenciamento de estado assíncrono (staleTime: 30s, gcTime: 5min)
- **React Flow** - Editor visual de workflows
- **Jotai** - Estado global do workflow builder
- **@xyflow/react** - Renderização de nodes e edges

### Backend
- **Next.js API Routes** - 200+ endpoints REST
- **Supabase** - PostgreSQL + Realtime + Storage
- **Upstash QStash** - Queue e Workflow SDK para execução durável
- **Redis** - Cache de credenciais e rate limiting
- **Meta WhatsApp Cloud API v24.0** - Envio de mensagens
- **Vercel AI SDK v6** - Integração multi-provider (Google, OpenAI, Anthropic, Cohere, TogetherAI)

### Banco de Dados
- **PostgreSQL (via Supabase)**
  - 38 tabelas
  - 16 SECURITY DEFINER functions
  - RLS habilitado em todas as tabelas
  - 11 tabelas com Supabase Realtime
  - pgvector para RAG/embeddings

### Deployment
- **Vercel** - Deploy automático via push na branch main
- **Standalone output** - Docker-ready

## Arquitetura

### Padrão Frontend: Page → Hook → Service → API

```
app/(dashboard)/campaigns/page.tsx    # Página fina: conecta hook à view
    ↓
hooks/useCampaigns.ts                 # Controller hook: React Query + estado UI
    ↓
services/campaignService.ts           # Chamadas API (fetch wrapper)
    ↓
app/api/campaigns/route.ts            # API Route → Supabase DB
```

**Princípios:**
- **Pages**: componentes thin que apenas conectam hooks às views
- **Hooks**: padrão controller com React Query + estado local + estado derivado
- **Services**: wrappers tipados para API routes
- **API Routes**: validação (Zod) + lógica de negócio + operações DB

### Padrão Backend: Serverless + Queues

```
API Routes (Next.js)  →  QStash Workflow  →  Meta WhatsApp API
        ↓                     ↓
  Supabase DB           (queue/durable steps)
```

### Estrutura de Diretórios

```
app/                    # Next.js App Router
  (auth)/               # Páginas de auth (login, wizard de instalação)
  (dashboard)/          # Páginas do dashboard
  api/                  # API routes (28+ sub-diretórios)
components/
  features/             # Componentes de view específicos de features
  ui/                   # shadcn/ui (new-york style, RSC-enabled)
  builder/              # Componentes do workflow builder
hooks/                  # Controller hooks (padrão React Query)
services/               # Camada cliente de API
lib/                    # Lógica de negócio e utilitários
  ai/                   # Providers e prompts de IA
  builder/              # Executor de workflows
  whatsapp/             # Integração WhatsApp API
types.ts                # Todas interfaces e enums TypeScript
supabase/migrations/    # Migrações SQL (31+ arquivos)
```

### Stack de Providers (app/providers.tsx)

```
ThemeProvider (next-themes, dark default)
  → QueryClientProvider (staleTime: 30s, gcTime: 5min, retry: 1)
    → DevModeProvider
      → CentralizedRealtimeProvider (Supabase Realtime)
        → PWAProvider
```

## Funcionalidades Principais

### 1. Gestão de Campanhas

Envio massivo de mensagens via templates do WhatsApp com:
- Agendamento de envios
- Segmentação de audiência (tags, custom fields, filtros avançados)
- Organização em pastas e tags
- Tracking em tempo real (enviado, entregue, lido, falha)
- Trace events detalhados
- Métricas por lote
- Preview de templates com substituição de variáveis
- Rate limiting automático (1 msg/6s por destinatário)
- Retry com backoff exponencial

**Fluxo:**
1. Criar campanha → selecionar template → configurar variáveis
2. Selecionar contatos/segmentos
3. Agendar ou enviar imediatamente
4. QStash processa envios em batches
5. Webhook recebe status de entrega da Meta
6. Dashboard atualiza em tempo real via Supabase Realtime

### 2. Inbox

Atendimento em tempo real com:
- Conversas em tempo real (Supabase Realtime)
- Agentes de IA com RAG (pgvector + embeddings)
- Handoff para humano
- Quick replies
- Labels e tags
- Mem0 para memória conversacional
- Histórico completo de mensagens
- Suporte a mídia (imagens, documentos, áudio, vídeo)

**Agentes de IA:**
- Resposta automática baseada em base de conhecimento
- Contexto de conversas anteriores via Mem0
- Fallback para atendimento humano quando necessário
- Múltiplos providers de IA (Google, OpenAI, Anthropic)

### 3. Template Factory

Criação e gestão de templates com IA:
- **3 estratégias de geração:**
  - Marketing: persuasão, CTAs, urgência
  - Utilidade: informativo, transacional
  - Bypass: evita rejeição da Meta
- Builder visual com preview em tempo real
- Submissão direta para Meta API
- Sincronização bidirecional (Meta ↔ DB local)
- Cache de templates com TTL
- Validação de componentes (header, body, footer, buttons)
- Suporte a variáveis dinâmicas

### 4. Workflow Builder

Editor visual de automações com:
- **10+ tipos de nodes:**
  - `start`: ponto de entrada
  - `message`: texto simples
  - `template`: template do WhatsApp
  - `menu`: lista de opções
  - `input`: captura de dados
  - `condition`: lógica condicional
  - `delay`: espera programada
  - `ai_agent`: agente de IA
  - `handoff`: transfere para humano
  - `end`: finalização
- Execução durável via Upstash Workflow SDK
- Triggers: webhook, agendamento, manual
- Variáveis de contexto entre nodes
- Retry automático em falhas
- Logs de execução por workflow run

**Arquitetura:**
```
lib/builder/workflow-executor.workflow.ts  # Executor principal
lib/builder/nodes/                         # Handlers específicos por node
```

### 5. Gestão de Contatos

- Importação via CSV/Excel
- Exportação de listas
- Custom fields personalizáveis
- Segmentação avançada
- Tags e categorias
- Validação de telefone (E.164 via libphonenumber-js)
- Histórico de interações
- Status de opt-in/opt-out

### 6. Flows/MiniApps

Criação de flows interativos do WhatsApp:
- Editor de Flow JSON (Meta spec)
- Validação de schema
- Preview em dispositivo
- Publicação direta via Meta API
- Coleta de dados estruturados
- Integração com workflows

### 7. Lead Forms

Formulários públicos para captação:
- URLs baseadas em slug (`/forms/{slug}`)
- Campos customizáveis
- Validação client-side e server-side
- Integração automática com contatos
- Tracking de conversões
- Webhook de notificação

### 8. Install Wizard

Provisionamento self-service:
- Configuração Supabase (URL, keys)
- Setup Redis (Upstash)
- Configuração QStash
- Integração Vercel
- Validação de credenciais WhatsApp
- Execução de migrações SQL
- Health checks automatizados

### 9. Settings

Configuração centralizada:
- Credenciais WhatsApp (token, phone ID, business account ID)
- Configuração de IA (provider, modelos, temperatura)
- Performance tuning (batch size, delays)
- Webhook management
- Integração Google Calendar
- Testes de conectividade

### 10. PWA

Progressive Web App:
- Service worker
- Push notifications (via Supabase Realtime)
- Install prompts
- Offline fallback
- App manifest

## Autenticação e Autorização

### Single-Tenant

**Sem contas de usuário.** Dois mecanismos de auth:

1. **Dashboard Login:**
   - Variável `MASTER_PASSWORD` (hash bcrypt)
   - Session cookie via middleware
   - Redirect automático se não autenticado

2. **API Routes:**
   - Header `Authorization: Bearer <key>` ou `X-API-Key: <key>`
   - **Chaves:**
     - `SMARTZAP_API_KEY` - acesso geral à API
     - `SMARTZAP_ADMIN_KEY` - endpoints admin (`/api/database/*`, `/api/vercel/*`)
   - **Rotas públicas (sem auth):**
     - `/api/webhook` (Meta webhooks)
     - `/api/health` (health checks)
     - `/api/flows` (flows públicos)

**Implementação:**
- Sem `middleware.ts` global
- Auth por rota via `verifyApiKey()` de `lib/auth.ts`

## Integração Meta WhatsApp API

### Versão: v24.0

### Estrutura de Template Payload

```json
{
  "messaging_product": "whatsapp",
  "to": "+5511999999999",
  "type": "template",
  "template": {
    "name": "nome_do_template",
    "language": { "code": "pt_BR" },
    "components": [
      {
        "type": "header",
        "parameters": [{ "type": "image", "image": { "id": "..." } }]
      },
      {
        "type": "body",
        "parameters": [{ "type": "text", "text": "valor {{1}}" }]
      }
    ]
  }
}
```

### Rate Limits

- **Cloud API**: até 1000 msgs/seg
- **Limite de par**: 1 msg/6 seg para mesmo destinatário (erro 131056)
- **Retry**: backoff exponencial conforme recomendação Meta

### Tratamento de Erros

```typescript
// lib/whatsapp-errors.ts - 44+ códigos mapeados
mapWhatsAppError(131042)  // → { type: 'payment', message: '...', action: '...' }
isCriticalError(code)     // Erros de pagamento, auth
isOptOutError(code)       // Usuário bloqueou empresa
```

### Webhooks

- **Endpoint**: `/api/webhook`
- **Validação**: signature verification via app secret
- **Eventos processados:**
  - `messages` - mensagens recebidas
  - `message_status` - status de entrega (sent, delivered, read, failed)
  - `message_template_status_update` - aprovação/rejeição de templates

## Clientes Supabase

Três padrões de cliente - use o correto para o contexto:

```typescript
// API Routes (server-side, bypassa RLS)
import { getSupabaseAdmin } from '@/lib/supabase'
const supabase = getSupabaseAdmin()

// Client components (browser, respeita RLS)
import { getSupabaseBrowser } from '@/lib/supabase'
const supabase = getSupabaseBrowser()

// Server Components (cookie-aware, @supabase/ssr)
import { createClient } from '@/lib/supabase-server'
const supabase = await createClient()
```

**Nota:** Ambos retornam `null` quando env vars ausentes (permite wizard rodar sem config).

## Camada de Banco de Dados

### Sem ORM - Queries diretas via Supabase

```typescript
// lib/supabase-db.ts - Queries diretas com CRUD abstraído
campaignDb.getAll()
campaignDb.create({ name, templateName })
campaignDb.update(id, { status: 'COMPLETED' })
```

### Tabelas Principais

- `settings` - Configurações (credenciais, tokens), cache Redis
- `campaigns` - Metadata de campanhas + contadores (sent/delivered/read/failed)
- `campaign_contacts` - Status por contato + message_id
- `contacts` - Informações de contato + custom fields
- `templates` - Cache de templates (sincronizado com Meta)
- `flows` - Definições de workflows
- `account_alerts` - Alertas de saúde da conta
- `conversations` - Conversas do inbox
- `messages` - Mensagens individuais
- `knowledge_base` - Base de conhecimento para RAG
- `ai_agents` - Configuração de agentes de IA

### Migrações

31+ arquivos SQL em `supabase/migrations/`:
- Schema inicial
- RLS policies
- SECURITY DEFINER functions
- Índices de performance
- pgvector setup
- Realtime triggers

## Workflow Engine

### Upstash Workflow SDK

Execução durável com steps:

```typescript
// lib/builder/workflow-executor.workflow.ts
export const workflowExecutor = serve(async (context) => {
  const result = await context.run('start-node', async () => {
    return executeStartNode(...)
  })

  await context.run('send-message', async () => {
    return sendWhatsAppMessage(...)
  })
})
```

**Características:**
- Durabilidade: retries automáticos
- State persistente entre steps
- Timeouts configuráveis
- Logs de execução
- Cancelamento manual

## Gestão de Credenciais WhatsApp

Hierarquia de busca:
1. Supabase `settings` table (prioridade)
2. Environment variables (fallback)
3. Cache Redis (TTL: 60s)

```typescript
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
const credentials = await getWhatsAppCredentials()
// { token, phoneId, businessAccountId }
```

## Formatação de Números de Telefone

Formato E.164 obrigatório:

```typescript
// lib/phone-formatter.ts
normalizePhoneNumber('+5511999999999')  // → '+5511999999999'
validatePhoneNumber(phone)              // Usa libphonenumber-js
```

## Variáveis de Ambiente

### Obrigatórias

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
QSTASH_TOKEN=
MASTER_PASSWORD=           # Senha de login do dashboard
SMARTZAP_API_KEY=          # Chave API geral
SMARTZAP_ADMIN_KEY=        # Chave API admin
```

### Opcionais

```bash
WHATSAPP_TOKEN=            # Fallback se não estiver no DB
WHATSAPP_PHONE_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
GEMINI_API_KEY=            # Features de IA
MEM0_API_KEY=              # Memória conversacional
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
COHERE_API_KEY=
TOGETHER_API_KEY=
```

**Aliases aceitos:**
- `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

## Testes

### Unit Tests (Vitest + jsdom)

```bash
npm run test              # Executar todos
npm run test:watch        # Watch mode
npm run test:ui           # Vitest UI dashboard
npm run test:coverage     # Relatório de cobertura
vitest run path/to/file.test.ts          # Arquivo único
vitest run -t "nome do teste"            # Teste único por nome
```

### E2E Tests (Playwright)

```bash
npm run test:e2e          # Headless (chromium + mobile)
npm run test:e2e:ui       # UI interativa
npm run test:e2e:headed   # Browser visível
npx playwright test path/to/file.spec.ts # Arquivo E2E único
```

### Testes Especializados

```bash
npm run test:e2e:whatsapp  # Cenários E2E WhatsApp (Vitest)
npm run test:ai:api        # Testes de API de IA (Vitest)
npm run test:all           # Unit + E2E combinados
```

**Convenções:**
- `*.test.ts` - Vitest
- `*.spec.ts` - Playwright (em `tests/e2e/`)

## Convenções de Código

### Linguagem

- **Código**: Inglês (variáveis, funções, classes)
- **Comentários/Documentação**: Português (pt-BR)
- **UI/Texto de interface**: Português (pt-BR)

### TypeScript

```typescript
// types.ts - Todas interfaces e enums centralizados
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'COMPLETED' | 'PAUSED' | 'FAILED'
export type TemplateCategory = 'MARKETING' | 'UTILIDADE' | 'AUTENTICACAO'
export type ContactStatus = 'OPT_IN' | 'OPT_OUT' | 'UNKNOWN'
```

### Styling

- Tailwind CSS v4 com shadcn/ui (new-york style)
- Cores primárias: `primary-400/500/600` (emerald/green)
- Backgrounds: `zinc-800/900/950`
- Ícones: lucide-react exclusivamente

## Configuração Next.js

```javascript
// next.config.ts
{
  reactCompiler: true,              // Memoização automática
  output: 'standalone',             // Docker-ready
  serverActions: {
    bodySizeLimit: '20mb'           // Upload de arquivos
  },
  optimizePackageImports: [
    'lucide-react',
    '@radix-ui/react-icons'
  ],
  outputFileTracingIncludes: {
    '/api/**/*': ['./supabase/migrations/**/*']  // Bundling de migrações SQL
  }
}
```

## Comportamentos Conhecidos

### Edge Cache Flash-back

Itens deletados podem reaparecer momentaneamente devido ao cache TTL de 10s da Vercel. Comportamento esperado, resolve após expiração do cache.

### Alertas de Pagamento

- **Auto-exibição**: erro 131042 (insufficient balance)
- **Auto-dismiss**: quando delivery bem-sucedido após correção
- Armazenado em `account_alerts` table

### Clientes Supabase Null

`getSupabaseAdmin()` e `getSupabaseBrowser()` retornam `null` quando env vars ausentes. Callers devem tratar isso para permitir fluxo do install wizard.

## Estatísticas do Projeto

- **870 arquivos fonte**
- **200+ API routes**
- **460+ componentes**
- **57 hooks**
- **19 services**
- **38 tabelas de banco**
- **31+ migrações SQL**
- **10+ tipos de workflow nodes**
- **44+ códigos de erro WhatsApp mapeados**

## Recursos Adicionais

### Documentação Relacionada

- [CLAUDE.md](../CLAUDE.md) - Instruções específicas para Claude Code
- [README.md](../README.md) - Setup e quickstart
- Migrações SQL em `supabase/migrations/`
- Tipos centralizados em `types.ts`

### Links Externos

- [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Supabase Docs](https://supabase.com/docs)
- [Upstash QStash](https://upstash.com/docs/qstash)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [shadcn/ui](https://ui.shadcn.com)
