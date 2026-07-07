# Mem0 Integration - SmartZap

> Documentação completa para integração do Mem0 como camada de memória persistente no chat-agent do SmartZap.

## Sumário

1. [O que é Mem0](#o-que-é-mem0)
2. [Por que usar Mem0 no SmartZap](#por-que-usar-mem0-no-smartzap)
3. [Arquitetura da Integração](#arquitetura-da-integração)
4. [Conceitos Fundamentais](#conceitos-fundamentais)
5. [API Reference](#api-reference)
6. [Exemplos Práticos](#exemplos-práticos)
7. [Plano de Implementação](#plano-de-implementação)
8. [Custom Instructions para SmartZap](#custom-instructions-para-smartzap)
9. [Troubleshooting](#troubleshooting)

---

## O que é Mem0

Mem0 é uma **camada de memória auto-aprimorável para aplicações LLM**. Diferente de simplesmente armazenar mensagens, o Mem0:

- **Extrai fatos estruturados** das conversas automaticamente
- **Resolve conflitos** entre memórias antigas e novas
- **Busca semanticamente** - recupera apenas o que é relevante para a pergunta atual
- **Persiste entre sessões** - o bot lembra do usuário mesmo meses depois

### Mem0 vs RAG Tradicional

| Aspecto | RAG Tradicional | Mem0 |
|---------|-----------------|------|
| **Armazenamento** | Documentos/chunks fixos | Memórias extraídas dinamicamente |
| **Contexto** | Estático | Evolui com cada interação |
| **Personalização** | Por documento | Por usuário/sessão/agente |
| **Deduplicação** | Manual | Automática com conflict resolution |

---

## Por que usar Mem0 no SmartZap

### Problema Atual

O chat-agent do SmartZap usa apenas as **últimas 10 mensagens** como contexto:

```typescript
// chat-agent.ts linha 308
const aiMessages = convertToAIMessages(messages.slice(-10))
```

**Limitações:**
- Nova conversa = bot "esquece" tudo
- Contexto limitado a ~10 mensagens
- Não há personalização entre sessões
- Informações importantes se perdem

### Solução com Mem0

```
┌─────────────────────────────────────────────────────────────┐
│                     ANTES (sem Mem0)                        │
├─────────────────────────────────────────────────────────────┤
│  Conversa 1: "Meu nome é João, tenho pizzaria em SP"        │
│  Conversa 2: "Oi" → Bot: "Olá! Como posso ajudar?"          │
│  (Bot não lembra nada)                                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     DEPOIS (com Mem0)                       │
├─────────────────────────────────────────────────────────────┤
│  Conversa 1: "Meu nome é João, tenho pizzaria em SP"        │
│  Mem0 extrai: [nome: João, negócio: pizzaria, cidade: SP]   │
│  Conversa 2: "Oi" → Bot: "Olá João! Como está a pizzaria?"  │
└─────────────────────────────────────────────────────────────┘
```

---

## Arquitetura da Integração

### Abordagem: Standalone Functions

Usaremos as funções standalone do Mem0 (`retrieveMemories`, `addMemories`) em vez do provider wrapper (`mem0("gpt-4")`).

**Motivo:** O SmartZap já tem:
- Factory de providers (`createLanguageModel`)
- DevTools wrapper para debugging
- Sistema de tools complexo (respond, searchKnowledgeBase, sendBookingFlow)

### Fluxo Proposto

```
┌─────────────────────────────────────────────────────────────┐
│                   FLUXO COM MEM0                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Mensagem do WhatsApp chega                              │
│           ↓                                                 │
│  2. retrieveMemories(mensagem, { user_id: phone })          │
│     → Busca memórias relevantes do contato                  │
│           ↓                                                 │
│  3. Combina: system_prompt + memórias + últimas 10 msgs     │
│           ↓                                                 │
│  4. generateText() com nosso model normal                   │
│     (DevTools, tools, factory - tudo igual)                 │
│           ↓                                                 │
│  5. Resposta enviada ao usuário                             │
│           ↓                                                 │
│  6. addMemories() em background (não bloqueia)              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Mapeamento de Entidades

| SmartZap | Mem0 | Uso |
|----------|------|-----|
| `conversation.phone` | `user_id` | Memória persistente por contato |
| `agent.id` | `agent_id` | Memórias específicas de cada agente |
| `conversation.id` | `run_id` | Contexto de sessão (opcional) |
| `"smartzap"` | `app_id` | Identificador da aplicação |

---

## Conceitos Fundamentais

### 1. Entity Partitioning

Mem0 usa identificadores para separar memórias e evitar "vazamentos":

```typescript
// Cada contato tem suas próprias memórias
await addMemories(messages, {
  user_id: "5511999999999",     // Telefone do contato
  agent_id: "agent_abc123",     // ID do agente AI
  app_id: "smartzap",           // Identificador da app
  run_id: "conv_xyz789",        // ID da conversa (opcional)
})
```

**Importante:** Sempre use filtros ao buscar para evitar cross-contamination:

```typescript
// CORRETO: Busca com escopo
const memories = await retrieveMemories(query, {
  user_id: phone,
  agent_id: agentId,
})

// ERRADO: Busca sem escopo (pode trazer memórias de outros usuários)
const memories = await retrieveMemories(query, {})
```

### 2. Memory Inference

Por padrão (`infer=True`), o Mem0:
1. Extrai fatos estruturados das mensagens
2. Resolve conflitos com memórias existentes
3. Deduplica informações repetidas

```typescript
// Mensagens brutas
const messages = [
  { role: "user", content: "Meu nome é João e tenho uma pizzaria" },
  { role: "assistant", content: "Prazer, João! Como posso ajudar sua pizzaria?" },
]

// Mem0 extrai automaticamente:
// - "O usuário se chama João"
// - "O usuário tem uma pizzaria"
```

### 3. Custom Instructions

Controle o que o Mem0 extrai e armazena:

```typescript
const customInstructions = `
Regras de memória para assistente de WhatsApp:

ARMAZENAR:
- Nome do usuário
- Tipo de negócio/empresa
- Preferências de atendimento
- Problemas recorrentes
- Feedback sobre o serviço

IGNORAR:
- Saudações genéricas ("oi", "tudo bem?")
- Mensagens de teste
- Informações sensíveis (CPF, senhas)
- Especulações ("acho que", "talvez")

FORMATO:
Extrair fatos concisos e verificados.
`
```

### 4. Memory Search

Busca semântica com filtros:

```typescript
// Busca simples
const memories = await client.search("preferências do cliente", {
  filters: { user_id: phone }
})

// Busca com múltiplos filtros
const memories = await client.search("histórico de problemas", {
  filters: {
    AND: [
      { user_id: phone },
      { agent_id: agentId },
      { created_at: { gte: "2024-01-01" } }
    ]
  }
})
```

---

## API Reference

### Instalação

```bash
npm install @mem0/vercel-ai-provider
```

### Inicialização

```typescript
import { createMem0, addMemories, retrieveMemories, getMemories } from '@mem0/vercel-ai-provider'

// Opção 1: Provider wrapper (NÃO usaremos)
const mem0 = createMem0({
  provider: "google",
  mem0ApiKey: process.env.MEM0_API_KEY,
  apiKey: process.env.GEMINI_API_KEY,
})

// Opção 2: Funções standalone (USAREMOS)
// Não precisa de inicialização, apenas passar configs em cada chamada
```

### addMemories()

Salva interações como memórias:

```typescript
import { addMemories } from '@mem0/vercel-ai-provider'

const messages = [
  { role: "user", content: "Preciso de ajuda com entregas" },
  { role: "assistant", content: "Claro! Qual o problema com as entregas?" },
]

await addMemories(messages, {
  user_id: "5511999999999",
  agent_id: "support_agent",
  mem0ApiKey: process.env.MEM0_API_KEY,
})
```

**Parâmetros:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `messages` | `Array<{role, content}>` | Mensagens a processar |
| `user_id` | `string` | Identificador do usuário |
| `agent_id` | `string` | Identificador do agente (opcional) |
| `app_id` | `string` | Identificador da app (opcional) |
| `run_id` | `string` | Identificador da sessão (opcional) |
| `metadata` | `object` | Metadados customizados (opcional) |
| `mem0ApiKey` | `string` | API key do Mem0 |

### retrieveMemories()

Busca memórias relevantes como string formatada (para system prompt):

```typescript
import { retrieveMemories } from '@mem0/vercel-ai-provider'

const memoriesText = await retrieveMemories("preferências do cliente", {
  user_id: "5511999999999",
  agent_id: "support_agent",
  mem0ApiKey: process.env.MEM0_API_KEY,
})

// Retorna string formatada:
// "- O usuário se chama João
//  - O usuário tem uma pizzaria em São Paulo
//  - O usuário prefere atendimento rápido"
```

### getMemories()

Busca memórias como array de objetos (para processamento):

```typescript
import { getMemories } from '@mem0/vercel-ai-provider'

const { results, relations } = await getMemories("preferências", {
  user_id: "5511999999999",
  mem0ApiKey: process.env.MEM0_API_KEY,
  enable_graph: true, // Opcional: retorna relacionamentos
})

// results: Array<{ id, memory, created_at, ... }>
// relations: Array<{ source, relation, target }> (se enable_graph=true)
```

---

## Exemplos Práticos

### Exemplo 1: Chat com Memória (Node.js)

```typescript
import { generateText } from 'ai'
import { retrieveMemories, addMemories } from '@mem0/vercel-ai-provider'

async function chatWithMemory(
  userMessage: string,
  userId: string,
  model: LanguageModel
) {
  // 1. Buscar memórias relevantes
  const memories = await retrieveMemories(userMessage, {
    user_id: userId,
    mem0ApiKey: process.env.MEM0_API_KEY,
  })

  // 2. Construir system prompt com memórias
  const systemPrompt = `Você é um assistente prestativo.

## Memórias do Usuário
${memories || "Nenhuma memória disponível."}

Use estas informações para personalizar sua resposta.`

  // 3. Gerar resposta
  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: userMessage,
  })

  // 4. Salvar interação como memória (em background)
  addMemories([
    { role: "user", content: userMessage },
    { role: "assistant", content: text },
  ], {
    user_id: userId,
    mem0ApiKey: process.env.MEM0_API_KEY,
  }).catch(console.error)

  return text
}
```

### Exemplo 2: Support Agent com Memória

```typescript
import { MemoryClient } from 'mem0ai'

class SupportAgent {
  private client: MemoryClient
  private appId = "smartzap_support"

  constructor(apiKey: string) {
    this.client = new MemoryClient({ apiKey })
  }

  async handleQuery(query: string, userId: string) {
    // Buscar histórico do cliente
    const memories = await this.client.search(query, {
      filters: {
        AND: [
          { user_id: userId },
          { app_id: this.appId }
        ]
      }
    })

    // Formatar contexto
    const context = memories.results
      .map(m => `- ${m.memory}`)
      .join('\n')

    // Gerar resposta com contexto
    const response = await this.generateResponse(query, context)

    // Salvar interação
    await this.client.add([
      { role: "user", content: query },
      { role: "assistant", content: response }
    ], {
      user_id: userId,
      app_id: this.appId,
    })

    return response
  }
}
```

### Exemplo 3: Filtering de Memórias por Sessão

```typescript
// Memórias da sessão atual
const sessionMemories = await client.search("resumo", {
  filters: {
    AND: [
      { user_id: phone },
      { run_id: conversationId }
    ]
  }
})

// Memórias de todas as sessões do usuário
const allUserMemories = await client.search("preferências", {
  filters: {
    AND: [
      { user_id: phone },
      { run_id: "*" }  // Wildcard: qualquer sessão
    ]
  }
})
```

---

## Plano de Implementação

### Fase 1: Setup Básico

#### 1.1 Criar `lib/ai/mem0-client.ts`

```typescript
/**
 * Mem0 Client - Memória persistente para conversas
 *
 * Integra com Vercel AI SDK usando funções standalone
 * para máximo controle sobre quando memórias são salvas/recuperadas.
 */

import { addMemories, retrieveMemories, getMemories } from '@mem0/vercel-ai-provider'

// Types
export interface Mem0Config {
  user_id: string      // phone number do contato
  agent_id?: string    // ID do agente AI
  run_id?: string      // ID da conversa (sessão)
  app_id?: string      // Identificador da app
}

export interface MemoryContext {
  systemPromptAddition: string  // Memórias formatadas como system prompt
  memoryCount: number
  relations?: Array<{ source: string; relation: string; target: string }>
}

// Environment check
const MEM0_API_KEY = process.env.MEM0_API_KEY

export function isMem0Enabled(): boolean {
  return !!MEM0_API_KEY
}

/**
 * Recupera memórias relevantes para a conversa atual
 * Retorna texto formatado para adicionar ao system prompt
 */
export async function fetchRelevantMemories(
  query: string,
  config: Mem0Config
): Promise<MemoryContext> {
  if (!MEM0_API_KEY) {
    return { systemPromptAddition: '', memoryCount: 0 }
  }

  try {
    console.log(`[mem0] Fetching memories for user ${config.user_id}`)
    const startTime = Date.now()

    // Busca memórias relevantes como string formatada
    const memoriesText = await retrieveMemories(query, {
      user_id: config.user_id,
      agent_id: config.agent_id,
      mem0ApiKey: MEM0_API_KEY,
    })

    // Também busca memórias raw para contagem
    const { results } = await getMemories(query, {
      user_id: config.user_id,
      agent_id: config.agent_id,
      mem0ApiKey: MEM0_API_KEY,
    })

    console.log(`[mem0] Found ${results.length} memories in ${Date.now() - startTime}ms`)

    if (!memoriesText || results.length === 0) {
      return { systemPromptAddition: '', memoryCount: 0 }
    }

    // Formata como seção do system prompt
    const systemPromptAddition = `
## Memórias do Usuário
Você tem as seguintes informações sobre este usuário de conversas anteriores:

${memoriesText}

Use estas memórias para personalizar sua resposta, mas não mencione explicitamente que "lembra" dessas informações a menos que seja relevante.
`.trim()

    return {
      systemPromptAddition,
      memoryCount: results.length,
    }
  } catch (error) {
    console.error('[mem0] Error fetching memories:', error)
    return { systemPromptAddition: '', memoryCount: 0 }
  }
}

/**
 * Salva a interação atual como memória
 * Chamado APÓS resposta bem-sucedida (em background)
 */
export async function saveInteractionMemory(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  config: Mem0Config
): Promise<boolean> {
  if (!MEM0_API_KEY) {
    return false
  }

  try {
    console.log(`[mem0] Saving ${messages.length} messages for user ${config.user_id}`)

    await addMemories(messages, {
      user_id: config.user_id,
      agent_id: config.agent_id,
      app_id: config.app_id || 'smartzap',
      mem0ApiKey: MEM0_API_KEY,
    })

    console.log(`[mem0] Memories saved successfully`)
    return true
  } catch (error) {
    console.error('[mem0] Error saving memories:', error)
    return false
  }
}

/**
 * Deleta todas as memórias de um usuário
 * Útil para LGPD/GDPR compliance
 */
export async function deleteUserMemories(userId: string): Promise<boolean> {
  if (!MEM0_API_KEY) {
    return false
  }

  try {
    // Usar MemoryClient para delete (não disponível em standalone functions)
    const { MemoryClient } = await import('mem0ai')
    const client = new MemoryClient({ apiKey: MEM0_API_KEY })

    await client.deleteAll({ user_id: userId })
    console.log(`[mem0] Deleted all memories for user ${userId}`)
    return true
  } catch (error) {
    console.error('[mem0] Error deleting memories:', error)
    return false
  }
}
```

#### 1.2 Modificar `lib/ai/agents/chat-agent.ts`

Adicionar no topo:
```typescript
import {
  isMem0Enabled,
  fetchRelevantMemories,
  saveInteractionMemory,
  type Mem0Config
} from '@/lib/ai/mem0-client'
```

Adicionar após linha 308 (setup de messages):
```typescript
// =======================================================================
// MEM0: Buscar memórias persistentes do usuário
// =======================================================================
let memoryContext = { systemPromptAddition: '', memoryCount: 0 }

if (isMem0Enabled()) {
  const mem0Config: Mem0Config = {
    user_id: conversation.phone,  // Identificador único do contato
    agent_id: agent.id,           // Memórias por agente
    app_id: 'smartzap',
  }

  memoryContext = await fetchRelevantMemories(inputText, mem0Config)

  if (memoryContext.memoryCount > 0) {
    console.log(`[chat-agent] 🧠 Mem0: Found ${memoryContext.memoryCount} relevant memories`)
  }
}
```

Modificar construção do system prompt (linha 349):
```typescript
// Combina system prompt do agente + memórias do Mem0
const systemPrompt = memoryContext.systemPromptAddition
  ? `${agent.system_prompt}\n\n${memoryContext.systemPromptAddition}`
  : agent.system_prompt
```

Adicionar antes do return de sucesso (linha 555):
```typescript
// =======================================================================
// MEM0: Salvar interação como memória (em background)
// =======================================================================
if (isMem0Enabled() && response) {
  const interactionMessages = [
    { role: 'user' as const, content: inputText },
    { role: 'assistant' as const, content: response.message },
  ]

  // Não bloqueia a resposta
  saveInteractionMemory(interactionMessages, {
    user_id: conversation.phone,
    agent_id: agent.id,
    app_id: 'smartzap',
  }).catch(err => {
    console.error('[chat-agent] Failed to save memory:', err)
  })
}
```

#### 1.3 Adicionar variável de ambiente

```env
# .env.local
MEM0_API_KEY=m0-xxxxxxxxx
```

### Fase 2: Custom Instructions

Configurar no dashboard do Mem0 ou via API:

```typescript
const SMARTZAP_MEMORY_INSTRUCTIONS = `
Regras de memória para SmartZap (assistente de WhatsApp para negócios):

## ARMAZENAR (Alta Prioridade)
- Nome do usuário/contato
- Nome da empresa/negócio
- Tipo de negócio (pizzaria, loja, etc)
- Localização/cidade
- Preferências de atendimento
- Problemas recorrentes reportados
- Feedback sobre produtos/serviços
- Horários de preferência para contato
- Histórico de compras/pedidos relevantes

## ARMAZENAR (Média Prioridade)
- Interesses demonstrados
- Perguntas frequentes do usuário
- Contexto de conversas anteriores relevantes

## IGNORAR (Não Armazenar)
- Saudações genéricas ("oi", "bom dia", "tudo bem?")
- Mensagens de teste ou spam
- Informações sensíveis (CPF, senhas, dados bancários)
- Especulações ou incertezas ("acho que", "talvez", "não sei")
- Conversas puramente transacionais sem contexto

## FORMATO DE EXTRAÇÃO
- Extrair fatos concisos e verificados
- Usar formato: "[Categoria] Informação"
- Exemplo: "[Nome] João Silva"
- Exemplo: "[Negócio] Pizzaria em São Paulo"
- Exemplo: "[Preferência] Atendimento rápido e direto"

## CONFLITOS
- Informações novas substituem antigas (ex: mudança de endereço)
- Manter histórico de preferências que podem coexistir
`
```

### Fase 3: Feature Flag (Opcional)

Adicionar campo no `ai_agents`:

```sql
-- Migration
ALTER TABLE ai_agents
ADD COLUMN memory_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN ai_agents.memory_enabled IS
'Habilita memória persistente via Mem0 para este agente';
```

No código:
```typescript
if (isMem0Enabled() && agent.memory_enabled) {
  // ... usar Mem0
}
```

---

## Custom Instructions para SmartZap

### Instruções Recomendadas

```
# SmartZap Memory Instructions

## Objetivo
Extrair e armazenar informações relevantes sobre clientes de WhatsApp para personalizar atendimentos futuros.

## O Que Armazenar

### Dados do Cliente
- Nome completo ou como prefere ser chamado
- Empresa/negócio (se aplicável)
- Segmento de atuação
- Cidade/região

### Preferências
- Estilo de comunicação preferido (formal/informal)
- Horários de preferência para contato
- Canais alternativos mencionados
- Produtos/serviços de interesse

### Histórico Relevante
- Problemas recorrentes
- Reclamações feitas
- Elogios ou feedback positivo
- Compras ou pedidos importantes

### Contexto de Negócio
- Tamanho da operação (se mencionado)
- Desafios enfrentados
- Objetivos declarados

## O Que NÃO Armazenar

- Dados sensíveis (CPF, CNPJ, senhas, dados bancários)
- Mensagens de teste
- Saudações sem conteúdo informativo
- Informações especulativas ou não confirmadas
- Detalhes de transações individuais (usar sistema próprio)

## Formato de Extração

Usar formato estruturado:
- "[Nome] Maria Silva"
- "[Empresa] Loja ABC"
- "[Segmento] Moda feminina"
- "[Preferência] Respostas rápidas e objetivas"
- "[Problema Recorrente] Dificuldade com entregas"
```

---

## Troubleshooting

### Memórias não estão sendo salvas

1. Verificar se `MEM0_API_KEY` está configurada
2. Verificar logs para erros de API
3. Confirmar que `user_id` está sendo passado corretamente

### Memórias de usuários diferentes estão misturadas

1. Verificar se `user_id` é único por contato (usar telefone)
2. Adicionar `agent_id` para separar por agente
3. Usar filtros AND ao buscar

### Muitas memórias irrelevantes

1. Revisar custom instructions
2. Aumentar threshold de confiança
3. Adicionar mais itens à lista de "IGNORAR"

### Latência alta

1. Mem0 adiciona ~100-200ms de latência
2. Considerar cache local para memórias recentes
3. Usar `addMemories` em background (não bloqueante)

### Memórias não estão aparecendo nas buscas

1. Verificar se os filtros estão corretos
2. Usar wildcards (`*`) para busca mais ampla
3. Verificar se as memórias foram realmente salvas no dashboard

---

## Referências

- [Mem0 Documentation](https://docs.mem0.ai/introduction)
- [Vercel AI SDK Integration](https://docs.mem0.ai/integrations/vercel-ai-sdk)
- [Entity Partitioning Guide](https://docs.mem0.ai/cookbooks/essentials/entity-partitioning-playbook)
- [Control Memory Ingestion](https://docs.mem0.ai/cookbooks/essentials/controlling-memory-ingestion)
- [Memory Operations - Add](https://docs.mem0.ai/core-concepts/memory-operations/add)
- [Memory Operations - Search](https://docs.mem0.ai/core-concepts/memory-operations/search)
- [Support Agent Cookbook](https://docs.mem0.ai/cookbooks/operations/support-inbox)
- [Node.js Companion Cookbook](https://docs.mem0.ai/cookbooks/companions/nodejs-companion)

---

## Custos

| Plano | Memórias/mês | Preço |
|-------|--------------|-------|
| Free | 1,000 | $0 |
| Pro | 100,000 | $99/mês |
| Enterprise | Ilimitado | Custom |

Para SmartZap, o plano Free é suficiente para testes (~1000 conversas distintas por mês).

Estimar uso de produção: `número de contatos ativos × média de interações por contato`
