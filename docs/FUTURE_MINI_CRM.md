# Feature Futura: Mini CRM

> **Status:** Planejado
> **Prioridade:** Média
> **Dependências:** Sistema de contatos existente, Agente de IA

## Visão Geral

Implementar um mini CRM básico integrado ao SmartZap para acompanhar leads no funil de vendas. O diferencial é a **integração nativa com o agente de IA**, que pode detectar e atualizar o estágio do lead automaticamente durante as conversas.

## Problema

Atualmente os contatos são armazenados com tags e campos customizados, mas não há:
- Visualização de pipeline/funil
- Estágio do lead estruturado
- Timeline unificada de interações
- Score/pontuação do lead
- Detecção automática de intenção de compra

## Solução Proposta

### Estrutura do Funil

```
┌─────────────┬─────────────┬─────────────┬─────────────┬────────┐
│   NOVOS     │ QUALIFICADO │ NEGOCIANDO  │  FECHADO    │ PERDIDO│
│     12      │      8      │      5      │      3      │    2   │
└─────────────┴─────────────┴─────────────┴─────────────┴────────┘
```

**Estágios:**
- `new` - Primeiro contato, lead frio
- `qualified` - Demonstrou interesse real (perguntou preço, agendou)
- `negotiating` - Pediu proposta, discutindo valores
- `closed` - Confirmou compra, virou cliente
- `lost` - Opt-out ou sem interesse

### Dados por Contato

```
┌─────────────────────────────────────────────────────────────────┐
│  👤 João Silva                                    🏷️ Lead Quente │
│  📱 +55 21 99999-9999                                           │
├─────────────────────────────────────────────────────────────────┤
│  FUNIL: [Novo] → [Qualificado] → Negociando → Fechado           │
│  VALOR: R$ 1.500,00                                             │
│  SCORE: ⭐⭐⭐⭐☆ (82 pontos)                                      │
│  PRÓXIMO CONTATO: Amanhã, 14:00                                 │
│  ORIGEM: Instagram Ads                                          │
├─────────────────────────────────────────────────────────────────┤
│  📜 TIMELINE                                                    │
│  ├─ Hoje 14:30 - 💬 Perguntou sobre preços (via WhatsApp)       │
│  ├─ Hoje 14:31 - 🤖 IA respondeu com tabela de preços           │
│  ├─ Ontem 10:00 - 📧 Recebeu campanha "Black Friday"            │
│  └─ 3 dias atrás - 📝 Preencheu formulário de interesse         │
└─────────────────────────────────────────────────────────────────┘
```

## Implementação

### Fase 1: Quick Win (sem migration)

Usar custom fields existentes:

| Campo | Tipo | Valores |
|-------|------|---------|
| `lead_stage` | select | new, qualified, negotiating, closed, lost |
| `deal_value` | number | Valor em R$ |
| `lead_source` | select | Instagram, Google, Indicação, Orgânico |
| `next_followup` | date | Data do próximo contato |

**Vantagem:** Funciona imediatamente sem alterar banco.

### Fase 2: CRM Nativo (com migration)

```sql
-- Novos campos em contacts
ALTER TABLE contacts ADD COLUMN lead_stage TEXT DEFAULT 'new';
ALTER TABLE contacts ADD COLUMN deal_value DECIMAL(10,2);
ALTER TABLE contacts ADD COLUMN lead_source TEXT;
ALTER TABLE contacts ADD COLUMN lead_score INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN next_followup_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN assigned_to TEXT;

-- Índices para performance
CREATE INDEX idx_contacts_lead_stage ON contacts(lead_stage);
CREATE INDEX idx_contacts_lead_score ON contacts(lead_score DESC);

-- Timeline unificada (view)
CREATE VIEW contact_timeline AS
SELECT
  c.phone as contact_phone,
  'message' as event_type,
  im.created_at as event_at,
  im.content as event_content,
  im.direction
FROM contacts c
JOIN inbox_conversations ic ON ic.phone = c.phone
JOIN inbox_messages im ON im.conversation_id = ic.id

UNION ALL

SELECT
  c.phone,
  'campaign' as event_type,
  cc.sent_at,
  cc.template_name,
  'outbound'
FROM contacts c
JOIN campaign_contacts cc ON cc.contact_id = c.id

UNION ALL

SELECT
  fs.phone,
  'form_submission' as event_type,
  fs.created_at,
  fs.flow_name,
  'inbound'
FROM flow_submissions fs

ORDER BY event_at DESC;
```

### Fase 3: Integração com Agente de IA

#### Nova Tool: `updateLeadStage`

```typescript
const updateLeadStageTool = tool({
  description: `Atualiza o estágio do lead no funil de vendas.
Use quando detectar sinais de progressão:
- Perguntou PREÇO/VALOR → qualified
- Pediu PROPOSTA/ORÇAMENTO → negotiating
- Confirmou COMPRA/PAGAMENTO → closed
- Disse NÃO QUERO/SEM INTERESSE → lost`,
  inputSchema: z.object({
    stage: z.enum(['new', 'qualified', 'negotiating', 'closed', 'lost']),
    reason: z.string().describe('Motivo da mudança de estágio'),
    dealValue: z.number().optional().describe('Valor do negócio se mencionado'),
  }),
  execute: async ({ stage, reason, dealValue }) => {
    // Atualizar contato no banco
    await updateContactLeadStage(conversation.phone, {
      lead_stage: stage,
      stage_changed_at: new Date(),
      stage_change_reason: reason,
      deal_value: dealValue,
    })
    return { success: true, newStage: stage }
  },
})
```

#### Nova Tool: `getContactContext`

```typescript
const getContactContextTool = tool({
  description: 'Busca contexto completo do contato: histórico, estágio, valor, última interação.',
  inputSchema: z.object({}),
  execute: async () => {
    const contact = await getContactByPhone(conversation.phone)
    const timeline = await getContactTimeline(conversation.phone, { limit: 10 })

    return {
      name: contact.name,
      stage: contact.lead_stage,
      dealValue: contact.deal_value,
      score: contact.lead_score,
      source: contact.lead_source,
      lastInteraction: timeline[0],
      totalInteractions: timeline.length,
    }
  },
})
```

#### Instruções no System Prompt

```
## Gestão de Leads

Ao conversar com o cliente, analise sinais de progressão no funil:

SINAIS DE QUALIFICAÇÃO (new → qualified):
- Perguntou sobre preço, valor, custo
- Perguntou sobre disponibilidade
- Agendou horário/reunião
- Pediu mais informações específicas

SINAIS DE NEGOCIAÇÃO (qualified → negotiating):
- Pediu proposta ou orçamento
- Perguntou sobre formas de pagamento
- Perguntou sobre parcelamento ou desconto
- Comparou com concorrentes

SINAIS DE FECHAMENTO (negotiating → closed):
- Confirmou compra ou pagamento
- Pediu dados para transferência/PIX
- Disse "vou comprar" ou "fechado"

SINAIS DE PERDA (any → lost):
- Disse "não tenho interesse"
- Pediu para não receber mais mensagens
- Ficou 30+ dias sem responder

Quando detectar um sinal, use a tool updateLeadStage para atualizar o funil.
```

## Detecção Automática de Estágio

### Regras Baseadas em Eventos

| Evento | Ação |
|--------|------|
| Primeiro contato recebido | → `new` |
| Usou booking tool | → `qualified` |
| Preencheu formulário | → `qualified` |
| Opt-out (pediu para sair) | → `lost` |
| Sem resposta por 30 dias | → `lost` (automático) |
| Recebeu template de confirmação | → `closed` |

### Regras Baseadas em IA (análise de conversa)

| Intenção Detectada | Ação |
|--------------------|------|
| Pergunta sobre preço | → `qualified` |
| Pedido de proposta | → `negotiating` |
| Confirmação de compra | → `closed` |
| Recusa/desinteresse | → `lost` |

## UI Proposta

### Página /crm (Pipeline Kanban)

```
┌─────────────────────────────────────────────────────────────────┐
│  🎯 Pipeline de Vendas                      [+ Novo Lead] [⚙️]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  NOVOS (12)      QUALIFICADO (8)   NEGOCIANDO (5)   FECHADO (3)│
│  R$ 6.000        R$ 9.600          R$ 4.000         R$ 6.000   │
│  ┌──────────┐    ┌──────────┐      ┌──────────┐     ┌────────┐ │
│  │ João     │    │ Maria    │      │ Pedro    │     │ Ana    │ │
│  │ R$ 500   │    │ R$ 1.200 │      │ R$ 800   │     │ R$ 2k  │ │
│  │ 📱 Hoje  │    │ 📱 Ontem │      │ 📱 2d    │     │ ✅     │ │
│  └──────────┘    └──────────┘      └──────────┘     └────────┘ │
│  ┌──────────┐    ┌──────────┐      ┌──────────┐               │
│  │ Carlos   │    │ Julia    │      │ Lucas    │               │
│  │ R$ 300   │    │ R$ 800   │      │ R$ 1.500 │               │
│  └──────────┘    └──────────┘      └──────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Detalhe do Contato (drawer/modal)

- Informações básicas (nome, telefone, email)
- Estágio atual com histórico de mudanças
- Valor do negócio
- Score do lead
- Timeline de interações
- Notas e tags
- Botões de ação (mover estágio, agendar follow-up)

## Métricas e Relatórios

- Taxa de conversão por estágio
- Tempo médio em cada estágio
- Valor total do pipeline
- Leads por origem
- Performance do agente de IA na qualificação

## Arquivos a Criar/Modificar

### Novos Arquivos
- `app/(dashboard)/crm/page.tsx` - Página principal do CRM
- `components/features/crm/PipelineKanban.tsx` - Visualização kanban
- `components/features/crm/ContactDetailDrawer.tsx` - Detalhe do contato
- `components/features/crm/TimelineView.tsx` - Timeline de interações
- `hooks/useCRM.ts` - Hook controller do CRM
- `services/crmService.ts` - API service
- `lib/ai/tools/lead-stage-tool.ts` - Tool para agente
- `lib/ai/tools/contact-context-tool.ts` - Tool para agente
- `supabase/migrations/XXXXXX_add_crm_fields.sql` - Migration

### Arquivos a Modificar
- `lib/ai/agents/chat-agent.ts` - Adicionar novas tools
- `types.ts` - Adicionar tipos do CRM
- `app/(dashboard)/layout.tsx` - Adicionar link no menu

## Estimativa de Esforço

| Fase | Esforço | Descrição |
|------|---------|-----------|
| Fase 1 | 2-3 dias | Custom fields + UI básica |
| Fase 2 | 3-5 dias | Migration + API + UI completa |
| Fase 3 | 2-3 dias | Integração com agente de IA |
| **Total** | **7-11 dias** | |

## Referências

- Estrutura atual de contatos: `lib/supabase-db.ts` → `contactDb`
- API de contatos: `app/api/contacts/`
- Agente de IA: `lib/ai/agents/chat-agent.ts`
- Booking tool (exemplo): `lib/ai/tools/booking-tool.ts`
