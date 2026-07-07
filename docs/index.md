# SmartZap - Documentação do Projeto

Documentação gerada automaticamente para facilitar navegação e compreensão do projeto.

Data de geração: 2026-02-08

## Visão Geral do Projeto

SmartZap é um SaaS single-tenant de automação de marketing via WhatsApp, construído com Next.js 16 (App Router), React 19, Supabase (PostgreSQL) e Upstash QStash. Integra Meta WhatsApp Cloud API (v24.0) para mensagens com template e Vercel AI SDK v6 para geração de conteúdo.

### Stack Tecnológico Principal

- **Frontend**: Next.js 16, React 19, TypeScript 5.7, Tailwind CSS v4
- **Backend**: Next.js API Routes, Upstash Workflow, QStash
- **Database**: Supabase PostgreSQL (38 tabelas, 16 funções)
- **UI**: shadcn/ui (new-york style), Radix UI, lucide-react
- **State**: React Query v5, Zustand (builder only)
- **AI**: Vercel AI SDK v6, Google Gemini, Mem0
- **WhatsApp**: Meta WhatsApp Cloud API v24.0
- **Tests**: Vitest, Playwright, jsdom
- **Deploy**: Vercel (standalone output)

## Documentos Gerados

### 1. Visão Geral e Arquitetura

- **[Source Tree](./source-tree.md)** - Estrutura completa de arquivos anotada (870 arquivos)
  - Mapeamento de todos os diretórios e arquivos principais
  - Descrições de cada componente do sistema
  - Convenções de nomenclatura e padrões de organização

### 2. Documentação de Referência Existente

#### Arquitetura e Design
- **[Architecture Guide](./ARCHITECTURE-GUIDE.md)** - Guia completo de arquitetura do sistema
  - Padrões de design (Page → Hook → Service → API)
  - Separação de concerns (controller/view)
  - State management e data flow

- **[Database Schema Management](./DATABASE_SCHEMA_MANAGEMENT.md)** - Gestão de schema do banco
  - 38 tabelas principais
  - 16 funções SQL
  - Políticas RLS (Row Level Security)
  - Processo de migrations

#### WhatsApp Integration
- **[WhatsApp Contract](./whatsapp-contract.md)** - Contrato da WhatsApp API
  - Endpoints disponíveis
  - Payloads de template
  - Rate limits e retry policies
  - Error codes (44+ mapeados)

- **[WhatsApp Flows Reference](./whatsapp-flows-complete-reference.md)** - Referência completa de WhatsApp Flows
  - Estrutura de flows (JSON schema)
  - Componentes disponíveis
  - Validação e endpoints

#### Instalação e Setup
- **[Installation Wizard](./INSTALLATION_WIZARD.md)** - Documentação do wizard de instalação
  - Fluxo de provisionamento
  - Validação de credenciais
  - Bootstrap inicial do sistema

#### AI e Automação
- **[Inbox AI Agents](./inbox-ai-agents.md)** - Agentes AI do inbox
  - Configuração de agents
  - Conhecimento (knowledge base)
  - Integração com Mem0

- **[MEM0 Integration](./MEM0_INTEGRATION.md)** - Integração com Mem0 para memória de conversas
  - Armazenamento de contexto
  - Busca semântica
  - RAG (Retrieval-Augmented Generation)

- **[RAG PGVector Plan](./rag-pgvector-plan.md)** - Plano de implementação de RAG com pgvector
  - Embeddings no PostgreSQL
  - Busca por similaridade vetorial
  - Otimizações de performance

#### Changelog
- **[Changelog](./changelog.md)** - Histórico de mudanças do projeto
  - Features implementadas
  - Bug fixes
  - Breaking changes

### 3. Regras para AI Agents

- **[Project Context](./../_bmad-output/project-context.md)** - 68 regras críticas para agentes AI
  - Convenções de código
  - Padrões de arquitetura obrigatórios
  - Validações e segurança
  - Testing requirements

## Estrutura do Projeto

### Diretórios Principais

```
smartzap/
├── app/                    # Next.js App Router (27 páginas + 200+ API routes)
├── components/             # Componentes React (460+ arquivos)
├── hooks/                  # Controller hooks (57 arquivos)
├── services/               # API client layer (19 serviços)
├── lib/                    # Business logic & utilities
├── types.ts                # TypeScript interfaces centralizadas
├── supabase/migrations/    # SQL migrations (31+ arquivos)
├── tests/                  # Suites de testes (E2E, unit, stress)
├── scripts/                # Utility scripts (50+ arquivos)
├── docs/                   # Documentação (36+ arquivos)
└── public/                 # Static assets (manifest, service worker, OpenAPI)
```

### Principais Features

#### 1. Campanhas de Marketing
- Criação e gestão de campanhas WhatsApp
- Templates com variáveis dinâmicas
- Agendamento e envio em lote
- Métricas (enviados, entregues, lidos, falhados)
- Rate limiting e retry automático

#### 2. Gestão de Contatos
- Importação CSV
- Campos customizados
- Segmentação dinâmica
- Tags e filtros
- Status de opt-in/opt-out

#### 3. Templates WhatsApp
- Sincronização com Meta API
- Builder visual
- Preview em tempo real
- Categorias (marketing, utilidade, autenticação)
- Versionamento e drafts

#### 4. Inbox de Conversas
- Interface de chat em tempo real (Supabase Realtime)
- Labels e organização
- Respostas rápidas (quick replies)
- Handoff para atendentes humanos
- AI Agents com conhecimento personalizado

#### 5. Workflow Builder
- Editor visual com React Flow
- 10 tipos de nodes (message, template, menu, input, condition, delay, AI agent, handoff, start, end)
- Execução durável com Upstash Workflow
- Histórico de execuções
- Code generation

#### 6. WhatsApp Flows (MiniApps)
- Builder de flows interativos
- JSON schema validation
- Endpoint público para submissões
- Preview mobile

#### 7. Formulários de Captação
- Lead forms customizados
- Integração com WhatsApp
- Submissões rastreadas
- Analytics

#### 8. AI Features
- Geração de templates via Gemini
- Geração de flows via AI
- Respostas automáticas no inbox
- Embeddings e RAG (pgvector)
- Memória de conversas (Mem0)

## Estatísticas do Projeto

| Métrica | Valor |
|---------|-------|
| Arquivos fonte totais | 870 |
| Linhas de código | 150.000+ |
| Páginas (dashboard) | 27 |
| API Routes | 200+ |
| Componentes React | 460+ |
| Hooks customizados | 57 |
| Services (API clients) | 19 |
| Tabelas do banco | 38 |
| Funções SQL | 16 |
| Migrations | 31+ |
| Testes E2E (Playwright) | 4 specs |
| Testes Unit (Vitest) | 20+ arquivos |
| Testes WhatsApp E2E | 5+ cenários |
| Testes AI API | 3+ suites |
| Scripts utilitários | 50+ |
| Dependências npm | 100+ |

## Padrões de Arquitetura

### Frontend Pattern

```
Page (thin)
  ↓
Hook (controller) → React Query + local state
  ↓
Service (API client) → fetch wrapper
  ↓
API Route → Validation + Business Logic + DB
```

### Backend Pattern

```
API Routes (Next.js)
  ↓
Validation (Zod v4)
  ↓
Business Logic (lib/business/)
  ↓
Database (Supabase, direct queries)
  ↓
Queue (QStash Workflow) → WhatsApp API
```

### Component Pattern

```
// Controller hook
useCampaignsController() {
  data, loading, mutations
  derived state, filters
  event handlers
}

// Presentational view
<CampaignListView
  campaigns={data}
  onDelete={handleDelete}
  onRowClick={handleRowClick}
/>
```

## Autenticação e Segurança

### Dashboard Login
- Senha única via `MASTER_PASSWORD` (bcrypt)
- Sem contas de usuário (single-tenant)
- Session cookie

### API Authentication
Três níveis de acesso:

1. **Público** (sem auth)
   - `/api/webhook` - Meta webhook
   - `/api/health` - Health check
   - `/api/flows` - Endpoint de flows públicos

2. **API Key** (`SMARTZAP_API_KEY`)
   - Maioria dos endpoints
   - Header: `Authorization: Bearer <key>` ou `X-API-Key: <key>`

3. **Admin Key** (`SMARTZAP_ADMIN_KEY`)
   - `/api/database/*` - Operações de DB
   - `/api/vercel/*` - Vercel API

## Database Schema

### Tabelas Principais (38 total)

- `settings` - Configurações globais (credentials, tokens)
- `campaigns` - Campanhas de marketing
- `campaign_contacts` - Relação campanha-contato com status
- `contacts` - Base de contatos
- `templates` - Cache de templates WhatsApp
- `flows` - WhatsApp Flows (MiniApps)
- `workflows` - Definições de workflows
- `conversations` - Conversas do inbox
- `messages` - Mensagens do inbox
- `ai_agents` - Configuração de AI agents
- `agent_knowledge` - Base de conhecimento dos agents
- `lead_forms` - Formulários de captação
- `form_submissions` - Submissões de formulários
- `account_alerts` - Alertas do sistema
- `custom_fields` - Definições de campos customizados
- ... (23 outras tabelas)

### Funções SQL (16 total)

- `get_campaign_stats()` - Estatísticas de campanhas
- `get_contact_segments()` - Segmentação de contatos
- `update_campaign_counters()` - Atualização de contadores
- ... (13 outras funções)

## Environment Variables

### Required

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

# Upstash
QSTASH_TOKEN=

# Auth
MASTER_PASSWORD=          # Dashboard login
SMARTZAP_API_KEY=         # API access
SMARTZAP_ADMIN_KEY=       # Admin endpoints
```

### Optional

```bash
# WhatsApp (fallback, DB tem prioridade)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=

# AI
GEMINI_API_KEY=           # AI features
MEM0_API_KEY=             # Conversation memory
```

## Comandos de Desenvolvimento

### Dev Server

```bash
npm run dev              # Dev server com Turbopack
npm run build            # Production build
npm run start            # Production server
npm run lint             # ESLint
```

### Testes

```bash
# Unit tests (Vitest)
npm run test             # Run all
npm run test:watch       # Watch mode
npm run test:ui          # Vitest UI dashboard
npm run test:coverage    # Coverage report

# E2E tests (Playwright)
npm run test:e2e         # Headless (chromium + mobile)
npm run test:e2e:ui      # Interactive UI
npm run test:e2e:headed  # Browser visible

# Specialized
npm run test:e2e:whatsapp  # WhatsApp E2E scenarios
npm run test:ai:api        # AI API tests
npm run test:all           # Unit + E2E combined
```

### Single Test Execution

```bash
# Single Vitest file
vitest run path/to/file.test.ts

# Single test by name
vitest run -t "test name"

# Single Playwright file
npx playwright test path/to/file.spec.ts
```

## Convenções de Código

### Linguagem

- **Código**: Inglês (variáveis, funções, classes)
- **Comentários**: Português (pt-BR)
- **UI/UX**: Português (pt-BR)
- **Documentação**: Português (pt-BR)

### TypeScript

- **Strict mode** habilitado
- **Interfaces centralizadas** em `types.ts`
- **Zod v4** para validação runtime
- **No `any`** (usar `unknown` quando necessário)

### Styling

- **Tailwind CSS v4** (sem `@apply`)
- **shadcn/ui** (new-york style, RSC-enabled)
- **Colors**: `primary-400/500/600` (emerald/green)
- **Backgrounds**: `zinc-800/900/950`
- **Icons**: lucide-react exclusivamente

### Testing

- **Unit**: `*.test.ts` (Vitest, jsdom)
- **E2E**: `*.spec.ts` (Playwright, headless)
- **Coverage mínimo**: 70% (não enforced)
- **Test IDs**: `data-testid` para E2E

## Provider Stack

```tsx
// app/providers.tsx
ThemeProvider (next-themes, dark default)
  → QueryClientProvider (staleTime: 30s, gcTime: 5min, retry: 1)
    → DevModeProvider (dev features toggle)
      → CentralizedRealtimeProvider (Supabase Realtime)
        → PWAProvider (service worker, install prompt)
```

## Known Issues e Comportamentos

### Edge Cache Flash-back
Itens deletados podem reaparecer momentaneamente devido ao cache de 10s do Vercel Edge Network. Solução: invalidação manual ou aguardar TTL.

### Payment Alerts
Alertas de pagamento (error 131042) são auto-exibidos e auto-removidos quando entrega subsequente sucede após correção.

### Null Supabase Clients
`getSupabaseAdmin()` e `getSupabaseBrowser()` retornam `null` quando env vars ausentes. Permite execução do install wizard em ambiente não configurado.

### WhatsApp Rate Limits
- **Cloud API**: Até 1000 msgs/sec
- **Pair limit**: 1 msg/6 sec para mesmo usuário (error 131056)
- **Retry**: Exponential backoff conforme recomendação Meta

## Roadmap e Melhorias Futuras

Consulte os seguintes documentos para planos futuros:

- [RAG PGVector Plan](./rag-pgvector-plan.md) - Implementação de RAG com pgvector
- [Changelog](./changelog.md) - Features planejadas vs implementadas
- Issues no repositório Git (se aplicável)

## Contribuindo

### Workflow de Desenvolvimento

1. Ler `CLAUDE.md` e `ARCHITECTURE-GUIDE.md`
2. Verificar `_bmad-output/project-context.md` para regras obrigatórias
3. Seguir padrões Page → Hook → Service → API
4. Escrever testes (unit + E2E quando aplicável)
5. Validar com `npm run lint` e `npm run test`
6. Criar migration SQL se schema mudar

### Code Review Checklist

- [ ] Código em inglês, comentários em português
- [ ] Componente separado de controller (hook)
- [ ] Validação com Zod nos API routes
- [ ] Error handling adequado (try/catch, mapWhatsAppError)
- [ ] Tipos TypeScript sem `any`
- [ ] Testes escritos (se feature crítica)
- [ ] Migration SQL criada (se schema mudou)
- [ ] Documentação atualizada (se API pública mudou)

## Contato e Suporte

Para questões sobre arquitetura ou decisões técnicas, consulte:

1. **[ARCHITECTURE-GUIDE.md](./ARCHITECTURE-GUIDE.md)** - Decisões arquiteturais
2. **[Project Context](./../_bmad-output/project-context.md)** - Regras críticas
3. **[Source Tree](./source-tree.md)** - Navegação por arquivo

---

**Última atualização**: 2026-02-08
**Versão do Next.js**: 16.0.0
**Versão do React**: 19.0.0
**Versão do TypeScript**: 5.7.3
