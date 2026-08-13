# SmartZap Telegram Mini App - Documento de Planejamento

> **Versão**: 1.0
> **Data**: 2026-01-21
> **Status**: Planejamento

## 1. Visão Geral

### 1.1 Conceito

O **SmartZap Mini App** é uma aplicação web que roda dentro do Telegram, permitindo que usuários gerenciem suas conversas do WhatsApp diretamente no app do Telegram. Esta abordagem oferece uma experiência nativa e integrada, eliminando a necessidade de alternar entre aplicativos.

### 1.2 Por que Mini App?

| Abordagem | Prós | Contras |
|-----------|------|---------|
| **Monitor via Topics** | Simples, familiar | Setup manual, limitações de formatação |
| **Mini App** | UX nativa, auth automática, pagamentos | Maior complexidade inicial |

**Decisão**: Mini App oferece experiência superior e recursos nativos que justificam o investimento.

### 1.3 Benefícios Chave

- **Autenticação Zero-Friction**: `initData` fornece identidade do usuário automaticamente
- **UI Nativa**: MainButton, BackButton, popups integram com Telegram
- **Pagamentos Nativos**: Telegram Stars para monetização
- **Storage Integrado**: CloudStorage persiste dados por usuário
- **Notificações**: Bot pode enviar mensagens push ao usuário
- **Biometria**: Face ID/Touch ID para operações sensíveis

## 2. Arquitetura

### 2.1 Stack Técnica

```
┌─────────────────────────────────────────────────────────────┐
│                     TELEGRAM CLIENT                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              SmartZap Mini App (WebView)              │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │   Next.js 16 + @telegram-apps/sdk-react         │  │  │
│  │  │   React 19 + TailwindCSS + shadcn/ui            │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SMARTZAP BACKEND                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Next.js   │  │   QStash    │  │   Meta WhatsApp     │  │
│  │  API Routes │◄─┤  Workflows  │◄─┤    Cloud API        │  │
│  └──────┬──────┘  └─────────────┘  └─────────────────────┘  │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Supabase (PostgreSQL)                  │    │
│  │   • conversations  • messages  • telegram_users     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Dependências Principais

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

### 2.3 Estrutura de Diretórios

```
app/
├── (telegram)/                    # Rotas do Mini App
│   ├── layout.tsx                 # TelegramSDKProvider
│   ├── page.tsx                   # Inbox principal
│   ├── conversation/[id]/page.tsx # Chat individual
│   ├── settings/page.tsx          # Configurações
│   └── onboarding/page.tsx        # Setup inicial
│
├── api/
│   └── telegram/
│       ├── webhook/route.ts       # Webhook do bot
│       ├── validate/route.ts      # Validar initData
│       └── mini-app/
│           ├── conversations/route.ts
│           ├── messages/route.ts
│           └── send/route.ts

components/
├── telegram/
│   ├── TelegramSDKProvider.tsx    # Provider com mock dev
│   ├── MainButton.tsx             # Wrapper MainButton
│   ├── BackButton.tsx             # Wrapper BackButton
│   ├── ThemeProvider.tsx          # Sync theme Telegram
│   └── HapticFeedback.tsx         # Wrapper haptics

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
│   └── constants.ts               # Bot token, URLs
```

## 3. Autenticação e Segurança

### 3.1 Fluxo de Autenticação

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Telegram   │───▶│  Mini App    │───▶│  SmartZap    │
│   Client     │    │  (WebView)   │    │   Backend    │
└──────────────┘    └──────────────┘    └──────────────┘
       │                   │                    │
       │  1. Abre Mini App │                    │
       │──────────────────▶│                    │
       │                   │                    │
       │  2. Injeta initData (signed)          │
       │──────────────────▶│                    │
       │                   │                    │
       │                   │ 3. POST /api/telegram/validate
       │                   │   { initData, hash }
       │                   │───────────────────▶│
       │                   │                    │
       │                   │                    │ 4. Valida HMAC-SHA256
       │                   │                    │    usando BOT_TOKEN
       │                   │                    │
       │                   │ 5. { user, session_token }
       │                   │◀───────────────────│
       │                   │                    │
       │                   │ 6. Armazena token  │
       │                   │    (CloudStorage)  │
```

### 3.2 Validação do initData (Backend)

```typescript
// lib/telegram/validate-init-data.ts
import crypto from 'crypto';

interface InitData {
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

export function validateInitData(initDataRaw: string, botToken: string): InitData | null {
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get('hash');
  params.delete('hash');

  // Ordenar alfabeticamente
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // Calcular HMAC
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (calculatedHash !== hash) {
    return null; // Inválido
  }

  // Verificar auth_date (não mais que 24h)
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

### 3.3 Tabela telegram_users

```sql
-- supabase/migrations/xxx_create_telegram_users.sql
CREATE TABLE telegram_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  language_code TEXT DEFAULT 'pt',
  is_premium BOOLEAN DEFAULT false,
  photo_url TEXT,

  -- Vinculação com SmartZap
  smartzap_user_id UUID REFERENCES auth.users(id),
  whatsapp_linked BOOLEAN DEFAULT false,

  -- Configurações
  notifications_enabled BOOLEAN DEFAULT true,
  theme_preference TEXT DEFAULT 'auto',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_telegram_users_telegram_id ON telegram_users(telegram_id);
```

## 4. Interface do Usuário

### 4.1 Telas Principais

#### 4.1.1 Onboarding (Primeiro Acesso)

```
┌─────────────────────────────────────┐
│  [←]            SmartZap            │
├─────────────────────────────────────┤
│                                     │
│         📱                          │
│     Conectar WhatsApp               │
│                                     │
│  Para começar, conecte sua conta    │
│  WhatsApp Business.                 │
│                                     │
│  ┌─────────────────────────────────┐│
│  │  📷 Escanear QR Code            ││
│  │  Abra WhatsApp > Dispositivos   ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │     [ QR CODE AQUI ]            ││
│  │                                 ││
│  └─────────────────────────────────┘│
│                                     │
│  Aguardando conexão...              │
│                                     │
├─────────────────────────────────────┤
│  [        Preciso de Ajuda        ] │
└─────────────────────────────────────┘
```

#### 4.1.2 Inbox (Lista de Conversas)

```
┌─────────────────────────────────────┐
│  SmartZap          🔍  ⚙️           │
├─────────────────────────────────────┤
│  ┌─────────────────────────────────┐│
│  │ 🟢 Ativos    🤖 IA    📥 Todos  ││
│  └─────────────────────────────────┘│
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 👤 João Silva           14:32  ││
│  │ Quero saber sobre o produto... ││
│  │ 🤖 Atendido por IA             ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 👤 Maria Santos    ●    14:28  ││
│  │ Preciso de ajuda urgente!      ││
│  │ 🔴 Handoff solicitado          ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 👤 Pedro Costa          13:45  ││
│  │ Obrigado pela atenção!         ││
│  │ ✅ Resolvido                   ││
│  └─────────────────────────────────┘│
│                                     │
├─────────────────────────────────────┤
│  [     + Nova Conversa            ] │  ← MainButton
└─────────────────────────────────────┘
```

#### 4.1.3 Conversa Individual

```
┌─────────────────────────────────────┐
│  [←]  João Silva      👤  📞  ⋮    │
│       Online • WhatsApp             │
├─────────────────────────────────────┤
│                                     │
│       ┌─────────────────────┐       │
│       │ Olá! Vi o anúncio   │ 14:30 │
│       │ do produto X        │       │
│       └─────────────────────┘       │
│                                     │
│  ┌─────────────────────────┐        │
│  │ Olá João! O produto X   │ 14:31  │
│  │ está disponível por     │ 🤖     │
│  │ R$ 99,90. Posso ajudar? │        │
│  └─────────────────────────┘        │
│                                     │
│       ┌─────────────────────┐       │
│       │ Vocês entregam em   │ 14:32 │
│       │ São Paulo?          │       │
│       └─────────────────────┘       │
│                                     │
├─────────────────────────────────────┤
│  [🤖 IA]  [👤 Assumir]  [📋 Info]  │
├─────────────────────────────────────┤
│  [  Digite uma mensagem...    ] 📎  │
│  [         Enviar                 ] │ ← MainButton
└─────────────────────────────────────┘
```

#### 4.1.4 Configurações

```
┌─────────────────────────────────────┐
│  [←]         Configurações          │
├─────────────────────────────────────┤
│                                     │
│  CONEXÃO                            │
│  ┌─────────────────────────────────┐│
│  │ 📱 WhatsApp                     ││
│  │ +55 11 99999-9999    [Conectado]││
│  └─────────────────────────────────┘│
│                                     │
│  AGENTE DE IA                       │
│  ┌─────────────────────────────────┐│
│  │ 🤖 Assistente Virtual          ││
│  │ Modelo: GPT-4o        [Editar] ││
│  └─────────────────────────────────┘│
│                                     │
│  NOTIFICAÇÕES                       │
│  ┌─────────────────────────────────┐│
│  │ 🔔 Novas mensagens      [✓]    ││
│  │ 🔴 Handoff requests     [✓]    ││
│  │ 📊 Resumo diário        [ ]    ││
│  └─────────────────────────────────┘│
│                                     │
│  CONTA                              │
│  ┌─────────────────────────────────┐│
│  │ ⭐ Plano: Pro          [Mudar] ││
│  │ 📈 Uso: 1.234 msgs/mês         ││
│  └─────────────────────────────────┘│
│                                     │
├─────────────────────────────────────┤
│  [         Salvar                 ] │ ← MainButton
└─────────────────────────────────────┘
```

### 4.2 Componentes Telegram Nativos

#### 4.2.1 MainButton

```typescript
// hooks/telegram/useMainButton.ts
import { useMainButton as useTgMainButton } from '@telegram-apps/sdk-react';
import { useCallback, useEffect } from 'react';

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

    return () => {
      mainButton.hide();
    };
  }, [mainButton, config.text, config.color, config.textColor, config.isEnabled, config.isLoading]);

  useEffect(() => {
    if (!mainButton) return;

    mainButton.on('click', config.onClick);

    return () => {
      mainButton.off('click', config.onClick);
    };
  }, [mainButton, config.onClick]);

  return mainButton;
}
```

#### 4.2.2 BackButton

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

#### 4.2.3 Haptic Feedback

```typescript
// hooks/telegram/useHaptic.ts
import { useHapticFeedback } from '@telegram-apps/sdk-react';
import { useCallback } from 'react';

export function useHaptic() {
  const haptic = useHapticFeedback();

  const impact = useCallback((style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
    haptic?.impactOccurred(style);
  }, [haptic]);

  const notification = useCallback((type: 'success' | 'warning' | 'error') => {
    haptic?.notificationOccurred(type);
  }, [haptic]);

  const selection = useCallback(() => {
    haptic?.selectionChanged();
  }, [haptic]);

  return { impact, notification, selection };
}
```

### 4.3 Theme Sync

```typescript
// components/telegram/ThemeProvider.tsx
'use client';

import { useMiniApp, useThemeParams } from '@telegram-apps/sdk-react';
import { createContext, useContext, useEffect, useState } from 'react';

interface ThemeContextValue {
  colorScheme: 'light' | 'dark';
  colors: {
    bg: string;
    text: string;
    hint: string;
    link: string;
    button: string;
    buttonText: string;
    secondary: string;
  };
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function TelegramThemeProvider({ children }: { children: React.ReactNode }) {
  const miniApp = useMiniApp();
  const themeParams = useThemeParams();

  const [theme, setTheme] = useState<ThemeContextValue>({
    colorScheme: 'light',
    colors: {
      bg: '#ffffff',
      text: '#000000',
      hint: '#999999',
      link: '#2481cc',
      button: '#2481cc',
      buttonText: '#ffffff',
      secondary: '#f0f0f0',
    },
  });

  useEffect(() => {
    if (!themeParams) return;

    setTheme({
      colorScheme: miniApp?.isDark ? 'dark' : 'light',
      colors: {
        bg: themeParams.backgroundColor || '#ffffff',
        text: themeParams.textColor || '#000000',
        hint: themeParams.hintColor || '#999999',
        link: themeParams.linkColor || '#2481cc',
        button: themeParams.buttonColor || '#2481cc',
        buttonText: themeParams.buttonTextColor || '#ffffff',
        secondary: themeParams.secondaryBackgroundColor || '#f0f0f0',
      },
    });
  }, [miniApp, themeParams]);

  // Aplicar CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--tg-bg', theme.colors.bg);
    root.style.setProperty('--tg-text', theme.colors.text);
    root.style.setProperty('--tg-hint', theme.colors.hint);
    root.style.setProperty('--tg-link', theme.colors.link);
    root.style.setProperty('--tg-button', theme.colors.button);
    root.style.setProperty('--tg-button-text', theme.colors.buttonText);
    root.style.setProperty('--tg-secondary', theme.colors.secondary);
  }, [theme]);

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTelegramTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTelegramTheme must be used within TelegramThemeProvider');
  return context;
}
```

## 5. Comunicação em Tempo Real

### 5.1 Arquitetura de Notificações

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Meta WhatsApp  │────▶│   SmartZap API   │────▶│  Telegram Bot    │
│   Webhook        │     │   (process msg)  │     │  sendMessage()   │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │   Supabase       │
                         │   Realtime       │
                         └──────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │   Mini App       │
                         │   (WebSocket)    │
                         └──────────────────┘
```

### 5.2 Notificação Push via Bot

```typescript
// lib/telegram/bot-api.ts
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

export async function sendTelegramMessage(chatId: number, text: string, options?: {
  parseMode?: 'HTML' | 'Markdown';
  replyMarkup?: object;
}) {
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

// Notificação de nova mensagem WhatsApp
export async function notifyNewWhatsAppMessage(telegramUserId: number, contact: {
  name: string;
  preview: string;
  conversationId: string;
}) {
  await sendTelegramMessage(telegramUserId,
    `📱 <b>Nova mensagem de ${contact.name}</b>\n\n${contact.preview}`,
    {
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [[
          {
            text: '💬 Responder',
            web_app: { url: `${process.env.MINI_APP_URL}/conversation/${contact.conversationId}` }
          }
        ]]
      }
    }
  );
}

// Notificação de handoff
export async function notifyHandoffRequest(telegramUserId: number, contact: {
  name: string;
  reason: string;
  conversationId: string;
}) {
  await sendTelegramMessage(telegramUserId,
    `🔴 <b>Handoff solicitado!</b>\n\n` +
    `Cliente: ${contact.name}\n` +
    `Motivo: ${contact.reason}`,
    {
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [[
          {
            text: '👤 Assumir Atendimento',
            web_app: { url: `${process.env.MINI_APP_URL}/conversation/${contact.conversationId}?takeover=true` }
          }
        ]]
      }
    }
  );
}
```

### 5.3 Realtime Updates no Mini App

```typescript
// hooks/telegram/useConversationsRealtime.ts
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useHaptic } from './useHaptic';

export function useConversationsRealtime(telegramUserId: number) {
  const queryClient = useQueryClient();
  const { notification } = useHaptic();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `telegram_user_id=eq.${telegramUserId}`,
        },
        (payload) => {
          // Invalidar cache
          queryClient.invalidateQueries({ queryKey: ['conversations'] });

          // Haptic feedback para nova mensagem
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            notification('success');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [telegramUserId, queryClient, notification]);
}
```

## 6. Pagamentos

### 6.1 Telegram Stars

O Mini App suporta pagamentos nativos via **Telegram Stars** (XTR), a moeda virtual do Telegram.

```typescript
// lib/telegram/payments.ts
import { useMiniApp } from '@telegram-apps/sdk-react';

export function usePayments() {
  const miniApp = useMiniApp();

  const openInvoice = async (invoiceUrl: string): Promise<'paid' | 'cancelled' | 'failed'> => {
    return new Promise((resolve) => {
      miniApp?.openInvoice(invoiceUrl, (status) => {
        resolve(status);
      });
    });
  };

  return { openInvoice };
}

// Backend: Criar invoice
// app/api/telegram/invoice/route.ts
export async function POST(request: Request) {
  const { planId, telegramUserId } = await request.json();

  const plan = PLANS[planId]; // { title, description, priceStars }

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

### 6.2 Planos de Assinatura

```typescript
const PLANS = {
  starter: {
    title: 'SmartZap Starter',
    description: '500 mensagens/mês, 1 agente IA',
    priceStars: 99, // ~$1.99
    features: ['500 msgs/mês', '1 agente IA', 'Suporte email'],
  },
  pro: {
    title: 'SmartZap Pro',
    description: '5.000 mensagens/mês, agentes ilimitados',
    priceStars: 499, // ~$9.99
    features: ['5.000 msgs/mês', 'Agentes ilimitados', 'Suporte prioritário', 'Analytics'],
  },
  enterprise: {
    title: 'SmartZap Enterprise',
    description: 'Mensagens ilimitadas, suporte dedicado',
    priceStars: 1999, // ~$39.99
    features: ['Msgs ilimitadas', 'Agentes ilimitados', 'Suporte dedicado', 'API access', 'Webhooks'],
  },
};
```

## 7. Storage

### 7.1 CloudStorage (Telegram)

Ideal para configurações e preferências do usuário.

```typescript
// hooks/telegram/useCloudStorage.ts
import { useCloudStorage as useTgCloudStorage } from '@telegram-apps/sdk-react';
import { useCallback } from 'react';

export function useCloudStorage() {
  const cloudStorage = useTgCloudStorage();

  const setItem = useCallback(async (key: string, value: string) => {
    await cloudStorage?.setItem(key, value);
  }, [cloudStorage]);

  const getItem = useCallback(async (key: string): Promise<string | undefined> => {
    return cloudStorage?.getItem(key);
  }, [cloudStorage]);

  const getItems = useCallback(async (keys: string[]): Promise<Record<string, string>> => {
    return cloudStorage?.getItems(keys) || {};
  }, [cloudStorage]);

  const removeItem = useCallback(async (key: string) => {
    await cloudStorage?.deleteItem(key);
  }, [cloudStorage]);

  return { setItem, getItem, getItems, removeItem };
}

// Uso
const { setItem, getItem } = useCloudStorage();

// Salvar preferências
await setItem('notifications', JSON.stringify({ enabled: true, sound: false }));

// Recuperar
const prefs = JSON.parse(await getItem('notifications') || '{}');
```

**Limites**:
- Máximo 1024 chaves por usuário
- Máximo 128 caracteres por chave
- Máximo 4096 caracteres por valor

### 7.2 Supabase (Dados de Negócio)

CloudStorage é para preferências de UI. Dados de negócio vão no Supabase.

```typescript
// Conversas, mensagens, configurações de IA
// → Supabase PostgreSQL

// Preferências de UI (theme, filtros, última tela)
// → CloudStorage
```

## 8. Desenvolvimento Local

### 8.1 Mock do Ambiente Telegram

```typescript
// hooks/telegram/useTelegramMock.ts
'use client';

import { mockTelegramEnv, isTMA } from '@telegram-apps/sdk-react';

const MOCK_INIT_DATA = new URLSearchParams([
  ['user', JSON.stringify({
    id: 123456789,
    first_name: 'Dev',
    last_name: 'User',
    username: 'devuser',
    language_code: 'pt',
    is_premium: true,
  })],
  ['hash', 'mock_hash_for_development'],
  ['auth_date', String(Math.floor(Date.now() / 1000))],
  ['start_param', 'debug'],
]).toString();

export function useTelegramMock() {
  if (typeof window === 'undefined' || isTMA('simple')) {
    return;
  }

  // Mock apenas em desenvolvimento no browser
  if (process.env.NODE_ENV === 'development') {
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

    console.log('🤖 Telegram environment mocked for development');
  }
}
```

### 8.2 TelegramSDKProvider

```typescript
// components/telegram/TelegramSDKProvider.tsx
'use client';

import { PropsWithChildren, useEffect, useState } from 'react';
import { SDKProvider, useLaunchParams } from '@telegram-apps/sdk-react';
import { useTelegramMock } from '@/hooks/telegram/useTelegramMock';

function TelegramSDKLoader({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Mock em dev
    if (process.env.NODE_ENV === 'development') {
      useTelegramMock();
    }
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return <>{children}</>;
}

export function TelegramSDKProvider({ children }: PropsWithChildren) {
  return (
    <SDKProvider acceptCustomStyles>
      <TelegramSDKLoader>
        {children}
      </TelegramSDKLoader>
    </SDKProvider>
  );
}
```

### 8.3 Testando no Celular

1. **Port Forwarding com ngrok**:
```bash
ngrok http 3000
# Copiar URL HTTPS gerado
```

2. **Configurar BotFather**:
   - Enviar `/mybots` ao @BotFather
   - Selecionar seu bot
   - Bot Settings > Menu Button > Edit Menu Button URL
   - Colar URL do ngrok

3. **Abrir no Telegram**:
   - Abrir chat com seu bot
   - Clicar no Menu Button
   - Mini App abre com ambiente real

### 8.4 Debugging com Eruda

```typescript
// app/(telegram)/layout.tsx
'use client';

import { useEffect } from 'react';

export default function TelegramLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Carregar Eruda apenas em dev
    if (process.env.NODE_ENV === 'development') {
      import('eruda').then((eruda) => {
        eruda.default.init();
      });
    }
  }, []);

  return children;
}
```

## 9. Bot Commands e Menu

### 9.1 Comandos do Bot

```typescript
// Configurar via BotFather ou API
const BOT_COMMANDS = [
  { command: 'start', description: 'Abrir SmartZap Mini App' },
  { command: 'inbox', description: 'Ver conversas ativas' },
  { command: 'settings', description: 'Configurações' },
  { command: 'help', description: 'Ajuda' },
  { command: 'status', description: 'Status da conexão WhatsApp' },
];

// Configurar via API
await fetch(`${TELEGRAM_API}/setMyCommands`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ commands: BOT_COMMANDS }),
});
```

### 9.2 Handler de Comandos

```typescript
// app/api/telegram/webhook/route.ts
export async function POST(request: Request) {
  const update = await request.json();

  if (update.message?.text?.startsWith('/')) {
    const command = update.message.text.split(' ')[0].substring(1);
    const chatId = update.message.chat.id;

    switch (command) {
      case 'start':
        await sendTelegramMessage(chatId,
          '👋 Bem-vindo ao SmartZap!\n\n' +
          'Clique no botão abaixo para abrir o Mini App.',
          {
            replyMarkup: {
              inline_keyboard: [[
                { text: '📱 Abrir SmartZap', web_app: { url: MINI_APP_URL } }
              ]]
            }
          }
        );
        break;

      case 'inbox':
        await sendTelegramMessage(chatId,
          '📥 Suas conversas ativas:',
          {
            replyMarkup: {
              inline_keyboard: [[
                { text: '💬 Ver Inbox', web_app: { url: `${MINI_APP_URL}?tab=inbox` } }
              ]]
            }
          }
        );
        break;

      case 'status':
        const status = await getWhatsAppStatus(chatId);
        await sendTelegramMessage(chatId,
          status.connected
            ? `✅ WhatsApp conectado\n📞 ${status.phoneNumber}`
            : '❌ WhatsApp desconectado\n\nAbra o Mini App para reconectar.'
        );
        break;

      case 'help':
        await sendTelegramMessage(chatId,
          '📖 <b>Ajuda SmartZap</b>\n\n' +
          '/start - Abrir Mini App\n' +
          '/inbox - Ver conversas\n' +
          '/settings - Configurações\n' +
          '/status - Status WhatsApp\n' +
          '/help - Esta mensagem'
        );
        break;
    }
  }

  return Response.json({ ok: true });
}
```

## 10. Roadmap de Implementação

### Fase 1: Fundação (1-2 semanas)

- [ ] Configurar bot no BotFather
- [ ] Criar estrutura base do Mini App
- [ ] Implementar TelegramSDKProvider
- [ ] Criar mock para desenvolvimento
- [ ] Validação de initData
- [ ] Tabela telegram_users
- [ ] Theme sync com Telegram

### Fase 2: Core Features (2-3 semanas)

- [ ] Tela de Onboarding
- [ ] Integração com WhatsApp existente
- [ ] Lista de conversas (Inbox)
- [ ] Tela de conversa individual
- [ ] Envio de mensagens
- [ ] MainButton e BackButton

### Fase 3: Tempo Real (1-2 semanas)

- [ ] Notificações push via Bot
- [ ] Supabase Realtime
- [ ] Haptic feedback
- [ ] Status de leitura/entrega

### Fase 4: Features Avançadas (2-3 semanas)

- [ ] Handoff para humano
- [ ] Configuração de agente IA
- [ ] CloudStorage para preferências
- [ ] Biometria para ações sensíveis

### Fase 5: Monetização (1 semana)

- [ ] Integração Telegram Stars
- [ ] Tela de planos
- [ ] Webhook de pagamento
- [ ] Ativação de features premium

## 11. Considerações de Segurança

### 11.1 Validação Obrigatória

```typescript
// SEMPRE validar initData no backend
// NUNCA confiar em dados vindos do frontend

// ❌ ERRADO
const user = JSON.parse(searchParams.get('user'));

// ✅ CORRETO
const validated = await validateInitData(initDataRaw, BOT_TOKEN);
if (!validated) throw new Error('Invalid initData');
```

### 11.2 Rate Limiting

```typescript
// Limitar requisições por telegram_id
const rateLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 req/min
});

const { success } = await rateLimiter.limit(`tg:${telegramUserId}`);
if (!success) {
  return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });
}
```

### 11.3 Dados Sensíveis

- **Nunca** armazenar tokens de API no CloudStorage
- **Sempre** usar variáveis de ambiente para secrets
- **Criptografar** dados sensíveis antes de salvar
- **Validar** todas as entradas do usuário

## 12. Métricas e Analytics

```typescript
// Eventos para tracking
const EVENTS = {
  MINI_APP_OPENED: 'mini_app_opened',
  CONVERSATION_OPENED: 'conversation_opened',
  MESSAGE_SENT: 'message_sent',
  HANDOFF_REQUESTED: 'handoff_requested',
  PAYMENT_STARTED: 'payment_started',
  PAYMENT_COMPLETED: 'payment_completed',
};

// Registrar evento
async function trackEvent(telegramUserId: number, event: string, data?: object) {
  await supabase.from('analytics_events').insert({
    telegram_user_id: telegramUserId,
    event,
    data,
    created_at: new Date().toISOString(),
  });
}
```

---

## Referências

- [Telegram Mini Apps Documentation](https://core.telegram.org/bots/webapps)
- [@telegram-apps/sdk-react](https://docs.telegram-mini-apps.com/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram Payments](https://core.telegram.org/bots/payments)
