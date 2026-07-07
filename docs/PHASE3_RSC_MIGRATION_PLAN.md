# Fase 3: Plano de Migração RSC Incremental

## Contexto Atual

### Arquitetura 100% Client-Side
```
Page (RSC vazio) → ClientWrapper ('use client') → Hook → View
```

- **27 páginas** no dashboard
- Todo data fetching acontece no cliente após hidratação
- React Query gerencia cache e estado
- Realtime subscriptions via Supabase

### Problemas da Arquitetura Atual
1. **Loading Spinners**: Usuário vê spinner enquanto dados carregam
2. **Bundle Size**: Todo código de fetching está no cliente
3. **Waterfall de Requests**: HTML → JS → Fetch → Render
4. **TTFB Subótimo**: Servidor retorna HTML vazio rapidamente

---

## Arquitetura Proposta: RSC Híbrido

### Novo Padrão
```
Page (RSC com data fetching) → ClientWrapper (hidrata com initialData) → Hook → View
```

### Benefícios
- **Sem Loading Spinner** no carregamento inicial
- **Streaming**: Dados chegam com o HTML
- **Cache em Edge**: Next.js pode cachear no Vercel Edge
- **Realtime Preservado**: React Query assume após hidratação
- **Rollback Fácil**: `initialData` é opcional

---

## Estratégia de Migração

### Princípios
1. **Incremental**: Uma página por vez
2. **Sem Breaking Changes**: ClientWrapper continua funcionando
3. **Feature Flag Implícita**: `initialData` é opcional
4. **Testes em Produção**: Monitorar métricas antes/depois

### Priorização de Páginas

| Prioridade | Página | Razão | Complexidade |
|------------|--------|-------|--------------|
| P0 | `/` (Dashboard) | Alta visitação, dados simples | Baixa |
| P0 | `/campaigns` | Segunda mais visitada | Baixa |
| P1 | `/templates` | Dados estáveis, ideal para cache | Baixa |
| P1 | `/contacts` | Grande dataset, paginado | Média |
| P2 | `/flows` | Menos visitada | Baixa |
| P2 | `/inbox` | Realtime intensivo | Alta |
| P3 | Settings pages | Baixa visitação | Baixa |
| P3 | `/campaigns/[id]` | Dados dinâmicos | Média |

---

## Implementação: Dashboard (Exemplo Completo)

### Passo 1: Criar Server Action para Data Fetching

```typescript
// app/(dashboard)/actions/dashboard.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import type { DashboardStats } from '@/services/dashboardService'
import type { Campaign } from '@/types'

export async function getDashboardData() {
  const supabase = await createClient()

  // Buscar stats agregados
  const { data: stats } = await supabase
    .rpc('get_dashboard_stats')
    .single()

  // Buscar campanhas recentes (top 5)
  const { data: recentCampaigns } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  return {
    stats: stats as DashboardStats,
    recentCampaigns: (recentCampaigns || []) as Campaign[]
  }
}
```

### Passo 2: Atualizar Page.tsx (RSC)

```typescript
// app/(dashboard)/page.tsx
import { Suspense } from 'react'
import { getDashboardData } from './actions/dashboard'
import { DashboardClientWrapper } from './DashboardClientWrapper'
import { DashboardSkeleton } from '@/components/features/dashboard/DashboardSkeleton'

// Revalidate a cada 30 segundos (ISR)
export const revalidate = 30

async function DashboardWithData() {
  const initialData = await getDashboardData()
  return <DashboardClientWrapper initialData={initialData} />
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardWithData />
    </Suspense>
  )
}
```

### Passo 3: ClientWrapper Recebe initialData

```typescript
// app/(dashboard)/DashboardClientWrapper.tsx
'use client'

import { useDashboardController } from '@/hooks/useDashboard'
import { DashboardView } from '@/components/features/dashboard/DashboardView'

interface DashboardClientWrapperProps {
  initialData?: {
    stats: any
    recentCampaigns: any[]
  }
}

export function DashboardClientWrapper({ initialData }: DashboardClientWrapperProps) {
  // Hook usa initialData para hydration instantânea
  const { stats, recentCampaigns, isLoading } = useDashboardController(initialData)

  return (
    <DashboardView
      stats={stats ?? DEFAULT_STATS}
      recentCampaigns={recentCampaigns ?? []}
      isLoading={isLoading && !initialData} // Não mostra loading se tem initialData
    />
  )
}
```

### Passo 4: Hook Usa initialData

```typescript
// hooks/useDashboard.ts
export const useDashboardController = (initialData?: { stats: any, recentCampaigns: any[] }) => {
  const statsQuery = useRealtimeQuery({
    queryKey: ['dashboardStats', 'v2'],
    queryFn: dashboardService.getStats,
    initialData: initialData?.stats, // ← Hydration instantânea
    placeholderData: (previous) => previous,
    refetchInterval: POLLING_INTERVAL,
    staleTime: 20_000,
    // ... resto da config
  })

  // ...
}
```

---

## Implementação: Campaigns (Exemplo com Paginação)

### Server Action

```typescript
// app/(dashboard)/campaigns/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import type { Campaign } from '@/types'

export async function getCampaignsInitialData() {
  const supabase = await createClient()

  const { data, count } = await supabase
    .from('campaigns')
    .select('*, folder:campaign_folders(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, 19) // Primeira página (20 items)

  return {
    data: data as Campaign[],
    total: count || 0,
    page: 1,
    totalPages: Math.ceil((count || 0) / 20)
  }
}
```

### Page.tsx com Streaming

```typescript
// app/(dashboard)/campaigns/page.tsx
import { Suspense } from 'react'
import { getCampaignsInitialData } from './actions'
import { CampaignsClientWrapper } from './CampaignsClientWrapper'
import { CampaignsSkeleton } from '@/components/features/campaigns/CampaignsSkeleton'

export const revalidate = 60 // 1 minuto (campanhas mudam menos)

async function CampaignsWithData() {
  const initialData = await getCampaignsInitialData()
  return <CampaignsClientWrapper initialData={initialData} />
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={<CampaignsSkeleton />}>
      <CampaignsWithData />
    </Suspense>
  )
}
```

---

## Skeleton Components (Necessários)

Para streaming funcionar bem, precisamos de skeletons:

```typescript
// components/features/dashboard/DashboardSkeleton.tsx
export function DashboardSkeleton() {
  return (
    <Page>
      <PageHeader>
        <div className="h-8 w-48 bg-zinc-800 rounded animate-pulse" />
      </PageHeader>

      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-zinc-800/50 rounded-xl animate-pulse" />
        ))}
      </div>

      {/* Chart Skeleton */}
      <div className="h-64 bg-zinc-800/50 rounded-xl mt-6 animate-pulse" />

      {/* Recent Campaigns Skeleton */}
      <div className="space-y-3 mt-6">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-zinc-800/50 rounded-xl animate-pulse" />
        ))}
      </div>
    </Page>
  )
}
```

---

## Configuração de Cache (next.config.ts)

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  // ... existing config

  // Headers para controle fino de cache
  async headers() {
    return [
      // Dashboard: cache curto (streaming + realtime)
      {
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=30, stale-while-revalidate=60' }
        ]
      },
      // Campanhas: cache médio
      {
        source: '/campaigns',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=60, stale-while-revalidate=120' }
        ]
      },
      // Templates: cache longo (dados estáveis)
      {
        source: '/templates',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=300, stale-while-revalidate=600' }
        ]
      }
    ]
  }
}
```

---

## Plano de Execução

### Sprint 1: Foundation (1-2 dias)
- [ ] Criar `lib/supabase/server.ts` (cliente RSC)
- [ ] Criar skeletons base (DashboardSkeleton, CampaignsSkeleton)
- [ ] Criar RPC `get_dashboard_stats` no Supabase
- [ ] Testar padrão RSC híbrido no Dashboard

### Sprint 2: Core Pages (2-3 dias)
- [ ] Migrar `/` (Dashboard)
- [ ] Migrar `/campaigns`
- [ ] Migrar `/templates`
- [ ] Validar métricas (TTFB, LCP, CLS)

### Sprint 3: Secondary Pages (2-3 dias)
- [ ] Migrar `/contacts`
- [ ] Migrar `/flows`
- [ ] Migrar `/settings`

### Sprint 4: Complex Pages (3-4 dias)
- [ ] Migrar `/inbox` (precisa streaming parcial)
- [ ] Migrar `/campaigns/[id]`
- [ ] Migrar `/flows/builder/[id]`

---

## Métricas de Sucesso

### Antes (Baseline)
- TTFB: ~200ms
- LCP: ~2.5s (espera JS + fetch)
- Loading spinner visível

### Depois (Target)
- TTFB: ~150ms (streaming)
- LCP: ~1.2s (dados no HTML)
- Skeleton em vez de spinner (melhor UX)

### Como Medir
```bash
# Lighthouse CI
npx lighthouse https://smartzap.vercel.app --only-categories=performance

# Web Vitals
# Vercel Analytics já coleta automaticamente
```

---

## Rollback Strategy

Se algo der errado, o rollback é simples:

```typescript
// Basta remover o async data fetching
export default function DashboardPage() {
  return <DashboardClientWrapper /> // Sem initialData = comportamento anterior
}
```

---

## Considerações Especiais

### Inbox (Realtime Intensivo)
O Inbox tem atualizações realtime frequentes. Estratégia:
- RSC carrega lista inicial de conversas
- ClientWrapper assume imediatamente com Realtime
- Mensagens carregam on-demand (não pré-fetch)

### Páginas Dinâmicas ([id])
- Usar `generateStaticParams` quando possível
- Fallback para streaming quando ID não conhecido

### Autenticação
- Server Actions precisam verificar sessão
- Usar `createClient()` do `@supabase/ssr`

---

## Checklist de Migração por Página

Para cada página, verificar:

- [ ] Criar Server Action com data fetching
- [ ] Atualizar page.tsx com Suspense
- [ ] Definir `revalidate` apropriado
- [ ] ClientWrapper aceita `initialData`
- [ ] Hook usa `initialData` no React Query
- [ ] Skeleton criado e estilizado
- [ ] Testar SSR (view-source mostra dados)
- [ ] Testar Realtime (ainda funciona após hidratação)
- [ ] Verificar métricas (LCP, TTFB)
