# Plano de Migração: Upstash Workflow + Vercel AI SDK

> Documento de análise e planejamento para otimização do processamento de IA no Inbox

**Data:** 2026-01-23
**Status:** Pesquisa Concluída - Aguardando Decisão

---

## 1. Resumo Executivo

### Problema Atual
O workflow de IA do inbox fica "travado" por tempo indeterminado porque:
1. `generateText()` dentro de `context.run()` não tem timeout nativo
2. A função serverless **espera** a resposta da IA, consumindo recursos
3. Se a IA demorar muito, o workflow pode exceder limites ou parecer congelado

### Solução Proposta
Migrar de `context.run()` para `context.call()` para chamadas de IA, permitindo que o **Upstash execute a chamada HTTP** em vez da função serverless.

---

## 2. Pesquisa: Vercel AI SDK + Upstash Workflow

### 2.1 Documentação Oficial do Vercel AI SDK

#### Integração com Upstash (ai-sdk.dev)
- **Chatbot Resume Streams**: Suporta reconexão de streams após page reload
- **Limitação conhecida**: `resume: true` **NÃO é compatível** com abort
- **Requisitos**: Redis + `resumable-stream` package
- **Uso principal**: Chat UI no browser (não nosso caso)

```typescript
// Exemplo do AI SDK - Resume Streams (para UI)
const { messages, sendMessage } = useChat({
  id: chatId,
  resume: true, // Reconecta após page reload
  transport: new DefaultChatTransport({...}),
});
```

#### Conclusão AI SDK
O AI SDK tem excelente suporte para **chat UI** com streams resumíveis, mas isso é para **frontend**. Nosso caso é **backend-to-backend** (WhatsApp).

---

### 2.2 Documentação Oficial do Upstash Workflow

#### context.run() vs context.call()

| Aspecto | context.run() | context.call() |
|---------|--------------|----------------|
| **Quem executa** | Sua função serverless | Upstash (em seu nome) |
| **Timeout máximo** | Limite da plataforma (Vercel ~10min) | **Até 2 horas** |
| **Consome compute** | Sim (enquanto espera) | **Não** |
| **Uso ideal** | Lógica interna, DB queries | HTTP requests longos, APIs de IA |
| **Retries** | Manual | Automático (configurável) |
| **Flow Control** | Não | Sim (rate limit, parallelism) |

#### context.call() - Características

```typescript
const { status, headers, body } = await context.call("ai-generate", {
  url: "https://api.openai.com/v1/chat/completions",
  method: "POST",
  body: { model: "gpt-4o", messages: [...] },
  headers: { authorization: `Bearer ${apiKey}` },
  retries: 3,
  retryDelay: "pow(2, retried) * 1000", // Exponential backoff
  timeout: 120, // 2 minutos
  flowControl: {
    key: "openai-calls",
    rate: 10,      // 10 requests/segundo
    parallelism: 5 // máximo 5 simultâneas
  }
});
```

#### context.api - Integrações Tipadas
Upstash oferece `context.api` com tipos para OpenAI, Anthropic e Resend:

```typescript
// Chamada tipada para OpenAI
const result = await context.api.openai.chat.completions({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }]
});
```

---

### 2.3 Blog Posts e Artigos

#### "Resumable LLM Streams" (Upstash Blog)
- **Problema**: Streams tradicionais quebram com network issues, page refresh, etc.
- **Solução**: Separar **Publisher** (geração) do **Subscriber** (entrega)
- **Arquitetura**:
  1. Cliente dispara geração (não mantém conexão)
  2. Workflow gera LLM output → publica no Redis
  3. Consumer lê Redis → envia para cliente via SSE

```
┌─────────┐     trigger     ┌─────────────┐    publish    ┌───────┐
│ Cliente │ ───────────────▶│ Workflow    │──────────────▶│ Redis │
└─────────┘                 │ (Generator) │               │Streams│
     │                      └─────────────┘               └───────┘
     │                                                         │
     │    SSE connection    ┌─────────────┐    subscribe       │
     └─────────────────────▶│ Consumer    │◀───────────────────┘
                            │ (API Route) │
                            └─────────────┘
```

**Conclusão**: Excelente para chat UI, mas **overengineering** para nosso caso (WhatsApp não precisa de SSE).

#### "AI SDK Powered by Upstash" (Upstash Blog)
Quatro padrões de integração:
1. **Cache com Redis** - Respostas de IA em cache
2. **Rate Limiting** - Limitar chamadas por usuário
3. **Search as Tool** - Upstash Vector como ferramenta
4. **Resumable Streams** - O padrão acima

---

### 2.4 Opiniões da Comunidade (Reddit)

#### r/nextjs - "How to Handle Long-Running Tasks on Vercel?"
- **Problema comum**: Vercel tem limite de 15min mesmo no Enterprise
- **Soluções populares**:
  1. Upstash Workflow/QStash
  2. Queue + Worker externo (Fly.io, Railway)
  3. Inngest
  4. AWS Step Functions

#### r/nextjs - "Long running server action"
- OpenAI API pode demorar 30+ segundos
- Recomendação: **Não espere na função** - use background jobs

---

## 3. Análise do Nosso Caso de Uso

### 3.1 Fluxo Atual (inbox-ai-workflow.ts)

```
1. Webhook recebe mensagem WhatsApp
2. Dispara Upstash Workflow
3. context.sleep() - debounce 5s
4. context.run("fetch-data") - busca conversa, agente, mensagens
5. context.run("process-ai") - ⚠️ AQUI ESTÁ O PROBLEMA
   └── generateText() dentro de context.run()
   └── Função serverless ESPERA a resposta
6. context.run("send-response") - envia via WhatsApp
7. context.run("cleanup") - limpa Redis
```

### 3.2 Por que context.run() é Problemático para IA

```typescript
// ATUAL - Problemático
const aiResult = await context.run('process-ai', async () => {
  const result = await generateText({...}) // ← Função ESPERA aqui
  return result
})
// A função serverless fica "ocupada" durante toda a geração
```

O `context.run()`:
- Executa código **dentro da sua função**
- A função **espera** o resultado
- Consome recursos enquanto espera
- Limitado pelo timeout da plataforma

### 3.3 Diferença para Chat UI vs WhatsApp

| Aspecto | Chat UI (Browser) | WhatsApp (Nosso caso) |
|---------|------------------|----------------------|
| **Entrega** | SSE/WebSocket | API Meta |
| **Reconexão** | Usuário pode dar refresh | Não aplicável |
| **Streaming** | Essencial para UX | Não suportado |
| **Resumable** | Crítico | Desnecessário |

**Conclusão**: Não precisamos de Resumable Streams. Precisamos apenas de **durabilidade** na geração.

---

## 4. Opções de Migração

### Opção A: context.call() para API interna (RECOMENDADA)

Criar uma API route interna que usa `generateText`, e chamá-la via `context.call()`.

```typescript
// api/internal/ai-generate/route.ts
export async function POST(req: Request) {
  const { agent, conversation, messages } = await req.json()

  const result = await generateText({
    model: google('gemini-3-flash-preview'),
    system: agent.system_prompt,
    messages: formatMessages(messages),
    tools: {...},
    toolChoice: 'required',
  })

  return Response.json(result)
}

// inbox-ai-workflow.ts
const aiResult = await context.call('process-ai', {
  url: `${process.env.NEXT_PUBLIC_APP_URL}/api/internal/ai-generate`,
  method: 'POST',
  body: { agent, conversation, messages },
  headers: { 'x-internal-key': process.env.INTERNAL_API_KEY },
  timeout: 120, // 2 minutos
  retries: 2,
})
```

**Prós:**
- Mantém Vercel AI SDK intacto
- Timeout configurável (até 2h)
- Retries automáticos
- Flow control disponível
- Não consome compute durante espera

**Contras:**
- Uma chamada HTTP adicional
- Precisa proteger a rota interna

---

### Opção B: context.api com OpenAI/Anthropic diretamente

Usar as integrações tipadas do Upstash para chamar providers diretamente.

```typescript
// inbox-ai-workflow.ts
const completion = await context.api.openai.chat.completions({
  model: 'gpt-4o',
  messages: [...],
  tools: [...],
})
```

**Prós:**
- Código mais simples
- Tipos automáticos
- Sem rota intermediária

**Contras:**
- ⚠️ Perde abstração do Vercel AI SDK
- ⚠️ Acoplado a um provider específico
- ⚠️ Tools têm formato diferente
- ⚠️ Difícil trocar de provider

---

### Opção C: Manter context.run() com melhorias (ATUAL)

Continuar usando `context.run()` mas com:
- AbortController + timeout (já implementado)
- `toolChoice: 'required'` (já implementado)
- Validação de system_prompt (já implementado)

**Prós:**
- Já implementado
- Funciona para a maioria dos casos

**Contras:**
- Ainda consome compute durante espera
- Timeout limitado pela plataforma
- Sem retries automáticos

---

## 5. Recomendação

### Abordagem em Fases

#### Fase 1: Estabilização (Concluída)
✅ Timeout com AbortController (90s)
✅ toolChoice: 'required'
✅ Validação de system_prompt
✅ Logs melhorados

#### Fase 2: Migração para context.call() (Concluída ✅)
✅ Criado `/api/internal/ai-generate` protegida por `SMARTZAP_API_KEY`
✅ Migrado `process-ai` de `context.run()` para `context.call()`
✅ Configurado retries (2) e timeout (120s)
✅ Exponential backoff para retries
- ⏳ Testar em produção

#### Fase 3: Otimizações (FUTURO)
- Flow control para rate limiting
- Métricas de performance
- Considerar streaming para futuras features

---

## 6. Implementação Proposta

### 6.1 Nova API Route Interna

```typescript
// app/api/internal/ai-generate/route.ts
import { processChatAgent } from '@/lib/ai/agents/chat-agent'

export async function POST(req: Request) {
  // Validar chave interna
  const internalKey = req.headers.get('x-internal-key')
  if (internalKey !== process.env.INTERNAL_API_KEY) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { agent, conversation, messages } = await req.json()

  const result = await processChatAgent({ agent, conversation, messages })

  return Response.json(result)
}
```

### 6.2 Workflow Migrado

```typescript
// inbox-ai-workflow.ts
const aiResult = await context.call<AIProcessResult>('process-ai', {
  url: `${process.env.NEXT_PUBLIC_APP_URL}/api/internal/ai-generate`,
  method: 'POST',
  body: JSON.stringify({ agent, conversation, messages }),
  headers: {
    'content-type': 'application/json',
    'x-internal-key': process.env.INTERNAL_API_KEY!,
  },
  timeout: 120,
  retries: 2,
  retryDelay: 'pow(2, retried) * 1000',
})

if (aiResult.status !== 200) {
  // Handle error
}

const { success, response, logId, error } = aiResult.body
```

---

## 7. Estimativa de Impacto

### Steps por Mensagem

| Cenário | Steps Atual | Steps Proposto | Diferença |
|---------|-------------|----------------|-----------|
| Sucesso | 5 | 5 | 0 |
| Com handoff | 6 | 6 | 0 |
| Com retry | 5 | 7 | +2 |

**Nota**: `context.call()` conta como 1 step, igual a `context.run()`.

### Custo

- **Atual**: ~$0.01 por 1000 mensagens (5 steps × $1/100K)
- **Proposto**: Igual (mesma quantidade de steps)
- **Com retries**: +$0.004 por retry

---

## 8. Conclusão

### Decisão Recomendada
**Opção A: context.call() para API interna**

### Justificativa
1. **Mantém Vercel AI SDK** - continua abstraindo providers
2. **Durabilidade** - Upstash aguarda até 2h
3. **Não consome compute** - função não fica "presa"
4. **Retries automáticos** - tratamento de falhas nativo
5. **Flow control** - rate limiting para escalar

### Próximos Passos
1. [x] Criar rota `/api/internal/ai-generate`
2. [x] Usar `SMARTZAP_API_KEY` existente (não precisa de nova variável)
3. [x] Migrar `context.run('process-ai')` para `context.call()`
4. [ ] Testar localmente com Cloudflare Tunnel
5. [ ] Deploy para produção
6. [ ] Monitorar métricas

---

## Referências

- [Upstash Workflow - context.call](https://upstash.com/docs/workflow/basics/context/call)
- [Vercel AI SDK - Resume Streams](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)
- [Resumable LLM Streams (Upstash Blog)](https://upstash.com/blog/resumable-llm-streams)
- [AI SDK Powered by Upstash](https://upstash.com/blog/ai-sdk-and-upstash)
- [Resumable AI SDK v5 Streams with Upstash Realtime](https://upstash.com/blog/realtime-ai-sdk)
