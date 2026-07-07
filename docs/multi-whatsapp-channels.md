# Feature: Múltiplos Canais WhatsApp

> **Status:** Planejado
> **Prioridade:** Backlog
> **Data da Pesquisa:** Janeiro 2025
> **Autor:** Claude + Thales

---

## Índice

1. [Objetivo](#objetivo)
2. [Pesquisa de Mercado](#pesquisa-de-mercado)
3. [Análise de Concorrentes](#análise-de-concorrentes)
4. [Reclamações de Usuários](#reclamações-de-usuários)
5. [Erros a Evitar](#erros-a-evitar)
6. [Arquitetura Proposta](#arquitetura-proposta)
7. [Modelagem de Dados](#modelagem-de-dados)
8. [Interface/UX](#interfaceux)
9. [Fluxo de Credenciais](#fluxo-de-credenciais)
10. [Migração](#migração)
11. [Checklist de Implementação](#checklist-de-implementação)
12. [Referências](#referências)

---

## Objetivo

Permitir que o SmartZap gerencie **múltiplos números de WhatsApp**, podendo estar no mesmo WABA (WhatsApp Business Account) ou em WABAs diferentes. Casos de uso:

- Número de Marketing vs Suporte vs Vendas
- Projetos diferentes com números diferentes
- Múltiplas empresas/marcas
- Campanhas segmentadas por número

---

## Pesquisa de Mercado

### Estrutura da Meta (WhatsApp Cloud API)

```
Meta Business Manager
└── WhatsApp Business Account (WABA)
    ├── Phone Number 1 (phone_number_id: "123456789")
    │   ├── Quality Rating: independente
    │   ├── Messaging Limit: independente
    │   └── Display Name: independente
    ├── Phone Number 2 (phone_number_id: "987654321")
    │   └── ...
    └── Templates (COMPARTILHADOS entre todos os números do WABA)
```

### Limites Oficiais

| Aspecto | Limite |
|---------|--------|
| Números por WABA | Até 20 |
| WABAs por Business Manager | Até 20 (padrão) ou 1000 (OBA) |
| Templates | Compartilhados dentro do mesmo WABA |
| Token | Um System User Token funciona para todos os números do WABA |

### Cenários de Implementação

| Cenário | Token | Templates | Complexidade |
|---------|-------|-----------|--------------|
| Mesmo WABA, múltiplos números | 1 token | Compartilhados | Baixa |
| WABAs diferentes | N tokens | Separados | Alta |
| Mix (alguns no mesmo WABA, outros em WABAs diferentes) | N tokens | Por WABA | Alta |

### Endpoints Relevantes da API

| Operação | Endpoint |
|----------|----------|
| Listar números do WABA | `GET /{WABA_ID}/phone_numbers` |
| Registrar número | `POST /{PHONE_NUMBER_ID}/register` |
| Enviar mensagem | `POST /{PHONE_NUMBER_ID}/messages` |
| Listar templates | `GET /{WABA_ID}/message_templates` |

---

## Análise de Concorrentes

### Ferramentas Analisadas

| Ferramenta | País | Modelo de UX | Nota Geral |
|------------|------|--------------|------------|
| Wati | Internacional | Dropdown no topo | 3.8/5 |
| Respond.io | Internacional | Canais unificados | 4.2/5 |
| SleekFlow | Hong Kong | Dropdown + Tabs | 3.2/5 |
| Kommo | Internacional | Inbox unificada | 2.8/5 |
| Interakt | Índia | Dashboard central | 4.4/5 |
| Zenvia | Brasil | Multicanal | 8.8/10* |
| Take Blip | Brasil | Multi-bot | 77.8%* |

*Nota do Reclame Aqui

### Padrões de UX Identificados

#### 1. Seletor de Contexto (Dropdown Global)
**Usado por:** Wati, SleekFlow, Interakt

```
┌─────────────────────────────────────────┐
│ Dashboard    [▼ Marketing (+55 11)]     │
├─────────────────────────────────────────┤
│   Conteúdo muda baseado no número       │
│   selecionado no dropdown               │
└─────────────────────────────────────────┘
```

**Prós:** Familiar, simples, contexto claro
**Contras:** Precisa trocar para ver outro número

#### 2. Inbox Unificada com Badge
**Usado por:** Kommo, Respond.io

```
┌─────────────────────────────────────────┐
│ Conversas                    [Filtrar ▼]│
├─────────────────────────────────────────┤
│ João Silva      [Marketing]       14:32 │
│ Maria Costa     [Suporte]         14:28 │
│ Pedro Lima      [Marketing]       14:15 │
└─────────────────────────────────────────┘
```

**Prós:** Visão completa, sem troca de contexto
**Contras:** Pode ficar confuso com muitos números

#### 3. Hierarquia WABA > Números (Enterprise)
**Usado por:** SleekFlow, Take Blip

```
┌─────────────────────────────────────────┐
│ ▼ Empresa Principal (WABA)              │
│   ├── Marketing (+55 11 99999-1111)     │
│   ├── Suporte (+55 11 99999-2222)       │
│   └── Vendas (+55 11 99999-3333)        │
│ ▼ Projeto Secundário (WABA)             │
│   └── Atendimento (+55 21 88888-1111)   │
└─────────────────────────────────────────┘
```

**Prós:** Organização clara, escalável
**Contras:** Complexidade adicional

### Melhores Práticas do Mercado

| Prática | Descrição |
|---------|-----------|
| Nome amigável | "Marketing" ao invés de "+55 11 99999-1111" |
| Badge/Tag visual | Identificar origem em listas de conversas |
| Indicador de status | Quality rating (🟢🟡🔴) visível |
| Filtro por número | Atributo para filtrar contatos por origem |
| Templates compartilhados | Criar uma vez, usar em todos os números do WABA |
| Métricas por número | Analytics separados por canal |
| Default automático | Um número é o "principal" |

---

## Reclamações de Usuários

### Resumo por Plataforma

| Plataforma | % Reviews 1⭐ | Principal Dor |
|------------|---------------|---------------|
| Wati | 28% | Suporte inexistente + fragmentação de inbox |
| SleekFlow | ~35% | Bugs constantes + logout automático |
| Kommo | **49%** | Recursos não funcionam + API horrível |
| Interakt | ~15% | Curva de aprendizado + dashboard complexo |
| Zenvia | - | Cobrança indevida + perda de número |
| Take Blip | - | Implementação infinita + zero suporte |

### Problemas por Categoria

#### 1. Fragmentação de Dados (Crítico)

> **Wati:** "A single customer chatting across two WhatsApp Business numbers becomes two profiles, fragmenting history and wasting agent time."

**Impacto:** Cliente vira 2 perfis diferentes, histórico perdido, agente não sabe que é a mesma pessoa.

#### 2. Interface/UX Confusa

| Plataforma | Citação |
|------------|---------|
| Wati | "Dashboard UI/UX described as needing improvement" |
| Wati | "Finding WhatsApp templates isn't simple enough for sales reps" |
| SleekFlow | "Navigation challenging, particularly when submitting templates" |
| SleekFlow | "Automatically logout from phone every day" / "Miss notifications frequently" |
| Kommo | "Pipeline is hard to manage, unclear interface" |
| Interakt | "The dashboard is a little complex" |
| Interakt | "Mobile UI complicated" |

#### 3. Bugs e Instabilidade

| Plataforma | Citação |
|------------|---------|
| SleekFlow | "When message volumes surge, users report frequent lag, bugs and downtime" |
| SleekFlow | "Worst platform ever buggy" |
| Kommo | "The bot never works for me, which is the feature I needed the most" |
| Kommo | "Features that work in trial don't work after purchasing" |
| Interakt | "Sometimes app hangs, blank white screen comes" |
| Zenvia | "Instabilidade na plataforma há 3 meses, mensagens que não chegavam" |

#### 4. Analytics Pobres

| Plataforma | Citação |
|------------|---------|
| Wati | "Tough to get analytics data. While exporting users who replied, replies are missing" |
| SleekFlow | "Analytics offers basic data, depth is limited, date range cannot be customised" |
| Interakt | "Analytics described as inefficient" |

#### 5. Regra das 24h Mal Comunicada

> **Wati:** "Worst thing: chat gets expired in 24 hours, cannot send messages after"

#### 6. Suporte Inexistente/Lento

| Plataforma | Citação |
|------------|---------|
| Wati | "Support replies are always links to documentation already available" |
| Wati | "Non-existent support, many features locked to support which may never respond" |
| SleekFlow | "Only answer to all bugs is to upgrade to pro plan" |
| Kommo | "Spent over 2 hours on chat support just to delete account" |
| Interakt | "WhatsApp chat company don't have chat support. Takes 4-5 days to fix" |
| Take Blip | "Plataforma de atendimento que tem o pior atendimento que já vi" |

#### 7. Perda de Número WhatsApp

| Plataforma | Citação |
|------------|---------|
| Wati | "Account was hacked, WhatsApp Business account suspended" |
| Zenvia | "Não consegui recuperar o número cadastrado, perdendo clientes" |

---

## Erros a Evitar

### TOP 10 Erros das Plataformas Concorrentes

| # | Erro | Quem Comete | Impacto |
|---|------|-------------|---------|
| 1 | Inbox fragmentada por número | Wati | Cliente vira 2 perfis |
| 2 | Dashboard complexo demais | Interakt, SleekFlow | Usuário se perde |
| 3 | Bugs em produção | SleekFlow, Kommo | Perda de confiança |
| 4 | Logout automático | SleekFlow | Perde notificações |
| 5 | Templates difíceis de achar | Wati | Vendedor não usa |
| 6 | Analytics sem profundidade | Todos | Decisões no escuro |
| 7 | Sem indicador de 24h | Wati | Surpresa negativa |
| 8 | Mobile UI ruim | Interakt | Abandono |
| 9 | Seletor de número escondido | - | Confusão sobre contexto |
| 10 | Error messages genéricas | Vários | Frustração |

### Citações Marcantes

> **Sobre fragmentação (Wati):**
> "A single customer chatting across two WhatsApp numbers becomes two profiles, fragmenting history and wasting agent time."

> **Sobre bugs (SleekFlow):**
> "Worst platform ever buggy and bad customer service"

> **Sobre suporte (Take Blip):**
> "Uma plataforma de atendimento que não presta atendimento"

> **Sobre UX (Interakt):**
> "You need to leave your business and become developer to use their software"

> **Sobre features (Kommo):**
> "The bot never works for me, which is the feature I needed the most"

---

## Arquitetura Proposta

### Princípios Base

| Princípio | Decisão | Motivo |
|-----------|---------|--------|
| Inbox | Unificada com badges | Evitar fragmentação (erro do Wati) |
| Contatos | Um perfil, múltiplas origens | Merge automático por telefone |
| Templates | Por WABA (não global) | WABAs diferentes = templates diferentes |
| Seletor | Header global + override por campanha | Contexto claro + flexibilidade |
| Credenciais | Tabela separada | Escalável, isolado |
| Nomenclatura | "Canais" (não "Números") | Mais intuitivo, padrão do mercado |

### Estrutura de Dados

```
whatsapp_accounts (WABAs)
├── id, name, waba_id, access_token, status
│
└── whatsapp_channels (Números) [1:N]
    ├── id, account_id, name, phone_number_id
    ├── display_phone, is_default, quality_rating
    │
    ├── campaigns [1:N]
    │   └── channel_id → whatsapp_channels
    │
    └── contacts [1:N] (origem)
        └── source_channel_id → whatsapp_channels

templates
└── account_id → whatsapp_accounts (por WABA, não por canal)
```

---

## Modelagem de Dados

### Tabela: whatsapp_accounts (WABAs)

```sql
CREATE TABLE whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação
  name TEXT NOT NULL,                      -- "Empresa Principal"
  waba_id TEXT NOT NULL UNIQUE,            -- ID do WABA na Meta
  business_id TEXT,                        -- Meta Business Account ID

  -- Credenciais
  access_token TEXT NOT NULL,              -- Token de acesso
  token_expires_at TIMESTAMPTZ,            -- Expiração (se aplicável)

  -- Status
  status TEXT DEFAULT 'active'             -- active, suspended, disconnected
    CHECK (status IN ('active', 'suspended', 'disconnected')),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabela: whatsapp_channels (Números)

```sql
CREATE TABLE whatsapp_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relacionamento
  account_id UUID NOT NULL
    REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,

  -- Identificação
  name TEXT NOT NULL,                      -- "Marketing", "Suporte"
  phone_number_id TEXT NOT NULL UNIQUE,    -- ID do número na Meta
  display_phone TEXT NOT NULL,             -- "+55 11 99999-1111" (visual)

  -- Configuração
  is_default BOOLEAN DEFAULT FALSE,        -- Número padrão do sistema

  -- Status da Meta
  quality_rating TEXT DEFAULT 'unknown'    -- GREEN, YELLOW, RED, unknown
    CHECK (quality_rating IN ('GREEN', 'YELLOW', 'RED', 'unknown')),
  messaging_limit TEXT,                    -- TIER_1K, TIER_10K, TIER_100K, UNLIMITED
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'flagged', 'restricted', 'disconnected')),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garantir apenas um default
CREATE UNIQUE INDEX idx_whatsapp_channels_single_default
  ON whatsapp_channels (is_default)
  WHERE is_default = TRUE;
```

### Alterações em Tabelas Existentes

```sql
-- Campanhas: adicionar referência ao canal
ALTER TABLE campaigns
ADD COLUMN channel_id UUID REFERENCES whatsapp_channels(id);

-- Contatos: adicionar origem (qual número recebeu primeiro)
ALTER TABLE contacts
ADD COLUMN source_channel_id UUID REFERENCES whatsapp_channels(id);

-- Templates: vincular ao WABA (não ao número)
ALTER TABLE templates
ADD COLUMN account_id UUID REFERENCES whatsapp_accounts(id);
```

### Índices

```sql
CREATE INDEX idx_whatsapp_channels_account ON whatsapp_channels(account_id);
CREATE INDEX idx_campaigns_channel ON campaigns(channel_id);
CREATE INDEX idx_contacts_source_channel ON contacts(source_channel_id);
CREATE INDEX idx_templates_account ON templates(account_id);
```

---

## Interface/UX

### Header Global (Seletor de Canal)

```
┌─────────────────────────────────────────────────────────────────┐
│ SmartZap                                                        │
│                                                                 │
│ ┌─────────────────────────────────────┐                    👤   │
│ │ 📱 Marketing                      ▼ │                         │
│ │    +55 11 99999-1111         🟢     │                         │
│ └─────────────────────────────────────┘                         │
│                                                                 │
│  Dropdown aberto:                                               │
│ ┌─────────────────────────────────────┐                         │
│ │ 📱 Marketing              ✓    🟢   │ ← Default               │
│ │    +55 11 99999-1111                │                         │
│ ├─────────────────────────────────────┤                         │
│ │ 📱 Suporte                     🟢   │                         │
│ │    +55 11 99999-2222                │                         │
│ ├─────────────────────────────────────┤                         │
│ │ 📱 Vendas                      🟡   │ ← Quality warning       │
│ │    +55 21 88888-3333                │                         │
│ ├─────────────────────────────────────┤                         │
│ │ ⚙️ Gerenciar canais                 │                         │
│ └─────────────────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘

Legenda:
🟢 = Quality GREEN (saudável)
🟡 = Quality YELLOW (atenção)
🔴 = Quality RED (problema)
```

### Inbox Unificada

```
┌─────────────────────────────────────────────────────────────────┐
│ Conversas                                    [Todos ▼]  🔍      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 👤 João Silva                                               │ │
│ │    "Oi, quero saber do pedido..."           [Marketing] 📱  │ │
│ │    há 2 min                                    ● não lida   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 👤 Maria Costa                                              │ │
│ │    "Obrigada pelo atendimento!"              [Suporte] 📱   │ │
│ │    há 15 min                                         ✓✓     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Filtro: [Todos] [Marketing] [Suporte] [Vendas]                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Criar Campanha (Seletor de Canal)

```
┌─────────────────────────────────────────────────────────────────┐
│ Nova Campanha                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Nome da campanha                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Black Friday 2024                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Enviar de                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📱 Marketing (+55 11 99999-1111)                      ▼ │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ℹ️ Templates disponíveis: 45 • Quality: 🟢                    │
│                                                                 │
│  Template                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Selecione um template...                              ▼ │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ⚠️ Só aparecem templates do WABA selecionado                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Página de Configuração de Canais

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚙️ Configurações > Canais WhatsApp                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ WABA: Empresa Principal                                   │  │
│  │ ID: 123456789 • Token: ••••••••EAB                       │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │                                                           │  │
│  │  📱 Marketing                              ⭐ Default     │  │
│  │     +55 11 99999-1111                                     │  │
│  │     Quality: 🟢 GREEN • Limit: 10K/dia                   │  │
│  │     [Editar] [Sincronizar]                                │  │
│  │                                                           │  │
│  │  📱 Suporte                                               │  │
│  │     +55 11 99999-2222                                     │  │
│  │     Quality: 🟢 GREEN • Limit: 10K/dia                   │  │
│  │     [Editar] [Tornar Default] [Sincronizar]               │  │
│  │                                                           │  │
│  │  [+ Adicionar número a este WABA]                         │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [+ Conectar novo WABA]                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fluxo de Credenciais

### Código TypeScript Proposto

```typescript
// lib/whatsapp/credentials.ts

interface ChannelCredentials {
  channelId: string
  channelName: string
  phoneNumberId: string
  displayPhone: string
  accessToken: string
  wabaId: string
}

/**
 * Busca credenciais por canal específico
 */
export async function getChannelCredentials(
  channelId: string
): Promise<ChannelCredentials> {
  const { data, error } = await supabase
    .from('whatsapp_channels')
    .select(`
      id,
      name,
      phone_number_id,
      display_phone,
      account:whatsapp_accounts (
        waba_id,
        access_token
      )
    `)
    .eq('id', channelId)
    .single()

  if (error || !data) throw new Error('Canal não encontrado')

  return {
    channelId: data.id,
    channelName: data.name,
    phoneNumberId: data.phone_number_id,
    displayPhone: data.display_phone,
    accessToken: data.account.access_token,
    wabaId: data.account.waba_id
  }
}

/**
 * Busca canal default (fallback para código legado)
 */
export async function getDefaultChannel(): Promise<ChannelCredentials> {
  const { data, error } = await supabase
    .from('whatsapp_channels')
    .select(`
      id,
      name,
      phone_number_id,
      display_phone,
      account:whatsapp_accounts (
        waba_id,
        access_token
      )
    `)
    .eq('is_default', true)
    .single()

  // Fallback para settings legado se não houver canal default
  if (error || !data) {
    return getLegacyCredentials()
  }

  return {
    channelId: data.id,
    channelName: data.name,
    phoneNumberId: data.phone_number_id,
    displayPhone: data.display_phone,
    accessToken: data.account.access_token,
    wabaId: data.account.waba_id
  }
}

/**
 * Lista todos os canais ativos
 */
export async function listChannels(): Promise<ChannelCredentials[]> {
  const { data } = await supabase
    .from('whatsapp_channels')
    .select(`
      id,
      name,
      phone_number_id,
      display_phone,
      quality_rating,
      is_default,
      account:whatsapp_accounts (
        id,
        name,
        waba_id
      )
    `)
    .eq('status', 'active')
    .order('is_default', { ascending: false })
    .order('name')

  return data || []
}
```

### Fluxo de Envio de Campanha

```
┌─────────────────┐
│ Criar Campanha  │
│ channel_id: X   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ API /campaigns  │
│ /send           │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ getChannelCredentials(channel_id)   │
│ → phoneNumberId, accessToken        │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ POST graph.facebook.com/v24.0/     │
│      {phoneNumberId}/messages       │
│ Authorization: Bearer {accessToken} │
└─────────────────────────────────────┘
```

---

## Migração

### Script de Migração

```sql
-- Passo 1: Criar WABA com dados atuais de settings
INSERT INTO whatsapp_accounts (
  name,
  waba_id,
  business_id,
  access_token
)
SELECT
  'Principal',
  value->>'whatsapp_business_account_id',
  value->>'meta_business_id',
  value->>'whatsapp_token'
FROM settings
WHERE key = 'whatsapp_credentials'
LIMIT 1;

-- Passo 2: Criar canal default com número atual
INSERT INTO whatsapp_channels (
  account_id,
  name,
  phone_number_id,
  display_phone,
  is_default
)
SELECT
  (SELECT id FROM whatsapp_accounts LIMIT 1),
  'Principal',
  s.value->>'whatsapp_phone_id',
  s.value->>'display_phone_number',
  TRUE
FROM settings s
WHERE s.key = 'whatsapp_credentials'
LIMIT 1;

-- Passo 3: Vincular templates existentes ao WABA
UPDATE templates
SET account_id = (SELECT id FROM whatsapp_accounts LIMIT 1)
WHERE account_id IS NULL;

-- Passo 4: Vincular campanhas existentes ao canal default
UPDATE campaigns
SET channel_id = (SELECT id FROM whatsapp_channels WHERE is_default = TRUE LIMIT 1)
WHERE channel_id IS NULL;
```

---

## Checklist de Implementação

### Fase 1: Database + Migração
- [ ] Criar migration com tabelas `whatsapp_accounts` e `whatsapp_channels`
- [ ] Adicionar colunas em `campaigns`, `contacts`, `templates`
- [ ] Criar índices
- [ ] Script de migração de dados existentes
- [ ] Testar migração em ambiente de dev

### Fase 2: Backend
- [ ] Criar `lib/whatsapp/credentials.ts` com funções de busca
- [ ] Adaptar `getWhatsAppCredentials()` para usar nova estrutura
- [ ] Adaptar envio de campanhas para usar `channel_id`
- [ ] Adaptar sync de templates para filtrar por WABA
- [ ] API endpoints para CRUD de canais

### Fase 3: UI - Configurações
- [ ] Página de gerenciamento de canais em Settings
- [ ] Formulário para adicionar WABA
- [ ] Formulário para adicionar número a WABA
- [ ] Ações: editar, tornar default, sincronizar quality

### Fase 4: UI - Campanhas
- [ ] Seletor de canal no wizard de campanha
- [ ] Filtrar templates pelo WABA do canal selecionado
- [ ] Mostrar indicador de quality do canal

### Fase 5: UI - Header (Global)
- [ ] Componente de seletor de canal no header
- [ ] Dropdown com lista de canais
- [ ] Indicador de quality rating (🟢🟡🔴)
- [ ] Link para gerenciar canais

### Fase 6: Inbox (Futuro)
- [ ] Badge de origem nas conversas
- [ ] Filtro por canal
- [ ] Merge de contatos duplicados
- [ ] Indicador de janela 24h

### Fase 7: Analytics
- [ ] Métricas por canal
- [ ] Filtro de canal nos relatórios
- [ ] Export com informação de canal

---

## Referências

### Documentação Oficial
- [Meta WhatsApp Business Management API](https://developers.facebook.com/docs/whatsapp/business-management-api)
- [Meta WhatsApp Cloud API - Phone Numbers](https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers)

### Reviews e Análises
- [Wati - Trustpilot](https://www.trustpilot.com/review/wati.io)
- [Wati - G2](https://www.g2.com/products/wati/reviews)
- [SleekFlow - Trustpilot](https://www.trustpilot.com/review/sleekflow.io)
- [SleekFlow - G2](https://www.g2.com/products/sleekflow/reviews)
- [Kommo - Trustpilot](https://www.trustpilot.com/review/kommo.com)
- [Kommo - Capterra](https://www.capterra.com/p/120048/amoCRM/reviews/)
- [Interakt - G2](https://www.g2.com/products/haptik-interakt/reviews)
- [Zenvia - Reclame Aqui](https://www.reclameaqui.com.br/empresa/zenvia/)
- [Take Blip - Reclame Aqui](https://www.reclameaqui.com.br/empresa/take-blip/)

### Artigos de Concorrentes
- [Wati - Multiple WhatsApp Numbers](https://www.wati.io/multiple-whatsapp-numbers-feature/)
- [SleekFlow - Best Practices](https://help.sleekflow.io/whatsapp/best-practices-for-managing-your-whatsapp-accounts)
- [Respond.io - WhatsApp Integration](https://respond.io/integrations/whatsapp)
- [Braze - Multiple WhatsApp Accounts](https://www.braze.com/docs/user_guide/message_building_by_channel/whatsapp/overview/multiple_subscription_groups)
- [AWS - Add Phone Numbers to WABA](https://docs.aws.amazon.com/social-messaging/latest/userguide/managing-phone-numbers-add.html)

---

## Histórico de Revisões

| Data | Autor | Alteração |
|------|-------|-----------|
| 2025-01-19 | Claude + Thales | Criação inicial com pesquisa completa |
