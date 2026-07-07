# Agent Forced Tool Calling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar Error 500 intermitente no chat via WhatsApp causado pelo LLM gerando texto direto sem chamar o tool `respond`.

**Architecture:** Aplicar o padrão "Forced Tool Calling" do AI SDK v6 — `toolChoice: 'required'` força o modelo a sempre chamar um tool; `respond` sem `execute` para o loop automaticamente; resultado lido de `result.staticToolCalls`.

**Tech Stack:** AI SDK v6 (`generateText`, `tool`, `stepCountIs`), TypeScript, Vitest (testes de integração)

---

## File Map

| Arquivo | Mudança |
|---------|---------|
| `app/api/ai-agents/[id]/chat/route.ts` | Remover `execute` do `respondTool`, adicionar `toolChoice: 'required'`, `stopWhen: stepCountIs(5)`, ler de `staticToolCalls` |
| `app/api/ai-agents/[id]/test/route.ts` | Mesmas mudanças (prevenir regressão no endpoint /test) |
| `tests/api/ai-agents/chat.test.ts` | Novo arquivo de testes de integração para chat/route.ts |
| `tests/api/ai-agents/test-endpoint.test.ts` | Novo arquivo de testes de integração para test/route.ts |

**NÃO mudar:** `lib/ai/`, `chat-agent.ts`, tipos, banco de dados, UI, outros endpoints.

---

## Task 1: Fix `chat/route.ts` — Forced Tool Calling

**Files:**
- Modify: `app/api/ai-agents/[id]/chat/route.ts`
- Create: `tests/api/ai-agents/chat.test.ts`

- [ ] **Step 1: Criar o arquivo de teste com testes que falham**

Criar `tests/api/ai-agents/chat.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks ANTES dos imports das rotas
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/ai/ai-center-config', () => ({
  getAiDirectConfig: vi.fn(),
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(),
}))

vi.mock('@/lib/ai/rag-store', () => ({
  findRelevantContent: vi.fn(),
  buildEmbeddingConfigFromAgent: vi.fn(),
  buildRerankConfigFromAgent: vi.fn(),
  hasIndexedContent: vi.fn(),
}))

vi.mock('@/lib/ai/devtools', () => ({
  withDevTools: vi.fn((model) => model),
}))

// Mock dinâmico do AI SDK
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    generateText: vi.fn(),
    tool: vi.fn((config) => config),
    stepCountIs: vi.fn((n) => n),
  }
})

import { POST } from '@/app/api/ai-agents/[id]/chat/route'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getAiDirectConfig } from '@/lib/ai/ai-center-config'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { hasIndexedContent } from '@/lib/ai/rag-store'
import { generateText } from 'ai'
import { NextRequest } from 'next/server'

function makeRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/ai-agents/test-id/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const mockAgent = {
  id: 'agent-1',
  name: 'Test Agent',
  system_prompt: 'Você é um assistente útil.',
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  max_tokens: 2048,
  handoff_enabled: false,
  embedding_provider: 'google',
  rag_max_results: 5,
  rag_similarity_threshold: 0.5,
}

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: mockAgent, error: null }),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSupabaseAdmin).mockReturnValue(mockSupabase as any)
  vi.mocked(getAiDirectConfig).mockResolvedValue({
    provider: 'google',
    model: 'gemini-2.5-flash',
    googleApiKey: 'test-key',
  })
  const mockModelFn = vi.fn().mockReturnValue({ type: 'mock-model' })
  vi.mocked(createGoogleGenerativeAI).mockReturnValue(mockModelFn as any)
  vi.mocked(hasIndexedContent).mockResolvedValue(false)
})

describe('POST /api/ai-agents/[id]/chat', () => {
  it('deve responder com sucesso quando o LLM chama o tool respond', async () => {
    // Simula staticToolCalls com o tool respond (padrão Forced Tool Calling)
    vi.mocked(generateText).mockResolvedValue({
      staticToolCalls: [
        {
          toolName: 'respond',
          input: {
            message: 'Olá! Como posso ajudar?',
            sentiment: 'positive',
            confidence: 0.9,
          },
        },
      ],
    } as any)

    const req = makeRequest({ message: 'Olá' })
    const ctx = { params: Promise.resolve({ id: 'agent-1' }) }
    const res = await POST(req, ctx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.message).toBe('Olá! Como posso ajudar?')
    expect(body.sentiment).toBe('positive')
    expect(body.confidence).toBe(0.9)
  })

  it('deve lançar 500 quando staticToolCalls não contém respond', async () => {
    // Simula LLM que não chamou respond (ex: chamou apenas searchKnowledgeBase)
    vi.mocked(generateText).mockResolvedValue({
      staticToolCalls: [],
    } as any)

    const req = makeRequest({ message: 'Olá' })
    const ctx = { params: Promise.resolve({ id: 'agent-1' }) }
    const res = await POST(req, ctx)

    expect(res.status).toBe(500)
  })

  it('deve chamar generateText com toolChoice required', async () => {
    vi.mocked(generateText).mockResolvedValue({
      staticToolCalls: [
        {
          toolName: 'respond',
          input: { message: 'OK', sentiment: 'neutral', confidence: 0.8 },
        },
      ],
    } as any)

    const req = makeRequest({ message: 'Teste' })
    const ctx = { params: Promise.resolve({ id: 'agent-1' }) }
    await POST(req, ctx)

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ toolChoice: 'required' })
    )
  })

  it('deve usar stopWhen com pelo menos 5 steps', async () => {
    vi.mocked(generateText).mockResolvedValue({
      staticToolCalls: [
        {
          toolName: 'respond',
          input: { message: 'OK', sentiment: 'neutral', confidence: 0.8 },
        },
      ],
    } as any)

    const { stepCountIs } = await import('ai')
    const req = makeRequest({ message: 'Teste' })
    const ctx = { params: Promise.resolve({ id: 'agent-1' }) }
    await POST(req, ctx)

    expect(stepCountIs).toHaveBeenCalledWith(expect.any(Number))
    const call = vi.mocked(stepCountIs).mock.calls[0][0]
    expect(call).toBeGreaterThanOrEqual(5)
  })

  it('deve retornar 400 quando body não tem message nem messages', async () => {
    const req = makeRequest({ invalid: true })
    const ctx = { params: Promise.resolve({ id: 'agent-1' }) }
    const res = await POST(req, ctx)

    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

```bash
cd /Users/thaleslaray/code/projetos/smartzap
npx vitest run tests/api/ai-agents/chat.test.ts
```

Esperado: **FAIL** — testes de `toolChoice: 'required'` e `staticToolCalls` falham porque `chat/route.ts` ainda usa o padrão antigo com `execute` e `toolChoice: 'auto'`.

- [ ] **Step 3: Implementar a correção em `chat/route.ts`**

**3a. Remover `execute` do `respondTool`** (linhas ~279 a 297):

```typescript
// ANTES
const respondTool = tool({
  description: 'Envia uma resposta estruturada ao usuário. SEMPRE use esta ferramenta para responder.',
  inputSchema: responseSchema,
  execute: async (params) => {
    const handoffParams = params as {
      shouldHandoff?: boolean
      handoffReason?: string
      handoffSummary?: string
    }
    structuredResponse = {
      ...params,
      shouldHandoff: handoffParams.shouldHandoff,
      handoffReason: handoffParams.handoffReason,
      handoffSummary: handoffParams.handoffSummary,
      sources: ragSources.length > 0 ? ragSources : params.sources,
    }
    return { success: true, message: params.message }
  },
})

// DEPOIS
const respondTool = tool({
  description: 'Envia uma resposta estruturada ao usuário. SEMPRE use esta ferramenta para responder.',
  inputSchema: responseSchema,
  // sem execute — para o loop quando chamado (Forced Tool Calling pattern)
})
```

**3b. Atualizar o `generateText` call** (linhas ~363 a 372):

```typescript
// ANTES
await generateText({
  model,
  system: agent.system_prompt,
  messages: messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  temperature: agent.temperature ?? 0.7,
  maxOutputTokens: agent.max_tokens ?? 2048,
  tools,
  ...(searchKnowledgeBaseTool ? { stopWhen: stepCountIs(3) } : {}),
})

// DEPOIS
const result = await generateText({
  model,
  system: agent.system_prompt,
  messages: messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  temperature: agent.temperature ?? 0.7,
  maxOutputTokens: agent.max_tokens ?? 2048,
  tools,
  toolChoice: 'required',
  stopWhen: stepCountIs(5),
})
```

**3c. Atualizar a extração do resultado** (linhas ~376 a 378):

```typescript
// ANTES
if (!structuredResponse) {
  throw new Error('Nenhuma resposta gerada pelo agente')
}

// DEPOIS
const respondCall = result.staticToolCalls.find(c => c.toolName === 'respond')
if (!respondCall) {
  throw new Error('Nenhuma resposta gerada pelo agente')
}
structuredResponse = respondCall.input as ChatResponse
// Adicionar fontes do RAG se disponíveis
if (ragSources.length > 0 && !structuredResponse.sources) {
  structuredResponse = { ...structuredResponse, sources: ragSources }
}
```

**3d. Remover a variável `structuredResponse` da closure** — ela não precisa mais ser mutada pelo `execute`:

A variável `let structuredResponse: ChatResponse | undefined` (linha ~268) **fica**, mas deixa de ser populada pelo `execute` do respondTool. Passa a ser populada após `generateText` via `respondCall.input`.

- [ ] **Step 4: Rodar os testes para confirmar que passam**

```bash
npx vitest run tests/api/ai-agents/chat.test.ts
```

Esperado: **PASS** — todos os 5 testes passam.

- [ ] **Step 5: Rodar build TypeScript para verificar tipos**

```bash
npm run build 2>&1 | head -50
```

Esperado: sem erros TypeScript relacionados a `staticToolCalls`, `toolChoice`, ou `respondCall`.

- [ ] **Step 6: Commit**

```bash
git add app/api/ai-agents/\[id\]/chat/route.ts tests/api/ai-agents/chat.test.ts
git commit -m "fix: forced tool calling em chat/route — elimina Error 500 intermitente

- Remove execute do respondTool (padrão Forced Tool Calling)
- Adiciona toolChoice: 'required' — modelo obrigado a chamar tool
- Aumenta stopWhen de 3 para 5 steps (evita esgotamento com RAG)
- Lê resposta de result.staticToolCalls em vez de closure

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Fix `test/route.ts` — Mesmas mudanças

**Files:**
- Modify: `app/api/ai-agents/[id]/test/route.ts`
- Create: `tests/api/ai-agents/test-endpoint.test.ts`

- [ ] **Step 1: Criar o arquivo de teste com testes que falham**

Criar `tests/api/ai-agents/test-endpoint.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/ai/ai-center-config', () => ({
  getAiDirectConfig: vi.fn(),
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(),
}))

vi.mock('@/lib/ai/rag-store', () => ({
  findRelevantContent: vi.fn(),
  buildEmbeddingConfigFromAgent: vi.fn(),
  hasIndexedContent: vi.fn(),
}))

vi.mock('@/lib/ai/devtools', () => ({
  withDevTools: vi.fn((model) => model),
}))

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    generateText: vi.fn(),
    tool: vi.fn((config) => config),
    stepCountIs: vi.fn((n) => n),
  }
})

import { POST } from '@/app/api/ai-agents/[id]/test/route'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getAiDirectConfig } from '@/lib/ai/ai-center-config'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { hasIndexedContent } from '@/lib/ai/rag-store'
import { generateText } from 'ai'
import { NextRequest } from 'next/server'

function makeRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/ai-agents/test-id/test', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const mockAgent = {
  id: 'agent-1',
  name: 'Test Agent',
  system_prompt: 'Você é um assistente útil.',
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  max_tokens: 1024,
  handoff_enabled: false,
  embedding_provider: 'google',
  rag_max_results: 5,
  rag_similarity_threshold: 0.5,
}

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: mockAgent, error: null }),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  count: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSupabaseAdmin).mockReturnValue(mockSupabase as any)
  vi.mocked(getAiDirectConfig).mockResolvedValue({
    provider: 'google',
    model: 'gemini-2.5-flash',
    googleApiKey: 'test-key',
  })
  const mockModelFn = vi.fn().mockReturnValue({ type: 'mock-model' })
  vi.mocked(createGoogleGenerativeAI).mockReturnValue(mockModelFn as any)
  vi.mocked(hasIndexedContent).mockResolvedValue(false)
})

describe('POST /api/ai-agents/[id]/test', () => {
  it('deve responder com sucesso lendo de staticToolCalls', async () => {
    vi.mocked(generateText).mockResolvedValue({
      staticToolCalls: [
        {
          toolName: 'respond',
          input: {
            message: 'Resposta de teste',
            sentiment: 'neutral',
            confidence: 0.85,
          },
        },
      ],
    } as any)

    const req = makeRequest({ message: 'Teste de agente' })
    const ctx = { params: Promise.resolve({ id: 'agent-1' }) }
    const res = await POST(req, ctx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.response).toBe('Resposta de teste')
    expect(body.sentiment).toBe('neutral')
    expect(body.confidence).toBe(0.85)
  })

  it('deve lançar 500 quando staticToolCalls não contém respond', async () => {
    vi.mocked(generateText).mockResolvedValue({
      staticToolCalls: [],
    } as any)

    const req = makeRequest({ message: 'Teste' })
    const ctx = { params: Promise.resolve({ id: 'agent-1' }) }
    const res = await POST(req, ctx)

    expect(res.status).toBe(500)
  })

  it('deve chamar generateText com toolChoice required', async () => {
    vi.mocked(generateText).mockResolvedValue({
      staticToolCalls: [
        {
          toolName: 'respond',
          input: { message: 'OK', sentiment: 'neutral', confidence: 0.8 },
        },
      ],
    } as any)

    const req = makeRequest({ message: 'Teste' })
    const ctx = { params: Promise.resolve({ id: 'agent-1' }) }
    await POST(req, ctx)

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ toolChoice: 'required' })
    )
  })

  it('deve retornar 400 para mensagem inválida', async () => {
    const req = makeRequest({ message: '' })
    const ctx = { params: Promise.resolve({ id: 'agent-1' }) }
    const res = await POST(req, ctx)

    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

```bash
npx vitest run tests/api/ai-agents/test-endpoint.test.ts
```

Esperado: **FAIL** — `test/route.ts` ainda usa padrão antigo.

- [ ] **Step 3: Implementar a correção em `test/route.ts`**

**3a. Remover `execute` do `respondTool`** (linhas ~188 a 204):

```typescript
// ANTES
const respondTool = tool({
  description: 'Envia uma resposta estruturada ao usuário. SEMPRE use esta ferramenta para responder.',
  inputSchema: responseSchema,
  execute: async (params) => {
    const handoffParams = params as {
      shouldHandoff?: boolean
      handoffReason?: string
    }
    structuredResponse = {
      ...params,
      shouldHandoff: handoffParams.shouldHandoff,
      handoffReason: handoffParams.handoffReason,
      sources: ragSources.length > 0 ? ragSources : params.sources,
    }
    return { success: true, message: params.message }
  },
})

// DEPOIS
const respondTool = tool({
  description: 'Envia uma resposta estruturada ao usuário. SEMPRE use esta ferramenta para responder.',
  inputSchema: responseSchema,
  // sem execute — para o loop quando chamado (Forced Tool Calling pattern)
})
```

**3b. Atualizar o `generateText` call** (linhas ~282 a 291):

```typescript
// ANTES
await generateText({
  model,
  system: systemPrompt,
  messages: [{ role: 'user' as const, content: message }],
  temperature: agent.temperature ?? 0.7,
  maxOutputTokens: agent.max_tokens ?? 1024,
  tools,
  ...(searchKnowledgeBaseTool ? { stopWhen: stepCountIs(3) } : {}),
})

// DEPOIS
const result = await generateText({
  model,
  system: systemPrompt,
  messages: [{ role: 'user' as const, content: message }],
  temperature: agent.temperature ?? 0.7,
  maxOutputTokens: agent.max_tokens ?? 1024,
  tools,
  toolChoice: 'required',
  stopWhen: stepCountIs(5),
})
```

**3c. Atualizar a extração do resultado** (linhas ~295 a 298):

```typescript
// ANTES
if (!structuredResponse) {
  throw new Error('No structured response generated from AI')
}

// DEPOIS
const respondCall = result.staticToolCalls.find(c => c.toolName === 'respond')
if (!respondCall) {
  throw new Error('No structured response generated from AI')
}
structuredResponse = respondCall.input as TestResponse
if (ragSources.length > 0 && !structuredResponse.sources) {
  structuredResponse = { ...structuredResponse, sources: ragSources }
}
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

```bash
npx vitest run tests/api/ai-agents/test-endpoint.test.ts
```

Esperado: **PASS** — todos os 4 testes passam.

- [ ] **Step 5: Rodar suite completa para garantir ausência de regressões**

```bash
npm run test 2>&1 | tail -20
```

Esperado: todos os testes existentes continuam passando.

- [ ] **Step 6: Build TypeScript final**

```bash
npm run build 2>&1 | grep -E "error TS|Error:" | head -20
```

Esperado: sem erros TypeScript.

- [ ] **Step 7: Commit final**

```bash
git add app/api/ai-agents/\[id\]/test/route.ts tests/api/ai-agents/test-endpoint.test.ts
git commit -m "fix: forced tool calling em test/route — consistência com chat/route

- Remove execute do respondTool (padrão Forced Tool Calling)
- Adiciona toolChoice: 'required'
- Aumenta stopWhen de 3 para 5 steps
- Lê resposta de result.staticToolCalls

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Verificação Manual

Após os dois tasks:

1. `npm run build` — sem erros TypeScript
2. Chat com agente sem RAG → responde consistentemente (não intermitente)
3. Chat com agente com base de conhecimento → busca + responde (não esgota steps)
4. Endpoint `/test` continua funcionando
5. `result.staticToolCalls` contém `respond` em 100% das execuções

---

## Fora do Escopo

| Problema | Motivo |
|----------|--------|
| Sessões em memória (`Map<string, ChatSession>`) | Causa perda de contexto, não Error 500. Issue separada. |
| Migração para Upstash Redis | Dependência de infra. |
| `stopWhen` dinâmico por config do agente | Over-engineering. |
