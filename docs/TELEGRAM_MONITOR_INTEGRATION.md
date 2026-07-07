# SmartZap Telegram Mini App - Planejamento Completo

> **Status:** Planejamento
> **Data:** 2026-01-22
> **Versão:** 2.1
> **Modelo:** Single-tenant, Multi-atendente
> **Mudança Principal:** Migração de "Monitor via Topics" para "Mini App"

## Índice

1. [Problema e Contexto](#1-problema-e-contexto)
2. [Pesquisa de Mercado](#2-pesquisa-de-mercado)
3. [Solução Escolhida: Mini App](#3-solução-escolhida-mini-app)
4. [Arquitetura Técnica](#4-arquitetura-técnica)
5. [Autenticação e Vinculação](#5-autenticação-e-vinculação)
6. [Schema do Banco de Dados](#6-schema-do-banco-de-dados)
7. [Fluxos de Comunicação](#7-fluxos-de-comunicação)
8. [Interface do Usuário](#8-interface-do-usuário)
9. [Componentes Telegram Nativos](#9-componentes-telegram-nativos)
10. [Notificações e Tempo Real](#10-notificações-e-tempo-real)
11. [Pagamentos](#11-pagamentos)
12. [Desenvolvimento Local](#12-desenvolvimento-local)
13. [Implementação](#13-implementação)
14. [Referências](#14-referências)

---

## 1. Problema e Contexto

### 1.1 Dor do Usuário

O SmartZap possui agentes de IA e um inbox para atendimento humano. Porém, os operadores nem sempre estão no computador quando clientes precisam de atendimento humano. Isso causa:

- **Tempo de resposta alto** quando cliente solicita humano
- **Perda de vendas** por demora no atendimento
- **Frustração do cliente** esperando resposta
- **Operadores "presos" ao desktop** para monitorar conversas

### 1.2 Necessidades Identificadas

1. **Mobilidade**: Operadores precisam responder de qualquer lugar (celular)
2. **Monitoramento**: Supervisores querem ver como os bots estão atendendo
3. **Intervenção**: Capacidade de "assumir" uma conversa a qualquer momento
4. **Alertas**: Saber imediatamente quando cliente precisa de humano

---

## 2. Pesquisa de Mercado

### 2.1 Soluções Avaliadas

| Solução | Prós | Contras |
|---------|------|---------|
| **App Nativo (React Native)** | Melhor UX, push nativo | Custo alto, manutenção stores |
| **PWA** | Mesmo código web | Limitações iOS, UX inferior |
| **Bridge via Topics** | Simples, familiar | Setup manual, formatação limitada |
| **Mini App** ⭐ | Auth automática, UI nativa, pagamentos | Maior complexidade inicial |

### 2.2 Decisão: Mini App

**Escolhemos Mini App** pelos seguintes motivos:

1. **Auth Zero-Friction**: `initData` fornece identidade do usuário automaticamente via HMAC-SHA256
2. **UI Nativa**: MainButton, BackButton, popups integram perfeitamente com Telegram
3. **Pagamentos Nativos**: Telegram Stars permitem monetização sem integrações externas
4. **Storage Integrado**: CloudStorage persiste preferências por usuário
5. **Notificações Garantidas**: Bot pode enviar push quando há mensagem urgente
6. **Biometria**: Face ID/Touch ID para operações sensíveis

### 2.3 Mini App vs Topics (comparativo)

| Aspecto | Topics (v1) | Mini App (v2) |
|---------|-------------|---------------|
| Setup inicial | Manual (criar grupo, adicionar bot) | Vincular com código |
| Interface | Telegram nativo (limitado) | UI customizada completa |
| Autenticação | Verificar admin do grupo | initData assinado |
| Experiência | Mensagens em topics | App completo com inbox |
| Monetização | Não suportada | Telegram Stars nativo |
| Desenvolvimento | Mais simples | Mais complexo, mas mais poderoso |

---

## 3. Solução Escolhida: Mini App

### 3.1 Conceito

O **SmartZap Mini App** é uma aplicação web que roda dentro do Telegram, permitindo que usuários gerenciem suas conversas do WhatsApp diretamente no app.

**Importante**: O Mini App é uma **interface alternativa** para o SmartZap. O usuário já tem (ou configura) uma conta SmartZap no dashboard web. O Mini App apenas **conecta a essa conta existente** via código de vinculação.

### 3.2 Diagrama Conceitual

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TELEGRAM (Operador)                             │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    SmartZap Mini App                               │  │
│  │                                                                    │  │
│  │  ┌──────────────────────────────────────────────────────────────┐ │  │
│  │  │  INBOX                                    🔍 Buscar           │ │  │
│  │  ├──────────────────────────────────────────────────────────────┤ │  │
│  │  │                                                               │ │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐ │ │  │
│  │  │  │ 🚨 Maria Souza                         QUER HUMANO      │ │ │  │
│  │  │  │ "quero falar com atendente"                    14:32    │ │ │  │
│  │  │  └─────────────────────────────────────────────────────────┘ │ │  │
│  │  │                                                               │ │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐ │ │  │
│  │  │  │ 🤖 João Silva                              IA Ativo     │ │ │  │
│  │  │  │ "Obrigado pela informação!"                    14:28    │ │ │  │
│  │  │  └─────────────────────────────────────────────────────────┘ │ │  │
│  │  │                                                               │ │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐ │ │  │
│  │  │  │ 👤 Pedro Costa (você assumiu)              Humano       │ │ │  │
│  │  │  │ "Vou verificar isso pra você"                  13:45    │ │ │  │
│  │  │  └─────────────────────────────────────────────────────────┘ │ │  │
│  │  │                                                               │ │  │
│  │  ├──────────────────────────────────────────────────────────────┤ │  │
│  │  │  [            + Nova Conversa              ]    MainButton   │ │  │
│  │  └──────────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Estados de uma Conversa

| Status | Emoji | Descrição |
|--------|-------|-----------|
| `ai_active` | 🤖 | Bot atendendo normalmente |
| `human_active` | 👤 | Operador assumiu a conversa |
| `handoff_requested` | 🚨 | Cliente pediu humano (urgente) |
| `resolved` | ✅ | Resolvida |

---

## 4. Arquitetura Técnica

### 4.1 Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TELEGRAM CLIENT                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                 SmartZap Mini App (WebView)                        │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │     Next.js 16 + @telegram-apps/sdk-react                   │  │  │
│  │  │     React 19 + TailwindCSS + shadcn/ui                      │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SMARTZAP BACKEND                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │    Next.js      │  │     QStash      │  │     Meta WhatsApp       │  │
│  │   API Routes    │◄─┤    Workflows    │◄─┤      Cloud API          │  │
│  └────────┬────────┘  └─────────────────┘  └─────────────────────────┘  │
│           │                                                              │
│           ▼                                                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    Supabase (PostgreSQL)                          │  │
│  │   • telegram_users    • telegram_link_codes    • conversations    │  │
│  │   • messages          • settings               • contacts         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Dependências

```json
{
  "dependencies": {
    "@telegram-apps/sdk-react": "^2.x",
    "@telegram-apps/bridge": "^2.x",
    "next": "^16.x",
    "react": "^19.x",
    "@tanstack/react-query": "^5.x"
  }
}
```

### 4.3 Estrutura de Diretórios

```
app/
├── (telegram)/                    # Rotas do Mini App
│   ├── layout.tsx                 # TelegramSDKProvider
│   ├── page.tsx                   # Inbox principal
│   ├── conversation/[id]/page.tsx # Chat individual
│   ├── settings/page.tsx          # Configurações
│   └── link/page.tsx              # Vinculação com código
│
├── api/
│   └── telegram/
│       ├── webhook/route.ts       # Webhook do bot
│       ├── validate/route.ts      # Validar initData
│       ├── link/route.ts          # Vincular conta
│       ├── generate-code/route.ts # Gerar código no dashboard
│       └── mini-app/
│           ├── conversations/route.ts
│           ├── messages/route.ts
│           └── send/route.ts

components/
├── telegram/
│   ├── TelegramSDKProvider.tsx    # Provider com mock dev
│   ├── MainButton.tsx             # Wrapper MainButton
│   ├── BackButton.tsx             # Wrapper BackButton
│   └── ThemeProvider.tsx          # Sync theme Telegram

hooks/
├── telegram/
│   ├── useTelegramUser.ts         # Dados do usuário
│   ├── useTelegramTheme.ts        # Theme colors
│   ├── useCloudStorage.ts         # CloudStorage wrapper
│   ├── useMainButton.ts           # MainButton state
│   └── useTelegramMock.ts         # Mock para dev

lib/
├── telegram/
│   ├── validate-init-data.ts      # Validação HMAC
│   ├── bot-api.ts                 # Telegram Bot API
│   ├── auth-middleware.ts         # Middleware autenticação
│   └── constants.ts               # Bot token, URLs
```

---

## 5. Autenticação e Vinculação

### 5.1 Fluxo de Vinculação (Código Temporário)

O Mini App **não** configura credenciais da Meta. Ele apenas se conecta a uma conta SmartZap já existente.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  DASHBOARD WEB   │     │   SMARTZAP API   │     │    MINI APP      │
│  (já autenticado)│     │                  │     │   (Telegram)     │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │
         │ 1. POST /api/telegram/generate-code            │
         │ (com session cookie)                           │
         │───────────────────────▶│                        │
         │                        │                        │
         │                        │ 2. INSERT telegram_link_codes
         │                        │    { code, account_id, expires_at }
         │                        │                        │
         │ 3. { code: "ABC-123-XYZ" }                     │
         │◀───────────────────────│                        │
         │                        │                        │
         │  ════════════════════════════════════════════  │
         │       Usuário vê código e abre Mini App        │
         │  ════════════════════════════════════════════  │
         │                        │                        │
         │                        │  4. POST /api/telegram/link
         │                        │  { code, initData }
         │                        │◀───────────────────────│
         │                        │                        │
         │                        │ 5. Valida initData (HMAC)
         │                        │    Valida código (não expirado, não usado)
         │                        │    Vincula telegram_id ↔ account_id
         │                        │                        │
         │                        │ 6. { success, account }
         │                        │────────────────────────▶│
         │                        │                        │
         │                        │      Mini App pronto!  │
```

### 5.2 UI de Vinculação no Dashboard

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Configurações > Telegram Mini App                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  📱 Vincular Telegram                                                    │
│                                                                          │
│  Para acessar o SmartZap pelo Telegram, abra o Mini App e               │
│  insira o código abaixo:                                                 │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                                                                      ││
│  │                    ABC-123-XYZ                                       ││
│  │                                                                      ││
│  │                (expira em 5 minutos)                                 ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  [📋 Copiar Código]     [🔄 Gerar Novo]                                 │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  🤖 Não tem o bot ainda?                                                │
│  Abra @smartzap_bot no Telegram e clique em "Abrir App"                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 UI de Vinculação no Mini App

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [←]                 SmartZap                                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                          🔗                                              │
│                                                                          │
│              Vincular sua conta SmartZap                                 │
│                                                                          │
│  Digite o código gerado no dashboard:                                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                                                                      ││
│  │    [  A  ] [  B  ] [  C  ] - [  1  ] [  2  ] [  3  ] - [  X  ]      ││
│  │                                                                      ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  Não tem código? Acesse o dashboard em                                   │
│  smartzap.com.br/settings/telegram                                      │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  [                    Vincular                    ]     ← MainButton     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.4 Validação do initData (Backend)

```typescript
// lib/telegram/validate-init-data.ts
import crypto from 'crypto';

interface TelegramInitData {
  query_id?: string;
  user?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    photo_url?: string;
  };
  auth_date: number;
  hash: string;
}

export function validateInitData(
  initDataRaw: string,
  botToken: string
): TelegramInitData | null {
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get('hash');
  params.delete('hash');

  // Ordenar alfabeticamente e criar string de verificação
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // Calcular HMAC-SHA256
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (calculatedHash !== hash) {
    return null; // Assinatura inválida
  }

  // Verificar expiração (24h)
  const authDate = parseInt(params.get('auth_date') || '0');
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 86400) {
    return null; // Expirado
  }

  return {
    query_id: params.get('query_id') || undefined,
    user: params.get('user') ? JSON.parse(params.get('user')!) : undefined,
    auth_date: authDate,
    hash: hash!,
  };
}
```

### 5.5 Middleware de Autenticação

```typescript
// lib/telegram/auth-middleware.ts
import { validateInitData } from './validate-init-data';
import { supabase } from '@/lib/supabase-db';

export interface TelegramAuthContext {
  telegramId: number;
  userId: string;      // UUID do telegram_user
  role: 'admin' | 'operator' | 'viewer';
  user: {
    firstName: string;
    lastName?: string;
    username?: string;
    isPremium?: boolean;
  };
}

export async function authenticateTelegram(
  request: Request
): Promise<TelegramAuthContext | null> {
  // 1. Extrair initData do header
  const initData = request.headers.get('X-Telegram-Init-Data');
  if (!initData) return null;

  // 2. Validar assinatura HMAC
  const telegramUser = validateInitData(initData, process.env.TELEGRAM_BOT_TOKEN!);
  if (!telegramUser?.user) return null;

  // 3. Buscar atendente vinculado
  const { data: tgUser } = await supabase
    .from('telegram_users')
    .select('id, role')
    .eq('telegram_id', telegramUser.user.id)
    .single();

  if (!tgUser) return null; // Não vinculado

  // 4. Atualizar last_active_at (fire-and-forget)
  supabase
    .from('telegram_users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', tgUser.id)
    .then(() => {}); // Não aguarda

  return {
    telegramId: telegramUser.user.id,
    userId: tgUser.id,
    role: tgUser.role,
    user: {
      firstName: telegramUser.user.first_name,
      lastName: telegramUser.user.last_name,
      username: telegramUser.user.username,
      isPremium: telegramUser.user.is_premium,
    },
  };
}

// Helper para verificar permissões
export function hasPermission(
  context: TelegramAuthContext,
  action: 'view' | 'respond' | 'configure'
): boolean {
  const permissions = {
    admin: ['view', 'respond', 'configure'],
    operator: ['view', 'respond'],
    viewer: ['view'],
  };
  return permissions[context.role].includes(action);
}
```

---

## 6. Schema do Banco de Dados

> **Modelo:** Single-tenant, Multi-atendente
> **Compliance:** Supabase Best Practices (Opção A - Backend-First)

### 6.1 Nova Tabela: `telegram_users`

Armazena os **atendentes** que podem acessar o Mini App. Múltiplos atendentes podem usar a mesma instância SmartZap.

```sql
CREATE TABLE telegram_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação Telegram (imutável após criação)
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  language_code TEXT DEFAULT 'pt',
  is_premium BOOLEAN DEFAULT false,
  photo_url TEXT,

  -- Configurações do atendente
  notifications_enabled BOOLEAN DEFAULT true,

  -- Role do atendente (para futuras permissões)
  role TEXT DEFAULT 'operator',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_telegram_users_role CHECK (role IN ('admin', 'operator', 'viewer'))
);

CREATE INDEX idx_telegram_users_telegram_id ON telegram_users(telegram_id);
CREATE INDEX idx_telegram_users_role ON telegram_users(role);
```

**Roles disponíveis:**
| Role | Permissões |
|------|------------|
| `admin` | Tudo: ver, responder, configurar |
| `operator` | Atender: ver e responder conversas |
| `viewer` | Apenas visualizar (monitoramento) |

### 6.2 Nova Tabela: `telegram_link_codes`

Códigos temporários para vincular um Telegram ao SmartZap. Expiram em 5 minutos.

```sql
CREATE TABLE telegram_link_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Código de vinculação (ex: "ABC-123-XYZ")
  code TEXT UNIQUE NOT NULL,

  -- Quem gerou o código (opcional, para auditoria)
  generated_by TEXT,

  -- Controle de uso
  used BOOLEAN DEFAULT false,
  used_by_telegram_id BIGINT,
  used_at TIMESTAMPTZ,

  -- Expiração
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Constraints
  CONSTRAINT chk_telegram_link_codes_expiration CHECK (expires_at > created_at)
);

CREATE INDEX idx_telegram_link_codes_code ON telegram_link_codes(code);
CREATE INDEX idx_telegram_link_codes_expires ON telegram_link_codes(expires_at);
CREATE INDEX idx_telegram_link_codes_used ON telegram_link_codes(used) WHERE used = false;
```

### 6.3 Configurações na Tabela `settings`

```sql
-- Novos campos (key-value pairs)
telegram_bot_token          TEXT      -- Token do @BotFather
telegram_bot_username       TEXT      -- Username do bot (@smartzap_bot)
telegram_webhook_secret     TEXT      -- Secret para validar webhooks
telegram_enabled            BOOLEAN   -- Liga/desliga integração
telegram_mini_app_url       TEXT      -- URL do Mini App
```

### 6.4 Funções SQL Auxiliares

```sql
-- Gerar código de vinculação
SELECT generate_telegram_link_code();
-- Retorna: "ABC-123-XYZ"

-- Gerar com expiração customizada (10 minutos)
SELECT generate_telegram_link_code(NULL, 10);

-- Usar código de vinculação
SELECT * FROM use_telegram_link_code(
  'ABC-123-XYZ',  -- código
  123456789,      -- telegram_id
  'João',         -- first_name
  'Silva',        -- last_name
  'joaosilva',    -- username
  'pt',           -- language_code
  false,          -- is_premium
  NULL            -- photo_url
);
-- Retorna: (success: true, message: 'Vinculação realizada', user_id: UUID)

-- Limpar códigos expirados (para cron job)
SELECT cleanup_expired_telegram_link_codes();
```

### 6.5 Migration

Arquivo: `supabase/migrations/20260122000000_telegram_miniapp.sql`

A migration inclui:
- ✅ Tabelas com RLS habilitado
- ✅ Policies permissivas (backend usa service_role)
- ✅ Índices em colunas de filtro
- ✅ CHECK constraints
- ✅ Trigger para updated_at
- ✅ Funções auxiliares (gerar/usar código)

### 6.6 Diagrama do Schema

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              settings                                    │
│                         (tabela existente)                              │
├─────────────────────────────────────────────────────────────────────────┤
│  + telegram_bot_token         TEXT                                       │
│  + telegram_bot_username      TEXT                                       │
│  + telegram_webhook_secret    TEXT                                       │
│  + telegram_enabled           BOOLEAN                                    │
│  + telegram_mini_app_url      TEXT                                       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          telegram_users                                  │
│                    (atendentes vinculados)                              │
├─────────────────────────────────────────────────────────────────────────┤
│  id                        UUID        PK                                │
│  telegram_id               BIGINT      UNIQUE, IDX                       │
│  telegram_username         TEXT                                          │
│  first_name                TEXT        NOT NULL                          │
│  last_name                 TEXT                                          │
│  language_code             TEXT        DEFAULT 'pt'                      │
│  is_premium                BOOLEAN     DEFAULT false                     │
│  photo_url                 TEXT                                          │
│  notifications_enabled     BOOLEAN     DEFAULT true                      │
│  role                      TEXT        DEFAULT 'operator', CHECK         │
│  created_at                TIMESTAMPTZ                                   │
│  updated_at                TIMESTAMPTZ TRIGGER                           │
│  last_active_at            TIMESTAMPTZ                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  RLS: ENABLED (policies permissivas - backend usa service_role)         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                       telegram_link_codes                                │
│                   (códigos temporários 5min)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  id                        UUID        PK                                │
│  code                      TEXT        UNIQUE, IDX (ex: ABC-123-XYZ)    │
│  generated_by              TEXT        Auditoria                         │
│  used                      BOOLEAN     DEFAULT false, IDX (partial)     │
│  used_by_telegram_id       BIGINT                                        │
│  used_at                   TIMESTAMPTZ                                   │
│  created_at                TIMESTAMPTZ                                   │
│  expires_at                TIMESTAMPTZ IDX, CHECK (> created_at)        │
├─────────────────────────────────────────────────────────────────────────┤
│  RLS: ENABLED (policies permissivas - backend usa service_role)         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Fluxos de Comunicação

### 7.1 Arquitetura de Comunicação

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Mini App    │     │   Next.js    │     │   Supabase   │
│  (Telegram)  │     │     API      │     │              │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │ HTTPS + initData   │                    │
       │───────────────────▶│                    │
       │                    │                    │
       │                    │ Auth Middleware    │
       │                    │ (valida initData,  │
       │                    │  busca account_id) │
       │                    │                    │
       │                    │ Query/Mutation     │
       │                    │───────────────────▶│
       │                    │                    │
       │                    │◀───────────────────│
       │                    │                    │
       │◀───────────────────│                    │
       │                    │                    │
```

### 7.2 Fluxo: Listar Conversas

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Mini App    │     │   Next.js    │     │   Supabase   │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │ GET /api/telegram/conversations        │
       │ Header: X-Telegram-Init-Data           │
       │───────────────────▶│                    │
       │                    │                    │
       │                    │ 1. Valida initData │
       │                    │ 2. Extrai telegram_id
       │                    │ 3. Busca account_id│
       │                    │                    │
       │                    │ SELECT * FROM conversations
       │                    │ WHERE account_id = ?
       │                    │───────────────────▶│
       │                    │                    │
       │                    │ [conversations]    │
       │                    │◀───────────────────│
       │                    │                    │
       │ { conversations }  │                    │
       │◀───────────────────│                    │
```

### 7.3 Fluxo: Enviar Mensagem pelo Mini App

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Mini App    │     │   Next.js    │     │   Supabase   │     │    Meta      │
│  (Telegram)  │     │     API      │     │              │     │  WhatsApp    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │                    │
       │ POST /api/telegram/send-message        │                    │
       │ { conversationId, text }               │                    │
       │───────────────────▶│                    │                    │
       │                    │                    │                    │
       │                    │ 1. Autenticar     │                    │
       │                    │                    │                    │
       │                    │ 2. Buscar credentials                  │
       │                    │    da conta vinculada                  │
       │                    │───────────────────▶│                    │
       │                    │                    │                    │
       │                    │◀───────────────────│                    │
       │                    │                    │                    │
       │                    │ 3. POST /v21.0/{phone_id}/messages     │
       │                    │───────────────────────────────────────▶│
       │                    │                    │                    │
       │                    │◀───────────────────────────────────────│
       │                    │                    │                    │
       │                    │ 4. Salvar mensagem │                    │
       │                    │───────────────────▶│                    │
       │                    │                    │                    │
       │ { success }        │                    │                    │
       │◀───────────────────│                    │                    │
```

### 7.4 Fluxo: Receber Mensagem WhatsApp (Tempo Real)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Meta      │     │   Next.js    │     │   Supabase   │     │  Mini App    │
│  WhatsApp    │     │   Webhook    │     │   Realtime   │     │  (Telegram)  │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │                    │
       │ POST /api/whatsapp/webhook             │                    │
       │───────────────────▶│                    │                    │
       │                    │                    │                    │
       │                    │ 1. Processa msg   │                    │
       │                    │    (IA, routing)  │                    │
       │                    │                    │                    │
       │                    │ 2. INSERT message │                    │
       │                    │    UPDATE conversation                 │
       │                    │───────────────────▶│                    │
       │                    │                    │                    │
       │                    │                    │ 3. Realtime event  │
       │                    │                    │    (postgres_changes)
       │                    │                    │───────────────────▶│
       │                    │                    │                    │
       │                    │                    │     4. UI atualiza │
       │                    │                    │                    │
```

---

## 8. Interface do Usuário

### 8.1 Tela: Inbox (Lista de Conversas)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SmartZap                                            🔍  ⚙️             │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │   🟢 Ativos       🤖 IA         📥 Todos                           ││
│  └─────────────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ 👤 João Silva                                              14:32   ││
│  │ Quero saber sobre o produto premium que vocês têm...               ││
│  │ 🤖 Atendido por IA                                                 ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ 👤 Maria Santos                                        ●   14:28   ││
│  │ Preciso de ajuda urgente com meu pedido!                           ││
│  │ 🚨 Handoff solicitado                                              ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ 👤 Pedro Costa                                             13:45   ││
│  │ Obrigado pela atenção! Até mais.                                   ││
│  │ ✅ Resolvido                                                       ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  [                    + Nova Conversa                    ]  MainButton  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Tela: Conversa Individual

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [←]  João Silva                                      👤  📞  ⋮        │
│       Online • WhatsApp                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│            ┌─────────────────────────────────────────┐                  │
│            │ Olá! Vi o anúncio do produto premium   │ 14:30            │
│            │ Podem me dar mais informações?          │                  │
│            └─────────────────────────────────────────┘                  │
│                                                                          │
│  ┌─────────────────────────────────────────┐                            │
│  │ Olá João! O produto premium custa       │ 14:31                      │
│  │ R$ 99,90/mês e inclui todas as          │ 🤖                         │
│  │ funcionalidades. Posso ajudar?          │                            │
│  └─────────────────────────────────────────┘                            │
│                                                                          │
│            ┌─────────────────────────────────────────┐                  │
│            │ Tem desconto pra plano anual?          │ 14:32            │
│            └─────────────────────────────────────────┘                  │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  [🤖 IA Ativo]     [👤 Assumir]     [📋 Info]                          │
├─────────────────────────────────────────────────────────────────────────┤
│  [  Digite uma mensagem...                            ]  📎            │
│  [                       Enviar                       ]    MainButton   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Tela: Configurações

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [←]                    Configurações                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  CONEXÃO                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ 📱 WhatsApp                                                         ││
│  │ +55 11 99999-9999                                    [Conectado]    ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  AGENTE DE IA                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ 🤖 Assistente Virtual                                               ││
│  │ Modelo: GPT-4o                                          [Editar]    ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  NOTIFICAÇÕES                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ 🔔 Novas mensagens                                           [✓]   ││
│  │ 🚨 Handoff requests                                          [✓]   ││
│  │ 📊 Resumo diário                                             [ ]   ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  CONTA                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ ⭐ Plano: Pro                                              [Mudar]  ││
│  │ 📈 Uso: 1.234 mensagens este mês                                    ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  [                        Salvar                       ]    MainButton  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Componentes Telegram Nativos

### 9.1 MainButton

```typescript
// hooks/telegram/useMainButton.ts
import { useMainButton as useTgMainButton } from '@telegram-apps/sdk-react';
import { useEffect } from 'react';

interface MainButtonConfig {
  text: string;
  onClick: () => void;
  isLoading?: boolean;
  isEnabled?: boolean;
  color?: string;
  textColor?: string;
}

export function useMainButton(config: MainButtonConfig) {
  const mainButton = useTgMainButton();

  useEffect(() => {
    if (!mainButton) return;

    mainButton.setParams({
      text: config.text,
      backgroundColor: config.color,
      textColor: config.textColor,
      isEnabled: config.isEnabled ?? true,
      isLoaderVisible: config.isLoading ?? false,
    });

    mainButton.show();
    return () => mainButton.hide();
  }, [mainButton, config]);

  useEffect(() => {
    if (!mainButton) return;
    mainButton.on('click', config.onClick);
    return () => mainButton.off('click', config.onClick);
  }, [mainButton, config.onClick]);

  return mainButton;
}
```

### 9.2 BackButton

```typescript
// hooks/telegram/useBackButton.ts
import { useBackButton as useTgBackButton } from '@telegram-apps/sdk-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function useBackButton(customHandler?: () => void) {
  const backButton = useTgBackButton();
  const router = useRouter();

  useEffect(() => {
    if (!backButton) return;

    const handleBack = () => {
      if (customHandler) {
        customHandler();
      } else {
        router.back();
      }
    };

    backButton.show();
    backButton.on('click', handleBack);

    return () => {
      backButton.hide();
      backButton.off('click', handleBack);
    };
  }, [backButton, customHandler, router]);

  return backButton;
}
```

### 9.3 Haptic Feedback

```typescript
// hooks/telegram/useHaptic.ts
import { useHapticFeedback } from '@telegram-apps/sdk-react';
import { useCallback } from 'react';

export function useHaptic() {
  const haptic = useHapticFeedback();

  const impact = useCallback(
    (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
      haptic?.impactOccurred(style);
    },
    [haptic]
  );

  const notification = useCallback(
    (type: 'success' | 'warning' | 'error') => {
      haptic?.notificationOccurred(type);
    },
    [haptic]
  );

  const selection = useCallback(() => {
    haptic?.selectionChanged();
  }, [haptic]);

  return { impact, notification, selection };
}
```

### 9.4 Theme Sync

```typescript
// components/telegram/ThemeProvider.tsx
'use client';

import { useMiniApp, useThemeParams } from '@telegram-apps/sdk-react';
import { useEffect } from 'react';

export function TelegramThemeSync() {
  const miniApp = useMiniApp();
  const themeParams = useThemeParams();

  useEffect(() => {
    if (!themeParams) return;

    const root = document.documentElement;
    root.style.setProperty('--tg-bg', themeParams.backgroundColor || '#ffffff');
    root.style.setProperty('--tg-text', themeParams.textColor || '#000000');
    root.style.setProperty('--tg-hint', themeParams.hintColor || '#999999');
    root.style.setProperty('--tg-link', themeParams.linkColor || '#2481cc');
    root.style.setProperty('--tg-button', themeParams.buttonColor || '#2481cc');
    root.style.setProperty('--tg-button-text', themeParams.buttonTextColor || '#ffffff');
    root.style.setProperty('--tg-secondary', themeParams.secondaryBackgroundColor || '#f0f0f0');

    // Aplicar classe dark/light
    if (miniApp?.isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [miniApp, themeParams]);

  return null;
}
```

---

## 10. Notificações e Tempo Real

### 10.1 Notificação Push via Bot

Quando chega uma mensagem urgente (handoff), o bot envia push notification:

```typescript
// lib/telegram/bot-api.ts
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  options?: {
    parseMode?: 'HTML' | 'Markdown';
    replyMarkup?: object;
  }
) {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode || 'HTML',
      reply_markup: options?.replyMarkup,
    }),
  });

  return response.json();
}

// Notificação de handoff
export async function notifyHandoffRequest(
  telegramUserId: number,
  contact: { name: string; reason: string; conversationId: string }
) {
  await sendTelegramMessage(
    telegramUserId,
    `🚨 <b>Handoff solicitado!</b>\n\n` +
      `Cliente: ${contact.name}\n` +
      `Motivo: ${contact.reason}`,
    {
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: '👤 Assumir Atendimento',
              web_app: {
                url: `${process.env.MINI_APP_URL}/conversation/${contact.conversationId}?takeover=true`,
              },
            },
          ],
        ],
      },
    }
  );
}
```

### 10.2 Realtime via Supabase

```typescript
// hooks/telegram/useConversationsRealtime.ts
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useHaptic } from './useHaptic';

export function useConversationsRealtime(accountId: string) {
  const queryClient = useQueryClient();
  const { notification } = useHaptic();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`conversations:${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `account_id=eq.${accountId}`,
        },
        (payload) => {
          // Invalidar cache
          queryClient.invalidateQueries({ queryKey: ['conversations'] });

          // Haptic feedback
          if (payload.eventType === 'UPDATE') {
            notification('success');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, queryClient, notification]);
}
```

---

## 11. Pagamentos

### 11.1 Telegram Stars

O Mini App suporta pagamentos nativos via **Telegram Stars** (XTR).

```typescript
// Criar invoice (backend)
export async function POST(request: Request) {
  const { planId, telegramUserId } = await request.json();

  const plan = PLANS[planId];

  const response = await fetch(`${TELEGRAM_API}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: plan.title,
      description: plan.description,
      payload: JSON.stringify({ planId, telegramUserId }),
      currency: 'XTR', // Telegram Stars
      prices: [{ label: plan.title, amount: plan.priceStars }],
    }),
  });

  const { result: invoiceUrl } = await response.json();
  return Response.json({ invoiceUrl });
}
```

### 11.2 Planos

```typescript
const PLANS = {
  starter: {
    title: 'SmartZap Starter',
    description: '500 mensagens/mês, 1 agente IA',
    priceStars: 99, // ~$1.99
  },
  pro: {
    title: 'SmartZap Pro',
    description: '5.000 mensagens/mês, agentes ilimitados',
    priceStars: 499, // ~$9.99
  },
  enterprise: {
    title: 'SmartZap Enterprise',
    description: 'Mensagens ilimitadas, suporte dedicado',
    priceStars: 1999, // ~$39.99
  },
};
```

---

## 12. Desenvolvimento Local

### 12.1 Mock do Ambiente Telegram

```typescript
// hooks/telegram/useTelegramMock.ts
'use client';

import { mockTelegramEnv, isTMA } from '@telegram-apps/sdk-react';

export function useTelegramMock() {
  if (typeof window === 'undefined' || isTMA('simple')) {
    return;
  }

  if (process.env.NODE_ENV === 'development') {
    const MOCK_INIT_DATA = new URLSearchParams([
      ['user', JSON.stringify({
        id: 123456789,
        first_name: 'Dev',
        last_name: 'User',
        username: 'devuser',
        language_code: 'pt',
        is_premium: true,
      })],
      ['hash', 'mock_hash'],
      ['auth_date', String(Math.floor(Date.now() / 1000))],
    ]).toString();

    mockTelegramEnv({
      themeParams: {
        backgroundColor: '#18181b',
        textColor: '#ffffff',
        hintColor: '#a1a1aa',
        linkColor: '#60a5fa',
        buttonColor: '#22c55e',
        buttonTextColor: '#ffffff',
        secondaryBackgroundColor: '#27272a',
      },
      initData: MOCK_INIT_DATA,
      initDataRaw: MOCK_INIT_DATA,
      version: '8.0',
      platform: 'tdesktop',
    });

    console.log('🤖 Telegram environment mocked');
  }
}
```

### 12.2 Testando no Celular

1. **Port Forwarding com ngrok**:
```bash
ngrok http 3000
# Copiar URL HTTPS
```

2. **Configurar BotFather**:
   - `/mybots` → Selecionar bot → Bot Settings → Menu Button
   - Colar URL do ngrok

3. **Abrir no Telegram**:
   - Abrir chat com @smartzap_bot
   - Clicar no Menu Button

### 12.3 Debugging com Eruda

```typescript
// app/(telegram)/layout.tsx
useEffect(() => {
  if (process.env.NODE_ENV === 'development') {
    import('eruda').then((eruda) => eruda.default.init());
  }
}, []);
```

---

## 13. Implementação

### 13.1 Roadmap

| Fase | Duração | Entregas |
|------|---------|----------|
| **1. Fundação** | 1-2 sem | Bot, SDK Provider, mock dev, validação initData |
| **2. Vinculação** | 1 sem | Geração de código, tela de link, tabelas DB |
| **3. Core** | 2-3 sem | Inbox, conversa individual, envio de mensagens |
| **4. Tempo Real** | 1-2 sem | Notificações push, Supabase Realtime, haptics |
| **5. Avançado** | 2 sem | Handoff, configuração IA, biometria |
| **6. Monetização** | 1 sem | Telegram Stars, planos |

### 13.2 Arquivos a Criar

```
supabase/migrations/
  20260122_telegram_miniapp.sql

lib/
  telegram/
    validate-init-data.ts
    auth-middleware.ts
    bot-api.ts

app/
  (telegram)/
    layout.tsx              # TelegramSDKProvider
    page.tsx                # Inbox
    link/page.tsx           # Vinculação
    conversation/[id]/page.tsx
    settings/page.tsx
  api/
    telegram/
      webhook/route.ts
      validate/route.ts
      link/route.ts
      generate-code/route.ts
      mini-app/
        conversations/route.ts
        messages/route.ts
        send/route.ts

components/
  telegram/
    TelegramSDKProvider.tsx
    ThemeProvider.tsx

hooks/
  telegram/
    useMainButton.ts
    useBackButton.ts
    useHaptic.ts
    useTelegramMock.ts
    useConversationsRealtime.ts
```

### 13.3 Comandos do Bot

```typescript
const BOT_COMMANDS = [
  { command: 'start', description: 'Abrir SmartZap Mini App' },
  { command: 'inbox', description: 'Ver conversas ativas' },
  { command: 'settings', description: 'Configurações' },
  { command: 'help', description: 'Ajuda' },
  { command: 'status', description: 'Status da conexão WhatsApp' },
];
```

---

## 14. Referências

### 14.1 Telegram Mini Apps

| Recurso | URL |
|---------|-----|
| Documentação Oficial | https://core.telegram.org/bots/webapps |
| @telegram-apps/sdk-react | https://docs.telegram-mini-apps.com/ |
| Telegram Bot API | https://core.telegram.org/bots/api |
| Telegram Payments | https://core.telegram.org/bots/payments |

### 14.2 Supabase

| Recurso | URL |
|---------|-----|
| Row Level Security | https://supabase.com/docs/guides/database/postgres/row-level-security |
| Realtime | https://supabase.com/docs/guides/realtime |

---

## Changelog

| Data | Versão | Mudanças |
|------|--------|----------|
| 2026-01-21 | 1.0 | Documento inicial (Monitor via Topics) |
| 2026-01-21 | 1.1 | Revisão de arquitetura Supabase |
| 2026-01-21 | 1.2 | Revisão de arquitetura Telegram Bot API |
| 2026-01-21 | **2.0** | **MIGRAÇÃO COMPLETA PARA MINI APP**: Removida abordagem Topics, adicionada arquitetura Mini App com vinculação por código, autenticação via initData, UI completa, pagamentos Telegram Stars |
| 2026-01-22 | **2.1** | **SIMPLIFICAÇÃO PARA SINGLE-TENANT**: Removido `account_id` (não há multi-tenancy), adicionado sistema de roles (`admin`, `operator`, `viewer`), funções SQL auxiliares (`generate_telegram_link_code`, `use_telegram_link_code`), compliance 100% Supabase Best Practices |
