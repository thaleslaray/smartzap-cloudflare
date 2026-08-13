# Plano: RAG Próprio com Supabase pgvector

## Contexto

O Google File Search tem uma limitação fundamental: só funciona com `prompt` (string), não com `messages` (array). Isso impossibilita o uso adequado de histórico de conversa em chatbots multi-turn.

**Solução**: Criar RAG próprio usando Supabase pgvector + Vercel AI SDK, que permite usar `messages` normalmente.

## Arquitetura: Multi-Provider Configurável

### Princípios

1. **Usuário escolhe** o provider de embedding e reranking
2. **Reranking é opcional** - habilitado por agente
3. **API keys por provider** na tabela `settings`
4. **Fácil trocar** - só muda config, não código

### Providers Suportados

#### Embeddings

| Provider | Modelos | Dimensões | Preço/1M tokens |
|----------|---------|-----------|-----------------|
| Google | gemini-embedding-001 | 768 | $0.025 |
| Google | text-embedding-004 | 768 | $0.025 |
| OpenAI | text-embedding-3-large | 3072 | $0.13 |
| OpenAI | text-embedding-3-small | 1536 | $0.02 |
| Voyage | voyage-3.5, voyage-3.5-lite | 1024 | $0.06 |
| Cohere | embed-multilingual-v3.0 | 1024 | ~$0.10 |

#### Reranking (Opcional)

| Provider | Modelos | Preço/1M tokens |
|----------|---------|-----------------|
| Cohere | rerank-v3.5, rerank-english-v3.0, rerank-multilingual-v3.0 | ~$0.05 |
| Together.ai | Mxbai-Rerank-Large-V2, Salesforce/Llama-Rank-v1 | $0.10 |
| Amazon Bedrock | amazon.rerank-v1:0, cohere.rerank-v3-5:0 | Variável |

### Default Recomendado

- **Embedding**: Google `gemini-embedding-001` (já tem API key)
- **Reranking**: Desabilitado por padrão (opcional)

> **Nota**: Trocar de provider de embedding requer re-indexar documentos (dimensões diferentes).

## Arquitetura Proposta

```
Upload de arquivo → Chunking → Embedding (Gemini) → Supabase pgvector
                                                          ↓
Mensagem do usuário → Embedding query → Similarity search → Contexto injetado
                                                          ↓
                                              generateText com messages[]
```

## Fase 1: Database Schema

### 1.1 Habilitar pgvector no Supabase

```sql
-- Migration: enable_pgvector
CREATE EXTENSION IF NOT EXISTS vector;
```

### 1.2 Adicionar campos de config RAG na tabela ai_agents

```sql
-- Migration: add_rag_config_to_agents
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS embedding_provider TEXT DEFAULT 'google';
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'gemini-embedding-001';
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER DEFAULT 768;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS rerank_enabled BOOLEAN DEFAULT false;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS rerank_provider TEXT;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS rerank_model TEXT;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS rerank_top_k INTEGER DEFAULT 5;
```

### 1.3 Criar tabela de embeddings (dimensões variáveis)

```sql
-- Migration: create_embeddings_table
-- Nota: Usamos 3072 como máximo (OpenAI text-embedding-3-large)
-- Vetores menores são compatíveis com índices maiores
CREATE TABLE ai_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  file_id UUID REFERENCES ai_knowledge_files(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(3072) NOT NULL, -- Máximo suportado
  dimensions INTEGER NOT NULL, -- Dimensões reais usadas
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index HNSW para busca eficiente
CREATE INDEX ai_embeddings_embedding_idx ON ai_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Index para filtrar por agent
CREATE INDEX ai_embeddings_agent_id_idx ON ai_embeddings(agent_id);
```

### 1.4 Função de busca por similaridade (com validação de dimensões)

```sql
-- Migration: create_similarity_search_function
CREATE OR REPLACE FUNCTION search_embeddings(
  query_embedding VECTOR(3072),
  agent_id_filter UUID,
  expected_dimensions INTEGER,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.content,
    1 - (e.embedding <=> query_embedding) AS similarity,
    e.metadata
  FROM ai_embeddings e
  WHERE e.agent_id = agent_id_filter
    AND e.dimensions = expected_dimensions -- Só busca vetores compatíveis
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

## Fase 2: Lógica de Embedding

### 2.1 Novo arquivo: `lib/ai/embeddings.ts`

```typescript
import { embed, embedMany } from 'ai'
import type { EmbeddingModel } from 'ai'

// =============================================================================
// Types
// =============================================================================

export type EmbeddingProvider = 'google' | 'openai' | 'voyage' | 'cohere'

export interface EmbeddingConfig {
  provider: EmbeddingProvider
  model: string
  dimensions: number
  apiKey: string
}

// =============================================================================
// Provider Factory
// =============================================================================

async function getEmbeddingModel(config: EmbeddingConfig): Promise<EmbeddingModel<string>> {
  switch (config.provider) {
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey })
      return google.embedding(config.model)
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      const openai = createOpenAI({ apiKey: config.apiKey })
      return openai.embedding(config.model)
    }
    case 'voyage': {
      const { createVoyage } = await import('voyage-ai-provider')
      const voyage = createVoyage({ apiKey: config.apiKey })
      return voyage.embeddingModel(config.model)
    }
    case 'cohere': {
      const { createCohere } = await import('@ai-sdk/cohere')
      const cohere = createCohere({ apiKey: config.apiKey })
      return cohere.embedding(config.model)
    }
    default:
      throw new Error(`Unsupported embedding provider: ${config.provider}`)
  }
}

// =============================================================================
// Embedding Functions
// =============================================================================

export async function generateEmbedding(
  text: string,
  config: EmbeddingConfig,
  taskType: 'query' | 'document' = 'query'
): Promise<number[]> {
  const model = await getEmbeddingModel(config)

  const { embedding } = await embed({
    model,
    value: text,
    providerOptions: getProviderOptions(config, taskType),
  })

  return embedding
}

export async function generateEmbeddings(
  texts: string[],
  config: EmbeddingConfig,
  taskType: 'query' | 'document' = 'document'
): Promise<number[][]> {
  const model = await getEmbeddingModel(config)

  const { embeddings } = await embedMany({
    model,
    values: texts,
    providerOptions: getProviderOptions(config, taskType),
  })

  return embeddings
}

// Provider-specific options
function getProviderOptions(config: EmbeddingConfig, taskType: 'query' | 'document') {
  switch (config.provider) {
    case 'google':
      return {
        google: {
          outputDimensionality: config.dimensions,
          taskType: taskType === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
        },
      }
    case 'voyage':
      return {
        voyage: {
          inputType: taskType,
          outputDimension: config.dimensions,
        },
      }
    default:
      return {}
  }
}

// =============================================================================
// Chunking
// =============================================================================

const CHUNK_SIZE = 1000
const CHUNK_OVERLAP = 200

export function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length)
    chunks.push(text.slice(start, end))
    start = end - CHUNK_OVERLAP
  }

  return chunks.filter(c => c.trim().length > 50)
}
```

### 2.2 Novo arquivo: `lib/ai/reranking.ts`

```typescript
import { rerank } from 'ai'

// =============================================================================
// Types
// =============================================================================

export type RerankProvider = 'cohere' | 'together' | 'bedrock'

export interface RerankConfig {
  provider: RerankProvider
  model: string
  apiKey: string
  topK?: number
}

export interface RerankResult {
  content: string
  score: number
  originalIndex: number
}

// =============================================================================
// Provider Factory
// =============================================================================

async function getRerankModel(config: RerankConfig) {
  switch (config.provider) {
    case 'cohere': {
      const { createCohere } = await import('@ai-sdk/cohere')
      const cohere = createCohere({ apiKey: config.apiKey })
      return cohere.reranking(config.model)
    }
    case 'together': {
      const { createTogetherAI } = await import('@ai-sdk/togetherai')
      const together = createTogetherAI({ apiKey: config.apiKey })
      return together.reranking(config.model)
    }
    // bedrock requires AWS credentials setup
    default:
      throw new Error(`Unsupported rerank provider: ${config.provider}`)
  }
}

// =============================================================================
// Rerank Function
// =============================================================================

export async function rerankDocuments(
  query: string,
  documents: string[],
  config: RerankConfig
): Promise<RerankResult[]> {
  const model = await getRerankModel(config)

  const { ranking } = await rerank({
    model,
    query,
    documents,
    topN: config.topK ?? 5,
  })

  return ranking.map(r => ({
    content: r.document,
    score: r.score,
    originalIndex: r.originalIndex,
  }))
}
```

> **Nota**: Reranking é opcional e só executa se `agent.rerank_enabled = true`.

### 2.3 Novo arquivo: `lib/ai/rag-store.ts`

```typescript
import { getSupabaseAdmin } from '@/lib/supabase'
import { chunkText, generateEmbedding, generateEmbeddings } from './embeddings'

// Indexar um documento
export async function indexDocument(params: {
  agentId: string
  fileId: string
  content: string
  apiKey: string
  metadata?: Record<string, unknown>
}): Promise<{ chunksIndexed: number }> {
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('Supabase not configured')

  const chunks = chunkText(params.content)
  const embeddings = await generateEmbeddings(chunks, params.apiKey)

  // Inserir em batch
  const rows = chunks.map((content, i) => ({
    agent_id: params.agentId,
    file_id: params.fileId,
    content,
    embedding: `[${embeddings[i].join(',')}]`, // pgvector format
    metadata: params.metadata || {},
  }))

  const { error } = await supabase
    .from('ai_embeddings')
    .insert(rows)

  if (error) throw error

  return { chunksIndexed: chunks.length }
}

// Buscar conteúdo relevante
export async function findRelevantContent(params: {
  agentId: string
  query: string
  apiKey: string
  topK?: number
  threshold?: number
}): Promise<Array<{ content: string; similarity: number }>> {
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('Supabase not configured')

  const queryEmbedding = await generateEmbedding(params.query, params.apiKey)

  const { data, error } = await supabase.rpc('search_embeddings', {
    query_embedding: `[${queryEmbedding.join(',')}]`,
    agent_id_filter: params.agentId,
    match_threshold: params.threshold ?? 0.5,
    match_count: params.topK ?? 5,
  })

  if (error) throw error

  return data || []
}

// Deletar embeddings de um arquivo
export async function deleteFileEmbeddings(fileId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('ai_embeddings')
    .delete()
    .eq('file_id', fileId)

  if (error) throw error
}

// Deletar todos embeddings de um agente
export async function deleteAgentEmbeddings(agentId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('ai_embeddings')
    .delete()
    .eq('agent_id', agentId)

  if (error) throw error
}
```

## Fase 3: Integração com Support Agent

### 3.1 Modificar `support-agent-v2.ts`

O agente agora pode usar `messages` array normalmente:

```typescript
// ANTES: File Search com prompt string (hacky)
if (hasKnowledgeBase) {
  const result = await generateText({
    model,
    system: agent.system_prompt,
    prompt: promptWithHistory, // String com histórico formatado
    tools: { file_search: google.tools.fileSearch(...) },
  })
}

// DEPOIS: RAG próprio com messages array (correto!)
if (hasKnowledgeBase) {
  // 1. Buscar contexto relevante
  const relevantContent = await findRelevantContent({
    agentId: agent.id,
    query: inputText,
    apiKey,
  })

  // 2. Injetar contexto no system prompt
  const contextualPrompt = relevantContent.length > 0
    ? `${agent.system_prompt}\n\n---\nCONTEXTO DA BASE DE CONHECIMENTO:\n${relevantContent.map(c => c.content).join('\n\n')}\n---`
    : agent.system_prompt

  // 3. Usar messages normalmente!
  const result = await generateText({
    model,
    system: contextualPrompt,
    messages: aiMessages, // Array de mensagens funciona!
    tools: { respond: respondTool },
    toolChoice: 'required',
  })
}
```

## Fase 4: Atualizar Fluxo de Upload

### 4.1 Modificar endpoint de upload de arquivos

Em vez de criar Google File Search Store, indexar localmente:

```typescript
// app/api/ai-agents/[id]/knowledge/route.ts
export async function POST(request: NextRequest, context: RouteContext) {
  // ... validação e upload para storage ...

  // Extrair texto do arquivo (PDF, TXT, MD)
  const textContent = await extractTextFromFile(file)

  // Indexar no pgvector
  const { chunksIndexed } = await indexDocument({
    agentId: agent.id,
    fileId: knowledgeFile.id,
    content: textContent,
    apiKey: geminiApiKey,
    metadata: { filename: file.name },
  })

  // Atualizar status
  await supabase
    .from('ai_knowledge_files')
    .update({
      indexing_status: 'completed',
      chunks_count: chunksIndexed,
    })
    .eq('id', knowledgeFile.id)
}
```

## Fase 5: Migração

### 5.1 Remover dependência do Google File Search

1. Remover coluna `file_search_store_id` de `ai_agents` (ou manter deprecated)
2. Atualizar `ai_knowledge_files` com nova coluna `chunks_count`
3. Re-indexar arquivos existentes no pgvector

### 5.2 Migration script

```sql
-- Migration: add_chunks_count_to_knowledge_files
ALTER TABLE ai_knowledge_files
  ADD COLUMN IF NOT EXISTS chunks_count INTEGER DEFAULT 0;
```

## Verificação

### Testes a executar:

1. **Unit test**: Chunking divide texto corretamente
2. **Unit test**: Embedding retorna vetor com 768 dimensões
3. **Integration test**: Indexar documento e buscar por similaridade
4. **E2E test**: Conversa multi-turn com RAG mantém histórico

### Critérios de sucesso:

- [ ] Bot responde usando contexto da knowledge base
- [ ] Histórico de conversa funciona corretamente (messages[])
- [ ] Latência < 3s para busca + resposta
- [ ] Custos de embedding dentro do esperado

## Dependências NPM

```bash
# Providers de embedding/reranking (instalar conforme necessário)
npm install voyage-ai-provider    # Voyage AI (community)
npm install @ai-sdk/cohere        # Cohere (embeddings + rerank)
npm install @ai-sdk/togetherai    # Together.ai (rerank)
# @ai-sdk/google já instalado
# @ai-sdk/openai se quiser usar OpenAI embeddings
```

## Arquivos a criar/modificar

| Arquivo | Ação |
|---------|------|
| `lib/ai/embeddings.ts` | **Criar** - Factory multi-provider |
| `lib/ai/reranking.ts` | **Criar** - Reranking opcional |
| `lib/ai/rag-store.ts` | **Criar** - Indexação e busca |
| `lib/ai/agents/support-agent-v2.ts` | **Modificar** - Usar RAG próprio |
| `app/api/ai-agents/[id]/knowledge/route.ts` | **Modificar** - Indexar no pgvector |
| `components/features/settings/ai-agents/AIAgentForm.tsx` | **Modificar** - UI config RAG |
| `supabase/migrations/xxx_enable_pgvector.sql` | **Criar** |
| `supabase/migrations/xxx_add_rag_config.sql` | **Criar** |
| `supabase/migrations/xxx_create_embeddings.sql` | **Criar** |
| `lib/ai/file-search-store.ts` | **Deprecar** (manter para rollback) |
| `types.ts` | **Modificar** - Adicionar tipos RAG |

## Rollback

Se necessário reverter:
1. A coluna `file_search_store_id` ainda existe
2. O código do Google File Search está em branch separado
3. Basta trocar a flag `useCustomRag` para `false`

## Estimativa

- Fase 1 (Database): 30min
- Fase 2 (Embeddings): 1h
- Fase 3 (Integration): 1h
- Fase 4 (Upload flow): 45min
- Fase 5 (Migration): 30min
- Testes: 1h

**Total: ~5h de desenvolvimento**
