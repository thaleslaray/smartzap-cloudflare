# Arquitetura SmartZap

Documentação técnica da arquitetura do SmartZap - SaaS single-tenant de automação de marketing via WhatsApp.

## 1. Visão Geral da Arquitetura

### Stack Principal

SmartZap é construído como um monolito Next.js 16 serverless deployado na Vercel, consolidando frontend e backend no mesmo repositório.

**Componentes principais:**

- **Runtime**: Next.js 16 (App Router) + React 19 com React Compiler
- **Frontend**: React Server Components + Client Components
- **Backend**: Next.js API Routes (serverless functions)
- **Banco de Dados**: PostgreSQL via Supabase (38 tabelas)
- **Filas**: Upstash QStash (durable workflows)
- **Cache**: Upstash Redis (TTL 60s para credentials)
- **Storage**: Supabase Storage (media uploads)
- **Realtime**: Supabase Realtime (WebSocket subscriptions)

### Deployment

- **Plataforma**: Vercel (Edge Network global)
- **Modo**: Standalone output (Docker-ready)
- **Regiões**: Edge cache distribuído (TTL 10s)
- **Escalabilidade**: Auto-scaling serverless functions

### Fluxo de Dados Principal

```
Browser → Next.js (SSR/RSC) → API Routes → Supabase PostgreSQL
                              ↓
                         QStash Workflow → Meta WhatsApp API
                              ↓
                         Redis Cache
```

## 2. Padrão Frontend: Page → Hook → Service → API

Arquitetura em camadas com responsabilidades bem definidas.

### Camada 1: Pages (Thin Components)

**Localização**: `app/(dashboard)/`

Server Components que fazem fetch inicial e conectam hooks a views:

```typescript
// app/(dashboard)/campaigns/page.tsx
export default async function CampaignsPage() {
  const supabase = await createClient();
  const initialCampaigns = await campaignDb.getAll(supabase);

  return <CampaignList initialData={initialCampaigns} />;
}
```

**Responsabilidades:**
- Fetch inicial de dados (Server Component)
- Wiring de hooks com componentes de view
- Layout e estrutura da página
- NUNCA contém lógica de negócio

### Camada 2: Hooks (Controller Pattern)

**Localização**: `hooks/`

Três subcamadas no controller pattern:

#### 2.1 Query Hooks (React Query)

```typescript
// hooks/useCampaigns.ts
export const useCampaignsQuery = () => {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => campaignService.getAll(),
    staleTime: 15_000,
    gcTime: 300_000
  });
};
```

#### 2.2 Mutation Hooks

```typescript
export const useDeleteCampaign = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => campaignService.delete(id),
    onSuccess: () => {
      invalidateCampaigns(queryClient);
    }
  });
};
```

#### 2.3 Controller Hook (Orquestração)

```typescript
export const useCampaignsController = () => {
  const { data: campaigns = [] } = useCampaignsQuery();
  const deleteMutation = useDeleteCampaign();
  const [filter, setFilter] = useState<CampaignStatus>('All');

  // Derived state
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(c => filter === 'All' || c.status === filter);
  }, [campaigns, filter]);

  return {
    campaigns: filteredCampaigns,
    filter,
    setFilter,
    onDelete: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending
  };
};
```

**Responsabilidades:**
- React Query para server state
- useState para UI state local
- useMemo para derived state
- Callback handlers
- Loading/error states

### Camada 3: Services (API Client)

**Localização**: `services/`

Fetch wrappers tipados, sem axios:

```typescript
// services/campaignService.ts
export const campaignService = {
  async getAll(): Promise<Campaign[]> {
    const res = await fetch('/api/campaigns');
    if (!res.ok) throw new Error('Failed to fetch campaigns');
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete campaign');
  }
};
```

**Responsabilidades:**
- HTTP calls para API routes
- Type safety (TypeScript)
- Error throwing (catch em hooks)
- NUNCA contém lógica de negócio

### Camada 4: API Routes

**Localização**: `app/api/`

28+ diretórios de routes com validação Zod + business logic + DB:

```typescript
// app/api/campaigns/route.ts
export async function GET() {
  const supabase = getSupabaseAdmin();
  const campaigns = await campaignDb.getAll(supabase);

  return NextResponse.json(campaigns, {
    headers: { 'Cache-Control': 'no-store' }
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const validated = createCampaignSchema.parse(body);

  const supabase = getSupabaseAdmin();
  const campaign = await campaignDb.create(supabase, validated);

  return NextResponse.json(campaign);
}
```

**Responsabilidades:**
- Autenticação via `verifyApiKey()`
- Validação de input (Zod schemas)
- Business logic
- Database operations
- Error handling
- Response formatting

## 3. Provider Stack

Hierarquia de providers configurada em `app/providers.tsx`:

```
ThemeProvider (next-themes, dark default)
  └─ QueryClientProvider (React Query global config)
      └─ DevModeProvider (feature flags)
          └─ CentralizedRealtimeProvider (Supabase Realtime)
              └─ PWAProvider (service worker)
```

### Configuração React Query

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,      // 30s antes de refetch
      gcTime: 300_000,        // 5min antes de garbage collect
      retry: 1,               // 1 retry em caso de falha
      refetchOnWindowFocus: false
    }
  }
});
```

### CentralizedRealtimeProvider

Gerencia single Supabase Realtime channel para toda aplicação:

- Debounced invalidations (200ms default, adaptativo)
- Fallback polling quando desconectado (10s)
- Auto-reconnect em caso de falha

## 4. Supabase Clients (3 Tipos)

### 4.1 Admin Client (API Routes)

**Arquivo**: `lib/supabase.ts`

```typescript
import { getSupabaseAdmin } from '@/lib/supabase';

// API Routes (server-side, bypassa RLS)
const supabase = getSupabaseAdmin();
```

**Características:**
- Usa `SUPABASE_SECRET_KEY`
- Bypassa Row Level Security (RLS)
- Acesso total ao banco
- APENAS em API routes (server-side)

### 4.2 Browser Client (Client Components)

**Arquivo**: `lib/supabase.ts`

```typescript
import { getSupabaseBrowser } from '@/lib/supabase';

// Client Components (browser, respeita RLS)
const supabase = getSupabaseBrowser();
```

**Características:**
- Usa `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Respeita RLS
- Executa no browser
- Para reads em client components

### 4.3 Server Component Client

**Arquivo**: `lib/supabase-server.ts`

```typescript
import { createClient } from '@/lib/supabase-server';

// Server Components (cookie-aware)
const supabase = await createClient();
```

**Características:**
- Cookie-aware via `@supabase/ssr`
- Respeita RLS
- Para Server Components
- Mantém sessão do usuário

### Comportamento com Env Vars Ausentes

Todos os três clients retornam `null` quando environment variables estão ausentes:

```typescript
if (!process.env.SUPABASE_SECRET_KEY) {
  return null; // Permite install wizard rodar sem config
}
```

## 5. State Management

### 5.1 React Query (Server State)

Única fonte de verdade para dados do servidor:

```typescript
// Cache configuration por domínio
const STALE_TIMES = {
  campaigns: 15_000,      // 15s
  contacts: 30_000,       // 30s
  templates: 600_000,     // 10min
  settings: 60_000        // 1min
};
```

**Features utilizadas:**
- Cache automático
- Optimistic updates
- Background refetching
- Invalidation centralizada (`lib/query-invalidation.ts`)

### 5.2 Jotai (Workflow Builder)

Único uso de state management global:

```typescript
// lib/builder/atoms.ts
export const nodesAtom = atom<Node[]>([]);
export const edgesAtom = atom<Edge[]>([]);
```

Armazena estado do graph (nodes + edges) do workflow builder.

### 5.3 React useState (UI State)

Para estado local de UI:

```typescript
const [filter, setFilter] = useState<CampaignStatus>('All');
const [isOpen, setIsOpen] = useState(false);
```

### 5.4 Supabase Realtime

**Provider**: `CentralizedRealtimeProvider`

Single channel para toda aplicação:

```typescript
// 11 tabelas com Realtime habilitado
const REALTIME_TABLES = [
  'campaigns',
  'campaign_contacts',
  'contacts',
  'templates',
  'flows',
  // ... mais 6 tabelas
];
```

**Debounce Strategy:**

```typescript
// Adaptativo baseado no tamanho da campanha
const debounceTime = campaignSize > 1000 ? 500 : 200;
```

**Fallback Polling:**

Quando WebSocket desconecta, fallback para polling de 10s.

### 5.5 Invalidation Centralizada

**Arquivo**: `lib/query-invalidation.ts`

```typescript
export const invalidateCampaigns = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: ['campaigns'] });
  queryClient.invalidateQueries({ queryKey: ['campaign-stats'] });
};

export const invalidateContacts = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: ['contacts'] });
};
```

Centraliza lógica de invalidation para evitar inconsistências.

## 6. Autenticação

### Single-Tenant (Sem User Accounts)

SmartZap não possui sistema de contas de usuário. Autenticação em dois níveis:

### 6.1 Dashboard Login

**Arquivo**: `lib/auth.ts`

```typescript
import bcrypt from 'bcryptjs';

export async function verifyMasterPassword(password: string): Promise<boolean> {
  const masterPassword = process.env.MASTER_PASSWORD;
  return bcrypt.compare(password, masterPassword);
}
```

**Fluxo:**
1. Usuário acessa `/login`
2. Insere `MASTER_PASSWORD`
3. Comparação bcrypt
4. Cookie de sessão criado

### 6.2 API Routes Authentication

**Header-based authentication:**

```typescript
// Option 1: Authorization Bearer
Authorization: Bearer <SMARTZAP_API_KEY>

// Option 2: X-API-Key
X-API-Key: <SMARTZAP_API_KEY>
```

**Níveis de acesso:**

```typescript
// General API access
SMARTZAP_API_KEY

// Admin endpoints (/api/database/*, /api/vercel/*)
SMARTZAP_ADMIN_KEY
```

**Enforcement per-route:**

```typescript
// app/api/campaigns/route.ts
export async function GET(req: Request) {
  const authError = verifyApiKey(req, 'general');
  if (authError) return authError;

  // ... route logic
}
```

### 6.3 Public Routes (Sem Auth)

```typescript
const PUBLIC_ROUTES = [
  '/api/webhook',      // WhatsApp webhooks
  '/api/health',       // Health checks
  '/api/flows'         // Flow executor (internal)
];
```

### Sem Middleware.ts

Autenticação é enforced per-route, não há middleware global. Isso permite controle granular e melhor performance.

## 7. Camada de Dados

### 7.1 Database Layer (Sem ORM)

**Arquivo**: `lib/supabase-db.ts`

CRUD abstraído por domínio:

```typescript
export const campaignDb = {
  async getAll(supabase: SupabaseClient) {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return toCamelCase(data);
  },

  async create(supabase: SupabaseClient, campaign: CreateCampaignInput) {
    const { data, error } = await supabase
      .from('campaigns')
      .insert(toSnakeCase(campaign))
      .select()
      .single();

    if (error) throw error;
    return toCamelCase(data);
  }
};
```

**Outros domínios:**
- `contactDb`
- `templateDb`
- `flowDb`
- `settingDb`

### 7.2 Case Conversion

Database usa `snake_case`, aplicação usa `camelCase`:

```typescript
// lib/utils.ts
export const toCamelCase = (obj: any) => { /* ... */ };
export const toSnakeCase = (obj: any) => { /* ... */ };
```

Conversão automática na camada DB.

### 7.3 Schema Overview

**38 tabelas principais:**

```sql
-- Core
campaigns, campaign_contacts, contacts, templates, flows

-- Settings
settings, account_alerts, api_usage

-- AI
ai_prompts, rag_knowledge, conversation_history

-- Integrations
google_calendar_events, google_calendar_tokens

-- Analytics
campaign_analytics, message_logs

-- ... e mais 23 tabelas
```

**Row Level Security (RLS):**

Todas as 38 tabelas possuem RLS habilitado. Policies configuradas para:
- Admin client: acesso total
- Browser client: read-only na maioria das tabelas

**Funções SECURITY DEFINER:**

16 funções PostgreSQL com `SECURITY DEFINER` para operações privilegiadas:

```sql
-- Exemplos
increment_campaign_counters(campaign_id, field)
update_contact_status(contact_id, new_status)
sync_template_from_meta(template_data)
```

### 7.4 Migrations

**Localização**: `supabase/migrations/`

31+ arquivos SQL versionados:

```
20240101000000_initial_schema.sql
20240102000000_add_flows_table.sql
20240103000000_add_realtime_triggers.sql
...
```

Executadas via Supabase CLI ou dashboard.

## 8. Workflow Engine

### 8.1 Upstash Workflow SDK

**Versão**: 0.3.0-rc

Durable workflows com steps que persistem estado entre execuções:

```typescript
// lib/builder/workflow-executor.workflow.ts
import { serve } from '@upstash/workflow/nextjs';

export const { POST } = serve(async (context) => {
  const { flowId, contactId } = context.requestPayload;

  // Durable step - persiste automaticamente
  const flow = await context.run('fetch-flow', async () => {
    return flowDb.getById(flowId);
  });

  // Cada node é um step
  for (const node of flow.nodes) {
    await executeNode(context, node, contactId);
  }
});
```

### 8.2 Node Types

10 tipos de nodes implementados:

```typescript
type NodeType =
  | 'start'        // Início do fluxo
  | 'message'      // Mensagem de texto
  | 'template'     // Template do WhatsApp
  | 'menu'         // Menu interativo
  | 'input'        // Aguarda input do usuário
  | 'condition'    // Condicional (if/else)
  | 'delay'        // Delay temporal
  | 'ai_agent'     // Agente AI (RAG + Mem0)
  | 'handoff'      // Transfer para humano
  | 'end';         // Fim do fluxo
```

### 8.3 Node Handlers

**Localização**: `lib/builder/nodes/`

Cada node type possui handler próprio:

```typescript
// lib/builder/nodes/template.ts
export async function executeTemplateNode(
  context: WorkflowContext,
  node: TemplateNode,
  contactId: string
) {
  const contact = await context.run('fetch-contact', async () => {
    return contactDb.getById(contactId);
  });

  const result = await context.run('send-template', async () => {
    return whatsappApi.sendTemplate({
      to: contact.phone,
      templateName: node.data.templateName,
      components: node.data.components
    });
  });

  // Aguarda delivery receipt
  await context.sleep('wait-delivery', node.data.timeout || 60);
}
```

### 8.4 Workflow Execution

**Trigger via QStash:**

```typescript
// app/api/campaigns/[id]/send/route.ts
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const campaign = await campaignDb.getById(params.id);

  // Enfileira workflow para cada contato
  for (const contact of campaign.contacts) {
    await qstashClient.publishJSON({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/flows/execute`,
      body: {
        flowId: campaign.flowId,
        contactId: contact.id
      }
    });
  }
}
```

**Retry Strategy:**

Workflow SDK gerencia retries automaticamente:
- Max retries: 3
- Backoff: exponencial (1s, 2s, 4s)
- Dead letter queue após 3 falhas

## 9. AI Architecture

### 9.1 Vercel AI SDK v6

**Multi-provider support:**

```typescript
// lib/ai/providers.ts
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

export const getModel = (provider: AIProvider) => {
  switch (provider) {
    case 'google':
      return google('gemini-2.0-flash-exp');
    case 'anthropic':
      return anthropic('claude-3-5-sonnet-20241022');
    case 'openai':
      return openai('gpt-4-turbo');
  }
};
```

### 9.2 RAG (Retrieval-Augmented Generation)

**pgvector para embeddings:**

```sql
-- Tabela rag_knowledge
CREATE TABLE rag_knowledge (
  id uuid PRIMARY KEY,
  content text,
  embedding vector(768),  -- Dimensão do modelo de embedding
  metadata jsonb,
  created_at timestamptz
);

-- HNSW index para similarity search
CREATE INDEX rag_knowledge_embedding_idx
ON rag_knowledge
USING hnsw (embedding vector_cosine_ops);
```

**Similarity search:**

```typescript
// lib/ai/rag.ts
export async function searchKnowledge(query: string, limit = 5) {
  const embedding = await generateEmbedding(query);

  const { data } = await supabase.rpc('match_knowledge', {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: limit
  });

  return data;
}
```

### 9.3 Mem0 (Conversation Memory)

**Integration:**

```typescript
// lib/ai/memory.ts
import { MemoryClient } from 'mem0ai';

const mem0 = new MemoryClient(process.env.MEM0_API_KEY);

export async function addMemory(userId: string, message: string) {
  return mem0.add(message, { user_id: userId });
}

export async function getMemories(userId: string) {
  return mem0.getAll({ user_id: userId });
}
```

**Contexto em AI Agent:**

```typescript
// lib/builder/nodes/ai-agent.ts
const memories = await getMemories(contactId);
const knowledgeBase = await searchKnowledge(userMessage);

const context = [
  ...memories.map(m => m.text),
  ...knowledgeBase.map(k => k.content)
].join('\n\n');
```

### 9.4 Template Generation Strategies

3 estratégias de geração:

#### Marketing Strategy

```typescript
// lib/ai/template-strategies/marketing.ts
const MARKETING_PROMPT = `
Crie um template de WhatsApp persuasivo para campanha de marketing.
Público: {audience}
Produto: {product}
CTA: {callToAction}
Tom: {tone}
`;
```

#### Utility Strategy

```typescript
// lib/ai/template-strategies/utility.ts
const UTILITY_PROMPT = `
Crie um template informativo e objetivo.
Propósito: {purpose}
Informações: {info}
Tom: profissional e claro
`;
```

#### Bypass Strategy

```typescript
// lib/ai/template-strategies/bypass.ts
const BYPASS_PROMPT = `
Template DEVE passar em análise da Meta.
Evitar: promoções diretas, urgência excessiva, clickbait
Focar: valor genuíno, clareza, conformidade
`;
```

### 9.5 AI Judge Validation

Valida templates antes de submeter para Meta:

```typescript
// lib/ai/judge.ts
export async function validateTemplate(template: string) {
  const { object } = await generateObject({
    model: google('gemini-2.0-flash-exp'),
    schema: z.object({
      isValid: z.boolean(),
      issues: z.array(z.string()),
      suggestions: z.array(z.string())
    }),
    prompt: `Analise este template de WhatsApp: ${template}`
  });

  return object;
}
```

## 10. External Integrations

### 10.1 Meta WhatsApp Cloud API v24.0

**50+ routes implementadas:**

```typescript
// lib/whatsapp/api.ts
export const whatsappApi = {
  // Messages
  async sendTemplate(params: SendTemplateParams) { /* ... */ },
  async sendText(params: SendTextParams) { /* ... */ },
  async sendMedia(params: SendMediaParams) { /* ... */ },

  // Templates
  async createTemplate(template: Template) { /* ... */ },
  async getTemplates() { /* ... */ },
  async deleteTemplate(name: string) { /* ... */ },

  // Media
  async uploadMedia(file: File) { /* ... */ },
  async getMediaUrl(mediaId: string) { /* ... */ },

  // Business Profile
  async getBusinessProfile() { /* ... */ },
  async updateBusinessProfile(data: BusinessProfile) { /* ... */ },

  // Phone Numbers
  async getPhoneNumbers() { /* ... */ },
  async registerPhone(params: RegisterPhoneParams) { /* ... */ }
};
```

**Template Payload Structure:**

```typescript
interface TemplatePayload {
  messaging_product: 'whatsapp';
  to: string;  // E.164 format
  type: 'template';
  template: {
    name: string;
    language: {
      code: string;  // pt_BR, en_US, etc.
    };
    components: Array<{
      type: 'header' | 'body' | 'button';
      parameters: Array<{
        type: 'text' | 'image' | 'video' | 'document';
        text?: string;
        image?: { id: string };
        video?: { id: string };
        document?: { id: string; filename: string };
      }>;
    }>;
  };
}
```

**Error Handling:**

```typescript
// lib/whatsapp-errors.ts
export const WHATSAPP_ERROR_CODES = {
  131042: { type: 'payment', message: 'Pagamento necessário' },
  131056: { type: 'rate_limit', message: 'Limite de 1 msg/6s excedido' },
  131031: { type: 'opt_out', message: 'Usuário bloqueou' },
  // ... 44+ error codes mapeados
};

export function mapWhatsAppError(code: number) {
  return WHATSAPP_ERROR_CODES[code] || { type: 'unknown', message: 'Erro desconhecido' };
}

export function isCriticalError(code: number) {
  return [131042, 131008].includes(code);  // Payment, auth
}
```

**Rate Limits:**

- Cloud API: até 1000 msgs/sec
- Pair limit: 1 msg/6s para mesmo usuário (error 131056)
- Retry: exponential backoff conforme recomendação Meta

### 10.2 Google Calendar

**OAuth Flow:**

```typescript
// lib/google-calendar/auth.ts
export async function getAuthUrl() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
  );

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar']
  });
}
```

**Webhook Subscription:**

```typescript
// lib/google-calendar/webhook.ts
export async function createWebhook(calendarId: string) {
  const calendar = google.calendar('v3');

  return calendar.events.watch({
    calendarId,
    requestBody: {
      id: uuid(),
      type: 'web_hook',
      address: `${process.env.NEXT_PUBLIC_APP_URL}/api/google/webhook`
    }
  });
}
```

**Event Sync:**

```typescript
// app/api/google/webhook/route.ts
export async function POST(req: Request) {
  const resourceState = req.headers.get('x-goog-resource-state');

  if (resourceState === 'sync') {
    // Initial sync
    await syncAllEvents();
  } else if (resourceState === 'exists') {
    // Event updated
    await syncChangedEvents();
  }

  return new Response('OK', { status: 200 });
}
```

### 10.3 Helicone (AI Observability)

**Integration via headers:**

```typescript
// lib/ai/providers.ts
import { openai } from '@ai-sdk/openai';

export const heliconeOpenAI = openai.provider({
  baseURL: 'https://oai.helicone.ai/v1',
  headers: {
    'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
    'Helicone-Cache-Enabled': 'true'
  }
});
```

**Custom properties:**

```typescript
const response = await generateText({
  model: heliconeOpenAI('gpt-4-turbo'),
  prompt: userMessage,
  headers: {
    'Helicone-Property-Campaign-Id': campaignId,
    'Helicone-Property-User-Id': userId
  }
});
```

### 10.4 QStash (Upstash)

**30+ routes usando QStash:**

```typescript
// lib/qstash.ts
import { Client } from '@upstash/qstash';

export const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN
});

// Publish message
export async function enqueueMessage(params: EnqueueParams) {
  return qstashClient.publishJSON({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/flows/execute`,
    body: params,
    retries: 3,
    delay: params.delay || 0
  });
}
```

**Scheduled jobs:**

```typescript
// Limpeza diária de logs
await qstashClient.schedules.create({
  destination: `${process.env.NEXT_PUBLIC_APP_URL}/api/cleanup`,
  cron: '0 0 * * *'  // Meia-noite todo dia
});
```

## 11. Realtime

### 11.1 CentralizedRealtimeProvider

**Arquivo**: `components/providers/CentralizedRealtimeProvider.tsx`

Single Supabase Realtime channel para toda aplicação:

```typescript
const channel = supabase.channel('db-changes')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'campaigns' },
    (payload) => handleChange('campaigns', payload)
  )
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'campaign_contacts' },
    (payload) => handleChange('campaign_contacts', payload)
  )
  // ... mais 9 tabelas
  .subscribe();
```

### 11.2 Tabelas com Realtime

11 tabelas monitoradas:

```typescript
const REALTIME_TABLES = [
  'campaigns',
  'campaign_contacts',
  'contacts',
  'templates',
  'flows',
  'settings',
  'account_alerts',
  'google_calendar_events',
  'message_logs',
  'conversation_history',
  'rag_knowledge'
];
```

### 11.3 Debounced Invalidations

**Estratégia adaptativa:**

```typescript
function getDebounceTime(table: string, eventCount: number): number {
  // Base debounce
  let debounce = 200;

  // Aumenta para high-frequency tables
  if (table === 'campaign_contacts' && eventCount > 100) {
    debounce = 500;
  }

  // Reduz para low-frequency tables
  if (table === 'settings') {
    debounce = 0;  // Immediate
  }

  return debounce;
}
```

**Implementação:**

```typescript
const debouncedInvalidate = useMemo(
  () => debounce((table: string) => {
    switch (table) {
      case 'campaigns':
        invalidateCampaigns(queryClient);
        break;
      case 'contacts':
        invalidateContacts(queryClient);
        break;
      // ... outros casos
    }
  }, getDebounceTime(table, eventCount)),
  [queryClient]
);
```

### 11.4 Fallback Polling

Quando WebSocket desconecta:

```typescript
useEffect(() => {
  if (channelState === 'closed' || channelState === 'errored') {
    // Fallback para polling a cada 10s
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    }, 10_000);

    return () => clearInterval(interval);
  }
}, [channelState]);
```

### 11.5 Connection Health

**Monitoring:**

```typescript
channel
  .on('system', { event: 'presence' }, ({ type }) => {
    if (type === 'sync') {
      setConnectionState('connected');
    } else if (type === 'leave') {
      setConnectionState('disconnected');
    }
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      setConnectionState('connected');
    } else if (status === 'CHANNEL_ERROR') {
      setConnectionState('error');
    }
  });
```

**Auto-reconnect:**

```typescript
useEffect(() => {
  if (connectionState === 'error') {
    const timeout = setTimeout(() => {
      channel.subscribe();  // Tenta reconectar
    }, 5000);

    return () => clearTimeout(timeout);
  }
}, [connectionState]);
```

## 12. Caching Strategy

### 12.1 Vercel Edge Cache

**TTL**: 10s global

**Configuração em API routes:**

```typescript
// app/api/campaigns/route.ts
export async function GET() {
  const campaigns = await campaignDb.getAll();

  return NextResponse.json(campaigns, {
    headers: {
      'Cache-Control': 'no-store'  // Desabilita edge cache
    }
  });
}
```

**Força dynamic rendering:**

```typescript
export const dynamic = 'force-dynamic';
export const revalidate = 0;
```

### 12.2 Upstash Redis

**TTL**: 60s para WhatsApp credentials

```typescript
// lib/whatsapp-credentials.ts
import { redis } from '@/lib/redis';

export async function getWhatsAppCredentials() {
  // Tenta cache primeiro
  const cached = await redis.get('whatsapp:credentials');
  if (cached) return JSON.parse(cached);

  // Busca do banco
  const credentials = await fetchFromDatabase();

  // Cache por 60s
  await redis.setex('whatsapp:credentials', 60, JSON.stringify(credentials));

  return credentials;
}
```

**Invalidação manual:**

```typescript
export async function invalidateWhatsAppCredentials() {
  await redis.del('whatsapp:credentials');
}
```

### 12.3 React Query Cache

**StaleTime por domínio:**

```typescript
// hooks/useCampaigns.ts
export const useCampaignsQuery = () => {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: campaignService.getAll,
    staleTime: 15_000  // 15s
  });
};

// hooks/useContacts.ts
export const useContactsQuery = () => {
  return useQuery({
    queryKey: ['contacts'],
    queryFn: contactService.getAll,
    staleTime: 30_000  // 30s
  });
};

// hooks/useTemplates.ts
export const useTemplatesQuery = () => {
  return useQuery({
    queryKey: ['templates'],
    queryFn: templateService.getAll,
    staleTime: 600_000  // 10min
  });
};
```

**GcTime (Garbage Collection):**

Global default: 5min (300_000ms)

### 12.4 Cache Invalidation Strategy

**Realtime invalidation:**

```typescript
// CentralizedRealtimeProvider
channel.on('postgres_changes', { event: '*', table: 'campaigns' }, () => {
  debouncedInvalidate('campaigns');
});
```

**Manual invalidation após mutations:**

```typescript
const createCampaign = useMutation({
  mutationFn: campaignService.create,
  onSuccess: () => {
    invalidateCampaigns(queryClient);
  }
});
```

**Optimistic updates:**

```typescript
const updateCampaign = useMutation({
  mutationFn: campaignService.update,
  onMutate: async (updatedCampaign) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['campaigns'] });

    // Snapshot previous value
    const previous = queryClient.getQueryData(['campaigns']);

    // Optimistically update
    queryClient.setQueryData(['campaigns'], (old: Campaign[]) =>
      old.map(c => c.id === updatedCampaign.id ? updatedCampaign : c)
    );

    return { previous };
  },
  onError: (err, variables, context) => {
    // Rollback on error
    queryClient.setQueryData(['campaigns'], context?.previous);
  }
});
```

### 12.5 Known Behaviors

**Edge cache flash-back:**

Items deletados podem reaparecer momentaneamente devido ao TTL de 10s do edge cache da Vercel. Após 10s, a deleção é refletida globalmente.

**Mitigação:**

```typescript
// Invalidação imediata + optimistic update
const deleteCampaign = useMutation({
  mutationFn: campaignService.delete,
  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: ['campaigns'] });

    const previous = queryClient.getQueryData(['campaigns']);

    queryClient.setQueryData(['campaigns'], (old: Campaign[]) =>
      old.filter(c => c.id !== id)
    );

    return { previous };
  }
});
```

## Considerações Finais

Esta arquitetura foi projetada para:

1. **Escalabilidade**: Serverless auto-scaling + queue-based processing
2. **Confiabilidade**: Durable workflows + retry strategies + error handling
3. **Performance**: Multi-layer caching + edge distribution + optimistic updates
4. **Manutenibilidade**: Clear separation of concerns + type safety + centralized logic
5. **Observabilidade**: Helicone AI tracking + Supabase logs + error monitoring

A ausência de middleware e ORM foi decisão deliberada para maximizar controle e performance em um contexto single-tenant.
