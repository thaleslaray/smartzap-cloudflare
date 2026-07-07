# Guia de Migração: React/Next.js → SvelteKit

Este documento descreve a estratégia de migração do SmartZap de React/Next.js para SvelteKit, aproveitando a arquitetura modular já implementada.

## Sumário

1. [Visão Geral](#visão-geral)
2. [O Que Copiar Direto](#o-que-copiar-direto)
3. [Conversão de Hooks para Stores](#conversão-de-hooks-para-stores)
4. [Reescrita de Componentes](#reescrita-de-componentes)
5. [Rotas e API](#rotas-e-api)
6. [Checklist de Migração](#checklist-de-migração)

---

## Visão Geral

### Arquitetura Atual (React/Next.js)

```
smartzap/
├── lib/
│   ├── business/          ← 100% portável (6,447 LOC)
│   │   ├── audience/      # Critérios de audiência
│   │   ├── campaign/      # Lógica de campanhas
│   │   ├── contact/       # Operações de contatos
│   │   ├── settings/      # Health check, webhook, calendar
│   │   └── template/      # Parsing, validação, seleção
│   └── *.ts               ← 100% portável (12,139 LOC)
├── services/              ← 100% portável (2,715 LOC)
├── types/                 ← 100% portável (2,390 LOC)
├── hooks/                 ← Converter para Svelte stores
└── components/            ← Reescrever em Svelte
```

### Arquitetura Alvo (SvelteKit)

```
smartzap-svelte/
├── src/
│   ├── lib/
│   │   ├── business/      ← COPIAR de React (zero mudanças)
│   │   ├── services/      ← COPIAR de React (zero mudanças)
│   │   ├── types/         ← COPIAR de React (zero mudanças)
│   │   ├── stores/        ← CONVERTER de hooks/
│   │   └── utils/         ← COPIAR de lib/*.ts
│   ├── routes/            ← Nova estrutura de rotas
│   └── components/        ← REESCREVER em Svelte
└── static/
```

---

## O Que Copiar Direto

### 1. Business Logic (lib/business/)

Copiar **integralmente** sem modificações:

```bash
# No projeto SvelteKit
mkdir -p src/lib/business
cp -r ../smartzap/lib/business/* src/lib/business/
```

**Módulos incluídos:**

| Módulo | Funções Principais | Uso em Svelte |
|--------|-------------------|---------------|
| `audience/` | `filterContactsByCriteria`, `buildAudienceCriteria` | Stores de filtro |
| `campaign/` | `mergeCampaignCountersMonotonic`, `validateCampaignForSend` | Stores de campanha |
| `contact/` | `transformContactForSending`, `filterContacts` | Stores de contato |
| `settings/` | `computeHealthScore`, `validateWebhookUrl` | Stores de config |
| `template/` | `parseTemplateVariables`, `autoMapVariables` | Stores de template |

### 2. Services (services/)

Copiar integralmente - são fetch API puro:

```bash
cp -r ../smartzap/services/* src/lib/services/
```

**Uso em Svelte:**

```typescript
// React (antes)
const { data } = useQuery(['campaigns'], () => campaignService.list())

// Svelte (depois)
import { campaignService } from '$lib/services'

const campaigns = writable<Campaign[]>([])
onMount(async () => {
  campaigns.set(await campaignService.list())
})
```

### 3. Types (types/)

Copiar integralmente:

```bash
cp -r ../smartzap/types/* src/lib/types/
```

### 4. Utilities (lib/*.ts)

Copiar arquivos que não têm imports React:

```bash
# Arquivos portáveis (verificados)
cp ../smartzap/lib/phone-formatter.ts src/lib/utils/
cp ../smartzap/lib/meta-limits.ts src/lib/utils/
cp ../smartzap/lib/whatsapp-errors.ts src/lib/utils/
cp ../smartzap/lib/csv-parser.ts src/lib/utils/
cp ../smartzap/lib/rate-limiter.ts src/lib/utils/
cp ../smartzap/lib/br-geo.ts src/lib/utils/
# ... (12,139 linhas total)
```

---

## Conversão de Hooks para Stores

### Padrão de Conversão

**React Hook:**
```typescript
// hooks/useContacts.ts
export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const filteredContacts = useMemo(() =>
    filterContacts(contacts, { searchTerm }),
    [contacts, searchTerm]
  )

  const fetchContacts = async () => {
    setIsLoading(true)
    const data = await contactService.list()
    setContacts(data)
    setIsLoading(false)
  }

  return { contacts: filteredContacts, isLoading, searchTerm, setSearchTerm, fetchContacts }
}
```

**Svelte Store equivalente:**
```typescript
// stores/contacts.ts
import { writable, derived } from 'svelte/store'
import { filterContacts } from '$lib/business/contact'
import { contactService } from '$lib/services'

function createContactsStore() {
  const contacts = writable<Contact[]>([])
  const isLoading = writable(false)
  const searchTerm = writable('')

  // Derived store (equivalente a useMemo)
  const filteredContacts = derived(
    [contacts, searchTerm],
    ([$contacts, $searchTerm]) => filterContacts($contacts, { searchTerm: $searchTerm })
  )

  async function fetchContacts() {
    isLoading.set(true)
    const data = await contactService.list()
    contacts.set(data)
    isLoading.set(false)
  }

  return {
    contacts: filteredContacts,
    isLoading: { subscribe: isLoading.subscribe },
    searchTerm,
    fetchContacts
  }
}

export const contactsStore = createContactsStore()
```

### Mapeamento de Hooks Principais

| React Hook | Svelte Store | Complexidade |
|------------|--------------|--------------|
| `useContacts.ts` (403 LOC) | `stores/contacts.ts` | Média |
| `useTemplates.ts` (716 LOC) | `stores/templates.ts` | Média |
| `useSettings.ts` (789 LOC) | `stores/settings.ts` | Alta |
| `useCampaignDetails.ts` (439 LOC) | `stores/campaignDetails.ts` | Média |
| `useCampaignWizard.ts` (740 LOC) | `stores/campaignWizard.ts` | Alta |
| `useCampaignRealtime.ts` (380 LOC) | `stores/campaignRealtime.ts` | Alta |

### Equivalências React → Svelte

| React | Svelte | Notas |
|-------|--------|-------|
| `useState` | `writable` | Estado reativo básico |
| `useMemo` | `derived` | Valores computados |
| `useEffect` | `onMount` / `$:` | Side effects |
| `useCallback` | Função normal | Svelte não precisa memoização |
| `useQuery` | `onMount` + `writable` | Ou usar @tanstack/svelte-query |
| `useMutation` | Função async | Ou usar @tanstack/svelte-query |
| `useRef` | `let variable` | Variáveis normais |
| Context API | Svelte Context | `setContext`/`getContext` |

### Exemplo: useCampaignWizard → Svelte

```typescript
// stores/campaignWizard.ts
import { writable, derived, get } from 'svelte/store'
import { validateCampaignForSend } from '$lib/business/campaign'
import { filterContactsByCriteria } from '$lib/business/audience'

function createCampaignWizardStore() {
  // Estado do wizard
  const currentStep = writable(0)
  const name = writable('')
  const selectedTemplate = writable<Template | null>(null)
  const selectedContacts = writable<Set<string>>(new Set())
  const audienceCriteria = writable<AudienceCriteria>({})

  // Derivados (useMemo equivalente)
  const filteredContacts = derived(
    [contacts, audienceCriteria],
    ([$contacts, $criteria]) => filterContactsByCriteria($contacts, $criteria)
  )

  const canProceed = derived(
    [currentStep, name, selectedTemplate, selectedContacts],
    ([$step, $name, $template, $contacts]) => {
      if ($step === 0) return $name.length > 0 && $template !== null
      if ($step === 1) return $contacts.size > 0
      return true
    }
  )

  const validationResult = derived(
    [name, selectedTemplate, filteredContacts],
    ([$name, $template, $contacts]) =>
      validateCampaignForSend({ name: $name, template: $template, contacts: $contacts })
  )

  // Actions
  function nextStep() {
    if (get(canProceed)) {
      currentStep.update(s => Math.min(s + 1, 2))
    }
  }

  function prevStep() {
    currentStep.update(s => Math.max(s - 1, 0))
  }

  function reset() {
    currentStep.set(0)
    name.set('')
    selectedTemplate.set(null)
    selectedContacts.set(new Set())
  }

  return {
    currentStep,
    name,
    selectedTemplate,
    selectedContacts,
    filteredContacts,
    canProceed,
    validationResult,
    nextStep,
    prevStep,
    reset
  }
}

export const campaignWizard = createCampaignWizardStore()
```

---

## Reescrita de Componentes

### Estrutura de Componentes Svelte

```
src/components/
├── ui/                    # Primitivos (Button, Input, Modal)
├── features/
│   ├── campaigns/
│   │   ├── CampaignCard.svelte
│   │   ├── CampaignList.svelte
│   │   └── wizard/
│   │       ├── StepTemplate.svelte
│   │       ├── StepAudience.svelte
│   │       └── StepReview.svelte
│   ├── contacts/
│   ├── templates/
│   └── settings/
└── layout/
    ├── Sidebar.svelte
    └── Header.svelte
```

### Exemplo: Componente de Lista

**React:**
```tsx
// components/features/campaigns/CampaignList.tsx
export function CampaignList() {
  const { campaigns, isLoading } = useCampaigns()

  if (isLoading) return <Skeleton />

  return (
    <div className="grid gap-4">
      {campaigns.map(campaign => (
        <CampaignCard key={campaign.id} campaign={campaign} />
      ))}
    </div>
  )
}
```

**Svelte:**
```svelte
<!-- components/features/campaigns/CampaignList.svelte -->
<script lang="ts">
  import { campaignsStore } from '$lib/stores/campaigns'
  import CampaignCard from './CampaignCard.svelte'
  import Skeleton from '$lib/components/ui/Skeleton.svelte'

  const { campaigns, isLoading } = campaignsStore
</script>

{#if $isLoading}
  <Skeleton />
{:else}
  <div class="grid gap-4">
    {#each $campaigns as campaign (campaign.id)}
      <CampaignCard {campaign} />
    {/each}
  </div>
{/if}
```

### UI Library

**Opção recomendada:** [shadcn-svelte](https://www.shadcn-svelte.com/)

É o equivalente Svelte do shadcn/ui que você já usa. Mesmos componentes, mesma API:

```bash
npx shadcn-svelte@latest init
npx shadcn-svelte@latest add button card dialog
```

---

## Rotas e API

### Estrutura de Rotas SvelteKit

```
src/routes/
├── +layout.svelte           # Layout principal
├── +page.svelte             # Dashboard (/)
├── campaigns/
│   ├── +page.svelte         # Lista (/campaigns)
│   ├── new/
│   │   └── +page.svelte     # Wizard (/campaigns/new)
│   └── [id]/
│       └── +page.svelte     # Detalhes (/campaigns/[id])
├── contacts/
│   └── +page.svelte
├── templates/
│   └── +page.svelte
├── settings/
│   └── +page.svelte
└── api/                     # API Routes
    ├── campaigns/
    │   ├── +server.ts       # GET, POST /api/campaigns
    │   └── [id]/
    │       └── +server.ts   # GET, PATCH, DELETE
    └── ...
```

### API Routes

**Next.js (atual):**
```typescript
// app/api/campaigns/route.ts
export async function GET(request: Request) {
  const campaigns = await db.campaigns.findMany()
  return Response.json(campaigns)
}
```

**SvelteKit (equivalente):**
```typescript
// src/routes/api/campaigns/+server.ts
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async () => {
  const campaigns = await db.campaigns.findMany()
  return new Response(JSON.stringify(campaigns), {
    headers: { 'Content-Type': 'application/json' }
  })
}
```

---

## Checklist de Migração

### Fase 1: Setup (1 dia)

- [ ] Criar projeto SvelteKit: `npm create svelte@latest smartzap-svelte`
- [ ] Configurar TypeScript (strict mode)
- [ ] Instalar dependências: `@tanstack/svelte-query`, `svelte-sonner`, etc.
- [ ] Configurar shadcn-svelte
- [ ] Configurar Tailwind CSS

### Fase 2: Copiar Código Portável (1 dia)

- [ ] Copiar `lib/business/` → `src/lib/business/`
- [ ] Copiar `services/` → `src/lib/services/`
- [ ] Copiar `types/` → `src/lib/types/`
- [ ] Copiar utilities de `lib/*.ts` → `src/lib/utils/`
- [ ] Verificar imports e ajustar paths (`@/` → `$lib/`)
- [ ] Rodar `tsc --noEmit` para validar tipos

### Fase 3: Converter Stores (3-4 dias)

- [ ] `useContacts.ts` → `stores/contacts.ts`
- [ ] `useTemplates.ts` → `stores/templates.ts`
- [ ] `useSettings.ts` → `stores/settings.ts`
- [ ] `useCampaignDetails.ts` → `stores/campaignDetails.ts`
- [ ] `useCampaignWizard.ts` → `stores/campaignWizard.ts`
- [ ] `useCampaignRealtime.ts` → `stores/campaignRealtime.ts`
- [ ] Outros hooks menores

### Fase 4: Componentes UI Base (3-4 dias)

- [ ] Setup shadcn-svelte components
- [ ] Layout principal (Sidebar, Header)
- [ ] Componentes comuns (DataTable, StatusBadge, etc.)

### Fase 5: Features (2-3 semanas)

- [ ] Dashboard
- [ ] Campaigns (list, details, wizard)
- [ ] Contacts (list, import, edit)
- [ ] Templates (list, preview, create)
- [ ] Settings (todas as seções)
- [ ] Flows/Builder

### Fase 6: API Routes (3-4 dias)

- [ ] Converter rotas de `app/api/` para `src/routes/api/`
- [ ] Adaptar middleware (auth, rate-limiting)
- [ ] Configurar Supabase client

### Fase 7: Testes e Polish (3-4 dias)

- [ ] Configurar Vitest para Svelte
- [ ] Migrar testes existentes
- [ ] E2E com Playwright
- [ ] Performance audit
- [ ] Deploy em Vercel

---

## Estimativa de Esforço

| Fase | Esforço | Dependência |
|------|---------|-------------|
| Setup | 1 dia | - |
| Código Portável | 1 dia | Setup |
| Stores | 4 dias | Código Portável |
| UI Base | 4 dias | Setup |
| Features | 15 dias | Stores + UI |
| API Routes | 4 dias | Features |
| Testes | 4 dias | Tudo |
| **Total** | **~33 dias úteis** | |

**Com 1 dev full-time: ~6-7 semanas**
**Com 2 devs: ~4 semanas**

---

## Benefícios da Migração

1. **Bundle menor**: Svelte compila para vanilla JS (~30-40% menor)
2. **Performance**: Sem Virtual DOM, updates mais rápidos
3. **DX melhor**: Menos boilerplate, sintaxe mais limpa
4. **SSR nativo**: SvelteKit tem SSR excelente
5. **Código reaproveitado**: 23,691 linhas (business + services + types)

## Riscos

1. **Curva de aprendizado**: Time precisa aprender Svelte
2. **Ecossistema menor**: Menos bibliotecas que React
3. **Supabase Realtime**: Pode precisar adapter custom
4. **Workflow Builder**: Biblioteca de flow pode não ter equivalente Svelte

---

## Referências

- [SvelteKit Docs](https://kit.svelte.dev/docs)
- [shadcn-svelte](https://www.shadcn-svelte.com/)
- [Svelte Store Patterns](https://svelte.dev/docs/svelte-store)
- [TanStack Query Svelte](https://tanstack.com/query/latest/docs/svelte/overview)
