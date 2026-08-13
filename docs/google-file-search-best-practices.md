# Google File Search - Melhores Práticas

> Documentação interna sobre o uso do Google File Search (RAG) com Gemini no SmartZap.
>
> **Última atualização:** 20 Janeiro 2026
> **Validado contra:** Documentação oficial Google, Vercel AI SDK v6, Google Gemini Cookbook

## Versões Requeridas

| Pacote | Versão Mínima | Versão Atual (SmartZap) | Notas |
|--------|---------------|-------------------------|-------|
| `@ai-sdk/google` | **3.0.5** | 3.0.10 ✅ | Gemini 3 File Search adicionado em 3.0.5 (6 Jan 2026) |
| `ai` | 6.0.x | 6.0.42 ✅ | Core do AI SDK |

### Changelog Relevante

- **@ai-sdk/google@3.0.5** (6 Jan 2026): `Add file support for Gemini 3 models` - PR #11163
- **@ai-sdk/google@3.0.6** (7 Jan 2026): `fix(google): parse structured output when using google provider tools`

> ⚠️ **Importante**: Versões anteriores a 3.0.5 NÃO suportam File Search com Gemini 3 (`gemini-3-pro-preview`, `gemini-3-flash-preview`)

## Regra de Ouro: Uma Tool por Chamada

**NUNCA combine `file_search` com outras tools na mesma chamada.**

> **Documentação Oficial do Google:**
> "**Tool incompatibility:** File Search cannot be combined with other tools like Grounding with Google Search, URL Context, etc. at this time."
> — [ai.google.dev/gemini-api/docs/file-search](https://ai.google.dev/gemini-api/docs/file-search)

O File Search é uma "provider-defined tool" do Google que tem comportamento especial - ele injeta contexto automaticamente e não pode ser combinado com tools customizadas (como nossa `respond` tool).

### Padrão Correto

| Cenário | Tools | Output | toolChoice |
|---------|-------|--------|------------|
| **COM** knowledge base | `file_search` apenas | texto plano | `auto` |
| **SEM** knowledge base | `respond` apenas | structured output | `required` |

### Código de Referência

```typescript
// COM knowledge base - File Search injeta contexto automaticamente
// ⚠️ IMPORTANTE: Usar 'prompt' (string) ao invés de 'messages' (array) para evitar timeout!
if (hasKnowledgeBase && agent.file_search_store_id) {
  const result = await generateText({
    model,
    system: agent.system_prompt,
    prompt: userMessage, // String única - NÃO usar messages array!
    tools: {
      file_search: google.tools.fileSearch({
        fileSearchStoreNames: [agent.file_search_store_id],
        topK: 5,
      }),
    },
    abortSignal: AbortSignal.timeout(30000), // 30s timeout recomendado
    // toolChoice: 'auto' (default) - modelo decide quando usar
  })

  // Resposta vem como texto plano
  const message = result.text
}

// SEM knowledge base - usar tool customizada para structured output
else {
  const respondTool = tool({
    description: 'Envia uma resposta estruturada ao usuário.',
    inputSchema: responseSchema,
    execute: async (params) => params,
  })

  await generateText({
    model,
    system: agent.system_prompt,
    messages: aiMessages, // Aqui pode usar messages array (sem File Search)
    tools: { respond: respondTool },
    toolChoice: 'required', // Força uso da tool
  })
}
```

## O que o File Search Faz Automaticamente

1. **Busca semântica** nos documentos indexados
2. **Injeta contexto relevante** no prompt (via `toolUsePromptTokens`)
3. **Retorna metadados de grounding** com citações das fontes

### Exemplo de Token Usage

```json
{
  "promptTokenCount": 379,        // Mensagem do usuário
  "toolUsePromptTokenCount": 3266, // Contexto injetado pelo File Search!
  "totalTokenCount": 4608
}
```

### Exemplo de Grounding Metadata

```json
{
  "groundingChunks": [
    {
      "retrievedContext": {
        "title": "documento.pdf",
        "text": "conteúdo relevante...",
        "fileSearchStore": "fileSearchStores/xxx"
      }
    }
  ],
  "groundingSupports": [
    {
      "segment": { "text": "parte da resposta" },
      "groundingChunkIndices": [0, 1]
    }
  ]
}
```

## File Search Store

### Formato do Nome
```
fileSearchStores/{display-name}-{random-id}
```

Exemplo: `fileSearchStores/smartzapagentjulia1df9618d-skkqie1sbq3h`

### Ciclo de Vida

1. **Criar store** ao configurar knowledge base do agente
2. **Upload de arquivos** - são chunked e indexados automaticamente
3. **Usar em queries** via `google.tools.fileSearch()`
4. **Deletar store** quando agente for removido

### Parâmetros Importantes

```typescript
google.tools.fileSearch({
  fileSearchStoreNames: [storeId], // Array de stores
  topK: 5,                          // Quantos chunks retornar (default: 5)
})
```

## Formatos de Arquivo Suportados

- PDF (com OCR automático)
- Markdown (.md)
- Texto (.txt)
- CSV
- JSON

## Erros Comuns

### 1. Combinar tools
```typescript
// ❌ ERRADO - não funciona
tools: {
  file_search: google.tools.fileSearch(...),
  respond: respondTool,  // Não pode combinar!
}

// ✅ CORRETO - uma tool por vez
tools: {
  file_search: google.tools.fileSearch(...),
}
```

### 2. Store não existe (403/404)
Se o store foi deletado ou nunca existiu, a API retorna erro. Sempre verificar se `file_search_store_id` é válido antes de usar.

### 3. Forçar toolChoice com File Search
```typescript
// ❌ ERRADO - pode causar comportamento inesperado
toolChoice: 'required'

// ✅ CORRETO - deixar o modelo decidir
toolChoice: 'auto' // ou omitir (default)
```

### 4. Usar `messages` array com File Search (TIMEOUT!)
```typescript
// ❌ ERRADO - pode causar timeout de 30s+
const result = await generateText({
  model,
  system: systemPrompt,
  messages: aiMessages,  // Array de mensagens causa problemas!
  tools: { file_search: google.tools.fileSearch(...) },
})

// ✅ CORRETO - usar prompt único
const result = await generateText({
  model,
  system: systemPrompt,
  prompt: userMessage,  // String única funciona corretamente
  tools: { file_search: google.tools.fileSearch(...) },
})
```

> ⚠️ **Descoberto em Jan 2026**: O File Search tem problemas de performance/timeout quando usado com array de mensagens (`messages`). Sempre usar `prompt` (string única) para evitar timeouts.

### 5. Incluir histórico de conversa com File Search

Como não podemos usar `messages` array, o histórico da conversa deve ser incluído no `prompt` como texto:

```typescript
// Formatar histórico como texto
function formatConversationHistory(messages: InboxMessage[]): string {
  const filtered = messages
    .filter((m) => m.message_type !== 'internal_note')
    .slice(-10) // Últimas 10 mensagens

  if (filtered.length <= 1) return ''

  const history = filtered.slice(0, -1) // Todas menos a última (atual)

  const formattedHistory = history
    .map((m) => {
      const role = m.direction === 'inbound' ? 'Cliente' : 'Assistente'
      return `${role}: ${m.content}`
    })
    .join('\n')

  return `---
HISTÓRICO DA CONVERSA ATUAL (use para contexto e personalização):
${formattedHistory}
---

Pergunta atual do cliente:`
}

// Usar no prompt
const conversationHistory = formatConversationHistory(messages)
const promptWithHistory = conversationHistory
  ? `${conversationHistory} ${inputText}`
  : inputText

const result = await generateText({
  model,
  system: agent.system_prompt,
  prompt: promptWithHistory, // Histórico + mensagem atual
  tools: { file_search: google.tools.fileSearch(...) },
})
```

> O formato com `---` delimitadores e "HISTÓRICO DA CONVERSA ATUAL" ajuda o modelo a distinguir entre contexto da conversa e contexto do File Search (documentos).

## System Prompt

**Use EXATAMENTE o que está configurado na UI.** Não adicione instruções extras.

O File Search já injeta contexto automaticamente - não precisa de:
- "Use as informações abaixo..."
- "Baseado no contexto fornecido..."
- Qualquer modificação do prompt original

## Modelos Suportados

Modelos que suportam File Search (Janeiro 2026):

- `gemini-3-pro-preview` ✅
- `gemini-3-flash-preview` ✅
- `gemini-2.5-pro` ✅
- `gemini-2.5-flash` ✅
- `gemini-2.5-flash-lite` ✅

**NÃO suportam File Search:**
- `gemini-2.0-flash` ❌
- `gemini-2.0-flash-lite` ❌

## Preços e Limites

### Preços (Janeiro 2026)

| Item | Preço |
|------|-------|
| Indexação | $0.15 por 1M tokens |
| **Storage** | **GRATUITO** |
| **Query embeddings** | **GRATUITO** |
| Tokens retornados | Preço normal de context tokens |

### Limites

| Limite | Valor |
|--------|-------|
| Max file size | 100 MB |
| Store size (Free tier) | 1 GB |
| Store size (Tier 1) | 10 GB |
| Store size (Tier 2) | 100 GB |
| Store size (Tier 3) | 1 TB |
| **Recomendado para latência ótima** | **< 20 GB** |

## Referências Oficiais

- [Vercel AI SDK - Google Provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai#file-search)
- [Google File Search Documentation](https://ai.google.dev/gemini-api/docs/file-search)
- [Google Gemini Cookbook - File Search](https://github.com/google-gemini/cookbook/blob/main/quickstarts/File_Search.ipynb)
- [File Search API Reference](https://ai.google.dev/api/file-search/file-search-stores)
