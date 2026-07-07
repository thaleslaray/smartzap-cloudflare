# Plano: Inbox + AI Agents SmartZap (Implementação Completa)

## Visão Geral

Implementar um módulo de **Live Chat (Inbox)** + **AI Agents** completo no SmartZap, inspirado no ManyChat, que:
- Armazena **TODAS** as mensagens inbound (atualmente são descartadas)
- Permite que operadores respondam leads em tempo real
- Integra com workflows existentes (pause/resume automation)
- **AI Agents com Vercel AI SDK v6** usando:
  - `ToolLoopAgent` para agentes reutilizáveis
  - `Call Options` para contexto dinâmico por request
  - `Structured Output + Tools` para resposta + sentiment + tags em 1 chamada
  - `google.tools.fileSearch()` (Provider Tool nativo) para RAG
  - Handoff inteligente tool-based (IA decide, não keywords)

---

## Arquitetura de Alto Nível

```
┌───────────────────────────────────────────────────────────────────────┐
│                   SmartZap Inbox + AI Agents                           │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   WhatsApp Cloud API                                                   │
│         │                                                              │
│         ▼                                                              │
│   ┌─────────────┐     ┌──────────────────┐                            │
│   │   Webhook   │────▶│  inbox_messages  │◀──── Realtime ───┐         │
│   └─────────────┘     └──────────────────┘                  │         │
│         │                     │                              │         │
│         │                     ▼                              │         │
│         │             ┌──────────────────┐                   │         │
│         │             │inbox_conversations│◀──── Realtime ──┤         │
│         │             └──────────────────┘                  │         │
│         │                     │                              │         │
│         ▼                     ▼                              ▼         │
│   ┌─────────────┐     ┌──────────────────┐        ┌───────────────┐   │
│   │  Workflows  │◀───▶│  Inbox UI (React)│        │   AI Agent    │   │
│   └─────────────┘     └──────────────────┘        │ (Gemini +     │   │
│                                                    │  File Search) │   │
│                                                    └───────┬───────┘   │
│                                                            │           │
│                                                            ▼           │
│                                                    ┌───────────────┐   │
│                                                    │ Google File   │   │
│                                                    │ Search Store  │   │
│                                                    │ (RAG managed) │   │
│                                                    └───────────────┘   │
│                                                                        │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Fases de Implementação (Integrada)

> **Abordagem**: Implementação completa em fases sequenciais, cada fase entrega valor funcional.

### Fase 1: Schema Completo (Inbox + AI Agents)
- Migration única com todas as tabelas
- Tipos TypeScript completos
- Funções e triggers do banco

### Fase 2: Webhook + Persistência
- Persistir TODAS mensagens inbound
- Criar/atualizar conversas automaticamente
- Lógica de pause/resume automation

### Fase 3: API Endpoints (Inbox + AI)
- CRUD conversas, mensagens, labels
- CRUD AI agents
- Endpoints de envio (text, template)
- File Search Store management

### Fase 4: Frontend Inbox
- Layout 3 colunas (sidebar, lista, chat)
- Realtime com Supabase
- Envio de mensagens
- Quick replies

### Fase 5: AI Agents Funcionais
- UI de configuração de agents
- Integração File Search no webhook
- Test chat
- Handoff para humano

### Fase 6: Integração Final + Testes
- Fluxo completo end-to-end
- Métricas básicas
- Polish e otimizações

**Total estimado: 12-18 dias**

---

## Fase 1: Schema Completo (Inbox + AI Agents)

### 1.1 Migration Única: `0034_add_inbox_and_ai_agents.sql`

> **Nota**: Uma única migration com todo o schema necessário para Inbox e AI Agents.

```sql
-- =============================================================================
-- INBOX CONVERSATIONS - Thread de conversa por contato
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inbox_conversations (
  id TEXT PRIMARY KEY DEFAULT concat('ic_', replace(gen_random_uuid()::text, '-', '')),

  -- Identificação
  phone TEXT NOT NULL,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'open', -- open, closed, snoozed
  channel TEXT NOT NULL DEFAULT 'whatsapp',

  -- Modo de atendimento
  mode TEXT NOT NULL DEFAULT 'bot', -- bot, human, hybrid
  assigned_to TEXT,
  assigned_at TIMESTAMPTZ,

  -- Integração com Workflows
  active_workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL,
  workflow_paused BOOLEAN DEFAULT FALSE,
  workflow_paused_at TIMESTAMPTZ,
  workflow_paused_by TEXT, -- 'operator' | 'system'
  workflow_resume_at TIMESTAMPTZ,

  -- Métricas
  message_count INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,
  inbound_count INTEGER NOT NULL DEFAULT 0,
  outbound_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,

  -- Organização
  labels JSONB DEFAULT '[]'::jsonb,
  priority TEXT DEFAULT 'normal', -- low, normal, high, urgent

  -- Preparação para IA
  ai_sentiment TEXT, -- positive, neutral, negative
  ai_intent TEXT,
  ai_urgency TEXT,
  ai_tags JSONB DEFAULT '[]'::jsonb,
  ai_summary TEXT,
  ai_last_analyzed_at TIMESTAMPTZ,

  -- Bookkeeping
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_inbox_conv_phone ON inbox_conversations(phone);
CREATE INDEX idx_inbox_conv_contact ON inbox_conversations(contact_id);
CREATE INDEX idx_inbox_conv_status ON inbox_conversations(status, last_message_at DESC);
CREATE INDEX idx_inbox_conv_unread ON inbox_conversations(unread_count) WHERE unread_count > 0;
CREATE INDEX idx_inbox_conv_mode ON inbox_conversations(mode, status);
CREATE INDEX idx_inbox_conv_labels ON inbox_conversations USING gin(labels);

-- =============================================================================
-- INBOX MESSAGES - Todas as mensagens (inbound + outbound)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id TEXT PRIMARY KEY DEFAULT concat('im_', replace(gen_random_uuid()::text, '-', '')),

  -- Relacionamentos
  conversation_id TEXT NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,

  -- Identificação WhatsApp
  wa_message_id TEXT,
  waba_id TEXT,
  phone_number_id TEXT,

  -- Direção e Origem
  direction TEXT NOT NULL, -- inbound, outbound
  source TEXT NOT NULL DEFAULT 'user', -- user, operator, bot, campaign, workflow

  -- Conteúdo
  message_type TEXT NOT NULL, -- text, image, video, audio, document, template, interactive, etc
  text_body TEXT,
  caption TEXT,

  -- Media
  media_id TEXT,
  media_url TEXT,
  media_mime_type TEXT,
  media_filename TEXT,

  -- Template (outbound)
  template_name TEXT,
  template_variables JSONB,

  -- Dados estruturados
  interactive_data JSONB,
  location_data JSONB,
  contacts_data JSONB,
  reaction_data JSONB,
  context_data JSONB, -- Reply-to message

  -- Status de entrega (outbound)
  delivery_status TEXT DEFAULT 'pending', -- pending, sent, delivered, read, failed
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_code INTEGER,
  failure_reason TEXT,

  -- Preparação para IA (por mensagem)
  ai_sentiment TEXT,
  ai_intent TEXT,
  ai_entities JSONB,
  ai_analyzed_at TIMESTAMPTZ,

  -- Payload original (debug)
  raw_payload JSONB,

  -- Timestamps
  message_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX idx_inbox_msg_wa_id ON inbox_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX idx_inbox_msg_conv ON inbox_messages(conversation_id, created_at DESC);
CREATE INDEX idx_inbox_msg_direction ON inbox_messages(direction);
CREATE INDEX idx_inbox_msg_created ON inbox_messages(created_at DESC);

-- =============================================================================
-- INBOX LABELS - Labels para organização
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inbox_labels (
  id TEXT PRIMARY KEY DEFAULT concat('il_', replace(gen_random_uuid()::text, '-', '')),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6B7280',
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  conversation_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INBOX QUICK REPLIES - Respostas rápidas (Canned Responses)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inbox_quick_replies (
  id TEXT PRIMARY KEY DEFAULT concat('iqr_', replace(gen_random_uuid()::text, '-', '')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  shortcut TEXT, -- e.g., "/ola"
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TRIGGERS - Atualizar métricas automaticamente
-- =============================================================================
CREATE OR REPLACE FUNCTION update_conversation_on_inbound()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE inbox_conversations SET
      message_count = message_count + 1,
      inbound_count = inbound_count + 1,
      unread_count = unread_count + 1,
      last_message_at = COALESCE(NEW.created_at, NOW()),
      last_inbound_at = COALESCE(NEW.created_at, NOW()),
      first_message_at = COALESCE(first_message_at, NEW.created_at, NOW()),
      updated_at = NOW()
    WHERE id = NEW.conversation_id;
  ELSIF NEW.direction = 'outbound' THEN
    UPDATE inbox_conversations SET
      message_count = message_count + 1,
      outbound_count = outbound_count + 1,
      last_message_at = COALESCE(NEW.created_at, NOW()),
      last_outbound_at = COALESCE(NEW.created_at, NOW()),
      updated_at = NOW()
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inbox_message_insert
  AFTER INSERT ON inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_inbound();

-- =============================================================================
-- FUNCTION - Encontrar ou criar conversa
-- =============================================================================
CREATE OR REPLACE FUNCTION get_or_create_inbox_conversation(
  p_phone TEXT,
  p_contact_id TEXT DEFAULT NULL
)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_conversation_id TEXT;
BEGIN
  -- Busca conversa aberta existente
  SELECT id INTO v_conversation_id
  FROM inbox_conversations
  WHERE phone = p_phone AND status = 'open'
  ORDER BY last_message_at DESC
  LIMIT 1;

  -- Se não encontrou, cria nova
  IF v_conversation_id IS NULL THEN
    INSERT INTO inbox_conversations (phone, contact_id, status, mode)
    VALUES (p_phone, p_contact_id, 'open', 'bot')
    RETURNING id INTO v_conversation_id;
  END IF;

  RETURN v_conversation_id;
END;
$$;

-- =============================================================================
-- AI AGENTS - Configuração de agentes conversacionais
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id TEXT PRIMARY KEY DEFAULT concat('agent_', replace(gen_random_uuid()::text, '-', '')),

  -- Identificação
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,

  -- Configuração Principal
  system_prompt TEXT NOT NULL,
  personality TEXT,
  language TEXT DEFAULT 'pt-BR',

  -- Goal & Tasks (ManyChat style)
  goal TEXT,
  tasks JSONB DEFAULT '[]'::jsonb,

  -- 🆕 GOOGLE FILE SEARCH STORE (RAG-as-a-Service)
  file_search_store_id TEXT, -- "projects/.../fileSearchStores/..."

  -- Comportamento
  model_name TEXT DEFAULT 'gemini-2.5-flash',
  temperature NUMERIC(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 500,
  top_k INTEGER DEFAULT 5, -- Quantos chunks retornar do File Search

  -- Handoff Inteligente (Tool-Based)
  handoff_enabled BOOLEAN DEFAULT true,
  handoff_message TEXT DEFAULT 'Vou transferir você para um atendente. Um momento...',
  fallback_message TEXT,

  -- Métricas
  total_conversations INTEGER DEFAULT 0,
  total_messages_sent INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_agents_active_default ON ai_agents(is_active, is_default);

-- =============================================================================
-- AI AGENT LOGS - Histórico para análise
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ai_agent_logs (
  id TEXT PRIMARY KEY DEFAULT concat('ailog_', replace(gen_random_uuid()::text, '-', '')),

  agent_id TEXT NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES inbox_conversations(id) ON DELETE SET NULL,
  message_id TEXT REFERENCES inbox_messages(id) ON DELETE SET NULL,

  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,

  -- Citações do File Search (automático pelo Gemini)
  sources JSONB, -- Array de {title, uri, relevance}

  -- Metadata
  model_used TEXT,
  response_time_ms INTEGER,

  -- Feedback
  was_helpful BOOLEAN,
  was_escalated BOOLEAN,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_agent_logs_agent ON ai_agent_logs(agent_id, created_at DESC);

-- =============================================================================
-- ATUALIZAR inbox_conversations com referência ao AI Agent
-- =============================================================================
ALTER TABLE inbox_conversations
  ADD COLUMN IF NOT EXISTS assigned_agent_id TEXT REFERENCES ai_agents(id) ON DELETE SET NULL;

-- =============================================================================
-- REALTIME - Inbox + AI Agents
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_conversations;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_messages;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agents;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

### 1.2 Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/migrations/0034_add_inbox_and_ai_agents.sql` | Criar | Schema completo (Inbox + AI) |
| `types.ts` | Modificar | Adicionar tipos Inbox + AIAgent |
| `lib/supabase-db.ts` | Modificar | Adicionar `inboxDb` + `aiAgentDb` |

---

## Fase 2: Webhook + Persistência + AI Integration

### 2.1 Modificar `app/api/webhook/route.ts`

**Ponto de inserção:** Após linha ~925 (após `extractInboundText`)

```typescript
// >>> INBOX + AI: Persistir e processar resposta <<<
try {
  // 1. Persistir mensagem no inbox
  const { conversationId, messageId } = await persistInboundToInbox({
    message,
    from: normalizedFrom,
    text,
    messageType,
    wabaId: entry?.id,
    phoneNumberId: change?.value?.metadata?.phone_number_id,
  })

  // 2. Determinar modo de resposta (AI, workflow, human)
  const responseMode = await determineResponseMode(conversationId, text)

  // 3. Se modo AI, gerar e enviar resposta
  if (responseMode === 'ai') {
    const aiResponse = await processAIResponse(conversationId, text)
    if (aiResponse) {
      await sendWhatsAppText(normalizedFrom, aiResponse.text)
      // Persistir resposta no inbox
      await persistOutboundToInbox(conversationId, aiResponse.text, 'ai')
    }
  }
} catch (e) {
  console.warn('[Webhook] Inbox/AI error (best-effort):', e)
}
// <<< FIM INBOX + AI <<<
```

### 2.2 Novo Arquivo: `lib/inbox/persist-inbound.ts`

```typescript
export async function persistInboundToInbox(input: {
  message: any
  from: string
  text: string
  messageType: string
  wabaId: string | null
  phoneNumberId: string | null
}): Promise<{ conversationId: string; messageId: string }> {
  // 1. Resolver contact_id
  const contactId = await resolveContactId(input.from)

  // 2. Get or create conversation
  const { data: conversationId } = await supabase
    .rpc('get_or_create_inbox_conversation', {
      p_phone: input.from,
      p_contact_id: contactId,
    })

  // 3. Insert message
  const { data: msg } = await supabase
    .from('inbox_messages')
    .insert({
      conversation_id: conversationId,
      contact_id: contactId,
      wa_message_id: input.message?.id,
      waba_id: input.wabaId,
      phone_number_id: input.phoneNumberId,
      direction: 'inbound',
      source: 'user',
      message_type: input.messageType,
      text_body: input.text,
      // ... extract media, interactive, etc
      raw_payload: input.message,
      message_timestamp: tryParseTimestamp(input.message?.timestamp),
    })
    .select('id')
    .single()

  return { conversationId, messageId: msg.id }
}
```

### 2.3 Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `lib/inbox/persist-inbound.ts` | Criar | Persistir mensagens inbound |
| `lib/inbox/persist-outbound.ts` | Criar | Persistir mensagens outbound |
| `lib/inbox/automation-control.ts` | Criar | Pause/resume automation |
| `lib/inbox/ai/determine-mode.ts` | Criar | Decidir AI/workflow/human |
| `lib/inbox/ai/process-response.ts` | Criar | Gerar resposta com File Search |
| `lib/inbox/ai/handoff-tool.ts` | Criar | Tool de handoff inteligente |
| `lib/inbox/index.ts` | Criar | Re-exports |
| `app/api/webhook/route.ts` | Modificar | Integrar inbox + AI |

### 2.4 Handoff Inteligente (Tool-Based)

> **Abordagem**: Em vez de keywords fixas, a IA **decide sozinha** quando fazer handoff baseado no contexto da conversa usando uma Tool do Vercel AI SDK.

#### Arquivo: `lib/inbox/ai/handoff-tool.ts`

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

/**
 * Tool que a IA chama automaticamente quando detecta necessidade de atendimento humano.
 * O modelo decide quando chamar baseado em:
 * - Frustração ou insatisfação do usuário
 * - Pedidos explícitos ou implícitos ("quero falar com alguém")
 * - Situações que requerem autoridade humana (cancelamentos, reembolsos)
 * - Incapacidade de resolver após múltiplas tentativas
 */
export const handoffToHumanTool = tool({
  description: `Transfere a conversa para um atendente humano. Use quando:
    - O usuário expressar frustração, raiva ou insatisfação
    - O usuário pedir para falar com humano (mesmo indiretamente, como "isso não resolve", "cansei")
    - A situação envolver decisões que requerem autoridade humana (cancelamento, reembolso, reclamação formal)
    - Você não conseguir resolver a questão após 2-3 tentativas
    - O assunto for sensível demais para automação (questões jurídicas, médicas)`,
  parameters: z.object({
    reason: z.string().describe('Motivo da transferência em português'),
    urgency: z.enum(['low', 'medium', 'high']).describe('Urgência: low=dúvida, medium=problema, high=reclamação/urgente'),
    summary: z.string().describe('Resumo da conversa até agora para o atendente'),
  }),
  execute: async ({ reason, urgency, summary }, { conversationId }) => {
    // Atualiza conversa para modo humano
    await supabase
      .from('inbox_conversations')
      .update({
        mode: 'human',
        ai_summary: summary,
        ai_urgency: urgency,
        priority: urgency === 'high' ? 'urgent' : urgency === 'medium' ? 'high' : 'normal',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    // Log do handoff
    console.log(`[Handoff] Conversa ${conversationId} transferida: ${reason} (${urgency})`);

    return {
      transferred: true,
      reason,
      urgency,
    };
  },
});
```

#### Uso no `process-response.ts`

```typescript
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { handoffToHumanTool } from './handoff-tool';

export async function processAIResponse(
  conversationId: string,
  userMessage: string,
  agent: AIAgent
): Promise<{ text: string; handedOff: boolean } | null> {
  const result = await generateText({
    model: google('gemini-2.0-flash'),
    system: agent.system_prompt,
    messages: await getConversationHistory(conversationId),
    tools: {
      handoffToHuman: handoffToHumanTool,
    },
    // Passa conversationId para a tool poder acessar
    toolContext: { conversationId },
  });

  // Verifica se a tool de handoff foi chamada
  const handoffCall = result.toolCalls?.find(tc => tc.name === 'handoffToHuman');

  if (handoffCall) {
    // Retorna mensagem de handoff configurada no agent
    return {
      text: agent.handoff_message || 'Vou transferir você para um atendente. Um momento...',
      handedOff: true,
    };
  }

  return {
    text: result.text,
    handedOff: false,
  };
}
```

#### Vantagens sobre Keyword-Based

| Aspecto | Keywords | Tool-Based |
|---------|----------|------------|
| **Detecção** | Strings literais | Semântica + contexto |
| **"Cansei disso"** | ❌ Não detecta | ✅ Detecta frustração |
| **"Vocês são ruins"** | ❌ Não detecta | ✅ Detecta insatisfação |
| **"Quero cancelar"** | Precisa keyword | ✅ Entende intenção |
| **Configuração** | Lista de palavras | Zero config (prompt) |
| **Manutenção** | Atualizar lista | Automático |

### 2.5 Arquitetura AI SDK v6: ToolLoopAgent + Structured Output

> **AI SDK v6** introduz abstrações poderosas que simplificam drasticamente nossa implementação.

#### Arquivo: `agents/support-agent.ts`

Define o agente UMA vez, usa em qualquer lugar (webhook, API de teste, etc):

```typescript
import { ToolLoopAgent, Output, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { handoffToHumanTool } from '@/lib/inbox/ai/handoff-tool';

// Schema do output estruturado
const responseSchema = z.object({
  response: z.string().describe('Resposta para enviar ao usuário'),
  sentiment: z.enum(['positive', 'neutral', 'frustrated', 'angry']),
  suggestedTags: z.array(z.string()).describe('Tags sugeridas para o contato'),
  shouldFollowUp: z.boolean().describe('Se deve criar task de follow-up'),
  confidence: z.number().min(0).max(1).describe('Confiança na resposta'),
});

// Schema das Call Options (contexto dinâmico por request)
const callOptionsSchema = z.object({
  conversationId: z.string(),
  contactName: z.string(),
  contactPhone: z.string(),
  contactTags: z.array(z.string()).optional(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
});

export const supportAgent = new ToolLoopAgent({
  model: google('gemini-2.5-flash'),

  // Call Options: contexto dinâmico passado em cada chamada
  callOptionsSchema,

  // Prepara a chamada com contexto do contato
  prepareCall: ({ options, ...settings }) => ({
    ...settings,
    instructions: `Você é um assistente de atendimento da SmartZap.

## Contexto do Cliente
- Nome: ${options.contactName}
- Telefone: ${options.contactPhone}
- Tags: ${options.contactTags?.join(', ') || 'Nenhuma'}

## Diretrizes
- Seja amigável e profissional
- Use o nome do cliente quando apropriado
- Se não souber responder, use a ferramenta de busca na base de conhecimento
- Se o cliente demonstrar frustração ou pedir humano, use handoffToHuman
- Mantenha respostas concisas (máximo 3 parágrafos)`,
  }),

  // Tools disponíveis
  tools: {
    // File Search nativo do Google (Provider Tool)
    fileSearch: google.tools.fileSearch({
      fileSearchStoreNames: ['fileSearchStores/${STORE_ID}'], // Substituir pelo ID real
      topK: 5,
    }),
    // Handoff inteligente
    handoffToHuman: handoffToHumanTool,
  },

  // Output estruturado: resposta + metadados em 1 chamada
  output: Output.object({ schema: responseSchema }),

  // Máximo de iterações (tool calls)
  stopWhen: stepCountIs(5),
});

// Tipo inferido para uso no frontend
export type SupportAgentOutput = z.infer<typeof responseSchema>;
```

#### Uso no Webhook: `lib/inbox/ai/process-response.ts`

```typescript
import { supportAgent, SupportAgentOutput } from '@/agents/support-agent';
import { supabase } from '@/lib/supabase';

export async function processAIResponse(
  conversationId: string,
  userMessage: string,
  contact: { name: string; phone: string; tags?: string[] },
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<{
  text: string;
  handedOff: boolean;
  metadata: Omit<SupportAgentOutput, 'response'>;
} | null> {
  try {
    const { output, steps } = await supportAgent.generate({
      prompt: userMessage,
      options: {
        conversationId,
        contactName: contact.name,
        contactPhone: contact.phone,
        contactTags: contact.tags,
        conversationHistory: history,
      },
    });

    // Verifica se handoff foi chamado
    const handoffStep = steps.find(s =>
      s.toolCalls?.some(tc => tc.name === 'handoffToHuman')
    );

    // Atualiza conversa com metadados de IA
    await supabase
      .from('inbox_conversations')
      .update({
        ai_sentiment: output.sentiment,
        ai_tags: output.suggestedTags,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    return {
      text: output.response,
      handedOff: !!handoffStep,
      metadata: {
        sentiment: output.sentiment,
        suggestedTags: output.suggestedTags,
        shouldFollowUp: output.shouldFollowUp,
        confidence: output.confidence,
      },
    };
  } catch (error) {
    console.error('[AI] Error processing response:', error);
    return null;
  }
}
```

#### DevTools para Debug (Desenvolvimento)

Durante desenvolvimento, wrapper com DevTools para visibilidade total:

```typescript
// lib/ai/model.ts
import { wrapLanguageModel } from 'ai';
import { google } from '@ai-sdk/google';
import { devToolsMiddleware } from '@ai-sdk/devtools';

const baseModel = google('gemini-2.5-flash');

// Em desenvolvimento, adiciona DevTools
export const model = process.env.NODE_ENV === 'development'
  ? wrapLanguageModel({
      model: baseModel,
      middleware: devToolsMiddleware(),
    })
  : baseModel;

// Para usar: npx @ai-sdk/devtools
// Abre dashboard em http://localhost:4983
```

#### Benefícios do AI SDK v6

| Feature | Benefício |
|---------|-----------|
| **ToolLoopAgent** | Define agente 1x, usa em webhook, API test, etc |
| **Call Options** | Contexto dinâmico (contato, histórico) sem poluir system prompt |
| **Structured Output + Tools** | Resposta + sentiment + tags em 1 chamada (economia de tokens) |
| **Provider Tools** | `google.tools.fileSearch()` nativo, zero config |
| **Type Safety** | Tipos inferidos end-to-end (agent → API → UI) |
| **DevTools** | Debug visual de cada step, tokens, timing |

---

## Fase 3: API Endpoints (Inbox + AI)

### 3.1 Estrutura de Rotas

```
app/api/
├── inbox/
│   ├── conversations/
│   │   ├── route.ts              # GET (list) + POST (create)
│   │   └── [id]/
│   │       ├── route.ts          # GET + PATCH
│   │       ├── messages/route.ts # GET (list messages)
│   │       ├── close/route.ts    # POST (close)
│   │       └── pause/route.ts    # POST (pause automation)
│   ├── send/
│   │   ├── text/route.ts         # POST (send text)
│   │   └── template/route.ts     # POST (send template)
│   ├── labels/route.ts           # CRUD labels
│   └── quick-replies/route.ts    # CRUD quick replies
│
└── ai/
    ├── agents/
    │   ├── route.ts              # GET (list) + POST (create)
    │   └── [id]/
    │       ├── route.ts          # GET + PATCH + DELETE
    │       └── test/route.ts     # POST (testar agente)
    ├── file-store/
    │   ├── route.ts              # POST (criar store)
    │   └── [storeId]/
    │       ├── upload/route.ts   # POST (upload arquivo)
    │       └── files/route.ts    # GET (listar) + DELETE
    └── chat/route.ts             # POST (testar chat)
```

### 3.2 Service Layer: `services/inboxService.ts`

```typescript
export const inboxService = {
  // Conversations
  listConversations: (params) => fetchAPI('/api/inbox/conversations', { params }),
  getConversation: (id) => fetchAPI(`/api/inbox/conversations/${id}`),
  closeConversation: (id) => fetchAPI(`/api/inbox/conversations/${id}/close`, { method: 'POST' }),
  pauseAutomation: (id, minutes) => fetchAPI(`/api/inbox/conversations/${id}/pause`, { method: 'POST', body: { minutes } }),

  // Messages
  getMessages: (conversationId, cursor) => fetchAPI(`/api/inbox/conversations/${conversationId}/messages`, { params: { cursor } }),
  sendText: (conversationId, text) => fetchAPI('/api/inbox/send/text', { method: 'POST', body: { conversationId, text } }),
  sendTemplate: (conversationId, templateName, variables) => fetchAPI('/api/inbox/send/template', { method: 'POST', body: { conversationId, templateName, variables } }),

  // Labels
  listLabels: () => fetchAPI('/api/inbox/labels'),
  createLabel: (name, color) => fetchAPI('/api/inbox/labels', { method: 'POST', body: { name, color } }),

  // Quick Replies
  listQuickReplies: () => fetchAPI('/api/inbox/quick-replies'),
}
```

### 3.3 Service Layer: `services/aiAgentService.ts`

```typescript
export const aiAgentService = {
  // Agents
  listAgents: () => fetchAPI('/api/ai/agents'),
  getAgent: (id) => fetchAPI(`/api/ai/agents/${id}`),
  createAgent: (data) => fetchAPI('/api/ai/agents', { method: 'POST', body: data }),
  updateAgent: (id, data) => fetchAPI(`/api/ai/agents/${id}`, { method: 'PATCH', body: data }),
  deleteAgent: (id) => fetchAPI(`/api/ai/agents/${id}`, { method: 'DELETE' }),
  testAgent: (id, message) => fetchAPI(`/api/ai/agents/${id}/test`, { method: 'POST', body: { message } }),

  // File Search Store
  createFileStore: (name) => fetchAPI('/api/ai/file-store', { method: 'POST', body: { name } }),
  uploadFile: (storeId, file) => fetchAPI(`/api/ai/file-store/${storeId}/upload`, { method: 'POST', body: file }),
  listFiles: (storeId) => fetchAPI(`/api/ai/file-store/${storeId}/files`),
  deleteFile: (storeId, fileId) => fetchAPI(`/api/ai/file-store/${storeId}/files/${fileId}`, { method: 'DELETE' }),

  // Chat de teste
  chat: (agentId, messages) => fetchAPI('/api/ai/chat', { method: 'POST', body: { agentId, messages } }),
}
```

---

## Fase 4: Frontend Inbox

### 4.1 Estrutura de Arquivos

```
components/features/inbox/
├── InboxView.tsx              # Container principal (3 colunas)
├── sidebar/
│   ├── InboxSidebar.tsx       # Folders + Labels
│   ├── FolderList.tsx
│   └── LabelList.tsx
├── thread-list/
│   ├── ThreadListPanel.tsx    # Lista de conversas
│   ├── ThreadListItem.tsx     # Item memoizado
│   └── ThreadListEmpty.tsx
├── chat/
│   ├── ChatPanel.tsx          # Área de chat
│   ├── ChatHeader.tsx         # Info + actions
│   ├── ChatMessages.tsx       # Lista de mensagens
│   ├── ChatMessageBubble.tsx  # Bolha memoizada
│   ├── ChatInputBar.tsx       # Input + envio
│   └── ChatQuickReplies.tsx   # Dropdown de respostas
└── contact/
    ├── ContactPanel.tsx       # Info do contato
    └── ContactDetails.tsx

hooks/
├── useInbox.ts                # Controller principal
├── useInboxConversations.ts   # Query de conversas
└── useInboxMessages.ts        # Query de mensagens

app/(dashboard)/inbox/
├── page.tsx                   # Thin page
└── loading.tsx                # Skeleton
```

### 4.2 Layout Desktop (Wireframe)

```
┌─────────┬──────────────────┬─────────────────────────┬──────────────┐
│ SIDEBAR │   THREAD LIST    │       CHAT WINDOW       │   CONTACT    │
│  200px  │      320px       │         flex-1          │    280px     │
├─────────┼──────────────────┼─────────────────────────┼──────────────┤
│         │ [🔍 Search...]   │ [Avatar] João Silva     │ [Avatar]     │
│ FOLDERS │ [Filter ▾]       │ @paused  [Pause] [X]    │ João Silva   │
│ ───────│──────────────────│─────────────────────────│ +5511...     │
│ > All   │ ┌──────────────┐ │                         │              │
│   (12)  │ │ Maria    · 2 │ │  ┌─────────────────┐   │ TAGS         │
│ Unread  │ │ Oi, tudo bem │ │  │ Oi, tudo bem?   │   │ [cliente]    │
│   (5)   │ │ 10:30        │ │  └─────────────────┘   │ [vip]        │
│ Mine    │ └──────────────┘ │           10:30        │ [+ Add]      │
│   (3)   │ ┌──────────────┐ │                         │              │
│         │ │ João     (2) │ │        ┌─────────────┐ │ CAMPOS       │
│ LABELS  │ │ Preciso de   │ │        │ Olá! Posso │ │ Curso: React │
│ ─────── │ │ 10:28        │ │        │ ajudar?    │ │ Score: Alto  │
│ [+]     │ └──────────────┘ │        └─────────────┘ │              │
│ cliente │                   │           10:31 ✓✓    │ HISTÓRICO    │
│ vip     │ [Load more...]   │                         │ - Camp. BF   │
│ lead    │                   │─────────────────────────│ - Form Lead  │
│         │                   │ [📎] [Template ▾]      │              │
│         │                   │ [Type a message...]    │              │
└─────────┴──────────────────┴─────────────────────────┴──────────────┘
```

### 4.3 Controller Hook: `useInbox.ts`

```typescript
export function useInboxController() {
  // UI State
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [filter, setFilter] = useState({ status: 'open', folder: 'all' })
  const [searchTerm, setSearchTerm] = useState('')

  // Queries com Realtime
  const conversations = useRealtimeQuery({
    queryKey: ['inbox', 'conversations', filter],
    queryFn: () => inboxService.listConversations(filter),
    table: 'inbox_conversations',
    events: ['INSERT', 'UPDATE'],
  })

  const messages = useRealtimeQuery({
    queryKey: ['inbox', 'messages', selectedConversationId],
    queryFn: () => inboxService.getMessages(selectedConversationId),
    table: 'inbox_messages',
    filter: `conversation_id=eq.${selectedConversationId}`,
    enabled: !!selectedConversationId,
  })

  // Mutations
  const sendMutation = useMutation({ mutationFn: inboxService.sendText })
  const closeMutation = useMutation({ mutationFn: inboxService.closeConversation })
  const pauseMutation = useMutation({ mutationFn: inboxService.pauseAutomation })

  return {
    // State
    conversations: conversations.data,
    messages: messages.data,
    selectedConversationId,
    filter,
    searchTerm,
    isLoading: conversations.isLoading,
    isSending: sendMutation.isPending,

    // Actions
    selectConversation: setSelectedConversationId,
    setFilter,
    setSearchTerm,
    sendMessage: sendMutation.mutate,
    closeConversation: closeMutation.mutate,
    pauseAutomation: pauseMutation.mutate,
  }
}
```

### 4.4 Design System - Tokens a Usar

| Elemento | Token |
|----------|-------|
| Background principal | `bg-zinc-950` |
| Card de conversa | `bg-zinc-900 hover:bg-zinc-800` |
| Conversa selecionada | `bg-zinc-800 border-l-2 border-emerald-500` |
| Bolha inbound | `bg-zinc-800 text-zinc-100` |
| Bolha outbound | `bg-emerald-600 text-white` |
| Unread badge | `bg-emerald-500 text-white text-xs` |
| Status badge | Usar `StatusBadge` existente |
| Typography heading | `text-heading-3` (Satoshi) |
| Typography body | `text-body-sm` (Inter) |
| Timestamp | `text-caption text-zinc-500` (JetBrains Mono) |

---

## Fase 5: AI Agents UI

> **Nota**: A lógica de backend (determineMode, processResponse, pause/resume) já está na Fase 2.
> Esta fase foca na UI de configuração e teste dos AI Agents.

### 5.1 Estrutura de Arquivos (AI Agents UI)

```
components/features/settings/ai-agents/
├── AIAgentsPanel.tsx          # Painel principal (lista + editor)
├── AgentList.tsx              # Lista de agentes
├── AgentCard.tsx              # Card de agente
├── AgentEditor.tsx            # Formulário de edição
├── AgentTestChat.tsx          # Chat de teste lado a lado
└── FileStoreManager.tsx       # Gerenciar arquivos do File Search
    ├── FileUploader.tsx       # Upload de arquivos
    └── FileList.tsx           # Lista de arquivos indexados

hooks/
├── useAIAgents.ts             # Controller principal
└── useAIAgentTest.ts          # Hook para chat de teste

app/(dashboard)/settings/ai-agents/
└── page.tsx                   # Page thin (ou tab em SettingsView)
```

### 5.2 Wireframe - Editor de Agente

```
┌─────────────────────────────────────────────────────────────────────────┐
│ AI Agent: Assistente de Vendas                          [Ativo] [Salvar]│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ ┌─────────────────────────────────────┐ ┌─────────────────────────────┐ │
│ │ CONFIGURAÇÃO                        │ │ TESTE AO VIVO              │ │
│ ├─────────────────────────────────────┤ ├─────────────────────────────┤ │
│ │ Nome: [Assistente de Vendas      ]  │ │ ┌─────────────────────────┐ │ │
│ │                                     │ │ │ Olá! Como posso ajudar? │ │ │
│ │ System Prompt:                      │ │ └─────────────────────────┘ │ │
│ │ ┌─────────────────────────────────┐ │ │                             │ │
│ │ │ Você é um assistente de vendas │ │ │  ┌───────────────────────┐  │ │
│ │ │ da SmartZap. Seja amigável...  │ │ │  │ Quais são os preços?  │  │ │
│ │ └─────────────────────────────────┘ │ │  └───────────────────────┘  │ │
│ │                                     │ │                             │ │
│ │ Objetivo:                           │ │ ┌─────────────────────────┐ │ │
│ │ [Qualificar leads e agendar demos]  │ │ │ Temos 3 planos...      │ │ │
│ │                                     │ │ │                         │ │ │
│ │ ─────────────────────────────────── │ │ │ 📄 Fonte: pricing.pdf  │ │ │
│ │ KNOWLEDGE BASE (File Search)  [+]   │ │ └─────────────────────────┘ │ │
│ │ ─────────────────────────────────── │ │                             │ │
│ │ 📄 pricing.pdf      ✅ Indexed      │ │ ─────────────────────────── │ │
│ │ 📄 faq.txt          ✅ Indexed      │ │ [Digite uma mensagem...]    │ │
│ │ 📄 products.json    ⏳ Indexing...  │ └─────────────────────────────┘ │
│ │                                     │                                 │
│ │ [+ Upload arquivo]                  │                                 │
│ └─────────────────────────────────────┘                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Controller Hook: `useAIAgents.ts`

```typescript
export function useAIAgentsController() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Queries
  const agents = useQuery({
    queryKey: ['ai', 'agents'],
    queryFn: () => aiAgentService.listAgents(),
  })

  // Mutations
  const createMutation = useMutation({ mutationFn: aiAgentService.createAgent })
  const updateMutation = useMutation({ mutationFn: aiAgentService.updateAgent })
  const deleteMutation = useMutation({ mutationFn: aiAgentService.deleteAgent })

  return {
    agents: agents.data,
    selectedAgentId,
    isEditing,
    isLoading: agents.isLoading,
    selectAgent: setSelectedAgentId,
    createAgent: createMutation.mutate,
    updateAgent: updateMutation.mutate,
    deleteAgent: deleteMutation.mutate,
  }
}
```

---

## Fase 6: Integração Final + Testes

### 6.1 Checklist de Integração

- [ ] Sidebar: Adicionar link "Inbox" no `DashboardSidebar.tsx`
- [ ] Settings: Adicionar tab "AI Agents" no `SettingsView.tsx`
- [ ] Realtime: Registrar tabelas no `CentralizedRealtimeProvider.tsx`
- [ ] Types: Exportar tipos em `types.ts`

### 6.2 Testes Manuais - Inbox

1. **Webhook**: Enviar mensagem WhatsApp → verificar em `inbox_messages`
2. **Realtime**: Abrir inbox → enviar mensagem → deve aparecer sem refresh
3. **Envio**: Responder pelo inbox → verificar entrega no WhatsApp
4. **Pause**: Pausar automation → enviar mensagem → bot não deve responder
5. **Close**: Fechar conversa → nova mensagem deve criar nova conversa

### 6.3 Testes Manuais - AI Agents

1. **CRUD Agente**: Criar agente com system prompt → verificar em `ai_agents`
2. **Criar File Store**: Criar store via API → salvar `file_search_store_id` no agente
3. **Upload arquivo**: Upload FAQ.txt → aguardar indexação (status "Indexed")
4. **Test Chat**: Perguntar algo do arquivo → resposta deve usar contexto
5. **Verificar sources**: Resposta deve incluir citações (sources)
6. **Handoff (Tool-Based)**:
   - Enviar "cansei disso, não resolve" → IA deve chamar tool e trocar mode para human
   - Enviar "quero falar com alguém de verdade" → deve transferir
   - Enviar "vocês são terríveis" → deve detectar frustração e transferir
   - Verificar que `ai_summary`, `ai_urgency` e `priority` são preenchidos

### 6.4 Queries de Validação

```sql
-- Verificar mensagens salvas
SELECT * FROM inbox_messages ORDER BY created_at DESC LIMIT 10;

-- Verificar conversas
SELECT * FROM inbox_conversations ORDER BY last_message_at DESC LIMIT 10;

-- Verificar métricas
SELECT id, phone, message_count, unread_count, status FROM inbox_conversations;

-- Verificar AI Agents
SELECT id, name, is_active, is_default, file_search_store_id FROM ai_agents;

-- Verificar Logs de AI (com sources)
SELECT id, agent_id, user_message, ai_response, sources, response_time_ms
FROM ai_agent_logs ORDER BY created_at DESC LIMIT 5;
```

---

## Arquivos a Criar

### Migration Única

| Arquivo | Descrição |
|---------|-----------|
| `supabase/migrations/0034_add_inbox_and_ai_agents.sql` | Schema completo (Inbox + AI Agents) |

### Inbox

| Arquivo | Descrição |
|---------|-----------|
| `lib/inbox/persist-inbound.ts` | Persistir mensagens inbound |
| `lib/inbox/persist-outbound.ts` | Persistir mensagens outbound |
| `lib/inbox/automation-control.ts` | Pause/resume automation |
| `agents/support-agent.ts` | **ToolLoopAgent** com Call Options + Structured Output |
| `lib/ai/model.ts` | Wrapper do modelo com DevTools (dev only) |
| `lib/inbox/ai/determine-mode.ts` | Decidir AI/workflow/human |
| `lib/inbox/ai/process-response.ts` | Usar supportAgent.generate() |
| `lib/inbox/ai/handoff-tool.ts` | Tool de handoff inteligente (Vercel AI SDK) |
| `lib/inbox/ai/file-search-store.ts` | Gerenciamento do File Search Store |
| `lib/inbox/index.ts` | Re-exports |
| `services/inboxService.ts` | API client Inbox |
| `services/aiAgentService.ts` | API client AI Agents |
| `hooks/useInbox.ts` | Controller Inbox |
| `hooks/useAIAgents.ts` | Controller AI Agents |
| `app/(dashboard)/inbox/page.tsx` | Page Inbox |
| `components/features/inbox/*` | Componentes Inbox |
| `components/features/settings/ai-agents/*` | Componentes AI Agents |
| `app/api/inbox/*` | APIs Inbox |
| `app/api/ai/*` | APIs AI Agents |

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `app/api/webhook/route.ts` | Integrar persistência + AI response |
| `types.ts` | Adicionar tipos Inbox + AIAgent |
| `lib/supabase-db.ts` | Adicionar `inboxDb` + `aiAgentDb` |
| `components/providers/CentralizedRealtimeProvider.tsx` | Adicionar tabelas |
| `components/layout/DashboardSidebar.tsx` | Link para Inbox |
| `components/features/settings/SettingsView.tsx` | Tab AI Agents |

---

## Dependências

```bash
# Virtualização de listas longas (inbox)
npm install @tanstack/react-virtual

# AI SDK v6 + Google Provider (IMPORTANTE: v6 para ToolLoopAgent)
npm install ai@^6.0.0 @ai-sdk/google@latest

# DevTools para debug durante desenvolvimento (opcional, dev only)
npm install -D @ai-sdk/devtools
```

**NÃO precisa:**
- ❌ `openai` (para embeddings)
- ❌ `langchain` (para chunking)
- ❌ pgvector no Supabase
- ❌ `@ai-sdk/cohere` (reranking - otimização futura)

---

## Notas Finais

- **Performance**: Usar memoization em todos os componentes de lista
- **Mobile**: Layout responsivo com stack em mobile
- **Acessibilidade**: Keyboard navigation (j/k para navegar, Enter para focar)
- **Design System**: Seguir 100% os tokens existentes em `lib/design-system/`
- **ManyChat Reference**: Folders, Labels, Pause automation, Quick replies
- **AI Architecture**: Vercel AI SDK **v6** + ToolLoopAgent + Gemini File Search
- **AI SDK v6 Features**: ToolLoopAgent, Call Options, Structured Output + Tools, DevTools
- **Custo AI**: Storage e query GRÁTIS, só paga indexação ($0.15/1M tokens)

---

## Resumo das Decisões Arquiteturais

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| **Framework AI** | Vercel AI SDK **v6** | ToolLoopAgent, Call Options, Structured Output |
| **Abstração de Agente** | `ToolLoopAgent` | Reutilizável, type-safe, loop automático |
| **RAG** | Gemini File Search (Provider Tool) | Zero complexidade, Google gerencia tudo |
| **Structured Output** | `Output.object()` + Tools | Resposta + sentiment + tags em 1 chamada |
| **Contexto Dinâmico** | Call Options | Passar contato, histórico, tags por request |
| **Handoff** | Tool-Based (`needsApproval`) | IA decide semanticamente + aprovação opcional |
| **Vector DB** | ❌ Não precisa | Google gerencia |
| **Embeddings** | ❌ Não precisa | Google gerencia |
| **LLM** | Gemini 2.5 Flash | Custo baixo, rápido, File Search nativo |
| **Realtime** | Supabase | Já existe CentralizedRealtimeProvider |
| **Debug** | AI SDK DevTools | Visibilidade total durante desenvolvimento |
