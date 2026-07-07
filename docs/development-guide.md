# Guia de Desenvolvimento - SmartZap

Este documento descreve os padrões de desenvolvimento para as camadas de hooks, services e lib do SmartZap.

## 1. Camada de Hooks

### Padrão Controller (3 camadas)

O projeto utiliza um padrão de separação em 3 camadas para gerenciamento de estado:

```typescript
// 1. Query Layer - React Query + Realtime
useXxxQuery()      // Fetching + Supabase Realtime subscription

// 2. Mutations Layer - Mutações otimistas
useXxxMutations()  // useMutation com optimistic updates + rollback

// 3. Controller Layer - Orquestração
useXxxController() // Query + mutations + UI state + derived state
```

### Hooks Principais

#### useCampaignsController
Orquestra listagem, filtros e ações CRUD de campanhas.

```typescript
const {
  campaigns,
  isLoading,
  filter,
  setFilter,
  searchQuery,
  setSearchQuery,
  selectedFolder,
  setSelectedFolder,
  selectedTags,
  setSelectedTags,
  handleDelete,
  handleDuplicate,
  handlePause,
  handleResume,
  handleCancel
} = useCampaignsController()
```

Funcionalidades:
- Filtro por status (Todas, Agendada, Em Andamento, Concluída, Pausada, Rascunho)
- Busca por nome
- Filtro por pasta e tags
- Paginação
- Ações CRUD com toast automático

#### useInbox
Gerencia conversas, mensagens, labels e quick replies da caixa de entrada.

```typescript
const {
  conversations,
  messages,
  labels,
  quickReplies,
  mode, // 'manual' | 'auto'
  toggleMode,
  sendMessage,
  assignLabel,
  handoffToAgent,
  triggerAIAgent
} = useInbox()
```

#### useCampaignWizard
Máquina de estados baseada em useReducer para criação de campanhas.

```typescript
const {
  state, // currentStep, formData, errors
  dispatch,
  goToStep,
  updateField,
  validateStep,
  submitCampaign
} = useCampaignWizard()
```

Estados: `selectTemplate` → `configureMessage` → `selectAudience` → `schedule` → `review`

#### useFlowsBuilderController
Gerencia listagem e ações de workflows.

```typescript
const {
  flows,
  searchQuery,
  setSearchQuery,
  filteredFlows,
  handleCreate,
  handleDelete,
  handleDuplicate
} = useFlowsBuilderController()
```

#### useFlowEditorController
Gerencia edição de workflow individual (integrado com React Flow).

```typescript
const {
  flow,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  handleSave,
  handlePublish,
  canPublish,
  isDirty
} = useFlowEditorController(flowId)
```

### Hooks Utilitários

#### useRealtimeQuery
Wrapper que combina React Query com Supabase Realtime.

```typescript
export function useRealtimeQuery<T>(
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
  options?: {
    enabled?: boolean
    staleTime?: number
    onRealtimeEvent?: (payload: any) => void
  }
)
```

Uso típico:
```typescript
const { data, isLoading } = useRealtimeQuery(
  ['campaigns'],
  () => campaignService.list(),
  {
    staleTime: CACHE.STALE_TIME.campaigns,
    onRealtimeEvent: (payload) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    }
  }
)
```

#### useMutationWithToast
Wrapper de useMutation com notificações automáticas.

```typescript
const mutation = useMutationWithToast({
  mutationFn: campaignService.delete,
  successMessage: 'Campanha excluída',
  errorMessage: 'Erro ao excluir campanha',
  invalidateQueries: [['campaigns']]
})
```

#### useMediaQuery
Detecção de media queries CSS (SSR-safe).

```typescript
const isDesktop = useMediaQuery('(min-width: 1024px)')
const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
```

#### use-mobile / use-touch
```typescript
const isMobile = useMobile() // < 768px
const isTouch = useTouch()   // touch device detection
```

#### use-copy-to-clipboard
```typescript
const { copy, isCopied } = useCopyToClipboard({ timeout: 2000 })

<Button onClick={() => copy(text)}>
  {isCopied ? 'Copiado!' : 'Copiar'}
</Button>
```

#### useSoundFX
```typescript
const { play } = useSoundFX()

play('success') // 'success' | 'error' | 'notification' | 'click'
```

#### useFocusTrap
```typescript
const containerRef = useFocusTrap({ enabled: isModalOpen })

<div ref={containerRef}>
  {/* Modal content */}
</div>
```

### Convenções de Query Keys

Query keys devem seguir o padrão hierárquico:

```typescript
// Listagens
['campaigns', { page, search, status, folderId, tagIds }]
['inbox-conversations', { page, status, mode, labelId, search }]
['contacts', { page, search, tags, status }]

// Items individuais
['campaigns', campaignId]
['flows', flowId]

// Recursos relacionados
['campaign-stats', campaignId]
['contact-stats']
['contactTags']

// Configurações
['settings']
['allSettings']
['accountLimits']

// Dashboard
['dashboardStats']
['recentCampaigns']

// Inbox
['inbox-labels']
['inbox-quick-replies']

// Templates
['templates']               // Aprovados
['templates', 'drafts']     // Rascunhos
['templates', 'manual']     // Criação manual
```

Estrutura de objetos em query keys permite invalidação granular:

```typescript
// Invalida todas as campanhas
queryClient.invalidateQueries({ queryKey: ['campaigns'] })

// Invalida apenas campanhas com status específico
queryClient.invalidateQueries({
  queryKey: ['campaigns', { status: 'SENDING' }]
})
```

## 2. Camada de Services

### Padrão de Service

Services são object literals com métodos async que encapsulam chamadas à API:

```typescript
// services/fooService.ts
export const fooService = {
  async list(params?: { page?: number; search?: string }) {
    const url = '/api/foo'
    const query = new URLSearchParams()
    if (params?.page) query.set('page', String(params.page))
    if (params?.search) query.set('search', params.search)

    const response = await fetch(`${url}?${query}`)
    if (!response.ok) throw new Error('Erro ao buscar dados')
    return response.json()
  },

  async create(data: CreateFooDTO) {
    const response = await fetch('/api/foo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) throw new Error('Erro ao criar')
    return response.json()
  },

  async update(id: string, data: UpdateFooDTO) {
    const response = await fetch(`/api/foo/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) throw new Error('Erro ao atualizar')
    return response.json()
  },

  async delete(id: string) {
    const response = await fetch(`/api/foo/${id}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Erro ao excluir')
    return response.json()
  }
}
```

Diretrizes:
- Usar `fetch()` nativo (sem axios/ky)
- `URLSearchParams` para query strings
- Object literal com async methods
- Error handling via try-catch no caller (hook)
- Type-safe com DTOs do `types.ts`

### Services Principais

#### campaignService (27 métodos)

```typescript
campaignService.list(params)
campaignService.getById(id)
campaignService.create(data)
campaignService.update(id, data)
campaignService.delete(id)
campaignService.duplicate(id)
campaignService.pause(id)
campaignService.resume(id)
campaignService.cancel(id)
campaignService.precheck(id)
campaignService.dispatch(id)
campaignService.getStats(id)

// Folders
campaignService.folders.list()
campaignService.folders.create(data)
campaignService.folders.update(id, data)
campaignService.folders.delete(id)

// Tags
campaignService.tags.list()
campaignService.tags.create(data)
campaignService.tags.update(id, data)
campaignService.tags.delete(id)
campaignService.tags.assign(campaignId, tagIds)
```

#### contactService (13 métodos)

```typescript
contactService.list(params)
contactService.getById(id)
contactService.add(data)
contactService.update(id, data)
contactService.delete(id)
contactService.bulkDelete(ids)
contactService.import(file)
contactService.export(format)
contactService.stats()

// Tags
contactService.tags.list()
contactService.tags.create(data)
contactService.tags.assign(contactId, tagIds)
contactService.tags.bulkAssign(contactIds, tagIds)
```

#### inboxService (18 métodos)

```typescript
// Conversations
inboxService.conversations.list(params)
inboxService.conversations.getById(id)
inboxService.conversations.archive(id)
inboxService.conversations.unarchive(id)

// Messages
inboxService.messages.list(conversationId)
inboxService.messages.send(conversationId, data)
inboxService.messages.markAsRead(messageId)

// Labels
inboxService.labels.list()
inboxService.labels.create(data)
inboxService.labels.assign(conversationId, labelId)

// Quick Replies
inboxService.quickReplies.list()
inboxService.quickReplies.create(data)

// Actions
inboxService.handoff(conversationId)
inboxService.pause(conversationId)
inboxService.resume(conversationId)
inboxService.triggerAI(conversationId)
```

#### templateService (10 métodos)

```typescript
templateService.getAll()
templateService.getDrafts()
templateService.getManual()
templateService.sync()
templateService.createInMeta(data)
templateService.updateDraft(id, data)
templateService.deleteDraft(id)
templateService.deleteBulk(ids)
templateService.uploadHeaderMedia(file)
templateService.generateUtilityTemplates(prompt)
```

#### settingsService (27 métodos)

```typescript
// Credentials
settingsService.getWhatsAppCredentials()
settingsService.updateWhatsAppCredentials(data)
settingsService.validateToken()

// AI
settingsService.getAIConfig()
settingsService.updateAIConfig(data)
settingsService.testAI(prompt)

// Test Contact
settingsService.getTestContact()
settingsService.updateTestContact(phone)

// Throttle
settingsService.getThrottle()
settingsService.updateThrottle(data)

// Auto-suppression
settingsService.getAutoSuppression()
settingsService.updateAutoSuppression(enabled)

// Calendar
settingsService.getCalendar()
settingsService.updateCalendar(data)

// Upstash
settingsService.getUpstashConfig()
settingsService.updateUpstashConfig(data)
```

## 3. Camada Lib

### lib/auth.ts

Autenticação para API routes (sem middleware.ts).

```typescript
import { verifyApiKey } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const authResult = await verifyApiKey(request)

  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // authResult.keyType: 'admin' | 'api'
  if (authResult.keyType !== 'admin') {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    )
  }

  // ... business logic
}
```

Headers aceitos:
- `Authorization: Bearer <key>`
- `X-API-Key: <key>`

Tipos de chave:
- `SMARTZAP_API_KEY` - acesso geral à API
- `SMARTZAP_ADMIN_KEY` - endpoints admin (`/api/database/*`, `/api/vercel/*`)

Endpoints públicos (sem auth):
- `/api/webhook`
- `/api/health`
- `/api/system`
- `/api/flows`
- `/api/flow-engine`
- `/api/campaign/dispatch`

### lib/query-invalidation.ts

Centraliza lógica de invalidação de queries.

```typescript
import { invalidateCampaigns, invalidateContacts } from '@/lib/query-invalidation'

// Após mutação
await campaignService.create(data)
await invalidateCampaigns(queryClient)

// Object API
import { queryInvalidation } from '@/lib/query-invalidation'

queryInvalidation.campaigns(queryClient)
queryInvalidation.contacts(queryClient)
queryInvalidation.templates(queryClient)
queryInvalidation.inbox(queryClient)
queryInvalidation.flows(queryClient)
```

Funções disponíveis:
- `invalidateCampaigns`
- `invalidateContacts`
- `invalidateTemplates`
- `invalidateInbox`
- `invalidateFlows`
- `invalidateSettings`
- `invalidateStats`

### lib/constants.ts

Constantes de paginação, cache e timeouts.

```typescript
// Paginação
PAGINATION.campaigns = 20
PAGINATION.contacts = 10
PAGINATION.messages = 100
PAGINATION.templates = 50

// Cache (staleTime)
CACHE.STALE_TIME.campaigns = 15000      // 15s
CACHE.STALE_TIME.contacts = 30000       // 30s
CACHE.STALE_TIME.templates = 600000     // 10min
CACHE.STALE_TIME.labels = 300000        // 5min

// Realtime debounce
REALTIME.DEBOUNCE.small = 250    // 250ms
REALTIME.DEBOUNCE.medium = 500   // 500ms
REALTIME.DEBOUNCE.large = 1000   // 1000ms

// Timeouts
TIMEOUTS.fetch = 30000           // 30s
TIMEOUTS.longOperation = 120000  // 2min
TIMEOUTS.metaApi = 60000         // 60s
```

### lib/whatsapp-errors.ts

Mapeamento de códigos de erro da Meta WhatsApp API.

```typescript
import {
  mapWhatsAppError,
  isCriticalError,
  isOptOutError
} from '@/lib/whatsapp-errors'

// Mapear erro
const error = mapWhatsAppError(131042)
// {
//   type: 'payment',
//   message: 'Método de pagamento inválido',
//   action: 'Atualize o método de pagamento no Meta Business Manager'
// }

// Verificar criticidade
if (isCriticalError(131042)) {
  // Pausar campanha, mostrar alerta
}

// Verificar opt-out
if (isOptOutError(130472)) {
  // Atualizar status do contato para OPT_OUT
}
```

Códigos mapeados (44+):
- **Pagamento**: 131042, 131043, 131044
- **Autenticação**: 190, 368, 131051
- **Rate limit**: 80007, 131048, 131056
- **Opt-out**: 130472, 131026, 131047
- **Template**: 132000, 132001, 132005, 132012, 132015, 132016, 132068, 132069

### lib/phone-formatter.ts

Normalização e validação de números de telefone (E.164 format).

```typescript
import {
  normalizePhoneNumber,
  validatePhoneNumber
} from '@/lib/phone-formatter'

// Normalizar para E.164
const normalized = normalizePhoneNumber('+55 11 99999-9999')
// '+5511999999999'

// Validar
const result = validatePhoneNumber('+5511999999999')
// { isValid: true, error: null }

const invalid = validatePhoneNumber('999999999')
// { isValid: false, error: 'Número inválido' }
```

Usa `libphonenumber-js` internamente.

### lib/whatsapp-credentials.ts

Busca credenciais do WhatsApp (Supabase como single source of truth).

```typescript
import {
  getWhatsAppCredentials,
  isWhatsAppConfigured,
  isWhatsAppConnected
} from '@/lib/whatsapp-credentials'

// Obter credenciais
const credentials = await getWhatsAppCredentials()
// {
//   token: string
//   phoneId: string
//   businessAccountId: string
// }

// Verificar configuração
if (!isWhatsAppConfigured()) {
  // Redirecionar para wizard de instalação
}

// Verificar conexão
if (!await isWhatsAppConnected()) {
  // Mostrar alerta de desconexão
}
```

Ordem de fallback:
1. Supabase `settings` table (prioridade)
2. Redis cache (60s TTL)
3. Environment variables (fallback)

### lib/ai/

Subsistema de AI com múltiplos providers.

#### providers.ts

```typescript
import { getAIProvider } from '@/lib/ai/providers'

const provider = await getAIProvider('google') // 'google' | 'openai' | 'anthropic'
const response = await provider.generateText(prompt)
```

#### unified-ai-service.ts

API unificada para todos os providers.

```typescript
import { generateText, generateStructuredData } from '@/lib/ai/unified-ai-service'

// Texto simples
const text = await generateText({
  prompt: 'Crie uma mensagem de boas-vindas',
  temperature: 0.7
})

// Dados estruturados (com schema)
const data = await generateStructuredData({
  prompt: 'Extraia nome e email',
  schema: z.object({
    name: z.string(),
    email: z.string().email()
  })
})
```

#### embeddings.ts

```typescript
import { generateEmbedding, cosineSimilarity } from '@/lib/ai/embeddings'

const embedding = await generateEmbedding('texto de exemplo')
const similarity = cosineSimilarity(embedding1, embedding2)
```

#### rag-store.ts

Knowledge base para RAG (Retrieval-Augmented Generation).

```typescript
import { ragStore } from '@/lib/ai/rag-store'

await ragStore.addDocument({
  id: 'doc1',
  content: 'conteúdo do documento',
  metadata: { source: 'manual' }
})

const results = await ragStore.search('pergunta do usuário', { limit: 5 })
```

#### mem0-client.ts

Memória conversacional.

```typescript
import { mem0Client } from '@/lib/ai/mem0-client'

await mem0Client.addMemory({
  userId: 'user123',
  memory: 'Usuário prefere respostas curtas',
  metadata: { context: 'preferences' }
})

const memories = await mem0Client.getMemories('user123')
```

#### prompts/

Templates de prompts pré-configurados:

- `marketing-template-generator.ts` - Geração de templates de marketing
- `utility-template-generator.ts` - Geração de templates utilitários
- `bypass-generator.ts` - Geração de variações para bypass de filtros
- `flow-form-mapper.ts` - Mapeamento de formulários para flows
- `utility-judge.ts` - Classificação de templates utilitários

```typescript
import { marketingTemplatePrompt } from '@/lib/ai/prompts/marketing-template-generator'

const prompt = marketingTemplatePrompt({
  businessType: 'E-commerce',
  goal: 'Promoção de Black Friday',
  tone: 'Urgente e promocional'
})
```

### lib/builder/

Sistema de workflow engine.

#### workflow-executor.workflow.ts

Executor principal (Upstash Workflow SDK).

```typescript
import { executeWorkflow } from '@/lib/builder/workflow-executor.workflow'

await executeWorkflow({
  flowId: 'flow123',
  contactId: 'contact456',
  trigger: { type: 'manual', data: {} }
})
```

#### workflow-store.ts

Estado do grafo de workflow (Jotai atoms).

```typescript
import {
  nodesAtom,
  edgesAtom,
  selectedNodeAtom
} from '@/lib/builder/workflow-store'

const [nodes, setNodes] = useAtom(nodesAtom)
const [edges, setEdges] = useAtom(edgesAtom)
const [selectedNode, setSelectedNode] = useAtom(selectedNodeAtom)
```

#### workflow-db.ts

Operações de banco de dados para workflows.

```typescript
import { workflowDb } from '@/lib/builder/workflow-db'

const flow = await workflowDb.getById('flow123')
await workflowDb.create({ name: 'Novo Flow', nodes: [], edges: [] })
await workflowDb.update('flow123', { name: 'Flow Atualizado' })
await workflowDb.delete('flow123')
```

#### steps/

Handlers para cada tipo de node:

- `trigger.ts` - Trigger nodes (webhook, schedule, manual)
- `http-request.ts` - HTTP requests
- `condition.ts` - Conditional branching
- `database-query.ts` - Database operations

```typescript
import { executeHttpRequest } from '@/lib/builder/steps/http-request'

await executeHttpRequest({
  url: 'https://api.example.com/data',
  method: 'POST',
  body: { key: 'value' }
})
```

#### codegen-registry.ts

Registro de geradores de código para nodes.

```typescript
import { codegenRegistry } from '@/lib/builder/codegen-registry'

const code = codegenRegistry.generate('http-request', nodeData)
```

### lib/business/

Regras de negócio organizadas por domínio.

#### audience/

```typescript
import { validateCriteria } from '@/lib/business/audience/criteria-validator'
import { audiencePresets } from '@/lib/business/audience/presets'
import { calculateStats } from '@/lib/business/audience/stats-calculator'

// Validar critérios de audiência
const isValid = validateCriteria(criteria)

// Presets prontos
const newCustomers = audiencePresets.newCustomers
const vipCustomers = audiencePresets.vipCustomers

// Calcular estatísticas
const stats = calculateStats(contacts, criteria)
```

#### campaign/

```typescript
import { mergeCampaigns } from '@/lib/business/campaign/merging'
import { filterMessages } from '@/lib/business/campaign/message-filtering'
import { validateSchedule } from '@/lib/business/campaign/scheduling'
import { validateSend } from '@/lib/business/campaign/send-validator'

// Mesclar campanhas
const merged = mergeCampaigns([campaign1, campaign2])

// Filtrar mensagens por critérios
const filtered = filterMessages(messages, criteria)

// Validar agendamento
const isValid = validateSchedule(scheduledDate)

// Validar envio
const canSend = validateSend(campaign)
```

#### contact/

```typescript
import { bulkUpdateContacts } from '@/lib/business/contact/bulk-operations'
import { filterContacts } from '@/lib/business/contact/filtering'
import { updateContactStatus } from '@/lib/business/contact/status'
import { transformContact } from '@/lib/business/contact/transformer'

// Operações em lote
await bulkUpdateContacts(contactIds, { status: 'OPT_OUT' })

// Filtrar contatos
const filtered = filterContacts(contacts, { tags: ['vip'], status: 'OPT_IN' })

// Atualizar status
await updateContactStatus(contactId, 'OPT_OUT')

// Transformar formato
const transformed = transformContact(rawContact)
```

#### template/

```typescript
import { validateCarousel } from '@/lib/business/template/carousel-rules'
import { validateDraft } from '@/lib/business/template/draft-validation'
import { filterTemplates } from '@/lib/business/template/filtering'
import { selectTemplate } from '@/lib/business/template/selection'
import { mapVariables, parseVariables } from '@/lib/business/template/variable-mapper'

// Validar carousel
const isValid = validateCarousel(carouselData)

// Validar rascunho
const validation = validateDraft(draftData)

// Filtrar templates
const filtered = filterTemplates(templates, { category: 'MARKETING' })

// Selecionar melhor template
const best = selectTemplate(templates, criteria)

// Mapear variáveis
const mapped = mapVariables(template, data)
const parsed = parseVariables('Olá {{1}}, bem-vindo!')
```

#### settings/

```typescript
import { getCalendar, isWithinBusinessHours } from '@/lib/business/settings/calendar'
import { checkHealth } from '@/lib/business/settings/health'
import { validateWebhook } from '@/lib/business/settings/webhook'

// Calendário
const calendar = await getCalendar()
const canSend = isWithinBusinessHours(new Date(), calendar)

// Health check
const health = await checkHealth()
// { status: 'healthy' | 'degraded' | 'unhealthy', checks: [...] }

// Webhook
const isValid = await validateWebhook(webhookUrl)
```

## 4. Padrão de API Routes

```typescript
// app/api/foo/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { verifyApiKey } from '@/lib/auth'
import { z } from 'zod'

// Desabilitar cache do Next.js
export const dynamic = 'force-dynamic'
export const revalidate = 0

const querySchema = z.object({
  page: z.coerce.number().min(1).optional(),
  search: z.string().optional()
})

export async function GET(request: NextRequest) {
  // 1. Verificar auth (se necessário)
  const authResult = await verifyApiKey(request)
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Verificar Supabase
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    )
  }

  // 3. Validar query params
  const url = new URL(request.url)
  const params = {
    page: url.searchParams.get('page'),
    search: url.searchParams.get('search')
  }

  const validation = querySchema.safeParse(params)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: validation.error },
      { status: 400 }
    )
  }

  // 4. Business logic
  try {
    const { data, error } = await supabase
      .from('foo')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    // 5. Response com cache headers
    return NextResponse.json(
      { data },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache'
        }
      }
    )
  } catch (error) {
    console.error('Error fetching data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

const bodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional()
})

export async function POST(request: NextRequest) {
  // Auth + Supabase checks...

  // Validar body
  const body = await request.json()
  const validation = bodySchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: validation.error },
      { status: 400 }
    )
  }

  const { name, description } = validation.data

  try {
    const { data, error } = await supabase
      .from('foo')
      .insert({ name, description })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('Error creating record:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

Checklist:
- `export const dynamic = 'force-dynamic'`
- `export const revalidate = 0`
- Verificar `verifyApiKey()` se necessário
- Verificar `getSupabaseAdmin() !== null`
- Validar inputs com Zod
- Try-catch para erros de DB
- Response headers: `Cache-Control: no-store`
- Status codes adequados (200, 201, 400, 401, 403, 500, 503)

## 5. Testing

### Vitest (Unit Tests)

Configuração:
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts']
  }
})
```

Padrões:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

describe('useCampaignsController', () => {
  it('deve carregar campanhas na inicialização', async () => {
    const { result } = renderHook(() => useCampaignsController())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.campaigns).toHaveLength(3)
  })

  it('deve filtrar campanhas por status', () => {
    const { result } = renderHook(() => useCampaignsController())

    result.current.setFilter('SENDING')

    expect(result.current.campaigns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'SENDING' })
      ])
    )
  })
})
```

Mocking:
```typescript
// Mock de service
vi.mock('@/services/campaignService', () => ({
  campaignService: {
    list: vi.fn().mockResolvedValue([mockCampaign1, mockCampaign2]),
    delete: vi.fn().mockResolvedValue({ success: true })
  }
}))

// Mock de Supabase
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        data: mockData,
        error: null
      }))
    }))
  }))
}))
```

Factories:
```typescript
// test/factories.ts
export const createMockCampaign = (overrides = {}) => ({
  id: '123',
  name: 'Campanha Teste',
  status: 'DRAFT',
  created_at: new Date().toISOString(),
  ...overrides
})

export const createMockContact = (overrides = {}) => ({
  id: '456',
  name: 'João Silva',
  phone: '+5511999999999',
  status: 'OPT_IN',
  ...overrides
})
```

### Playwright (E2E Tests)

Configuração:
```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'mobile', use: devices['iPhone 13'] }
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true
  }
})
```

Padrões:
```typescript
import { test, expect } from '@playwright/test'

test.describe('Campanhas', () => {
  test('deve criar nova campanha', async ({ page }) => {
    await page.goto('/campaigns')
    await page.click('button:has-text("Nova Campanha")')

    await page.fill('input[name="name"]', 'Campanha E2E')
    await page.click('button:has-text("Salvar")')

    await expect(page.locator('text=Campanha criada com sucesso')).toBeVisible()
  })

  test('deve filtrar campanhas por status', async ({ page }) => {
    await page.goto('/campaigns')

    await page.selectOption('select[name="status"]', 'SENDING')

    const campaigns = page.locator('[data-testid="campaign-row"]')
    await expect(campaigns).toHaveCount(2)
  })
})
```

Nomenclatura:
- Nomes de testes em português
- Usar `data-testid` para seletores (quando possível)
- Page Object Model para telas complexas

```typescript
// tests/e2e/pages/CampaignsPage.ts
export class CampaignsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/campaigns')
  }

  async createCampaign(name: string) {
    await this.page.click('button:has-text("Nova Campanha")')
    await this.page.fill('input[name="name"]', name)
    await this.page.click('button:has-text("Salvar")')
  }

  async filterByStatus(status: string) {
    await this.page.selectOption('select[name="status"]', status)
  }
}
```

## 6. Boas Práticas

### Hooks
- Sempre usar `useCallback` para funções passadas como props
- Sempre usar `useMemo` para computações custosas ou objetos/arrays derivados
- Evitar lógica de negócio dentro de hooks - mover para `lib/business/`
- Query keys devem ser consistentes e hierárquicas
- Usar `useRealtimeQuery` para dados que mudam frequentemente

### Services
- Um service por entidade/domínio
- Métodos devem retornar dados tipados
- Não fazer transformações de dados - retornar como vem da API
- Error handling via throw - deixar para o caller (hook) tratar

### Lib
- Funções puras sempre que possível
- Separar business logic de infraestrutura
- Testes unitários para funções complexas
- Documentar edge cases e limitações

### Performance
- Usar React Compiler (automático, já habilitado no projeto)
- Lazy loading de componentes pesados
- Debounce em campos de busca (300-500ms)
- Virtualização para listas longas (react-window)
- Otimistic updates para melhor UX

### Segurança
- Nunca expor tokens/secrets no frontend
- Validar todos os inputs (Zod)
- Sanitizar dados antes de exibir (DOMPurify se necessário)
- Rate limiting em endpoints sensíveis
