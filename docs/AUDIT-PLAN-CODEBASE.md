# Plano de Auditoria por Camada — SmartZap

> Objetivo: identificar e corrigir padrões de código duplicado, baixa qualidade e ineficiências em toda a codebase.
> Metodologia: uma camada por vez, com revisão manual + busca cirúrgica por padrões.

**Data:** 2026-04-03
**Baseline:** 870 arquivos fonte, 3705 testes passando, 0 erros TypeScript.

---

## Sumário Executivo

| # | Camada | Arquivos | Impacto | Esforço | Prioridade |
|---|--------|----------|---------|---------|-----------|
| 1 | `services/` | 19 | Alto | Baixo | 🔴 ALTA |
| 2 | `app/api/` (erros) | 200+ | Alto | Médio | 🔴 ALTA |
| 3 | `hooks/` (hooks gordos) | 66 | Médio | Alto | 🟡 MÉDIA |
| 4 | `lib/whatsapp/` | ~15 | Médio | Médio | 🟡 MÉDIA |
| 5 | `lib/ai/` | 12 | Baixo | Baixo | 🟢 BAIXA (já auditado) |

---

## Camada 1: `services/` — Fetch Wrapper

### Diagnóstico
Todos os 19 services usam `fetch()` raw com o mesmo padrão de error handling copiado N vezes:

```typescript
// Repetido em campaignService, contactService, aiAgentService, etc.
const response = await fetch('/api/xxx')
if (!response.ok) {
    console.error('Failed to fetch xxx:', response.statusText)
    return fallback  // [] / null / undefined
}
return response.json()
```

**Evidências encontradas:**
- `campaignService.ts`: 31 chamadas `fetch()`
- `inboxService.ts`: 18 chamadas
- `aiAgentService.ts`: 5 chamadas
- `flowsService.ts`: 9 chamadas
- Total estimado: ~90 chamadas fetch raw

### O que auditar
- [ ] Existe algum fetch wrapper compartilhado? (`lib/api-client.ts` ou similar)
- [ ] Padrão de error handling é consistente ou varia por service?
- [ ] Há services que lançam exceção vs. retornam `null`? (inconsistência)
- [ ] Autenticação nos headers é duplicada ou centralizada?
- [ ] Tipagem do retorno: `response.json() as T` vs. inferência?

### Refatoração esperada
Criar `lib/fetch-client.ts` (ou aproveitar se já existe) com:
```typescript
async function apiGet<T>(path: string): Promise<T>
async function apiPost<T>(path: string, body: unknown): Promise<T>
async function apiPut<T>(path: string, body: unknown): Promise<T>
async function apiDelete(path: string): Promise<void>
```

### Impacto estimado
- Redução: ~200 linhas de boilerplate repetitivo
- Ganho: error handling consistente, um lugar para adicionar headers globais (auth, versioning)

---

## Camada 2: `app/api/` — Padrão de Erro nas Rotas

### Diagnóstico
69 ocorrências de `NextResponse.json({ error: ..., status: 500 })` espalhadas nas rotas — cada uma com sua variação de mensagem, status code e formato.

Padrões problemáticos identificados:
```typescript
// Variante A: só mensagem
return NextResponse.json({ error: 'Erro interno' }, { status: 500 })

// Variante B: mensagem + detalhes
return NextResponse.json({ error: 'Erro', details: e.message }, { status: 500 })

// Variante C: success: false
return NextResponse.json({ success: false, error: 'xxx' }, { status: 400 })

// Variante D: message ao invés de error
return NextResponse.json({ message: 'Not found' }, { status: 404 })
```

### O que auditar
- [ ] Quantos formatos de erro distintos existem? (`error` vs `message` vs `success: false`)
- [ ] Status codes corretos? (404 retornando 500? 400 retornando 500?)
- [ ] 14 rotas sem chamada a `verifyApiKey` — são todas intencionalmente públicas?
- [ ] Try/catch excessivamente amplos que engolindo erros específicos?
- [ ] Rotas que lançam mas não tratam erros do Supabase (`.error` ignorado)

### Refatoração esperada
Criar `lib/api-response.ts`:
```typescript
export const apiError = (message: string, status = 500, details?: unknown) =>
    NextResponse.json({ error: message, ...(details && { details }) }, { status })

export const apiOk = <T>(data: T) =>
    NextResponse.json(data)

export const apiNotFound = (resource = 'Recurso') =>
    apiError(`${resource} não encontrado`, 404)
```

### Impacto estimado
- Redução: ~100 linhas de construção de resposta repetitiva
- Ganho: formato de erro consistente para o frontend consumir

---

## Camada 3: `hooks/` — Hooks Gordos

### Diagnóstico
66 hooks, alguns com tamanho preocupante:

| Hook | Linhas | Problema suspeito |
|------|--------|------------------|
| `useCampaignNew.ts` | 1703 | Faz tudo: state, UI, validação, API, lógica de negócio |
| `useSettings.ts` | 861 | Mistura settings de 5+ domínios diferentes |
| `useTemplates.ts` | 793 | Pode ser dividido em sub-hooks |
| `useCampaignWizard.ts` | 764 | Wizard state + validação acoplados |
| `useFlowBuilder.ts` | 714 | Jotai + queries + editor state |

### O que auditar
- [ ] `useCampaignNew.ts`: quantos estados distintos? Deveria ser múltiplos hooks?
- [ ] `useSettings.ts`: os domínios são coesos ou deveriam ser `useSettingsAI`, `useSettingsWhatsApp`, etc.?
- [ ] Há estado derivado (`useMemo`) sendo guardado como `useState`?
- [ ] Há effects que poderiam ser callbacks diretos?
- [ ] Duplicação de queries similares entre hooks (ex: `templates` fetchado em múltiplos lugares)?

### Refatoração esperada
- Extrair sub-hooks por responsabilidade
- Converter `useState` de valores derivados para `useMemo`
- Verificar se `useSettingsAI.ts` já existe (529 linhas) e se há duplicação com `useSettings.ts`

### Impacto estimado
- Redução: difícil estimar sem leitura profunda
- Ganho: manutenibilidade, testabilidade, reuso entre features

---

## Camada 4: `lib/whatsapp/` — Builders de Payload

### Diagnóstico
~6588 linhas no módulo. Os maiores arquivos:

| Arquivo | Linhas | Risco |
|---------|--------|-------|
| `flow-endpoint-handlers.ts` | 930 | Handlers de eventos de Flow (pode ter switch gigante) |
| `template-contract.ts` | 917 | Contrato de validação de templates |
| `template.service.ts` | 589 | Service que chama Meta API |
| `interactive.ts` | 410 | Builders de mensagens interativas |
| `media.ts` | 350 | Upload/gestão de mídia |

### O que auditar
- [ ] `flow-endpoint-handlers.ts`: há um switch/if gigante por tipo de evento?
- [ ] `template-contract.ts` vs `template.service.ts`: responsabilidades claramente separadas?
- [ ] `interactive.ts` + `text.ts` + `media.ts`: há funções de construção de payload duplicadas?
- [ ] `template-media-preview.ts` (378 linhas): é usado por quem? Poderia estar dentro de `media.ts`?
- [ ] Há validação de schema Zod duplicada entre `validators/template.schema.ts` e `template-contract.ts`?

### Refatoração esperada
- Extrair tabela de dispatch de `flow-endpoint-handlers.ts` (strategy pattern)
- Verificar se `template-media-preview.ts` pode ser absorvido por `media.ts`
- Unificar schemas de validação de template

---

## Camada 5: `lib/ai/` (✅ Auditado)

Concluído na sessão de 2026-04-03. Principais mudanças:
- `unified-ai-service.ts`: extraído `buildGatewayArgs`, tipagem discriminada
- `settings/ai/route.ts`: unificado `validateApiKey` REST-based para 4 providers

---

## Processo de Execução

Para cada camada:

```
1. Ler os arquivos-chave da camada
2. Buscar padrões específicos com grep/glob
3. Identificar top-3 problemas por impacto
4. Implementar fix + rodar testes
5. Commit com escopo claro (refactor(services): ...)
6. Marcar camada como concluída aqui
```

### Critério de conclusão por camada
- [ ] Nenhum padrão duplicado de alto impacto restante
- [ ] `npx tsc --noEmit` — zero erros
- [ ] `npx vitest run` — todos os testes passando
- [ ] Commit atômico por camada

---

## Status

| Camada | Status | Commit |
|--------|--------|--------|
| `lib/ai/` | ✅ Concluído | `3755214` |
| `services/` | ⏳ Pendente | — |
| `app/api/` erros | ⏳ Pendente | — |
| `hooks/` | ⏳ Pendente | — |
| `lib/whatsapp/` | ⏳ Pendente | — |
