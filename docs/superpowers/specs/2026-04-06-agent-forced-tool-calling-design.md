# Design: Fix — Agente para de responder via WhatsApp

**Data**: 2026-04-06
**Status**: Aprovado
**Branch**: fix/agent-forced-tool-calling

---

## Problema

O endpoint `POST /api/ai-agents/[id]/chat` falha com Error 500 de forma intermitente durante conversas via WhatsApp. O agente simplesmente não responde.

### Causa Raiz

O padrão atual usa dois tools em `generateText`:

1. `searchKnowledgeBase` — o LLM decide quando buscar na base de conhecimento
2. `respond` — o LLM **deveria** chamar para enviar a resposta estruturada

O problema: `toolChoice` padrão é `'auto'`, o que permite ao LLM gerar texto direto sem chamar nenhuma tool. Quando isso acontece, `structuredResponse` permanece `undefined` e o código lança:

```
throw new Error('Nenhuma resposta gerada pelo agente')
```

Agravante: `stopWhen: stepCountIs(3)` com RAG ativo pode esgotar os steps disponíveis em buscas antes de o modelo chamar `respond`.

### Evidências

- Erro intermitente (não determinístico) — depende do comportamento do LLM
- Acontece apenas no chat via WhatsApp (não no endpoint `/test`)
- Documentação oficial AI SDK (`loop-control.mdx`): *"toolChoice: 'required' forces the model to call a tool at every step instead of generating text directly"*
- Issue conhecido na comunidade Vercel: `NoOutputGeneratedError` ao combinar `Output.object()` + tools (descarta a Opção B)

---

## Solução: Forced Tool Calling Pattern

Padrão documentado oficialmente no AI SDK v6 (`loop-control.mdx`, seção *Forced Tool Calling*).

### Princípio

- `toolChoice: 'required'` → modelo **obrigado** a chamar um tool em cada step
- `respond` tool **sem `execute`** → quando chamado, para o loop automaticamente
- Resultado lido de `result.staticToolCalls` (tool calls sem execute)

### Comportamento resultante

```
Step 1: LLM chama searchKnowledgeBase (tem execute → continua)
Step 2: LLM chama respond (sem execute → loop para)
result.staticToolCalls = [{ toolName: 'respond', input: { message, sentiment, ... } }]
```

---

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `app/api/ai-agents/[id]/chat/route.ts` | Remover `execute` do `respondTool`, adicionar `toolChoice: 'required'`, aumentar `stopWhen` para 5, ler de `staticToolCalls` |
| `app/api/ai-agents/[id]/test/route.ts` | Mesmas mudanças (mesmo padrão, prevenir regressão) |

**Não mudar**: tipos, banco de dados, UI, outros endpoints, `lib/ai/`, `chat-agent.ts`.

---

## Implementação Detalhada

### `chat/route.ts`

**respondTool — remover execute:**
```typescript
// ANTES
const respondTool = tool({
  description: 'Envia uma resposta estruturada ao usuário. SEMPRE use esta ferramenta para responder.',
  inputSchema: responseSchema,
  execute: async (params) => {
    structuredResponse = { ...params, ... }
    return { success: true, message: params.message }
  },
})

// DEPOIS
const respondTool = tool({
  description: 'Envia uma resposta estruturada ao usuário. SEMPRE use esta ferramenta para responder.',
  inputSchema: responseSchema,
  // sem execute — para o loop quando chamado
})
```

**generateText — adicionar toolChoice e aumentar stopWhen:**
```typescript
// ANTES
await generateText({
  model,
  system: agent.system_prompt,
  messages: messages.map(...),
  temperature: agent.temperature ?? 0.7,
  maxOutputTokens: agent.max_tokens ?? 2048,
  tools,
  ...(searchKnowledgeBaseTool ? { stopWhen: stepCountIs(3) } : {}),
})

// DEPOIS
await generateText({
  model,
  system: agent.system_prompt,
  messages: messages.map(...),
  temperature: agent.temperature ?? 0.7,
  maxOutputTokens: agent.max_tokens ?? 2048,
  tools,
  toolChoice: 'required',
  stopWhen: stepCountIs(5),
})
```

**Extração do resultado — de closure para staticToolCalls:**
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
```

### `test/route.ts`

Mesmas três mudanças (removeu `execute` de `respondTool`, adicionou `toolChoice: 'required'`, aumentou `stopWhen`, lê de `staticToolCalls`).

---

## Fora do Escopo (PRs futuros)

| Problema | Motivo para não incluir agora |
|----------|-------------------------------|
| Sessões em memória (`Map<string, ChatSession>`) | Causa perda de contexto (não Error 500). Issue separada. |
| Migração para Redis | Dependência de infra, escopo maior. |
| `stopWhen` dinâmico por agent config | Over-engineering para o problema atual. |

---

## Verificação

1. `npm run build` sem erros TypeScript
2. Conversa de múltiplos turnos via chat endpoint com agente sem RAG → responde consistentemente
3. Conversa com agente com base de conhecimento indexada → busca + responde (não esgota steps)
4. Endpoint `/test` continua funcionando
5. `result.staticToolCalls` contém `respond` em 100% das execuções (não intermitente)
