# Installation Wizard - Documentação Completa

> Documentação técnica do wizard de instalação self-hosted.
> Pode ser reaproveitado em outros sistemas SaaS.

## Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Fluxo Completo](#fluxo-completo)
4. [Componentes](#componentes)
5. [Storage e Estado](#storage-e-estado)
6. [API Endpoints](#api-endpoints)
7. [Autenticação e Hashing](#autenticação-e-hashing)
8. [Bootstrap da Instância](#bootstrap-da-instância)
9. [Server-Sent Events (SSE)](#server-sent-events-sse)
10. [Como Adaptar para Outro Sistema](#como-adaptar-para-outro-sistema)

---

## Visão Geral

O Installation Wizard é um fluxo de onboarding que permite ao usuário configurar uma instância self-hosted do sistema. Ele coleta credenciais de diversos serviços, executa migrações de banco de dados, e configura variáveis de ambiente automaticamente.

### Características

- **Multi-step wizard** com animações suaves (Framer Motion)
- **Persistência local** via localStorage (permite retomar instalação)
- **SSE streaming** para feedback em tempo real
- **Retry automático** com backoff exponencial
- **Health check** para pular etapas desnecessárias
- **Tema Matrix** para UX diferenciada

### Serviços Configurados

| Serviço | Finalidade |
|---------|------------|
| **Vercel** | Deploy e environment variables |
| **Supabase** | Banco de dados PostgreSQL + Auth |
| **QStash** | Filas e jobs assíncronos |
| **Redis (Upstash)** | Cache e rate limiting |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  /install/start                    /install/wizard               │
│  ┌──────────────┐                 ┌──────────────┐              │
│  │ IdentityStep │───────────────▶│  Confirmation │              │
│  │ VercelStep   │  localStorage   │  Provisioning │              │
│  │ SupabaseStep │◀───────────────│  Success/Error│              │
│  │ QStashStep   │                 └──────┬───────┘              │
│  │ RedisStep    │                        │                       │
│  └──────────────┘                        │ SSE Stream            │
│                                          ▼                       │
├─────────────────────────────────────────────────────────────────┤
│                          BACKEND                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  /api/installer/run-stream                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. Resolve Supabase Keys (anon, service_role)            │   │
│  │ 2. Setup Vercel Env Vars                                  │   │
│  │ 3. Wait for Supabase Project Ready                        │   │
│  │ 4. Run SQL Migrations                                     │   │
│  │ 5. Bootstrap Instance (settings iniciais)                 │   │
│  │ 6. Trigger Vercel Redeploy                                │   │
│  │ 7. Wait for Deploy Ready                                  │   │
│  │ 8. Disable Installer                                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  /api/installer/health-check                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Verifica estado atual para pular etapas já concluídas    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fluxo Completo

### Fase 1: Coleta de Dados (`/install/start`)

```
Step 1: Identity
├── Nome do administrador
├── Email
├── Senha (com validação de força)
└── Confirmação de senha

Step 2: Vercel
├── Token de acesso (Personal Access Token)
└── Seleção do projeto

Step 3: Supabase
├── Personal Access Token (PAT)
├── URL do projeto
├── Project Reference
├── Senha do banco de dados
└── (Auto-resolve: anon key, service_role key)

Step 4: QStash
└── Token do QStash

Step 5: Redis
├── REST URL
└── REST Token
```

### Fase 2: Confirmação (`/install/wizard`)

Exibe resumo de tudo que foi coletado e permite:
- **Pílula Vermelha**: Voltar e editar
- **Pílula Verde**: Iniciar provisionamento

### Fase 3: Provisionamento

```
1. resolve_keys     → Obtém chaves da API do Supabase
2. setup_envs       → Configura variáveis no Vercel
3. wait_project     → Aguarda projeto Supabase ficar ACTIVE
4. migrations       → Executa SQL schema
5. bootstrap        → Cria configurações iniciais
6. redeploy         → Dispara novo deploy no Vercel
7. wait_deploy      → Aguarda deploy finalizar
```

### Fase 4: Sucesso

- Exibe mensagem de boas-vindas personalizada
- Botão para ir ao login
- Limpa dados do localStorage

---

## Componentes

### Estrutura de Arquivos

```
components/install/
├── index.ts                    # Barrel exports
├── InstallLayout.tsx           # Layout wrapper com dots animados
├── StepCard.tsx                # Card com glow effect
├── ServiceIcon.tsx             # Ícones dos serviços
└── steps/
    ├── IdentityStep.tsx        # Nome, email, senha
    ├── VercelStep.tsx          # Token + projeto Vercel
    ├── SupabaseStep.tsx        # Credenciais Supabase
    ├── QStashStep.tsx          # Token QStash
    └── RedisStep.tsx           # URL + Token Redis

app/(auth)/install/
├── start/
│   └── page.tsx                # Wizard multi-step
└── wizard/
    └── page.tsx                # Provisionamento com SSE
```

### IdentityStep

Coleta identidade do administrador:

```typescript
interface IdentityStepProps {
  onComplete: (data: {
    name: string;
    email: string;
    password: string;
    passwordHash: string;
  }) => void;
  initialName?: string;
  initialEmail?: string;
}
```

**Validações:**
- Nome: mínimo 2 caracteres
- Email: deve conter `@`
- Senha: mínimo 8 chars, 1 letra, 1 número
- Confirmação: deve bater com senha

**Features:**
- Botão "Sugerir senha forte" (gera 16 chars aleatórios)
- Indicadores visuais de força da senha
- Toggle mostrar/ocultar senha

### StepCard

Card estilizado com efeito glow:

```typescript
interface StepCardProps {
  children: React.ReactNode;
  glowColor?: 'emerald' | 'zinc' | 'red' | 'orange';
}
```

---

## Storage e Estado

### Storage Keys

```typescript
const STORAGE_KEYS = {
  // Identity
  USER_NAME: 'smartzap_install_name',
  USER_EMAIL: 'smartzap_install_email',
  USER_PASS_HASH: 'smartzap_install_pass_hash',
  USER_PASS_PLAIN: 'smartzap_install_pass', // sessionStorage only!

  // Vercel
  VERCEL_TOKEN: 'smartzap_install_vercel_token',
  VERCEL_PROJECT: 'smartzap_install_vercel_project',

  // Supabase
  SUPABASE_PAT: 'smartzap_install_supabase_pat',
  SUPABASE_URL: 'smartzap_install_supabase_url',
  SUPABASE_REF: 'smartzap_install_supabase_ref',
  SUPABASE_PUBLISHABLE_KEY: 'smartzap_install_supabase_publishable_key',
  SUPABASE_SECRET_KEY: 'smartzap_install_supabase_secret_key',
  SUPABASE_DB_PASS: 'smartzap_install_supabase_db_pass',

  // QStash
  QSTASH_TOKEN: 'smartzap_install_qstash_token',

  // Redis
  REDIS_REST_URL: 'smartzap_install_redis_url',
  REDIS_REST_TOKEN: 'smartzap_install_redis_token',
};
```

### Persistência

| Dado | Storage | Motivo |
|------|---------|--------|
| Senha plain-text | `sessionStorage` | Não persiste entre sessões |
| Tokens e hashes | `localStorage` | Permite retomar instalação |
| Todos os dados | Limpos após sucesso | Segurança |

### Estado do Wizard

```typescript
interface WizardState {
  // Identity
  name: string;
  email: string;
  passwordHash: string;

  // Vercel
  vercelToken: string;
  vercelProject: { id: string; name: string; teamId?: string } | null;

  // Supabase
  supabasePat: string;
  supabaseUrl: string;
  supabaseRef: string;
  supabasePublishableKey: string;
  supabaseSecretKey: string;
  supabaseDbPass: string;

  // QStash
  qstashToken: string;

  // Redis
  redisRestUrl: string;
  redisRestToken: string;
}
```

---

## API Endpoints

### POST `/api/installer/run-stream`

Endpoint principal que executa o provisionamento via SSE.

**Request Body:**

```typescript
{
  vercel: {
    token: string;
    teamId?: string;
    projectId: string;
    targets: ('production' | 'preview')[];
  };
  supabase: {
    url: string;
    accessToken: string;
    projectRef?: string;
    dbPass?: string;
  };
  upstash: {
    qstashToken: string;
    redisRestUrl: string;
    redisRestToken: string;
  };
  admin: {
    name: string;
    email: string;
    passwordHash: string;
  };
  healthCheck?: {
    skipWaitProject?: boolean;
    skipMigrations?: boolean;
    skipBootstrap?: boolean;
  };
}
```

**Response:** Server-Sent Events stream

### POST `/api/installer/health-check`

Verifica estado atual para otimizar instalação.

**Request Body:**

```typescript
{
  supabase: {
    url: string;
    accessToken: string;
  };
}
```

**Response:**

```typescript
{
  ok: boolean;
  skipWaitProject?: boolean;
  skipMigrations?: boolean;
  skipBootstrap?: boolean;
  estimatedSeconds?: number;
}
```

---

## Autenticação e Hashing

### Geração de Senha

```typescript
const PASSWORD_CHARSET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';

function generateStrongPassword(length = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => PASSWORD_CHARSET[b % PASSWORD_CHARSET.length]).join('');
}
```

**Nota:** Charset exclui caracteres ambíguos (I, l, 1, O, 0).

### Hashing da Senha

```typescript
async function hashPassword(password: string): Promise<string> {
  const SALT = '_smartzap_salt_2026';
  const encoder = new TextEncoder();
  const data = encoder.encode(password + SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
```

**Importante:**
- O salt deve ser o MESMO no frontend (IdentityStep) e backend (loginUser)
- O hash é armazenado como `MASTER_PASSWORD` no Vercel
- Login compara hash do input vs `MASTER_PASSWORD` (nunca plain-text vs hash)

### Fluxo de Login

```typescript
// lib/user-auth.ts
export async function loginUser(password: string): Promise<UserAuthResult> {
  const masterPassword = process.env.MASTER_PASSWORD;

  // Hash a senha digitada ANTES de comparar
  const passwordHash = await hashPasswordForLogin(password);

  // Compara hash vs hash
  const isValid = passwordHash === masterPassword;

  if (!isValid) {
    return { ok: false, error: 'Senha incorreta' };
  }

  // Gera JWT e retorna
  // ...
}
```

---

## Bootstrap da Instância

### O que é Bootstrap?

É a configuração inicial da instância após as migrations rodarem. Cria registros essenciais na tabela `settings`.

### Função Bootstrap

```typescript
// lib/installer/bootstrap.ts
export async function bootstrapInstance({
  supabaseUrl,
  serviceRoleKey,
  adminEmail,
  adminName,
}: BootstrapInput): Promise<BootstrapResult> {
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Verifica se já foi bootstrapped
  const { data: existingEmail } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'admin_email')
    .single();

  if (existingEmail?.value) {
    return { ok: true, mode: 'exists' };
  }

  // Cria settings iniciais
  const initialSettings = [
    { key: 'admin_email', value: adminEmail },
    { key: 'admin_name', value: adminName },
    { key: 'company_name', value: adminName }, // Usado por isSetupComplete()
    { key: 'installation_date', value: new Date().toISOString() },
    { key: 'version', value: '1.0.0' },
  ];

  for (const setting of initialSettings) {
    await admin.from('settings').upsert(setting, { onConflict: 'key' });
  }

  return { ok: true, mode: 'created' };
}
```

### Verificação de Setup Completo

```typescript
// lib/settings.ts
export async function isSetupComplete(): Promise<boolean> {
  // Verifica env var primeiro (mais rápido)
  if (process.env.SETUP_COMPLETE === 'true') {
    return true;
  }

  // Fallback: verifica se company_name existe no banco
  const companyName = await getSetting('company_name');
  return !!companyName;
}
```

---

## Server-Sent Events (SSE)

### Tipos de Eventos

```typescript
interface StreamEvent {
  type: 'phase' | 'progress' | 'error' | 'complete' | 'skip' | 'retry';
  phase?: PhaseId;
  title?: string;
  subtitle?: string;
  progress?: number;
  error?: string;
  ok?: boolean;
  skipped?: string[];
  stepId?: string;
  retryCount?: number;
  maxRetries?: number;
}

type PhaseId = 'coordinates' | 'signal' | 'station' | 'contact' | 'landing' | 'complete';
```

### Fases Cinematográficas (Tema Matrix)

```typescript
const PHASES = {
  coordinates: {
    title: 'Seguindo o coelho branco...',
    subtitle: 'Estabelecendo conexão com a Matrix...',
  },
  signal: {
    title: 'Entrando na Matrix',
    subtitle: 'A realidade está sendo construída...',
  },
  station: {
    title: 'Instalando conhecimento',
    subtitle: 'I know kung fu...',
  },
  contact: {
    title: 'Você é o Escolhido',
    subtitle: 'Configurando sua identidade...',
  },
  landing: {
    title: 'A escolha foi feita',
    subtitle: 'Livre sua mente...',
  },
  complete: {
    title: `Bem-vindo à realidade, ${firstName}.`,
    subtitle: 'Você tomou a pílula verde.',
  },
};
```

### Consumindo o Stream

```typescript
const handleStream = async (response: Response) => {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const event: StreamEvent = JSON.parse(line.slice(6));

        if (event.type === 'phase') {
          setTitle(event.title);
          setProgress(event.progress);
        } else if (event.type === 'error') {
          throw new Error(event.error);
        } else if (event.type === 'complete' && event.ok) {
          setPhase('success');
        }
      }
    }
  }
};
```

### Retry com Backoff

```typescript
async function withRetry<T>(
  stepId: string,
  fn: () => Promise<T>,
  sendEvent: (event: StreamEvent) => Promise<void>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;

      await sendEvent({
        type: 'retry',
        stepId,
        retryCount: attempt,
        maxRetries,
      });

      // Backoff exponencial
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}
```

---

## Como Adaptar para Outro Sistema

### 1. Substituir Serviços

Edite os steps em `components/install/steps/`:

```typescript
// Exemplo: trocar Vercel por Netlify
// components/install/steps/NetlifyStep.tsx
export function NetlifyStep({ onComplete }) {
  const [token, setToken] = useState('');
  const [site, setSite] = useState('');

  const handleSubmit = () => {
    onComplete({ token, siteId: site });
  };

  return (
    <StepCard>
      {/* Form para coletar token e site do Netlify */}
    </StepCard>
  );
}
```

### 2. Atualizar Storage Keys

```typescript
const STORAGE_KEYS = {
  // Renomeie o prefixo
  USER_NAME: 'meusistema_install_name',
  // ... adicione/remova conforme necessário
};
```

### 3. Modificar API de Provisionamento

```typescript
// app/api/installer/run-stream/route.ts

// 1. Atualize o schema Zod
const RunSchema = z.object({
  netlify: z.object({
    token: z.string(),
    siteId: z.string(),
  }),
  // ...
});

// 2. Atualize as etapas de provisionamento
const ALL_STEPS = [
  { id: 'setup_netlify', phase: 'coordinates', weight: 20 },
  // ...
];

// 3. Implemente a lógica de cada etapa
```

### 4. Personalizar Tema

Troque as mensagens Matrix por algo do seu produto:

```typescript
const PHASES = {
  coordinates: {
    title: 'Preparando ambiente...',
    subtitle: 'Conectando aos serviços...',
  },
  // ...
};
```

### 5. Ajustar Autenticação

Se não usar `MASTER_PASSWORD`:

```typescript
// Opção 1: Supabase Auth
await supabase.auth.signUp({ email, password });

// Opção 2: NextAuth
// Configure providers em pages/api/auth/[...nextauth].ts

// Opção 3: Clerk, Auth0, etc.
```

### 6. Atualizar Bootstrap

```typescript
// lib/installer/bootstrap.ts
const initialSettings = [
  { key: 'admin_email', value: adminEmail },
  { key: 'company_name', value: companyName },
  // Adicione settings específicos do seu sistema
  { key: 'feature_x_enabled', value: 'true' },
  { key: 'plan', value: 'free' },
];
```

### 7. Desabilitar Installer Após Sucesso

```typescript
// No final do provisionamento:
await upsertEnvVar('INSTALLER_ENABLED', 'false');

// No início da rota:
if (process.env.INSTALLER_ENABLED === 'false') {
  return new Response('Installer disabled', { status: 403 });
}
```

---

## Troubleshooting

### "Setup não concluído" após instalação

**Causas:**
1. `SETUP_COMPLETE` não foi setado como env var
2. `company_name` não foi criado no bootstrap
3. Hash da senha não bate (salt diferente)

**Solução:**
```bash
# Verificar env vars no Vercel
vercel env ls

# Verificar settings no Supabase
SELECT * FROM settings WHERE key IN ('company_name', 'admin_email');
```

### Redeploy não executa

**Causa:** Código travando antes de chegar ao redeploy (ex: função sem timeout).

**Solução:** Adicione logs detalhados e verifique se todas as funções têm timeout:

```typescript
console.log('[run-stream] Iniciando passo: redeploy');
// ... código
console.log('[run-stream] Redeploy concluído');
```

### Migrations falham

**Causas:**
1. Senha do banco incorreta
2. Schema já existe (não é idempotente)
3. Permissões insuficientes

**Solução:**
```typescript
// Verificar se schema já existe antes de rodar
const schemaExists = await checkSchemaApplied(dbUrl);
if (schemaExists) {
  console.log('Schema já aplicado, pulando migrations');
  return;
}
```

### Stream SSE fecha prematuramente

**Causa:** Timeout do serverless function.

**Solução:**
```typescript
// app/api/installer/run-stream/route.ts
export const maxDuration = 300; // 5 minutos
export const runtime = 'nodejs';
```

---

## Checklist de Implementação

- [ ] Criar componentes de step para cada serviço
- [ ] Definir storage keys com prefixo único
- [ ] Implementar hash de senha com salt fixo
- [ ] Criar rota SSE de provisionamento
- [ ] Implementar retry com backoff
- [ ] Criar função de bootstrap
- [ ] Configurar verificação `isSetupComplete()`
- [ ] Adicionar `INSTALLER_ENABLED` check
- [ ] Implementar health check (opcional)
- [ ] Testar fluxo completo do zero
- [ ] Testar retomada de instalação parcial
- [ ] Verificar limpeza de dados após sucesso

---

## Referências

- [Vercel API](https://vercel.com/docs/rest-api)
- [Supabase Management API](https://supabase.com/docs/reference/api)
- [QStash](https://docs.upstash.com/qstash)
- [Upstash Redis](https://docs.upstash.com/redis)
- [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Framer Motion](https://www.framer.com/motion/)
