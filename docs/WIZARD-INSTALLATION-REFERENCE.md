# Referência: Wizard de Instalação (CRM → SmartZap)

> Análise cirúrgica do sistema de instalação do projeto CRM para replicação no SmartZap.
>
> **⚠️ ATUALIZAÇÃO IMPORTANTE (Jan/2026):** Após análise detalhada das APIs de Upstash, descobriu-se que a automação de Redis NÃO é possível. O SmartZap requer **8 campos obrigatórios** (não 5-6 como o CRM).

---

## RESUMO EXECUTIVO

### O que o usuário REALMENTE preenche no SmartZap (8 campos):

| # | Campo | Tipo | Onde | Pode Automatizar? |
|---|-------|------|------|-------------------|
| 1 | Email | email | Tela Identity | ❌ Usuário define |
| 2 | Senha | password | Tela Identity | ❌ Usuário define |
| 3 | Vercel Token | password (cola) | Tela Vercel | ❌ Usuário cola do console |
| 4 | Supabase PAT | password (cola) | Tela Supabase | ❌ Usuário cola do console |
| 5 | QStash Token | password (cola) | Tela QStash | ❌ Usuário cola do console |
| 6 | QStash Signing Key | password (cola) | Tela QStash | ❌ Usuário cola do console |
| 7 | Upstash Redis REST URL | url (cola) | Tela Redis | ❌ Usuário cola do console |
| 8 | Upstash Redis REST Token | password (cola) | Tela Redis | ❌ Usuário cola do console |

### Comparação CRM vs SmartZap:

| Aspecto | CRM | SmartZap |
|---------|-----|----------|
| **Campos coletados** | 5-6 | **8** (obrigatórios) |
| **Redis** | Não usa | **OBRIGATÓRIO** |
| **QStash** | Não usa | **OBRIGATÓRIO** |
| **WhatsApp** | N/A | **Separado** (em `/settings`) |

### Por que SmartZap precisa de mais campos?

1. **Redis é OBRIGATÓRIO** (decisão de negócio): Usado para dedupe de webhooks WhatsApp. Sem Redis, status duplicados podem causar inconsistência nos contadores de campanhas.

2. **Upstash Redis API NÃO retorna REST credentials**: A [Developer API](https://upstash.com/docs/devops/developer-api/redis/create_database) pode criar databases, mas o response inclui apenas `endpoint` (slug), não `rest_url` nem `rest_token`. Essas credenciais só estão disponíveis no console UI.

3. **QStash Signing Key é OBRIGATÓRIO**: Verifica que chamadas de callback realmente vêm do QStash via header `upstash-signature`. Funciona como segundo fator de autenticação para a API.

---

### O que o CRM coletava (REFERÊNCIA):

| # | Campo | Tipo | Onde |
|---|-------|------|------|
| 1 | Nome completo | text | Tela Identity |
| 2 | Email | email | Tela Identity |
| 3 | Senha | password | Tela Identity (ou clica "Sugerir") |
| 4 | Vercel Token | password (cola) | Tela Vercel |
| 5 | Supabase PAT | password (cola) | Tela Supabase |
| 6 | Installer Token | password (opcional) | Tela Vercel (se `meta.requiresToken`) |

### O que é 100% AUTOMÁTICO:

- ✅ Validação de tokens via API
- ✅ Descoberta do projeto Vercel (via domínio ou env var)
- ✅ Listagem de organizações Supabase
- ✅ Escolha inteligente da organização (paga > free com slot)
- ✅ Geração do nome do projeto (`nossocrm`, `nossocrmv2`, etc.)
- ✅ Geração da senha do banco de dados (20 chars aleatórios)
- ✅ Criação do projeto Supabase com retry automático
- ✅ Polling até status ACTIVE
- ✅ Resolução de chaves (anon, service_role, dbUrl)
- ✅ Configuração de env vars na Vercel
- ✅ Execução de migrations SQL
- ✅ Deploy de Edge Functions
- ✅ Criação de organização + usuário admin no banco
- ✅ Trigger de redeploy na Vercel
- ✅ Health checks finais

---

## 1. Arquitetura de Arquivos

```
app/
├── install/
│   ├── page.tsx          # Entry router - decide entre /start ou /wizard
│   ├── start/
│   │   └── page.tsx      # Telas: identity → vercel → supabase → redirect
│   └── wizard/
│       └── page.tsx      # Provisioning 100% automático + streaming de progresso
```

### Fluxo de Navegação

```
/install
    │
    ├─ (sem tokens) ──→ /install/start
    │                        │
    │                        ├─ Tela 1: Identity (nome, email, senha)
    │                        ├─ Tela 2: Vercel Token (cola + auto-submit em 800ms)
    │                        ├─ Tela 3: Supabase PAT (cola + auto-submit em 800ms)
    │                        │
    │                        └─ Redirect automático → /install/wizard
    │
    └─ (com tokens) ──→ /install/wizard
                             │
                             ├─ Step 1: Supabase Setup (100% automático)
                             │    └─ Lista orgs → Escolhe melhor → Cria projeto → Polling → Resolve keys
                             ├─ Step 2: Admin Validation (confirma dados)
                             ├─ Step 3: Run Install (streaming SSE)
                             │    └─ Env vars → Migrations → Edge Functions → Bootstrap → Redeploy
                             │
                             └─ Redirect → /auth/login ou /dashboard
```

---

## 2. Persistência de Estado

### Chaves localStorage (REAIS do CRM)

| Chave | Conteúdo | Quando é setada |
|-------|----------|-----------------|
| `STORAGE_USER_NAME` | Nome do usuário | Após tela Identity |
| `STORAGE_USER_EMAIL` | Email do admin | Após tela Identity |
| `STORAGE_USER_PASS_HASH` | Hash SHA-256 da senha | Após tela Identity |
| `STORAGE_SESSION_LOCKED` | `'false'` | Após tela Identity |
| `STORAGE_TOKEN` | Vercel Token | Após validação Vercel |
| `STORAGE_PROJECT` | JSON `{id, name, teamId, url}` | Após validação Vercel |
| `STORAGE_INSTALLER_TOKEN` | Installer Token (opcional) | Após validação Vercel |
| `crm_install_supabase_token` | Supabase PAT | Após tela Supabase |

### sessionStorage (senha em plaintext temporária)

| Chave | Conteúdo | Quando |
|-------|----------|--------|
| `crm_install_user_pass` | Senha em texto puro | Precisa para criar usuário no Supabase Auth |

> ⚠️ A senha fica em sessionStorage porque é necessária para chamar `supabase.auth.signUp()`. É limpa após instalação.

### Lógica de Decisão no Router

```typescript
// /install/page.tsx - Decide para onde ir
useEffect(() => {
  const vercelToken = localStorage.getItem(STORAGE_TOKEN);
  const projectJson = localStorage.getItem(STORAGE_PROJECT);
  const supabaseToken = localStorage.getItem('crm_install_supabase_token');

  // Se tem todos os tokens → vai direto para wizard
  if (vercelToken && projectJson && supabaseToken) {
    router.replace('/install/wizard');
    return;
  }

  // Se tem pelo menos Vercel → vai para start na tela supabase
  if (vercelToken && projectJson) {
    router.replace('/install/start'); // start detecta e pula para tela supabase
    return;
  }

  // Senão → começa do zero
  router.replace('/install/start');
}, []);
```

### Recuperação de Estado no /install/start

```typescript
// Ao carregar /install/start
useEffect(() => {
  const savedToken = localStorage.getItem(STORAGE_TOKEN);
  const savedProject = localStorage.getItem(STORAGE_PROJECT);
  const savedSupabase = localStorage.getItem('crm_install_supabase_token');

  if (savedToken) setVercelToken(savedToken);
  if (savedProject) {
    setProject(JSON.parse(savedProject));
    // Se já tem Vercel validado, pula para tela Supabase
    if (!savedSupabase) {
      setScreen('supabase');
    }
  }
  if (savedSupabase) {
    // Já tem tudo → vai para wizard
    router.push('/install/wizard');
  }
}, []);
```

---

## 3. Steps Detalhados (/install/start)

### Tela 1: Identity (screen='identity')

**Campos coletados:**
| Campo | Validação | Armazenamento |
|-------|-----------|---------------|
| Nome | min 2 chars | `localStorage.STORAGE_USER_NAME` |
| Email | contém `@` | `localStorage.STORAGE_USER_EMAIL` |
| Senha | 8+ chars, 1 letra, 1 número | Hash → `localStorage.STORAGE_USER_PASS_HASH` |
| Confirmar Senha | === Senha | Não armazena |

**Política de Senha (REAL do CRM):**
```typescript
// validateInstallerPassword() - linhas 103-110
const passwordChecks = {
  minLen: p.length >= 8,
  hasLetter: /[A-Za-z]/.test(p),  // NÃO exige maiúscula separada
  hasNumber: /\d/.test(p),
};
const valid = Object.values(passwordChecks).every(Boolean);
```

> ⚠️ Nota: A política do CRM é MAIS SIMPLES que eu documentei antes. Não exige maiúscula obrigatória.

**Gerador de Senha Sugerida:**
```typescript
// generateStrongPassword(length = 16)
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
// Remove caracteres ambíguos: I, l, 1, O, 0

const generateStrongPassword = (length = 16): string => {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, b => CHARSET[b % CHARSET.length]).join('');
};
```

**Hash SHA-256 com Salt:**
```typescript
const hashPassword = async (password: string): Promise<string> => {
  const SALT = '_crm_salt_2024';  // Salt fixo
  const encoder = new TextEncoder();
  const data = encoder.encode(password + SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};
```

**Fluxo de Submit:**
```typescript
const handleIdentitySubmit = async () => {
  // 1. Validações
  if (name.trim().length < 2) return setError('Nome muito curto');
  if (!email.includes('@')) return setError('Email inválido');
  if (!validateInstallerPassword(pass)) return setError('Senha fraca');
  if (pass !== confirm) return setError('Senhas não conferem');

  // 2. Gera hash
  const hash = await hashPassword(pass);

  // 3. Salva em localStorage
  localStorage.setItem(STORAGE_USER_NAME, name);
  localStorage.setItem(STORAGE_USER_EMAIL, email);
  localStorage.setItem(STORAGE_USER_PASS_HASH, hash);
  localStorage.setItem(STORAGE_SESSION_LOCKED, 'false');

  // 4. Salva senha plaintext em sessionStorage (precisa para Supabase Auth)
  sessionStorage.setItem('crm_install_user_pass', pass);

  // 5. Avança
  setScreen('vercel');
};
```

---

### Tela 2: Vercel Token (screen='vercel')

**Campo coletado:**
| Campo | Validação | Armazenamento |
|-------|-----------|---------------|
| Vercel Token | min 20 chars | `localStorage.STORAGE_TOKEN` |
| Installer Token (opcional) | se `meta.requiresToken` | `localStorage.STORAGE_INSTALLER_TOKEN` |

**⚡ Auto-Submit Inteligente:**
```typescript
// Quando token tem 24+ chars, dispara submit automaticamente após 800ms
useEffect(() => {
  if (screen === 'vercel' && vercelToken.trim().length >= 24 && !isLoading && !error) {
    const handle = setTimeout(() => void handleVercelSubmit(), 800);
    return () => clearTimeout(handle);
  }
}, [vercelToken, screen, isLoading, error]);
```

**O que acontece no Submit:**
```typescript
const handleVercelSubmit = async () => {
  setScreen('validating');  // Mostra loading
  setError(null);

  // POST para backend que faz a mágica
  const res = await fetch('/api/installer/bootstrap', {
    method: 'POST',
    body: JSON.stringify({
      token: vercelToken.trim(),
      installerToken: installerToken.trim() || undefined,
      domain: window.location.hostname  // Usado para encontrar projeto
    }),
  });

  const data = await res.json();

  if (!data.success) {
    setError(data.error || 'Token inválido');
    setScreen('vercel');
    return;
  }

  // SUCESSO: Backend retorna projeto descoberto automaticamente
  // { project: { id, name, teamId, url } }
  setProject(data.project);

  // Salva tudo
  localStorage.setItem(STORAGE_TOKEN, vercelToken);
  localStorage.setItem(STORAGE_PROJECT, JSON.stringify(data.project));
  if (installerToken) {
    localStorage.setItem(STORAGE_INSTALLER_TOKEN, installerToken);
  }

  setScreen('supabase');
};
```

**O que o Backend faz (POST /api/installer/bootstrap):**
1. Valida token via `GET https://api.vercel.com/v2/user`
2. Busca projeto por:
   - Se `VERCEL_PROJECT_ID` env existe → busca direto
   - Senão → busca por domínio via `findProjectByDomain(hostname)`
3. Retorna `{ project: { id, name, teamId, url } }`

> ⚠️ O usuário NÃO escolhe o projeto. É descoberto automaticamente pelo domínio.

---

### Tela 3: Supabase PAT (screen='supabase')

**Campo coletado:**
| Campo | Validação | Armazenamento |
|-------|-----------|---------------|
| Supabase PAT | começa com `sbp_`, min 30 chars | `localStorage.crm_install_supabase_token` |

**⚡ Auto-Submit Inteligente:**
```typescript
// Quando token é válido, dispara submit automaticamente após 800ms
useEffect(() => {
  if (
    screen === 'supabase' &&
    supabaseToken.trim().startsWith('sbp_') &&
    supabaseToken.trim().length >= 30
  ) {
    const handle = setTimeout(() => void handleSupabaseSubmit(), 800);
    return () => clearTimeout(handle);
  }
}, [supabaseToken, screen]);
```

**O que acontece no Submit:**
```typescript
const handleSupabaseSubmit = async () => {
  if (!supabaseToken.trim().startsWith('sbp_')) {
    setError('Token deve começar com sbp_');
    return;
  }

  // Apenas salva - a validação real acontece no /wizard
  localStorage.setItem('crm_install_supabase_token', supabaseToken.trim());

  // Mostra checkmark de sucesso
  setScreen('ready');

  // Após 1.2s, redireciona
  setTimeout(() => router.push('/install/wizard'), 1200);
};
```

> ⚠️ O usuário NÃO escolhe organização nem projeto Supabase aqui. Isso é 100% automático no /wizard.

---

## 4. Wizard Automático (/install/wizard)

> ⚠️ **TUDO NESTA SEÇÃO É 100% AUTOMÁTICO** - O usuário apenas observa o progresso.

### Hydration (ao carregar página)

```typescript
useEffect(() => {
  // Recupera tokens do localStorage
  const vToken = localStorage.getItem(STORAGE_TOKEN);
  const vProject = localStorage.getItem(STORAGE_PROJECT);
  const sToken = localStorage.getItem('crm_install_supabase_token');
  const userName = localStorage.getItem(STORAGE_USER_NAME);
  const userEmail = localStorage.getItem(STORAGE_USER_EMAIL);

  // Se falta algo, volta para /install/start
  if (!vToken || !vProject || !sToken) {
    router.replace('/install/start');
    return;
  }

  // Recupera senha do sessionStorage
  const userPass = sessionStorage.getItem('crm_install_user_pass');

  // Carrega estado anterior (para retry/resume)
  const savedState = loadInstallState();

  setIsHydrated(true);
}, []);
```

---

### Step 1: Supabase Setup (currentStep=1) - 100% AUTOMÁTICO

**Disparo automático ao detectar PAT válida:**
```typescript
useEffect(() => {
  if (
    isHydrated &&
    currentStep === 1 &&
    /^sbp_[A-Za-z0-9_-]{20,}$/.test(supabaseAccessToken) &&
    !supabaseOrgs.length &&
    !isLoading
  ) {
    const timer = setTimeout(() => loadOrgsAndDecide(), 400);
    return () => clearTimeout(timer);
  }
}, [isHydrated, currentStep, supabaseAccessToken]);
```

**Fluxo loadOrgsAndDecide():**
```typescript
const loadOrgsAndDecide = async () => {
  // 1. Lista organizações do usuário
  const orgsRes = await fetch('/api/installer/supabase/organizations', {
    method: 'POST',
    body: JSON.stringify({ accessToken: supabaseAccessToken }),
  });
  const { organizations, freeGlobalLimitHit } = await orgsRes.json();

  // 2. Preflight: enriquece com planos e contagem de projetos
  const preflightRes = await fetch('/api/installer/supabase/preflight', {
    method: 'POST',
    body: JSON.stringify({ accessToken: supabaseAccessToken }),
  });
  const preflight = await preflightRes.json();

  // 3. DECISÃO AUTOMÁTICA de onde criar
  decideAndCreate(organizations, preflight);
};
```

**Lógica de Decisão Automática:**
```typescript
const decideAndCreate = (orgs, preflight) => {
  // Prioridade 1: Organização PAGA (pro, team, enterprise)
  const paidOrg = orgs.find(o => o.plan !== 'free');
  if (paidOrg) {
    return createProjectInOrg(paidOrg.slug);
  }

  // Prioridade 2: Organização FREE com slot disponível (<2 projetos ativos)
  const freeWithSlot = orgs.find(o => o.plan === 'free' && o.activeCount < 2);
  if (freeWithSlot) {
    return createProjectInOrg(freeWithSlot.slug);
  }

  // Sem slot: Mostra tela pedindo para pausar um projeto
  setNeedsPauseProject(true);
};
```

**Criação do Projeto (com retry automático):**
```typescript
const createProjectInOrg = async (orgSlug: string) => {
  // GERA senha do banco automaticamente
  const dbPass = generateStrongPassword(20);
  setSupabaseCreateDbPass(dbPass);

  // GERA nome do projeto automaticamente
  let projectName = 'nossocrm';
  let attempt = 0;

  while (attempt < 30) {
    const res = await fetch('/api/installer/supabase/create-project', {
      method: 'POST',
      body: JSON.stringify({
        accessToken: supabaseAccessToken,
        organizationSlug: orgSlug,
        name: projectName,
        dbPass,
        regionSmartGroup: 'americas',  // Hardcoded
      }),
    });

    if (res.ok) {
      const { projectRef, supabaseUrl } = await res.json();
      setSupabaseProjectRef(projectRef);
      setSupabaseUrl(supabaseUrl);

      // Inicia polling de status
      pollProjectStatus(projectRef);
      return;
    }

    if (res.status === 409) {
      // Nome já existe, incrementa: nossocrm → nossocrmv2 → nossocrmv3
      attempt++;
      projectName = `nossocrmv${attempt + 1}`;
      continue;
    }

    throw new Error('Falha ao criar projeto');
  }
};
```

**Polling de Status (até ACTIVE):**
```typescript
const pollProjectStatus = async (ref: string) => {
  const maxWait = 210000; // 3.5 minutos
  const interval = 4000;  // 4 segundos
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const res = await fetch('/api/installer/supabase/project-status', {
      method: 'POST',
      body: JSON.stringify({ accessToken: supabaseAccessToken, projectRef: ref }),
    });

    const { status } = await res.json();

    if (status === 'ACTIVE_HEALTHY' || status === 'ACTIVE') {
      // Projeto pronto! Resolve as chaves
      resolveKeys();
      return;
    }

    await new Promise(r => setTimeout(r, interval));
  }

  throw new Error('Timeout aguardando projeto Supabase');
};
```

**Resolução de Chaves:**
```typescript
const resolveKeys = async () => {
  const res = await fetch('/api/installer/supabase/resolve', {
    method: 'POST',
    body: JSON.stringify({
      accessToken: supabaseAccessToken,
      supabaseUrl,
      projectRef: supabaseProjectRef,
    }),
  });

  const {
    publishableKey,  // anon key (eyJ...)
    secretKey,       // service_role key
    dbUrl,           // postgresql://postgres.ref:pass@pooler...
  } = await res.json();

  setSupabaseAnonKey(publishableKey);
  setSupabaseServiceKey(secretKey);
  setSupabaseDbUrl(dbUrl);
  setSupabaseResolvedOk(true);

  // Avança para step 2 automaticamente
  setCurrentStep(2);
};
```

---

### Step 2: Admin Validation (currentStep=2)

**Único momento de "interação"** - mostra os dados coletados para confirmação:

- Nome: `{userName}` (do localStorage)
- Email: `{adminEmail}` (do localStorage)
- Senha: `••••••••` (do sessionStorage)

Opções:
- Botão "Gerar nova senha" → abre modal
- Botão "Instalar" → avança para step 3

---

### Step 3: Run Install (currentStep=3) - STREAMING SSE

**Payload enviado:**
```typescript
const payload = {
  vercel: {
    token: vercelToken,
    projectId: project.id,
    teamId: project.teamId,
    targets: ['production', 'preview'],
  },
  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: supabaseServiceKey,
    dbUrl: supabaseDbUrl,
    accessToken: supabaseAccessToken,
    projectRef: supabaseProjectRef,
    deployEdgeFunctions: true,
  },
  admin: {
    companyName: userName,
    email: adminEmail,
    password: adminPassword,
  },
};
```

**Fases do Streaming (run-stream):**

| Fase | Step | O que faz |
|------|------|-----------|
| COORDINATES | resolve_keys | Extrai chaves Supabase (redundante, já tem) |
| COORDINATES | setup_envs | **Upsert env vars na Vercel** |
| SIGNAL | wait_project | Aguarda projeto Vercel estar pronto |
| STATION | migrations | **Executa todas as migrations SQL** |
| STATION | wait_storage | Aguarda storage bucket |
| COMMS | edge_secrets | Configura secrets nas Edge Functions |
| COMMS | edge_deploy | Deploy das Edge Functions |
| CONTACT | bootstrap | **Cria org + user admin no banco** |
| LANDING | redeploy | Trigger redeploy da Vercel |
| LANDING | wait_vercel_deploy | Aguarda deploy READY |

**Env Vars configuradas automaticamente:**
```typescript
const ENV_VARS = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
  SUPABASE_SECRET_KEY: serviceRoleKey,
  SUPABASE_DB_URL: dbUrl,
  // ... outras específicas da app
};
```

**Bootstrap (criação do admin):**
```typescript
// bootstrapInstance() em lib/installer/supabase.ts
// 1. Cria organization no banco
const { data: org } = await supabase
  .from('organizations')
  .upsert({ name: companyName })
  .select()
  .single();

// 2. Cria usuário no Supabase Auth
const { data: authUser } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

// 3. Cria profile associado
await supabase
  .from('profiles')
  .upsert({
    id: authUser.id,
    organization_id: org.id,
    email,
    role: 'admin',
  });
```

---

### Completion

**Se sucesso:**
```typescript
// Limpa dados sensíveis
localStorage.removeItem('crm_install_supabase_token');
sessionStorage.removeItem('crm_install_user_pass');

// Marca como instalado
markInstallationComplete(installState);

// Redireciona
router.push('/auth/login');
```

**Se erro:**
- Mostra erro com opção de retry
- Salva estado para resumir depois
- Permite rollback parcial

---

## 4. UX/UI Patterns

### Animações (Framer Motion)

```typescript
// Transição entre steps
const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0
  }),
  center: {
    x: 0,
    opacity: 1
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0
  })
};

// Uso no componente
<motion.div
  key={currentStep}
  custom={direction}
  variants={stepVariants}
  initial="enter"
  animate="center"
  exit="exit"
  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
>
  <StepContent />
</motion.div>
```

### Progress Indicator

```typescript
const ProgressBar = ({ currentStep, totalSteps }: Props) => {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <div className="w-full bg-zinc-800 rounded-full h-2">
      <motion.div
        className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-2 rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5 }}
      />
    </div>
  );
};
```

### Step Indicator (Dots)

```typescript
const StepDots = ({ currentStep, totalSteps, completedSteps }: Props) => (
  <div className="flex gap-2 justify-center">
    {Array.from({ length: totalSteps }).map((_, i) => {
      const stepNum = i + 1;
      const isActive = stepNum === currentStep;
      const isCompleted = completedSteps.includes(stepNum);

      return (
        <motion.div
          key={i}
          className={cn(
            'w-3 h-3 rounded-full transition-colors',
            isActive && 'bg-emerald-500',
            isCompleted && !isActive && 'bg-emerald-500/50',
            !isActive && !isCompleted && 'bg-zinc-700'
          )}
          animate={{ scale: isActive ? 1.2 : 1 }}
        />
      );
    })}
  </div>
);
```

### Themed Gradients

```css
/* Background gradient animado */
.install-bg {
  background: linear-gradient(
    135deg,
    theme('colors.zinc.950') 0%,
    theme('colors.zinc.900') 50%,
    theme('colors.emerald.950/20') 100%
  );
}

/* Glow effect em cards */
.install-card {
  @apply bg-zinc-900/50 backdrop-blur-xl;
  @apply border border-zinc-800;
  @apply shadow-[0_0_60px_-15px_theme('colors.emerald.500/20')];
}
```

### Loading States

```typescript
const LoadingStep = ({ message, subMessage }: Props) => (
  <div className="flex flex-col items-center gap-6 py-12">
    {/* Spinner animado */}
    <motion.div
      className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full"
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    />

    {/* Mensagens */}
    <div className="text-center">
      <p className="text-lg font-medium text-zinc-100">{message}</p>
      {subMessage && (
        <p className="text-sm text-zinc-400 mt-1">{subMessage}</p>
      )}
    </div>

    {/* Dots pulsantes */}
    <div className="flex gap-1">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-2 h-2 bg-emerald-500 rounded-full"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  </div>
);
```

---

## 5. Error Handling

### Retry Logic

```typescript
interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2
};

const withRetry = async <T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> => {
  let lastError: Error;
  let delay = config.baseDelayMs;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === config.maxAttempts) {
        throw lastError;
      }

      // Exponential backoff
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
    }
  }

  throw lastError!;
};
```

### Error Display

```typescript
const ErrorDisplay = ({ error, onRetry }: Props) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-red-500/10 border border-red-500/20 rounded-xl p-6"
  >
    <div className="flex items-start gap-4">
      <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
      <div className="flex-1">
        <h3 className="font-medium text-red-400">Erro na instalação</h3>
        <p className="text-sm text-zinc-400 mt-1">{error.message}</p>

        {error.recoverable && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-4"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        )}
      </div>
    </div>
  </motion.div>
);
```

### Resumable State

```typescript
const saveStateForResume = (state: InstallState, error?: Error) => {
  const resumableState = {
    ...state,
    canResume: true,
    lastError: error?.message,
    lastAttempt: new Date().toISOString()
  };

  localStorage.setItem('nossocrm_install_state', JSON.stringify(resumableState));
};

const attemptResume = async (savedState: InstallState): Promise<boolean> => {
  // Verifica se recursos criados ainda existem
  const checks = await Promise.all([
    savedState.vercelProjectId && checkVercelProject(savedState.vercelProjectId),
    savedState.supabaseProjectRef && checkSupabaseProject(savedState.supabaseProjectRef)
  ]);

  // Se algum recurso foi deletado, não pode resumir
  if (checks.some(c => c === false)) {
    return false;
  }

  return true;
};
```

---

## 6. Post-Installation

### Onboarding Flow

```typescript
// Após instalação bem-sucedida
const completeInstallation = async (state: InstallState) => {
  // Limpa dados temporários sensíveis
  localStorage.removeItem('crm_install_token');
  localStorage.removeItem('crm_install_supabase_token');

  // Marca instalação como concluída
  localStorage.setItem('crm_installed', 'true');
  localStorage.setItem('crm_installed_at', new Date().toISOString());

  // Salva apenas dados necessários para o app
  localStorage.setItem('crm_user', JSON.stringify({
    name: state.userName,
    email: state.userEmail
  }));

  // Redirect para onboarding ou dashboard
  if (state.firstTimeUser) {
    window.location.href = '/onboarding';
  } else {
    window.location.href = '/dashboard';
  }
};
```

### First Login

```typescript
// Verifica se é primeiro acesso
const checkFirstAccess = () => {
  const installed = localStorage.getItem('crm_installed');
  const hasLoggedIn = localStorage.getItem('crm_has_logged_in');

  if (installed && !hasLoggedIn) {
    // Primeiro acesso após instalação
    return { isFirstAccess: true, showTour: true };
  }

  return { isFirstAccess: false, showTour: false };
};
```

---

## 7. Adaptação para SmartZap

### ⚠️ ANÁLISE FINAL (Jan/2026): SmartZap NÃO consegue atingir 5-6 campos

Após análise detalhada das APIs dos provedores, concluímos que o SmartZap requer **8 campos obrigatórios**.

#### Limitações Técnicas Descobertas:

| Serviço | Pode Automatizar? | Motivo |
|---------|-------------------|--------|
| **Vercel** | ❌ | Precisa de token com permissões específicas |
| **Supabase** | ✅ PARCIALMENTE | API cria projeto E retorna todas as keys |
| **QStash** | ❌ | Não existe API de provisioning - token já existe por conta |
| **Upstash Redis** | ❌ | API cria database mas **NÃO retorna REST credentials** |

#### Detalhes da API Upstash Redis (por que não funciona):

```bash
# POST https://api.upstash.com/v2/redis/database
# Response:
{
  "database_id": "abc123",
  "database_name": "mydb",
  "endpoint": "strong-panda-12345.upstash.io",  # ← Apenas o hostname!
  "port": 12345,
  "password": "xxx",                             # ← Senha para conexão direta (não REST)
  "state": "active"
}
# FALTAM: rest_url, rest_token (só no console UI)
```

### Campos Obrigatórios do SmartZap (FINAL):

| # | Campo | Onde | Auto-Submit? |
|---|-------|------|--------------|
| 1 | Email | Tela Identity | Não |
| 2 | Senha | Tela Identity | Não |
| 3 | Vercel Token | Tela Vercel | ✅ 24+ chars |
| 4 | Supabase PAT | Tela Supabase | ✅ sbp_ + 30 chars |
| 5 | QStash Token | Tela QStash | ✅ 30+ chars |
| 6 | QStash Signing Key | Tela QStash | ✅ (junto com token) |
| 7 | Upstash Redis REST URL | Tela Redis | ✅ https://...upstash.io |
| 8 | Upstash Redis REST Token | Tela Redis | ✅ (junto com URL) |

> **Nota:** WhatsApp foi movido para `/settings`. Não faz parte do wizard de instalação.

### Fluxo Revisado para SmartZap

```
/install
    │
    └─→ /install/start
            │
            ├─ Tela 1: Identity (email, senha)
            ├─ Tela 2: Vercel Token (auto-submit)
            ├─ Tela 3: Supabase PAT (auto-submit)
            ├─ Tela 4: QStash (token + signing key) ← NOVO
            ├─ Tela 5: Redis (url + token) ← NOVO
            │
            └─→ /install/wizard (100% automático)
                    │
                    ├─ Step 1: Supabase Setup (criar projeto, polling, resolve keys)
                    ├─ Step 2: Confirmação (mostra resumo dos dados)
                    ├─ Step 3: Run Install (env vars, migrations)
                    │
                    └─→ /dashboard
                            │
                            └─ Banner: "Configure WhatsApp em Configurações"
```

### Validações dos Novos Campos

**QStash Token + Signing Key:**
```typescript
// QStash Token: formato JWT ou prefixo qstash_
const isValidQStashToken = (token: string) =>
  token.startsWith('qstash_') || token.split('.').length === 3;

// Signing Key: formato específico Upstash (sig_...)
const isValidSigningKey = (key: string) =>
  key.startsWith('sig_') && key.length >= 30;

// Auto-submit quando ambos estão preenchidos
useEffect(() => {
  if (
    qstashToken.trim().length >= 30 &&
    isValidQStashToken(qstashToken) &&
    signingKey.trim().length >= 30
  ) {
    const timer = setTimeout(() => handleQStashSubmit(), 800);
    return () => clearTimeout(timer);
  }
}, [qstashToken, signingKey]);
```

**Upstash Redis REST:**
```typescript
// URL: deve ser https://...upstash.io
const isValidRedisUrl = (url: string) =>
  url.startsWith('https://') && url.includes('.upstash.io');

// Token: formato AX... (base64-like)
const isValidRedisToken = (token: string) =>
  token.length >= 30 && /^[A-Za-z0-9_=-]+$/.test(token);

// Auto-submit quando ambos estão preenchidos
useEffect(() => {
  if (isValidRedisUrl(redisUrl) && isValidRedisToken(redisToken)) {
    const timer = setTimeout(() => handleRedisSubmit(), 800);
    return () => clearTimeout(timer);
  }
}, [redisUrl, redisToken]);
```

### Env Vars do SmartZap (ATUALIZADAS)

```typescript
const SMARTZAP_ENV_VARS = {
  // === AUTOMÁTICO (obtido do provisioning Supabase) ===
  NEXT_PUBLIC_SUPABASE_URL: string,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string,
  SUPABASE_SECRET_KEY: string,

  // === GERADO AUTOMATICAMENTE ===
  MASTER_PASSWORD: string,       // Hash SHA-256 da senha do usuário
  SMARTZAP_API_KEY: string,      // generateStrongPassword(32)
  SMARTZAP_ADMIN_KEY: string,    // generateStrongPassword(32)

  // === COLETADO DO USUÁRIO (QStash) ===
  QSTASH_TOKEN: string,                    // Obrigatório
  QSTASH_CURRENT_SIGNING_KEY: string,      // Obrigatório - verifica callbacks

  // === COLETADO DO USUÁRIO (Redis) ===
  UPSTASH_REDIS_REST_URL: string,          // Obrigatório - webhook dedupe
  UPSTASH_REDIS_REST_TOKEN: string,        // Obrigatório

  // === CONFIGURADO SEPARADAMENTE (em /settings) ===
  // WHATSAPP_TOKEN: string,
  // WHATSAPP_PHONE_ID: string,
  // WHATSAPP_BUSINESS_ACCOUNT_ID: string,
};
```

### Migrations do SmartZap

O SmartZap tem 30+ migrations. Todas serão executadas automaticamente:

```typescript
// lib/installer/migrations.ts
const SMARTZAP_MIGRATIONS = [
  // Core
  '20240101000000_initial_settings.sql',
  '20240101000001_contacts.sql',
  '20240101000002_custom_fields.sql',
  '20240101000003_templates.sql',
  '20240101000004_campaigns.sql',
  '20240101000005_campaign_contacts.sql',
  '20240101000006_flows.sql',
  '20240101000007_flow_sessions.sql',
  '20240101000008_account_alerts.sql',
  // ... (ler do diretório supabase/migrations/)
];

// Execução sequencial
for (const migration of SMARTZAP_MIGRATIONS) {
  const sql = await readMigrationFile(migration);
  await executeSql(supabaseClient, sql);
}
```

### Diferenças Técnicas (ATUALIZADO)

| Aspecto | CRM | SmartZap |
|---------|-----|----------|
| **Campos coletados** | 5-6 (nome, email, senha, vercel, supabase) | **8** (email, senha, vercel, supabase, qstash×2, redis×2) |
| **Telas de coleta** | 3 (Identity, Vercel, Supabase) | **5** (Identity, Vercel, Supabase, QStash, Redis) |
| **Migrations** | ~5 arquivos | 30+ arquivos |
| **Env vars** | ~8 | **14** (inclui QStash, Redis) |
| **Redis** | Não usa | **OBRIGATÓRIO** (dedupe webhooks) |
| **QStash** | Não usa | **OBRIGATÓRIO** (campanhas async) |
| **Auth** | Hash salvo em localStorage | Hash em env var `MASTER_PASSWORD` |
| **Bootstrap** | Cria organization + profile | Apenas settings + migrations |
| **WhatsApp** | N/A | **Separado** em `/settings` (não bloqueia) |
| **Pós-install** | /dashboard | /dashboard + banner "Configure WhatsApp" |

### APIs Necessárias (ATUALIZADAS)

```
app/api/installer/
├── bootstrap/route.ts           # Valida Vercel token + descobre projeto
├── qstash/
│   └── validate/route.ts        # Valida QStash token + signing key ← NOVO
├── redis/
│   └── validate/route.ts        # Valida Upstash Redis REST credentials ← NOVO
├── supabase/
│   ├── organizations/route.ts
│   ├── preflight/route.ts
│   ├── create-project/route.ts
│   ├── project-status/route.ts
│   └── resolve/route.ts
└── run-stream/route.ts          # SSE com fases de instalação
```

> **Nota:** WhatsApp validation foi movida para `/api/settings/whatsapp/validate` - não faz parte do wizard.

### Validação QStash (POST /api/installer/qstash/validate)

```typescript
// Valida token fazendo uma chamada de teste ao QStash
const validateQStash = async (token: string, signingKey: string) => {
  // Verifica se token é válido listando mensagens (não cria nada)
  const res = await fetch('https://qstash.upstash.io/v2/messages', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error('QStash Token inválido');
  }

  // Signing key: valida formato (sig_...)
  if (!signingKey.startsWith('sig_') || signingKey.length < 30) {
    throw new Error('Signing Key inválida');
  }

  return { valid: true };
};
```

### Validação Redis (POST /api/installer/redis/validate)

```typescript
// Valida credenciais Redis fazendo PING
const validateRedis = async (restUrl: string, restToken: string) => {
  // Teste simples: PING deve retornar PONG
  const res = await fetch(`${restUrl}/ping`, {
    headers: { Authorization: `Bearer ${restToken}` }
  });

  if (!res.ok) {
    throw new Error('Credenciais Redis inválidas');
  }

  const data = await res.json();
  if (data.result !== 'PONG') {
    throw new Error('Redis não respondeu corretamente');
  }

  return { valid: true };
};
```

### Código Base Reutilizável

```typescript
// hooks/useInstallWizard.ts
export const useInstallWizard = () => {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const goNext = useCallback(() => {
    setStep(s => Math.min(s + 1, TOTAL_STEPS));
  }, []);

  const goBack = useCallback(() => {
    setStep(s => Math.max(s - 1, 1));
  }, []);

  const updateState = useCallback((partial: Partial<WizardState>) => {
    setState(s => ({ ...s, ...partial }));
  }, []);

  const executeStep = useCallback(async (stepFn: () => Promise<void>) => {
    setIsLoading(true);
    setError(null);

    try {
      await stepFn();
      goNext();
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, [goNext]);

  return {
    step,
    state,
    isLoading,
    error,
    goNext,
    goBack,
    updateState,
    executeStep
  };
};
```

---

## 8. Checklist de Implementação (ATUALIZADO)

### Fase 1: Estrutura Base
- [ ] Criar `/app/install/page.tsx` - Router (decide start vs wizard)
- [ ] Criar `/app/install/start/page.tsx` - Telas: identity → vercel → supabase → qstash → redis
- [ ] Criar `/app/install/wizard/page.tsx` - Provisioning 100% automático
- [ ] Definir constantes de storage para 8 campos
- [ ] ~~Criar `/app/install/whatsapp/page.tsx`~~ (REMOVIDO - vai em /settings)

### Fase 2: Telas de Coleta (/install/start) - 5 TELAS

- [ ] **Tela 1 - Identity**: email, senha (+ botão "Sugerir senha")
  - [ ] Validação: email com @, senha 8+ chars
  - [ ] Hash SHA-256 com salt fixo
  - [ ] Salvar hash em localStorage, plaintext em sessionStorage

- [ ] **Tela 2 - Vercel**: input token + auto-submit após 24 chars
  - [ ] POST `/api/installer/bootstrap` para validar + descobrir projeto
  - [ ] Salvar token e project JSON em localStorage

- [ ] **Tela 3 - Supabase**: input PAT + auto-submit após sbp_ + 30 chars
  - [ ] Apenas salva e redireciona (validação real no wizard)

- [ ] **Tela 4 - QStash** (NOVO): 2 campos (token + signing key)
  - [ ] Validação token: formato JWT ou prefixo `qstash_`
  - [ ] Validação signing key: prefixo `sig_` + 30 chars
  - [ ] POST `/api/installer/qstash/validate`
  - [ ] Auto-submit quando ambos válidos

- [ ] **Tela 5 - Redis** (NOVO): 2 campos (REST URL + REST token)
  - [ ] Validação URL: `https://...upstash.io`
  - [ ] Validação token: 30+ chars, base64-like
  - [ ] POST `/api/installer/redis/validate` (faz PING)
  - [ ] Auto-submit quando ambos válidos

### Fase 3: Wizard Automático (/install/wizard)
- [ ] **Hydration**: recuperar todos os dados do storage
- [ ] **Step 1 - Supabase Setup** (100% automático):
  - [ ] `loadOrgsAndDecide()` - lista orgs e escolhe automaticamente
  - [ ] `createProjectInOrg()` - cria projeto com retry de nome
  - [ ] `pollProjectStatus()` - aguarda status ACTIVE
  - [ ] `resolveKeys()` - obtém anon_key, service_role_key, db_url
- [ ] **Step 2 - Admin Validation**: mostra dados para confirmação
- [ ] **Step 3 - Run Install** (streaming SSE):
  - [ ] Fase COORDINATES: setup env vars na Vercel
  - [ ] Fase STATION: executar migrations SQL
  - [ ] Fase LANDING: trigger redeploy Vercel

### Fase 4: APIs do Installer (ATUALIZADAS)
- [ ] `POST /api/installer/bootstrap` - Valida Vercel + descobre projeto
- [ ] `POST /api/installer/supabase/organizations` - Lista orgs
- [ ] `POST /api/installer/supabase/preflight` - Enriquece orgs com planos
- [ ] `POST /api/installer/supabase/create-project` - Cria projeto
- [ ] `POST /api/installer/supabase/project-status` - Polling status
- [ ] `POST /api/installer/supabase/resolve` - Obtém chaves
- [ ] `POST /api/installer/run-stream` - SSE de instalação
- [ ] `POST /api/installer/qstash/validate` (NOVO) - Valida QStash token + signing key
- [ ] `POST /api/installer/redis/validate` (NOVO) - Valida Redis REST credentials (PING)
- [ ] ~~`POST /api/installer/whatsapp/validate`~~ (REMOVIDO - vai em /settings)

### Fase 5: Libs de Suporte
- [ ] `lib/installer/vercel.ts` - validateToken, upsertEnvs, findProject
- [ ] `lib/installer/supabase.ts` - createProject, resolveKeys, getOrgs
- [ ] `lib/installer/migrations.ts` - executar 30+ migrations do SmartZap
- [ ] `lib/installer/crypto.ts` - hashPassword, generateStrongPassword

### Fase 6: UI Components
- [ ] Layout com gradiente + glow (igual CRM)
- [ ] Auto-submit com delay de 800ms
- [ ] Loading spinner + dots pulsantes
- [ ] Checkmark animado de sucesso
- [ ] Progress indicator (dots ou barra)
- [ ] Error state com retry

### Fase 7: Pós-Instalação
- [ ] Limpar dados sensíveis do storage (tokens, senhas)
- [ ] Redirect para `/dashboard`
- [ ] Mostrar banner "Configure WhatsApp em Configurações"
- [ ] ~~`/install/whatsapp`~~ (REMOVIDO - config em `/settings` com wizard separado)

### Estimativa de Esforço (ATUALIZADA)

| Componente | Complexidade | Pode copiar do CRM? |
|------------|--------------|---------------------|
| /install/page.tsx | Baixa | ✅ 90% igual |
| /install/start/page.tsx | **Alta** | ⚠️ 60% (+ QStash + Redis = 5 telas) |
| /install/wizard/page.tsx | Alta | ✅ 70% igual |
| APIs de Supabase | Alta | ✅ 100% igual |
| API de Vercel | Média | ✅ 100% igual |
| run-stream (SSE) | Alta | ⚠️ 50% (migrations + Redis/QStash env vars) |
| Migrations executor | Média | ❌ Específico SmartZap |
| QStash validation | Baixa | ❌ Novo (2 campos: token + signing key) |
| Redis validation | Baixa | ❌ Novo (2 campos: URL + token, PING test) |
| ~~WhatsApp validation~~ | - | ❌ REMOVIDO (vai em /settings) |

**Total de telas de coleta:** 5 (vs 3 do CRM)
**Total de campos coletados:** 8 (vs 5-6 do CRM)

---

## Referências

- [CRM Source Code](/Users/thaleslaray/code/projetos/crm)
- [Vercel API Docs](https://vercel.com/docs/rest-api)
- [Supabase Management API](https://supabase.com/docs/reference/api/introduction)
- [Framer Motion](https://www.framer.com/motion/)
