# SmartZap CF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild greenfield do SmartZap (loop de marketing WhatsApp) 100% Cloudflare, num Worker único, em repositório novo `smartzap-cf`.

**Architecture:** SPA React 19 (Vite) servida por Static Assets + API Hono no mesmo Worker; D1 (dados), KV (sessões/cache), R2 (mídia), Queues (webhooks Meta), Workflows (pipeline de envio), Durable Objects (RealtimeHub WS, PhoneThrottle), Turnstile + rate limiting no login, Cron Trigger de reconciliação. Specs: `docs/superpowers/specs/2026-07-05-smartzap-cf-design.md`, `docs/smartzap-cf-stack.md`, `docs/smartzap-cf-perfil.md`, `docs/smartzap-cf-design.md`.

**Tech Stack:** TypeScript strict, Hono ^4, @cloudflare/vite-plugin, wrangler ^4, @cloudflare/vitest-pool-workers, React 19 + @tanstack/react-query v5 + react-router v7 (modo library), Tailwind CSS v4, zod, libphonenumber-js, papaparse, Playwright.

## Global Constraints

- Repo NOVO: `~/Projetos/smartzap-cf` (git init). O repo atual é só referência de leitura.
- `compatibility_date: "2026-07-05"`, `compatibility_flags: ["nodejs_compat"]`.
- Código em inglês; comentários e UI em pt-BR.
- Secrets APENAS via `wrangler secret put` (dev: `.dev.vars`, gitignored): `MASTER_PASSWORD`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `TURNSTILE_SECRET`, `SMARTZAP_API_KEY`. Var não-secreta `ENVIRONMENT` vem de `vars` no wrangler.jsonc (`production`); no dev, `.dev.vars` sobrescreve com `development`.
- Webhook Meta é fail-closed: sem `META_APP_SECRET` → 401 (nunca aceitar sem HMAC).
- Toda rota `/api/*` exceto allowlist (`/api/auth/login`, `/api/health`) exige sessão válida (KV) OU API key (comparação timing-safe).
- Telefones sempre E.164. Import de contatos exige declaração de opt-in (LGPD art. 7º).
- Tarifas Meta BRL (hardcoded com fonte, revisar trimestralmente): marketing R$ 0,3217 · utility R$ 0,035 · auth R$ 0,035 (developers.facebook.com/docs/whatsapp/pricing, 2026-07-05).
- MVP sem IA (Gemini/AI Gateway/AI Search são onda 2). Sem inbox, sem flows, sem builder.
- TDD: testes de worker com `@cloudflare/vitest-pool-workers` (workerd real). Commits pequenos e frequentes com Conventional Commits.

## Estrutura de arquivos (alvo)

```
smartzap-cf/
  wrangler.jsonc               # bindings: DB, CACHE, MEDIA, WEBHOOK_QUEUE, CAMPAIGN_WF,
                               #   REALTIME, THROTTLE, LOGIN_LIMITER (ratelimits), assets
  vite.config.ts               # @cloudflare/vite-plugin + react + tailwindcss
  vitest.config.ts             # plugin cloudflareTest() + readD1Migrations (testes do worker)
  index.html                   # entry da SPA
  migrations/0001_init.sql
  src/                         # ---- BACKEND (Worker) ----
    index.ts                   # export default {fetch,queue,scheduled} + DOs + Workflow
    env.d.ts                   # interface Env
    api/                       # rotas Hono por domínio
      router.ts                # monta o app Hono + middleware
      auth.ts  contacts.ts  templates.ts  campaigns.ts
      dashboard.ts  settings.ts  webhook.ts  realtime.ts
    middleware/auth.ts         # sessão KV OU API key timing-safe + allowlist
    domain/                    # lógica pura (testável sem bindings)
      phone.ts  csv-import.ts  pricing.ts  audience.ts
      template-precheck.ts  campaign-status.ts
    db/                        # repositórios D1 (SQL centralizado)
      contacts.ts  campaigns.ts  campaign-contacts.ts
      templates.ts  settings.ts  status-events.ts
    whatsapp/
      client.ts                # cliente Graph API ÚNICO (sendTemplate, fetchTemplates)
      errors.ts                # mapa de erros Meta (portado do repo antigo)
      webhook-verify.ts        # HMAC sha256 fail-closed
    do/
      RealtimeHub.ts  PhoneThrottle.ts
    workflows/CampaignSendWorkflow.ts
    queue/webhook-consumer.ts
    cron/reconcile.ts
  app/                         # ---- FRONTEND (SPA) ----
    main.tsx  App.tsx  index.css        # tokens Tailwind v4 (@theme)
    lib/api.ts                          # fetch wrapper (services)
    hooks/                              # useAuth, useCampaigns, useContacts,
                                        # useTemplates, useSettings, useDashboard, useRealtime
    pages/                              # Login, Dashboard, Campaigns, CampaignNew,
                                        # CampaignDetail, Contacts, Templates, Settings
    components/                         # ui/ (button, card, badge, table, dialog…) + shared
  tests/                       # testes do worker (Vitest pool workers)
    apply-migrations.ts  env.d.ts  auth.test.ts  contacts.test.ts  campaigns.test.ts
    whatsapp.test.ts  webhook.test.ts  do.test.ts  domain/*.test.ts
  e2e/smoke.spec.ts            # Playwright
```

Regra de fronteira: `api/` valida (zod) e orquestra; `domain/` decide (puro); `db/` persiste; `whatsapp/` fala com a Meta. Nenhum SQL fora de `db/`, nenhum `fetch` à Meta fora de `whatsapp/`.

---

### Task 1: Scaffold do repo + Worker Hono + health check

**Files:**
- Create: `package.json`, `wrangler.jsonc`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `tests/apply-migrations.ts`, `tests/env.d.ts`, `.gitignore`, `.dev.vars.example`, `index.html`, `src/index.ts`, `src/env.d.ts`, `src/api/router.ts`, `app/main.tsx`, `app/App.tsx`, `app/index.css`
- Test: `tests/health.test.ts`

**Interfaces:**
- Produces: `Env` (interface global de bindings), `createApp(): Hono<{ Bindings: Env }>` em `src/api/router.ts`, rota `GET /api/health` → `{ ok: true }`.

- [ ] **Step 1: Criar repo e instalar dependências**

```bash
mkdir -p ~/Projetos/smartzap-cf && cd ~/Projetos/smartzap-cf && git init
mkdir -p migrations tests
npm init -y
npm i hono zod libphonenumber-js papaparse
npm i -D typescript wrangler @cloudflare/vite-plugin @cloudflare/vitest-pool-workers \
  vite vitest @vitejs/plugin-react react react-dom \
  @types/react @types/react-dom @tanstack/react-query react-router \
  tailwindcss @tailwindcss/vite lucide-react @types/papaparse
```

- [ ] **Step 2: Escrever configs**

`wrangler.jsonc`:
```jsonc
{
  "name": "smartzap-cf",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-05",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "not_found_handling": "single-page-application",
    // Garante que a API e o webhook nunca sejam respondidos pelo fallback da SPA
    "run_worker_first": ["/api/*", "/webhook"]
  },
  "observability": { "enabled": true },
  // Em dev/test o .dev.vars sobrescreve com ENVIRONMENT=development
  "vars": { "ENVIRONMENT": "production" },
  "d1_databases": [{ "binding": "DB", "database_name": "smartzap", "database_id": "PLACEHOLDER-SET-ON-DEPLOY", "migrations_dir": "migrations" }],
  "kv_namespaces": [{ "binding": "CACHE", "id": "PLACEHOLDER-SET-ON-DEPLOY" }],
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "smartzap-media" }],
  "queues": {
    "producers": [{ "binding": "WEBHOOK_QUEUE", "queue": "meta-webhooks" }],
    "consumers": [{ "queue": "meta-webhooks", "max_batch_size": 50, "max_batch_timeout": 2, "max_retries": 5, "dead_letter_queue": "meta-webhooks-dlq" }]
  },
  "workflows": [{ "binding": "CAMPAIGN_WF", "name": "campaign-send", "class_name": "CampaignSendWorkflow" }],
  "durable_objects": { "bindings": [
    { "name": "REALTIME", "class_name": "RealtimeHub" },
    { "name": "THROTTLE", "class_name": "PhoneThrottle" }
  ]},
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["RealtimeHub", "PhoneThrottle"] }],
  "ratelimits": [{ "name": "LOGIN_LIMITER", "namespace_id": "1001", "simple": { "limit": 5, "period": 60 } }],
  "triggers": { "crons": ["*/15 * * * *"] }
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
})
```

`vitest.config.ts`:
```ts
import path from 'node:path'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { readD1Migrations } from '@cloudflare/vitest-pool-workers/config'
import { defineConfig } from 'vitest/config'

// Migrations D1 lidas em Node no load do config e injetadas no worker de teste
// via binding TEST_MIGRATIONS (aplicadas pelo setup tests/apply-migrations.ts)
const migrations = await readD1Migrations(path.join(__dirname, 'migrations'))

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // Bindings de teste autocontidos: os testes não dependem de .dev.vars (CI-safe)
        bindings: {
          TEST_MIGRATIONS: migrations,
          MASTER_PASSWORD: 'dev',
          SMARTZAP_API_KEY: 'dev-api-key',
          META_APP_SECRET: 'dev-meta-secret',
          META_VERIFY_TOKEN: 'dev-verify',
          TURNSTILE_SECRET: '',
          ENVIRONMENT: 'test',
        },
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/apply-migrations.ts'],
  },
})
```

`tests/apply-migrations.ts`:
```ts
// Setup global (setupFiles): aplica as migrations D1 no banco de teste antes de cada arquivo.
// TEST_MIGRATIONS é injetado pelo vitest.config.ts via readD1Migrations().
import { applyD1Migrations, env } from 'cloudflare:test'

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
```

`tests/env.d.ts`:
```ts
declare module 'cloudflare:test' {
  // Env visto por `import { env } from 'cloudflare:test'` nos testes
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[]
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "jsx": "react-jsx", "skipLibCheck": true, "noEmit": true,
    "types": ["./worker-configuration.d.ts", "@cloudflare/vitest-pool-workers", "vite/client"]
  },
  "include": ["src", "app", "tests", "e2e"]
}
```

`worker-configuration.d.ts` é gerado por `npm run types` (`wrangler types`) a partir do wrangler.jsonc + `.dev.vars` — inclui os tipos de runtime na compatibility date correta e a interface `Env`. Regenerar a cada mudança de binding; o arquivo é commitado.

`.gitignore`:
```
node_modules
dist
.dev.vars
.wrangler
test-results
```

`.dev.vars.example` (copiar para `.dev.vars` no dev — usado só pelo `vite dev`; os testes usam os bindings do vitest.config.ts):
```
ENVIRONMENT=development
MASTER_PASSWORD=dev
META_APP_SECRET=dev-meta-secret
META_VERIFY_TOKEN=dev-verify
WHATSAPP_TOKEN=dev-token
TURNSTILE_SECRET=
SMARTZAP_API_KEY=dev-api-key
```

`package.json` — scripts:
```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "deploy": "npm run build && wrangler deploy",
    "test": "vitest run --max-workers=1 --no-isolate",
    "test:watch": "vitest --max-workers=1 --no-isolate",
    "types": "wrangler types",
    "e2e": "playwright test"
  },
  "type": "module"
}
```

`--max-workers=1 --no-isolate` faz os arquivos de teste compartilharem o mesmo worker/storage — requisito dos testes de WebSocket+DO (Task 9); os testes usam dados únicos por arquivo para conviver com storage compartilhado.

Run: `cp .dev.vars.example .dev.vars` — Expected: `.dev.vars` criado (gitignored).

- [ ] **Step 3: Escrever o teste que falha (health)**

`tests/health.test.ts`:
```ts
import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('health', () => {
  it('GET /api/health responde 200 {ok:true}', async () => {
    const res = await SELF.fetch('https://example.com/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
```

Run: `npx vitest run tests/health.test.ts` — Expected: FAIL (src/index.ts não existe).

- [ ] **Step 4: Implementar entry + router mínimos**

`src/env.d.ts`:
```ts
// Espelho legível do Env. A fonte preferida é o `worker-configuration.d.ts` gerado
// por `npm run types` (wrangler types) — manter este arquivo em sincronia com o
// wrangler.jsonc; se os dois divergirem, o gerado vence.
interface Env {
  DB: D1Database
  CACHE: KVNamespace
  MEDIA: R2Bucket
  WEBHOOK_QUEUE: Queue<import('./api/webhook').MetaStatus> // msgs pequenas e tipadas (Task 12)
  CAMPAIGN_WF: Workflow
  REALTIME: DurableObjectNamespace<import('./do/RealtimeHub').RealtimeHub>
  THROTTLE: DurableObjectNamespace<import('./do/PhoneThrottle').PhoneThrottle>
  LOGIN_LIMITER: RateLimit
  ENVIRONMENT: string
  MASTER_PASSWORD: string
  META_APP_SECRET: string
  META_VERIFY_TOKEN: string
  WHATSAPP_TOKEN: string
  TURNSTILE_SECRET: string
  SMARTZAP_API_KEY: string
}
```

`src/api/router.ts`:
```ts
import { Hono } from 'hono'

export function createApp() {
  const app = new Hono<{ Bindings: Env }>()
  // Handler global de erro: log JSON estruturado + resposta genérica (sem vazar stack)
  app.onError((err, c) => {
    console.error(JSON.stringify({
      level: 'error',
      path: new URL(c.req.url).pathname,
      method: c.req.method,
      message: err.message,
      stack: err.stack,
    }))
    return c.json({ error: 'erro interno' }, 500)
  })
  app.get('/api/health', (c) => c.json({ ok: true }))
  return app
}
```

`src/index.ts`:
```ts
import { createApp } from './api/router'

const app = createApp()

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>

// Placeholders exigidos pelo wrangler.jsonc — implementados nas Tasks 8-11
export { RealtimeHub } from './do/RealtimeHub'
export { PhoneThrottle } from './do/PhoneThrottle'
export { CampaignSendWorkflow } from './workflows/CampaignSendWorkflow'
```

Stubs mínimos para compilar (substituídos nas tasks próprias) — `src/do/RealtimeHub.ts`, `src/do/PhoneThrottle.ts`:
```ts
import { DurableObject } from 'cloudflare:workers'
export class RealtimeHub extends DurableObject<Env> {}
```
```ts
import { DurableObject } from 'cloudflare:workers'
export class PhoneThrottle extends DurableObject<Env> {}
```
`src/workflows/CampaignSendWorkflow.ts`:
```ts
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
export type CampaignWorkflowParams = { campaignId: string }
export class CampaignSendWorkflow extends WorkflowEntrypoint<Env, CampaignWorkflowParams> {
  async run(_event: WorkflowEvent<CampaignWorkflowParams>, _step: WorkflowStep) {}
}
```

SPA mínima — `index.html`:
```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SmartZap</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/app/main.tsx"></script>
  </body>
</html>
```
`app/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(<App />)
```
`app/App.tsx`:
```tsx
export default function App() {
  return <div className="p-8 text-zinc-100">SmartZap</div>
}
```
`app/index.css`:
```css
@import 'tailwindcss';
```

- [ ] **Step 5: Gerar tipos, rodar teste e commitar**

Run: `npx wrangler types` — Expected: gera `worker-configuration.d.ts` (commitado; regenerar a cada mudança de binding).
Run: `npx vitest run tests/health.test.ts` — Expected: PASS.
```bash
git add -A && git commit -m "feat: scaffold worker+spa com health check"
```

---

### Task 2: Schema D1 + repositórios base

**Files:**
- Create: `migrations/0001_init.sql`, `src/db/contacts.ts`, `src/db/settings.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces: schema completo (spec §6); `contactsDb(db: D1Database)` com `create(input: {phone: string; name?: string; status?: string}): Promise<Contact>`, `getByPhone(phone: string): Promise<Contact | null>`, `list(opts: {q?: string; status?: string; limit: number; offset: number}): Promise<{items: Contact[]; total: number}>`; `settingsDb(db)` com `get(key: string): Promise<string | null>`, `set(key: string, value: string): Promise<void>`. Tipo `Contact = { id: string; phone: string; name: string | null; status: 'opt_in'|'opt_out'|'unknown'; custom_fields: string | null; created_at: string; updated_at: string }`.

- [ ] **Step 1: Escrever a migration**

`migrations/0001_init.sql`:
```sql
-- Schema smartzap-cf (spec §6). SQLite/D1.
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('opt_in','opt_out','unknown')),
  custom_fields TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE contact_tags (
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);
CREATE TABLE custom_field_defs (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text'
);
CREATE TABLE templates (
  name TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  components TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','scheduled','sending','completed','paused','failed','cancelled')),
  scheduled_at TEXT,
  workflow_id TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  read INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE TABLE campaign_contacts (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','skipped','sending','sent','delivered','read','failed')),
  message_id TEXT,
  error_code TEXT,
  error_detail TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, contact_id)
);
CREATE INDEX idx_cc_message_id ON campaign_contacts(message_id);
CREATE INDEX idx_cc_status ON campaign_contacts(campaign_id, status);
CREATE TABLE suppressions (
  phone TEXT PRIMARY KEY,
  reason TEXT,
  expires_at TEXT
);
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT,
  status TEXT NOT NULL,
  raw TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_se_message_id ON status_events(message_id);
-- Evidência de consentimento (LGPD art. 8º: ônus da prova é do controlador).
-- Cada import/cadastro grava a declaração aceita, a origem e a contagem.
CREATE TABLE consent_events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('import','manual')),
  declaration_text TEXT NOT NULL,
  contact_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Teste que falha (repos)**

`tests/db.test.ts` (migrations já aplicadas pelo setup `tests/apply-migrations.ts`):
```ts
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { contactsDb } from '../src/db/contacts'
import { settingsDb } from '../src/db/settings'

describe('contactsDb', () => {
  it('cria e busca por phone', async () => {
    const db = contactsDb(env.DB)
    const created = await db.create({ phone: '+5511999990001', name: 'Ana', status: 'opt_in' })
    expect(created.id).toBeTruthy()
    const found = await db.getByPhone('+5511999990001')
    expect(found?.name).toBe('Ana')
  })
  it('list filtra por status', async () => {
    const db = contactsDb(env.DB)
    const { items, total } = await db.list({ status: 'opt_in', limit: 10, offset: 0 })
    expect(total).toBeGreaterThan(0)
    expect(items.every((c) => c.status === 'opt_in')).toBe(true)
  })
})

describe('settingsDb', () => {
  it('set/get roundtrip', async () => {
    const db = settingsDb(env.DB)
    await db.set('whatsapp_phone_id', '123')
    expect(await db.get('whatsapp_phone_id')).toBe('123')
  })
})
```

Run: `npx vitest run tests/db.test.ts` — Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar repositórios**

`src/db/contacts.ts`:
```ts
export type Contact = {
  id: string; phone: string; name: string | null
  status: 'opt_in' | 'opt_out' | 'unknown'
  custom_fields: string | null; created_at: string; updated_at: string
}

export function contactsDb(db: D1Database) {
  return {
    async create(input: { phone: string; name?: string; status?: Contact['status'] }): Promise<Contact> {
      const id = crypto.randomUUID()
      await db.prepare(
        'INSERT INTO contacts (id, phone, name, status) VALUES (?1, ?2, ?3, ?4)'
      ).bind(id, input.phone, input.name ?? null, input.status ?? 'unknown').run()
      return (await this.getByPhone(input.phone))!
    },
    async getByPhone(phone: string): Promise<Contact | null> {
      return db.prepare('SELECT * FROM contacts WHERE phone = ?1').bind(phone).first<Contact>()
    },
    async list(opts: { q?: string; status?: string; limit: number; offset: number }) {
      const where: string[] = []
      const binds: unknown[] = []
      if (opts.status) { where.push(`status = ?${binds.length + 1}`); binds.push(opts.status) }
      if (opts.q) { where.push(`(name LIKE ?${binds.length + 1} OR phone LIKE ?${binds.length + 1})`); binds.push(`%${opts.q}%`) }
      const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const items = (await db.prepare(
        `SELECT * FROM contacts ${w} ORDER BY created_at DESC LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`
      ).bind(...binds, opts.limit, opts.offset).all<Contact>()).results
      const total = (await db.prepare(`SELECT COUNT(*) as n FROM contacts ${w}`).bind(...binds).first<{ n: number }>())!.n
      return { items, total }
    },
  }
}
```

`src/db/settings.ts`:
```ts
export function settingsDb(db: D1Database) {
  return {
    async get(key: string): Promise<string | null> {
      const row = await db.prepare('SELECT value FROM settings WHERE key = ?1').bind(key).first<{ value: string }>()
      return row?.value ?? null
    },
    async set(key: string, value: string): Promise<void> {
      await db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')`
      ).bind(key, value).run()
    },
  }
}
```

- [ ] **Step 4: Rodar testes e commitar**

Run: `npx vitest run tests/db.test.ts` — Expected: PASS.
```bash
git add -A && git commit -m "feat: schema D1 inicial + repos de contatos e settings"
```

---

### Task 3: Auth — sessões KV, login com Turnstile + rate limit, middleware

**Files:**
- Create: `src/api/auth.ts`, `src/middleware/auth.ts`
- Modify: `src/api/router.ts`
- Test: `tests/auth.test.ts`

**Interfaces:**
- Consumes: `createApp()` (Task 1).
- Produces: `POST /api/auth/login {password, turnstileToken?}` → seta cookie `smartzap_session` (httpOnly, 7d) e grava `session:<token>` no KV (TTL 604800); `POST /api/auth/logout`; `GET /api/auth/status` → `{authenticated: boolean}`; middleware `requireAuth` aplicado a `/api/*` com allowlist `['/api/health','/api/auth/login']`; helper `timingSafeEqualStr(a: string, b: string): Promise<boolean>`.

- [ ] **Step 1: Teste que falha**

`tests/auth.test.ts`:
```ts
import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

// Bindings de teste vêm do vitest.config.ts: MASTER_PASSWORD=dev, SMARTZAP_API_KEY=dev-api-key,
// TURNSTILE_SECRET vazio, ENVIRONMENT=test (bypass explícito do Turnstile fora de produção)
describe('auth', () => {
  it('rota protegida sem credencial → 401', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts')
    expect(res.status).toBe(401)
  })
  it('cookie presente mas sessão inexistente no KV → 401', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts', {
      headers: { cookie: 'smartzap_session=token-que-nao-existe-no-kv' },
    })
    expect(res.status).toBe(401)
  })
  it('login com senha errada → 401', async () => {
    const res = await SELF.fetch('https://x.com/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'errada' }),
    })
    expect(res.status).toBe(401)
  })
  it('login correto seta cookie e o cookie autentica', async () => {
    const login = await SELF.fetch('https://x.com/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'dev' }),
    })
    expect(login.status).toBe(200)
    const cookie = login.headers.get('set-cookie')!
    expect(cookie).toContain('smartzap_session=')
    const status = await SELF.fetch('https://x.com/api/auth/status', { headers: { cookie } })
    expect(await status.json()).toEqual({ authenticated: true })
  })
  it('API key válida autentica; inválida não', async () => {
    const ok = await SELF.fetch('https://x.com/api/auth/status', { headers: { 'x-api-key': 'dev-api-key' } })
    expect((await ok.json() as { authenticated: boolean }).authenticated).toBe(true)
    const bad = await SELF.fetch('https://x.com/api/contacts', { headers: { 'x-api-key': 'nope' } })
    expect(bad.status).toBe(401)
  })
})
```

Run: `npx vitest run tests/auth.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar middleware + rotas**

`src/middleware/auth.ts`:
```ts
import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'

const PUBLIC = new Set(['/api/health', '/api/auth/login'])

// Comparação timing-safe canônica: digere os dois lados (SHA-256) para igualar os
// comprimentos — sem early-return que vaze o tamanho do secret — e compara com
// crypto.subtle.timingSafeEqual do runtime Workers.
export async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  return crypto.subtle.timingSafeEqual(da, db)
}

export async function requireAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const path = new URL(c.req.url).pathname
  if (PUBLIC.has(path)) return next()

  // 1) API key (Bearer ou X-API-Key), comparação timing-safe
  const key = c.req.header('x-api-key') ?? c.req.header('authorization')?.replace(/^Bearer /, '')
  if (key && c.env.SMARTZAP_API_KEY && (await timingSafeEqualStr(key, c.env.SMARTZAP_API_KEY))) return next()

  // 2) Sessão: valor do cookie validado contra o KV (não só presença)
  const token = getCookie(c, 'smartzap_session')
  if (token && (await c.env.CACHE.get(`session:${token}`))) return next()

  return c.json({ error: 'não autenticado' }, 401)
}
```

`src/api/auth.ts`:
```ts
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { timingSafeEqualStr } from '../middleware/auth'

const SESSION_TTL = 60 * 60 * 24 * 7 // 7 dias

async function verifyTurnstile(env: Env, token: string | undefined, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) {
    // Fail-closed: produção sem secret é erro de configuração, nunca bypass silencioso
    if (env.ENVIRONMENT === 'production') {
      console.error(JSON.stringify({ level: 'error', msg: 'TURNSTILE_SECRET ausente em produção — login bloqueado' }))
      return false
    }
    return true // bypass explícito fora de produção (dev/test)
  }
  if (!token) return false
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret, response: token, remoteip: ip }),
  })
  const data = (await res.json()) as { success: boolean }
  return data.success
}

export const authRoutes = new Hono<{ Bindings: Env }>()
  .post('/login', async (c) => {
    const ip = c.req.header('cf-connecting-ip') ?? 'local'
    const { success } = await c.env.LOGIN_LIMITER.limit({ key: ip })
    if (!success) return c.json({ error: 'muitas tentativas, aguarde' }, 429)

    const body = await c.req.json<{ password?: string; turnstileToken?: string }>().catch(() => ({}) as never)
    if (!(await verifyTurnstile(c.env, body.turnstileToken, ip)))
      return c.json({ error: 'verificação anti-bot falhou' }, 403)
    if (!body.password || !(await timingSafeEqualStr(body.password, c.env.MASTER_PASSWORD)))
      return c.json({ error: 'senha incorreta' }, 401)

    const token = crypto.randomUUID()
    await c.env.CACHE.put(`session:${token}`, '1', { expirationTtl: SESSION_TTL })
    setCookie(c, 'smartzap_session', token, {
      httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: SESSION_TTL,
    })
    return c.json({ ok: true })
  })
  .post('/logout', async (c) => {
    const token = getCookie(c, 'smartzap_session')
    if (token) await c.env.CACHE.delete(`session:${token}`)
    deleteCookie(c, 'smartzap_session', { path: '/' })
    return c.json({ ok: true })
  })
  .get('/status', async (c) => {
    // requireAuth já passou: se chegou aqui autenticado por cookie ou API key
    return c.json({ authenticated: true })
  })
```

`src/api/router.ts` (substituir):
```ts
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { authRoutes } from './auth'

export function createApp() {
  const app = new Hono<{ Bindings: Env }>()
  // Handler global de erro: log JSON estruturado + resposta genérica (sem vazar stack)
  app.onError((err, c) => {
    console.error(JSON.stringify({
      level: 'error',
      path: new URL(c.req.url).pathname,
      method: c.req.method,
      message: err.message,
      stack: err.stack,
    }))
    return c.json({ error: 'erro interno' }, 500)
  })
  app.use('/api/*', requireAuth)
  app.get('/api/health', (c) => c.json({ ok: true }))
  app.route('/api/auth', authRoutes)
  // Rota provisória usada pelo teste de 401 — substituída na Task 5
  app.get('/api/contacts', (c) => c.json({ items: [] }))
  return app
}
```

- [ ] **Step 3: Rodar testes e commitar**

Run: `npx vitest run tests/auth.test.ts` — Expected: PASS (5 testes).
```bash
git add -A && git commit -m "feat: auth com sessões KV, turnstile, rate limit e API key timing-safe"
```

---

### Task 4: Domain — telefone E.164, pricing e CSV de contatos

**Files:**
- Create: `src/domain/phone.ts`, `src/domain/pricing.ts`, `src/domain/csv-import.ts`
- Test: `tests/domain/phone.test.ts`, `tests/domain/pricing.test.ts`, `tests/domain/csv-import.test.ts`

**Interfaces:**
- Produces: `normalizePhone(raw: string, defaultCountry?: 'BR'): string | null` (E.164 ou null); `estimateCampaignCostBRL(category: string, recipients: number): { unit: number; total: number }`; `parseContactsCsv(text: string, mapping: { phone: string; name?: string }): { valid: {phone: string; name?: string}[]; invalid: string[]; duplicates: number }`.

- [ ] **Step 1: Testes que falham**

`tests/domain/phone.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { normalizePhone } from '../../src/domain/phone'

describe('normalizePhone', () => {
  it('normaliza BR local para E.164', () => {
    expect(normalizePhone('11 99999-0001', 'BR')).toBe('+5511999990001')
  })
  it('aceita E.164 pronto', () => {
    expect(normalizePhone('+5511999990001')).toBe('+5511999990001')
  })
  it('rejeita lixo', () => {
    expect(normalizePhone('abc')).toBeNull()
  })
})
```

`tests/domain/pricing.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { estimateCampaignCostBRL } from '../../src/domain/pricing'

describe('estimateCampaignCostBRL', () => {
  it('marketing: 1000 destinatários = R$ 321,70', () => {
    const { unit, total } = estimateCampaignCostBRL('MARKETING', 1000)
    expect(unit).toBe(0.3217)
    expect(total).toBeCloseTo(321.7)
  })
  it('utility usa tarifa menor', () => {
    expect(estimateCampaignCostBRL('UTILITY', 100).total).toBeCloseTo(3.5)
  })
})
```

`tests/domain/csv-import.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parseContactsCsv } from '../../src/domain/csv-import'

describe('parseContactsCsv', () => {
  it('separa válidos, inválidos e duplicados', () => {
    const csv = 'telefone,nome\n11999990001,Ana\nabc,Bruno\n11999990001,Ana de novo\n'
    const r = parseContactsCsv(csv, { phone: 'telefone', name: 'nome' })
    expect(r.valid).toEqual([{ phone: '+5511999990001', name: 'Ana' }])
    expect(r.invalid).toEqual(['abc'])
    expect(r.duplicates).toBe(1)
  })
})
```

Run: `npx vitest run tests/domain` — Expected: FAIL.

- [ ] **Step 2: Implementar**

`src/domain/phone.ts`:
```ts
import { parsePhoneNumberFromString } from 'libphonenumber-js'

export function normalizePhone(raw: string, defaultCountry: 'BR' = 'BR'): string | null {
  const parsed = parsePhoneNumberFromString(raw, defaultCountry)
  return parsed?.isValid() ? parsed.number : null
}
```

`src/domain/pricing.ts`:
```ts
// Tarifas Meta BRL por mensagem entregue — developers.facebook.com/docs/whatsapp/pricing
// Vigência 2026-07-01. REVISAR TRIMESTRALMENTE (Meta só muda dia 1º de cada trimestre).
const BRL_RATES: Record<string, number> = {
  MARKETING: 0.3217,
  UTILITY: 0.035,
  AUTHENTICATION: 0.035,
}

export function estimateCampaignCostBRL(category: string, recipients: number) {
  const unit = BRL_RATES[category.toUpperCase()] ?? BRL_RATES.MARKETING
  return { unit, total: unit * recipients }
}
```

`src/domain/csv-import.ts`:
```ts
import Papa from 'papaparse'
import { normalizePhone } from './phone'

export function parseContactsCsv(text: string, mapping: { phone: string; name?: string }) {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
  const valid: { phone: string; name?: string }[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  let duplicates = 0
  for (const row of parsed.data) {
    const raw = (row[mapping.phone] ?? '').trim()
    const phone = normalizePhone(raw)
    if (!phone) { if (raw) invalid.push(raw); continue }
    if (seen.has(phone)) { duplicates++; continue }
    seen.add(phone)
    valid.push({ phone, name: mapping.name ? row[mapping.name]?.trim() : undefined })
  }
  return { valid, invalid, duplicates }
}
```

- [ ] **Step 3: Rodar testes e commitar**

Run: `npx vitest run tests/domain` — Expected: PASS (6 testes).
```bash
git add -A && git commit -m "feat: domain de telefone E.164, pricing Meta BRL e parser CSV"
```

---

### Task 5: Contatos — rotas CRUD, tags e import CSV com opt-in

**Files:**
- Create: `src/api/contacts.ts`, `src/db/consent-events.ts`
- Modify: `src/api/router.ts` (remover rota provisória, montar `contactsRoutes`), `src/db/contacts.ts` (adicionar `bulkInsert`, `setStatus`, `addTag`)
- Test: `tests/contacts.test.ts`

**Interfaces:**
- Consumes: `contactsDb` (Task 2), `parseContactsCsv`/`normalizePhone` (Task 4), `requireAuth` (Task 3).
- Produces: `GET /api/contacts?q=&status=&page=` → `{items, total}`; `POST /api/contacts {phone, name?, optInConfirmed: boolean}` (400 se `optInConfirmed !== true`); `POST /api/contacts/import {csv, mapping: {phone, name?}, optInConfirmed: boolean}` → `{imported, duplicates, invalid}` (400 se `optInConfirmed !== true`; 413 acima de 20.000 linhas válidas); `POST /api/contacts/bulk-status {ids, status}`. `contactsDb.bulkInsert(rows: {phone: string; name?: string}[], status: 'opt_in'): Promise<number>` (INSERT OR IGNORE em chunks de 50, retorna inseridos). `consentEventsDb(db)` com `record(input: {source: 'import'|'manual'; declarationText: string; contactCount: number}): Promise<void>` — evidência de consentimento gravada em todo caminho que cria contato `opt_in`.

- [ ] **Step 1: Teste que falha**

`tests/contacts.test.ts` (migrations já aplicadas pelo setup `tests/apply-migrations.ts`):
```ts
import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

const AUTH = { 'x-api-key': 'dev-api-key', 'content-type': 'application/json' }

describe('contacts API', () => {
  it('import exige declaração de opt-in', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts/import', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ csv: 'telefone\n11999990002\n', mapping: { phone: 'telefone' }, optInConfirmed: false }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('opt-in')
  })
  it('import válido insere com status opt_in, reporta números e grava consent event', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts/import', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({
        csv: 'telefone,nome\n11999990002,Bia\nabc,X\n11999990002,Bia2\n',
        mapping: { phone: 'telefone', name: 'nome' }, optInConfirmed: true,
      }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ imported: 1, duplicates: 1, invalid: 1 })
    const list = await SELF.fetch('https://x.com/api/contacts?q=Bia', { headers: AUTH })
    const { items } = (await list.json()) as { items: { phone: string; status: string }[] }
    expect(items[0].phone).toBe('+5511999990002')
    expect(items[0].status).toBe('opt_in')
    const ev = await env.DB.prepare(
      "SELECT * FROM consent_events WHERE source = 'import' ORDER BY created_at DESC"
    ).first<{ declaration_text: string; contact_count: number }>()
    expect(ev?.contact_count).toBe(1)
    expect(ev?.declaration_text).toBeTruthy()
  })
  it('import acima do teto de 20k linhas válidas → 413', async () => {
    const rows = Array.from({ length: 20_001 }, (_, i) => `+55119${10000000 + i}`)
    const res = await SELF.fetch('https://x.com/api/contacts/import', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ csv: `telefone\n${rows.join('\n')}\n`, mapping: { phone: 'telefone' }, optInConfirmed: true }),
    })
    expect(res.status).toBe(413)
  })
  it('POST /api/contacts exige declaração de opt-in', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts', {
      method: 'POST', headers: AUTH, body: JSON.stringify({ phone: '11999990003' }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('opt-in')
  })
  it('POST /api/contacts com opt-in confirmado cria opt_in e grava consent event', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ phone: '11999990003', name: 'Caio', optInConfirmed: true }),
    })
    expect(res.status).toBe(201)
    const contact = (await res.json()) as { phone: string; status: string }
    expect(contact.phone).toBe('+5511999990003')
    expect(contact.status).toBe('opt_in')
    const ev = await env.DB.prepare(
      "SELECT contact_count FROM consent_events WHERE source = 'manual'"
    ).first<{ contact_count: number }>()
    expect(ev?.contact_count).toBe(1)
  })
  it('POST /api/contacts rejeita telefone inválido', async () => {
    const res = await SELF.fetch('https://x.com/api/contacts', {
      method: 'POST', headers: AUTH, body: JSON.stringify({ phone: 'abc', optInConfirmed: true }),
    })
    expect(res.status).toBe(400)
  })
})
```

Run: `npx vitest run tests/contacts.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar rotas + bulkInsert**

Adicionar a `src/db/contacts.ts` (dentro do objeto retornado):
```ts
    async bulkInsert(rows: { phone: string; name?: string }[], status: Contact['status']): Promise<number> {
      if (!rows.length) return 0
      let inserted = 0
      // Chunks de 50 statements — mesmo limite usado em campaign_contacts (Task 10);
      // evita mandar um batch gigante para o D1 num CSV grande.
      for (let i = 0; i < rows.length; i += 50) {
        const stmts = rows.slice(i, i + 50).map((r) =>
          db.prepare('INSERT OR IGNORE INTO contacts (id, phone, name, status) VALUES (?1, ?2, ?3, ?4)')
            .bind(crypto.randomUUID(), r.phone, r.name ?? null, status)
        )
        const results = await db.batch(stmts)
        inserted += results.reduce((n, r) => n + (r.meta.changes ?? 0), 0)
      }
      return inserted
    },
    async setStatus(ids: string[], status: Contact['status']): Promise<void> {
      if (!ids.length) return
      const marks = ids.map((_, i) => `?${i + 2}`).join(',')
      await db.prepare(`UPDATE contacts SET status = ?1, updated_at = datetime('now') WHERE id IN (${marks})`)
        .bind(status, ...ids).run()
    },
```

`src/db/consent-events.ts`:
```ts
// Evidência de consentimento (LGPD art. 8º): todo caminho que cria contato opt_in grava um evento.
export function consentEventsDb(db: D1Database) {
  return {
    async record(input: { source: 'import' | 'manual'; declarationText: string; contactCount: number }): Promise<void> {
      await db.prepare(
        'INSERT INTO consent_events (id, source, declaration_text, contact_count) VALUES (?1, ?2, ?3, ?4)'
      ).bind(crypto.randomUUID(), input.source, input.declarationText, input.contactCount).run()
    },
  }
}
```

`src/api/contacts.ts`:
```ts
import { Hono } from 'hono'
import { z } from 'zod'
import { consentEventsDb } from '../db/consent-events'
import { contactsDb } from '../db/contacts'
import { parseContactsCsv } from '../domain/csv-import'
import { normalizePhone } from '../domain/phone'

const PAGE_SIZE = 50
const MAX_IMPORT_ROWS = 20_000 // teto por request — acima disso, dividir o CSV
// Mesmo texto exibido ao lado do checkbox na UI — gravado como evidência do consentimento
const OPT_IN_DECLARATION =
  'Declaro que estes contatos consentiram em receber mensagens deste negócio via WhatsApp.'

export const contactsRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => {
    const q = c.req.query('q') || undefined
    const status = c.req.query('status') || undefined
    const page = Math.max(1, Number(c.req.query('page') ?? 1))
    const { items, total } = await contactsDb(c.env.DB).list({
      q, status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
    })
    return c.json({ items, total })
  })
  .post('/', async (c) => {
    const body = z.object({
      phone: z.string(),
      name: z.string().optional(),
      optInConfirmed: z.boolean().optional(),
    }).safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'payload inválido' }, 400)
    // Mesmo controle LGPD do import: opt_in só nasce de declaração explícita
    if (body.data.optInConfirmed !== true)
      return c.json({ error: 'declaração de opt-in é obrigatória para cadastrar' }, 400)
    const phone = normalizePhone(body.data.phone)
    if (!phone) return c.json({ error: 'telefone inválido (esperado E.164 ou nacional BR)' }, 400)
    const contact = await contactsDb(c.env.DB).create({ phone, name: body.data.name, status: 'opt_in' })
    await consentEventsDb(c.env.DB).record({ source: 'manual', declarationText: OPT_IN_DECLARATION, contactCount: 1 })
    return c.json(contact, 201)
  })
  .post('/import', async (c) => {
    const body = z.object({
      csv: z.string().min(1),
      mapping: z.object({ phone: z.string(), name: z.string().optional() }),
      optInConfirmed: z.boolean(),
    }).safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'payload inválido' }, 400)
    // LGPD art. 7º + política anti-spam da Meta: consentimento é pré-condição, não detalhe
    if (body.data.optInConfirmed !== true)
      return c.json({ error: 'declaração de opt-in é obrigatória para importar' }, 400)
    const parsed = parseContactsCsv(body.data.csv, body.data.mapping)
    if (parsed.valid.length > MAX_IMPORT_ROWS)
      return c.json({ error: `CSV excede o teto de ${MAX_IMPORT_ROWS} linhas válidas por import — divida o arquivo` }, 413)
    const imported = await contactsDb(c.env.DB).bulkInsert(parsed.valid, 'opt_in')
    await consentEventsDb(c.env.DB).record({ source: 'import', declarationText: OPT_IN_DECLARATION, contactCount: imported })
    return c.json({ imported, duplicates: parsed.duplicates, invalid: parsed.invalid.length })
  })
  .post('/bulk-status', async (c) => {
    const body = z.object({ ids: z.array(z.string()).min(1), status: z.enum(['opt_in', 'opt_out', 'unknown']) })
      .safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'payload inválido' }, 400)
    await contactsDb(c.env.DB).setStatus(body.data.ids, body.data.status)
    return c.json({ ok: true })
  })
```

Em `src/api/router.ts`: remover a rota provisória `app.get('/api/contacts', ...)` e adicionar:
```ts
import { contactsRoutes } from './contacts'
// dentro de createApp():
app.route('/api/contacts', contactsRoutes)
```

- [ ] **Step 3: Rodar testes e commitar**

Run: `npx vitest run tests/contacts.test.ts tests/auth.test.ts` — Expected: PASS (o teste de 401 da Task 3 continua passando via `contactsRoutes`).
```bash
git add -A && git commit -m "feat: contatos com CRUD, import CSV e consentimento opt-in persistido"
```

---

### Task 6: Cliente WhatsApp único + mapa de erros + verificação HMAC

**Files:**
- Create: `src/whatsapp/client.ts`, `src/whatsapp/errors.ts`, `src/whatsapp/webhook-verify.ts`
- Test: `tests/whatsapp.test.ts`

**Interfaces:**
- Produces: `whatsappClient({token, phoneId}): { sendTemplate(to: string, template: {name, language, components?}): Promise<{ok: true, messageId: string} | {ok: false, code: number, detail: string}>; fetchTemplates(wabaId: string): Promise<MetaTemplate[]> }`; `mapWhatsAppError(code: number): { critical: boolean; optOut: boolean; message: string }`; `verifyMetaSignature(secret: string, rawBody: string, header: string | null): Promise<boolean>` (fail-closed: secret vazio ou header ausente → false). `MetaTemplate = { name: string; language: string; category: string; status: string; components: unknown[] }`.

- [ ] **Step 1: Teste que falha**

`tests/whatsapp.test.ts`:
```ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import { whatsappClient } from '../src/whatsapp/client'
import { mapWhatsAppError } from '../src/whatsapp/errors'
import { verifyMetaSignature } from '../src/whatsapp/webhook-verify'

afterEach(() => vi.unstubAllGlobals())

describe('whatsappClient.sendTemplate', () => {
  it('sucesso retorna messageId', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ messages: [{ id: 'wamid.123' }] }), { status: 200 })))
    const client = whatsappClient({ token: 't', phoneId: '111' })
    const r = await client.sendTemplate('+5511999990001', { name: 'promo', language: 'pt_BR' })
    expect(r).toEqual({ ok: true, messageId: 'wamid.123' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('https://graph.facebook.com/v24.0/111/messages')
  })
  it('erro da Meta retorna código', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 131056, message: 'pair rate limit' } }), { status: 400 })))
    const client = whatsappClient({ token: 't', phoneId: '111' })
    const r = await client.sendTemplate('+5511999990001', { name: 'promo', language: 'pt_BR' })
    expect(r).toEqual({ ok: false, code: 131056, detail: 'pair rate limit' })
  })
})

describe('mapWhatsAppError', () => {
  it('131042 (pagamento) é crítico', () => {
    expect(mapWhatsAppError(131042).critical).toBe(true)
  })
  it('131050 (opt-out) marca optOut', () => {
    expect(mapWhatsAppError(131050).optOut).toBe(true)
  })
  it('131056 (pair limit) não é crítico', () => {
    expect(mapWhatsAppError(131056).critical).toBe(false)
  })
})

describe('verifyMetaSignature (fail-closed)', () => {
  it('secret vazio → false', async () => {
    expect(await verifyMetaSignature('', 'body', 'sha256=x')).toBe(false)
  })
  it('assinatura correta → true', async () => {
    const secret = 's3cret'; const body = '{"a":1}'
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(await verifyMetaSignature(secret, body, `sha256=${hex}`)).toBe(true)
    expect(await verifyMetaSignature(secret, body, 'sha256=deadbeef')).toBe(false)
  })
})
```

Run: `npx vitest run tests/whatsapp.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar**

`src/whatsapp/client.ts`:
```ts
const GRAPH = 'https://graph.facebook.com/v24.0'

export type MetaTemplate = { name: string; language: string; category: string; status: string; components: unknown[] }
export type SendResult = { ok: true; messageId: string } | { ok: false; code: number; detail: string }

export function whatsappClient(creds: { token: string; phoneId: string }) {
  const headers = { authorization: `Bearer ${creds.token}`, 'content-type': 'application/json' }
  return {
    async sendTemplate(
      to: string,
      template: { name: string; language: string; components?: unknown[] },
    ): Promise<SendResult> {
      const res = await fetch(`${GRAPH}/${creds.phoneId}/messages`, {
        method: 'POST', headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp', to, type: 'template',
          template: {
            name: template.name,
            language: { code: template.language },
            ...(template.components ? { components: template.components } : {}),
          },
        }),
      })
      const data = (await res.json()) as {
        messages?: { id: string }[]; error?: { code: number; message: string }
      }
      if (res.ok && data.messages?.[0]) return { ok: true, messageId: data.messages[0].id }
      return { ok: false, code: data.error?.code ?? res.status, detail: data.error?.message ?? 'erro desconhecido' }
    },
    async fetchTemplates(wabaId: string): Promise<MetaTemplate[]> {
      const out: MetaTemplate[] = []
      let url: string | null = `${GRAPH}/${wabaId}/message_templates?limit=100&fields=name,language,category,status,components`
      while (url) {
        const res = await fetch(url, { headers })
        if (!res.ok) throw new Error(`Meta templates: HTTP ${res.status}`)
        const page = (await res.json()) as { data: MetaTemplate[]; paging?: { next?: string } }
        out.push(...page.data)
        url = page.paging?.next ?? null
      }
      return out
    },
  }
}
```

`src/whatsapp/errors.ts`:
```ts
// Subconjunto do mapa de erros Meta relevante ao envio de campanha.
// Referência completa: repo antigo lib/whatsapp-errors.ts + developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
type ErrInfo = { critical: boolean; optOut: boolean; message: string }

const ERRORS: Record<number, ErrInfo> = {
  131042: { critical: true, optOut: false, message: 'Problema de pagamento na conta Meta — envios bloqueados.' },
  0:      { critical: true, optOut: false, message: 'Falha de autenticação — token inválido ou expirado.' },
  190:    { critical: true, optOut: false, message: 'Token expirado.' },
  131056: { critical: false, optOut: false, message: 'Limite de mensagens para este destinatário (1 msg/6s) — tente depois.' },
  131050: { critical: false, optOut: true,  message: 'Usuário bloqueou mensagens da empresa (opt-out).' },
  131026: { critical: false, optOut: false, message: 'Destinatário indisponível ou número inválido.' },
  131047: { critical: false, optOut: false, message: 'Janela de 24h expirada — mensagem exige template.' },
  132000: { critical: false, optOut: false, message: 'Número de parâmetros do template não confere.' },
  132001: { critical: false, optOut: false, message: 'Template inexistente ou não aprovado para o idioma.' },
}

export function mapWhatsAppError(code: number): ErrInfo {
  return ERRORS[code] ?? { critical: false, optOut: false, message: `Erro Meta ${code}.` }
}
```

`src/whatsapp/webhook-verify.ts`:
```ts
// Fail-closed: sem secret configurado ou sem header, NUNCA aceita.
export async function verifyMetaSignature(
  secret: string, rawBody: string, header: string | null,
): Promise<boolean> {
  if (!secret || !header?.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const expected = header.slice('sha256='.length)
  const sigBytes = new Uint8Array(expected.length / 2)
  for (let i = 0; i < sigBytes.length; i++) {
    const byte = Number.parseInt(expected.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) return false
    sigBytes[i] = byte
  }
  return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(rawBody))
}
```

- [ ] **Step 3: Rodar testes e commitar**

Run: `npx vitest run tests/whatsapp.test.ts` — Expected: PASS (7 testes).
```bash
git add -A && git commit -m "feat: cliente Graph API único, mapa de erros e HMAC fail-closed"
```

---

### Task 7: Templates — sync da Meta + settings/credenciais com cache KV

**Files:**
- Create: `src/api/templates.ts`, `src/api/settings.ts`, `src/db/templates.ts`, `src/whatsapp/credentials.ts`
- Modify: `src/api/router.ts` (montar `templatesRoutes` e `settingsRoutes`)
- Test: `tests/templates.test.ts`

**Interfaces:**
- Consumes: `whatsappClient.fetchTemplates` (Task 6), `settingsDb` (Task 2).
- Produces: `getCredentials(env): Promise<{token, phoneId, wabaId} | null>` — lê settings do D1 (keys `whatsapp_token`, `whatsapp_phone_id`, `whatsapp_waba_id`) com fallback para env vars; o KV (key `creds:v1`, TTL 60s) cacheia **apenas** `{phoneId, wabaId}` — o token é lido de D1/env a cada chamada (secret não ganha cópia extra em repouso no KV); `templatesDb(db)` com `upsertMany(templates: MetaTemplate[])`, `list(): Promise<MetaTemplate[]>`, `get(name: string)`; `GET /api/templates`; `POST /api/templates/sync` → `{synced: number}`; `GET /api/settings` (token sai como `{configured: boolean}` — nunca o valor nem prefixo); `PUT /api/settings` com schema por campo (`throttle_mps` numérico validado) e invalidação do cache de credenciais.

- [ ] **Step 1: Teste que falha**

`tests/templates.test.ts` (migrations já aplicadas pelo setup `tests/apply-migrations.ts`; `vi.stubGlobal('fetch')` intercepta o fetch de saída porque o main Worker roda no mesmo isolate dos testes):
```ts
import { SELF, env } from 'cloudflare:test'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { getCredentials } from '../src/whatsapp/credentials'
import { settingsDb } from '../src/db/settings'

const AUTH = { 'x-api-key': 'dev-api-key', 'content-type': 'application/json' }
afterEach(() => vi.unstubAllGlobals())

describe('credentials', () => {
  it('settings do banco vencem env; cache KV guarda só os ids, nunca o token', async () => {
    await settingsDb(env.DB).set('whatsapp_phone_id', 'db-phone')
    await settingsDb(env.DB).set('whatsapp_token', 'tok-secreto')
    await env.CACHE.delete('creds:v1')
    const creds = await getCredentials(env)
    expect(creds?.phoneId).toBe('db-phone')
    expect(creds?.token).toBe('tok-secreto')
    const cached = await env.CACHE.get('creds:v1')
    expect(cached).toBeTruthy()
    expect(cached).not.toContain('tok-secreto') // token nunca vai pro KV
  })
})

describe('templates sync', () => {
  it('sync busca da Meta, salva e lista', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      if (String(url).includes('message_templates'))
        return new Response(JSON.stringify({ data: [
          { name: 'promo_julho', language: 'pt_BR', category: 'MARKETING', status: 'APPROVED', components: [] },
        ] }), { status: 200 })
      throw new Error(`fetch inesperado: ${url}`)
    }))
    const res = await SELF.fetch('https://x.com/api/templates/sync', { method: 'POST', headers: AUTH })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ synced: 1 })
    const list = await SELF.fetch('https://x.com/api/templates', { headers: AUTH })
    const { items } = (await list.json()) as { items: { name: string }[] }
    expect(items[0].name).toBe('promo_julho')
  })
})

describe('settings API', () => {
  it('PUT valida throttle_mps e GET não vaza o token', async () => {
    const bad = await SELF.fetch('https://x.com/api/settings', {
      method: 'PUT', headers: AUTH, body: JSON.stringify({ throttle_mps: 'abc' }),
    })
    expect(bad.status).toBe(400)
    const ok = await SELF.fetch('https://x.com/api/settings', {
      method: 'PUT', headers: AUTH,
      body: JSON.stringify({ whatsapp_token: 'tok-secreto', throttle_mps: '40' }),
    })
    expect(ok.status).toBe(200)
    const res = await SELF.fetch('https://x.com/api/settings', { headers: AUTH })
    const raw = await res.text()
    expect(raw).not.toContain('tok-secreto') // nem valor nem prefixo
    const body = JSON.parse(raw) as { whatsapp_token: { configured: boolean }; throttle_mps: string | null }
    expect(body.whatsapp_token).toEqual({ configured: true })
    expect(body.throttle_mps).toBe('40')
  })
})
```

Run: `npx vitest run tests/templates.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar**

`src/whatsapp/credentials.ts`:
```ts
import { settingsDb } from '../db/settings'

const CACHE_KEY = 'creds:v1'
const CACHE_TTL = 60 // segundos — mesmo comportamento do produto antigo

export type Credentials = { token: string; phoneId: string; wabaId: string }
type CachedIds = { phoneId: string; wabaId: string }

// O cache KV guarda APENAS {phoneId, wabaId}. O token é lido de D1/env a cada
// chamada: KV replica globalmente e o secret não deve ganhar mais uma cópia em repouso.
export async function getCredentials(env: Env): Promise<Credentials | null> {
  const s = settingsDb(env.DB)
  const token = (await s.get('whatsapp_token')) ?? env.WHATSAPP_TOKEN ?? ''
  if (!token) return null

  const cached = await env.CACHE.get<CachedIds>(CACHE_KEY, 'json')
  if (cached?.phoneId) return { token, ...cached }

  const [phoneId, wabaId] = await Promise.all([
    s.get('whatsapp_phone_id'), s.get('whatsapp_waba_id'),
  ])
  const ids: CachedIds = { phoneId: phoneId ?? '', wabaId: wabaId ?? '' }
  if (!ids.phoneId) return null
  await env.CACHE.put(CACHE_KEY, JSON.stringify(ids), { expirationTtl: CACHE_TTL })
  return { token, ...ids }
}

export async function invalidateCredentials(env: Env) {
  await env.CACHE.delete(CACHE_KEY)
}
```

`src/db/templates.ts`:
```ts
import type { MetaTemplate } from '../whatsapp/client'

export function templatesDb(db: D1Database) {
  return {
    async upsertMany(templates: MetaTemplate[]): Promise<void> {
      if (!templates.length) return
      await db.batch(templates.map((t) =>
        db.prepare(
          `INSERT INTO templates (name, language, category, status, components, synced_at)
           VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
           ON CONFLICT(name) DO UPDATE SET language=?2, category=?3, status=?4, components=?5, synced_at=datetime('now')`
        ).bind(t.name, t.language, t.category, t.status, JSON.stringify(t.components ?? []))))
    },
    async list() {
      const rows = (await db.prepare('SELECT * FROM templates ORDER BY name').all()).results
      return rows.map((r) => ({ ...r, components: JSON.parse((r.components as string) || '[]') }))
    },
    async get(name: string) {
      const r = await db.prepare('SELECT * FROM templates WHERE name = ?1').bind(name).first()
      return r ? { ...r, components: JSON.parse((r.components as string) || '[]') } : null
    },
  }
}
```

`src/api/templates.ts`:
```ts
import { Hono } from 'hono'
import { templatesDb } from '../db/templates'
import { whatsappClient } from '../whatsapp/client'
import { getCredentials } from '../whatsapp/credentials'

export const templatesRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => c.json({ items: await templatesDb(c.env.DB).list() }))
  .post('/sync', async (c) => {
    const creds = await getCredentials(c.env)
    if (!creds?.wabaId) return c.json({ error: 'credenciais Meta não configuradas (settings)' }, 400)
    const templates = await whatsappClient(creds).fetchTemplates(creds.wabaId)
    await templatesDb(c.env.DB).upsertMany(templates)
    return c.json({ synced: templates.length })
  })
```

`src/api/settings.ts`:
```ts
import { Hono } from 'hono'
import { z } from 'zod'
import { settingsDb } from '../db/settings'
import { invalidateCredentials } from '../whatsapp/credentials'

// Schema por campo: throttle_mps é numérico com teto (string livre viraria NaN
// e desativaria o throttle no workflow). Os demais seguem como string.
const PutSchema = z.object({
  whatsapp_token: z.string().min(1).optional(),
  whatsapp_phone_id: z.string().optional(),
  whatsapp_waba_id: z.string().optional(),
  throttle_mps: z.coerce.number().int().positive().max(80).optional(),
})

export const settingsRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => {
    const s = settingsDb(c.env.DB)
    return c.json({
      // Token NUNCA sai da API — nem prefixo; só o fato de existir
      whatsapp_token: { configured: Boolean(await s.get('whatsapp_token')) },
      whatsapp_phone_id: await s.get('whatsapp_phone_id'),
      whatsapp_waba_id: await s.get('whatsapp_waba_id'),
      throttle_mps: await s.get('throttle_mps'),
    })
  })
  .put('/', async (c) => {
    const body = PutSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'payload inválido' }, 400)
    const s = settingsDb(c.env.DB)
    for (const [k, v] of Object.entries(body.data)) {
      if (v === undefined) continue
      await s.set(k, String(v))
    }
    await invalidateCredentials(c.env)
    return c.json({ ok: true })
  })
```

Em `src/api/router.ts`, montar:
```ts
import { templatesRoutes } from './templates'
import { settingsRoutes } from './settings'
app.route('/api/templates', templatesRoutes)
app.route('/api/settings', settingsRoutes)
```

- [ ] **Step 3: Rodar testes e commitar**

Run: `npx vitest run tests/templates.test.ts` — Expected: PASS.
```bash
git add -A && git commit -m "feat: sync de templates Meta + settings com cache de credenciais em KV"
```

---

### Task 8: Durable Object — PhoneThrottle (throttle por número)

**Files:**
- Modify: `src/do/PhoneThrottle.ts` (substituir stub da Task 1)
- Test: `tests/do.test.ts`

**Interfaces:**
- Produces (RPC): `PhoneThrottle.acquire(now?: number): Promise<number>` — retorna quantos ms esperar antes de enviar a próxima mensagem para respeitar `ratePerSecond` (default 10; configurável via `configure(rate)`). `now` é injetável para testes determinísticos (default `Date.now()`). Estado (`rate` e `nextSlot`) persistido — eviction do DO no meio de uma campanha não causa burst acima da taxa. A idempotência de webhooks NÃO mora aqui: é garantida no D1 pelo `updateByMessageId` atômico (Task 12).

- [ ] **Step 1: Teste que falha**

`tests/do.test.ts`:
```ts
import { env, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { PhoneThrottle } from '../src/do/PhoneThrottle'

describe('PhoneThrottle', () => {
  it('respeita a taxa: 3 acquires no mesmo instante acumulam espera', async () => {
    const stub = env.THROTTLE.getByName('t1')
    await runInDurableObject(stub, async (instance: PhoneThrottle) => {
      await instance.configure(1) // 1 msg/s
      const t0 = Date.now()
      expect(await instance.acquire(t0)).toBe(0)
      expect(await instance.acquire(t0)).toBe(1000)
      expect(await instance.acquire(t0)).toBe(2000)
    })
  })
  it('tempo real decorrido libera o slot sem espera', async () => {
    const stub = env.THROTTLE.getByName('t2')
    await runInDurableObject(stub, async (instance: PhoneThrottle) => {
      await instance.configure(1)
      const t0 = Date.now()
      expect(await instance.acquire(t0)).toBe(0)
      expect(await instance.acquire(t0 + 5000)).toBe(0) // 5s depois: slot já passou
    })
  })
})
```

Run: `npx vitest run tests/do.test.ts` — Expected: FAIL (stub vazio).

- [ ] **Step 2: Implementar**

`src/do/PhoneThrottle.ts`:
```ts
import { DurableObject } from 'cloudflare:workers'

// Uma instância por phone_number_id — serializa a taxa de envio daquele número.
export class PhoneThrottle extends DurableObject<Env> {
  private nextSlot = 0        // timestamp (ms) do próximo slot livre
  private ratePerSecond = 10  // default conservador; Meta suporta muito mais

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Carrega o estado persistido antes de aceitar qualquer chamada:
    // sem isso, uma eviction no meio da campanha zeraria nextSlot e causaria burst.
    ctx.blockConcurrencyWhile(async () => {
      this.ratePerSecond = (await ctx.storage.get<number>('rate')) ?? 10
      this.nextSlot = (await ctx.storage.get<number>('nextSlot')) ?? 0
    })
  }

  async configure(rate: number): Promise<void> {
    const next = Math.max(1, rate)
    if (next === this.ratePerSecond) return // evita write a cada batch com o mesmo valor
    this.ratePerSecond = next
    await this.ctx.storage.put('rate', next)
  }

  // `now` injetável para testes determinísticos
  async acquire(now: number = Date.now()): Promise<number> {
    const interval = 1000 / this.ratePerSecond
    const slot = Math.max(now, this.nextSlot)
    this.nextSlot = slot + interval
    // void proposital: writes são coalescidos e o output gate segura a resposta
    // até a escrita durar — durabilidade sem pagar um await por mensagem.
    void this.ctx.storage.put('nextSlot', this.nextSlot)
    return slot - now // ms que o chamador deve esperar
  }
}
```

- [ ] **Step 3: Rodar testes e commitar**

Run: `npx vitest run tests/do.test.ts` — Expected: PASS.
```bash
git add -A && git commit -m "feat: DO de throttle por número com estado persistido"
```

---

### Task 9: RealtimeHub — WebSocket Hibernation + broadcast

**Files:**
- Modify: `src/do/RealtimeHub.ts` (substituir stub)
- Create: `src/api/realtime.ts`, `src/api/origin.ts`
- Modify: `src/api/router.ts` (montar rota `/api/realtime`)
- Test: `tests/realtime.test.ts`

**Interfaces:**
- Consumes: sessão validada pelo `requireAuth` (Task 3).
- Produces: `GET /api/realtime` (upgrade WS, autenticado) encaminha para a instância única `hub`; RPC `RealtimeHub.broadcast(event: RealtimeEvent): Promise<number>` (retorna nº de sockets notificados). `RealtimeEvent = { type: 'invalidate'; keys: string[][] } | { type: 'progress'; campaignId: string; counters: { sent: number; delivered: number; read: number; failed: number; total: number } }`. Helper `broadcastToHub(env, event)` em `src/api/realtime.ts` para uso do consumer/workflow. Keepalive: `ping`→`pong` via `setWebSocketAutoResponse` (respondido pelo runtime sem tirar o DO da hibernação). O upgrade checa o header `Origin` com `assertSameOrigin(c)` (`src/api/origin.ts`, reusado pela Task 10 em dispatch/cancel) — defesa CSRF em profundidade além do cookie SameSite.

- [ ] **Step 1: Teste que falha**

`tests/realtime.test.ts`:
```ts
import { env, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { RealtimeHub } from '../src/do/RealtimeHub'

describe('RealtimeHub', () => {
  it('aceita WS e broadcast entrega o evento', async () => {
    const stub = env.REALTIME.getByName('hub')
    const res = await stub.fetch('https://do/ws', { headers: { upgrade: 'websocket' } })
    expect(res.status).toBe(101)
    const ws = res.webSocket!
    ws.accept()
    const received = new Promise<string>((resolve) => ws.addEventListener('message', (e) => resolve(e.data as string)))
    const n = await runInDurableObject(stub, (i: RealtimeHub) =>
      i.broadcast({ type: 'invalidate', keys: [['campaigns']] }))
    expect(n).toBe(1)
    expect(JSON.parse(await received)).toEqual({ type: 'invalidate', keys: [['campaigns']] })
  })
})
```

Run: `npx vitest run tests/realtime.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar**

`src/do/RealtimeHub.ts`:
```ts
import { DurableObject } from 'cloudflare:workers'

export type RealtimeEvent =
  | { type: 'invalidate'; keys: string[][] }
  | { type: 'progress'; campaignId: string; counters: { sent: number; delivered: number; read: number; failed: number; total: number } }

export class RealtimeHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // ping/pong respondido pelo runtime SEM acordar o DO da hibernação —
    // keepalive de NAT sem custo de wall-clock.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return new Response('esperado upgrade websocket', { status: 426 })
    const pair = new WebSocketPair()
    // Hibernation API: o DO dorme sem derrubar os clientes
    this.ctx.acceptWebSocket(pair[1])
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async broadcast(event: RealtimeEvent): Promise<number> {
    const msg = JSON.stringify(event)
    let n = 0
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); n++ } catch { /* socket morto — ignorar */ }
    }
    return n
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean) {
    // Completa o handshake de fechamento ecoando código/razão do cliente
    ws.close(code, reason)
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.warn('[realtime] erro no socket', error)
    try { ws.close(1011, 'erro interno') } catch { /* já fechado */ }
  }
}
```

`src/api/origin.ts`:
```ts
import type { Context } from 'hono'

// Defesa CSRF em profundidade (além do cookie SameSite=Lax): se o navegador
// enviou Origin e o host difere do host da própria request, recusa com 403.
// Requests sem Origin (curl, integrações com API key) passam normalmente.
export function assertSameOrigin(c: Context): Response | null {
  const origin = c.req.header('origin')
  if (!origin) return null
  try {
    if (new URL(origin).host === new URL(c.req.url).host) return null
  } catch { /* Origin malformado → recusa */ }
  return c.json({ error: 'origin não permitida' }, 403)
}
```

`src/api/realtime.ts`:
```ts
import { Hono } from 'hono'
import type { RealtimeEvent } from '../do/RealtimeHub'
import { assertSameOrigin } from './origin'

export function hubStub(env: Env) {
  // Env tipado com DurableObjectNamespace<RealtimeHub> — RPC direto, sem casts
  return env.REALTIME.getByName('hub')
}

export async function broadcastToHub(env: Env, event: RealtimeEvent): Promise<void> {
  // best-effort: realtime nunca pode derrubar o caminho principal
  try { await hubStub(env).broadcast(event) } catch (e) { console.warn('[realtime] broadcast falhou', e) }
}

export const realtimeRoutes = new Hono<{ Bindings: Env }>()
  .get('/', (c) => assertSameOrigin(c) ?? hubStub(c.env).fetch(c.req.raw))
```

Em `src/api/router.ts`:
```ts
import { realtimeRoutes } from './realtime'
app.route('/api/realtime', realtimeRoutes)
```

- [ ] **Step 3: Rodar testes e commitar**

Run: `npx vitest run tests/realtime.test.ts` — Expected: PASS.
```bash
git add -A && git commit -m "feat: RealtimeHub com hibernation e broadcast tipado"
```

---

### Task 10: Campanhas — repos, CRUD, audiência, custo estimado e dispatch

**Files:**
- Create: `src/api/campaigns.ts`, `src/db/campaigns.ts`, `src/db/campaign-contacts.ts`, `src/domain/audience.ts`
- Modify: `src/api/router.ts` (montar `campaignsRoutes`)
- Test: `tests/campaigns.test.ts`

**Interfaces:**
- Consumes: `templatesDb` (Task 7), `contactsDb` (Task 5), `estimateCampaignCostBRL` (Task 4), `assertSameOrigin` (Task 9), `env.CAMPAIGN_WF` (binding).
- Produces:
  - `campaignsDb(db)`: `create({name, template_name, scheduled_at?}): Promise<Campaign>`, `get(id)`, `list()`, `setStatus(id, status)`, `setWorkflowId(id, wfId)`, `updateCounters(id, deltas: Partial<Counters>)`, `isCancelled(id): Promise<boolean>`.
  - `campaignContactsDb(db)`: `bulkInsert(campaignId, rows: {contactId, phone, status}[])`, `claimPending(campaignId, limit): Promise<{contact_id, phone}[]>` (marca `sending`), `markResult(campaignId, contactId, r: {status, message_id?, error_code?, error_detail?})`, `updateByMessageId(messageId, status): Promise<{campaign_id: string; applied: boolean} | null>` (UPDATE condicional **atômico**: só progride o status; `meta.changes` decide `applied` — é ele que garante a idempotência dos webhooks sob retry da Queue), `countByStatus(campaignId): Promise<Record<string, number>>`, `listByCampaign(campaignId, page)`.
  - Rotas: `GET /api/campaigns`, `POST /api/campaigns {name, template_name, scheduled_at?}`, `GET /api/campaigns/:id` (com contadores + custo estimado/real), `GET /api/campaigns/:id/contacts?page=`, `POST /api/campaigns/:id/estimate {tags?}` → `{recipients, skipped, unit, total}`, `POST /api/campaigns/:id/dispatch {tags?}` → 202 `{workflowId}`, `POST /api/campaigns/:id/cancel`, `POST /api/campaigns/:id/pause`, `POST /api/campaigns/:id/resume`. `dispatch` e `cancel` checam `Origin` via `assertSameOrigin`.
  - `pauseCampaign`/`resumeCampaign`/`cancelCampaign(db, wf: WorkflowBinding, id)` exportadas de `src/api/campaigns.ts` — a lógica de controle fica testável com fake; `WorkflowBinding = { get(id): Promise<{pause(): Promise<void>; resume(): Promise<void>; terminate(): Promise<void>}> }` (interface mínima estruturalmente satisfeita por `env.CAMPAIGN_WF`).
  - `resolveAudience(db, opts: {tags?: string[]}): Promise<{eligible: {id, phone}[]; skipped: number}>` — só `opt_in`, exclui `suppressions` ativas.
- `Campaign = { id, name, template_name, status, scheduled_at, workflow_id, total, sent, delivered, read, failed, created_at, completed_at }`, `Counters = { total, sent, delivered, read, failed }`.

- [ ] **Step 1: Teste que falha**

`tests/campaigns.test.ts`:
```ts
import { SELF, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { contactsDb } from '../src/db/contacts'
import { campaignsDb } from '../src/db/campaigns'
import { resolveAudience } from '../src/domain/audience'
import { cancelCampaign, pauseCampaign, resumeCampaign } from '../src/api/campaigns'

const AUTH = { 'x-api-key': 'dev-api-key', 'content-type': 'application/json' }
// Telefones únicos por execução — os arquivos de teste compartilham o mesmo D1
const uniquePhone = () => '+55119' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 10)

const phoneOk = uniquePhone()
const phoneSuppressed = uniquePhone()
const phoneOptOut = uniquePhone()

beforeAll(async () => {
  const c = contactsDb(env.DB)
  await c.bulkInsert([{ phone: phoneOk }, { phone: phoneSuppressed }], 'opt_in')
  await c.bulkInsert([{ phone: phoneOptOut }], 'opt_in')
  await c.setStatus([(await c.getByPhone(phoneOptOut))!.id], 'opt_out')
  await env.DB.prepare('INSERT OR IGNORE INTO suppressions (phone, reason) VALUES (?1, ?2)')
    .bind(phoneSuppressed, 'reclamou').run()
  await env.DB.prepare(
    `INSERT OR IGNORE INTO templates (name, language, category, status, components)
     VALUES ('promo_teste', 'pt_BR', 'MARKETING', 'APPROVED', '[]')`).run()
})

describe('resolveAudience', () => {
  it('só opt_in e fora de supressão', async () => {
    const { eligible, skipped } = await resolveAudience(env.DB, {})
    const phones = eligible.map((e) => e.phone)
    expect(phones).toContain(phoneOk)
    expect(phones).not.toContain(phoneSuppressed) // suprimido
    expect(phones).not.toContain(phoneOptOut) // opt-out
    expect(skipped).toBeGreaterThanOrEqual(1)
  })
})

describe('campaigns API', () => {
  it('cria, estima custo e despacha', async () => {
    const create = await SELF.fetch('https://x.com/api/campaigns', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ name: 'Julho', template_name: 'promo_teste' }),
    })
    expect(create.status).toBe(201)
    const { id } = (await create.json()) as { id: string }

    const est = await SELF.fetch(`https://x.com/api/campaigns/${id}/estimate`, {
      method: 'POST', headers: AUTH, body: JSON.stringify({}),
    })
    const estimate = (await est.json()) as { recipients: number; unit: number; total: number }
    expect(estimate.unit).toBe(0.3217) // MARKETING
    expect(estimate.recipients).toBeGreaterThanOrEqual(1)

    const dispatch = await SELF.fetch(`https://x.com/api/campaigns/${id}/dispatch`, {
      method: 'POST', headers: AUTH, body: JSON.stringify({}),
    })
    expect(dispatch.status).toBe(202)
    const detail = await SELF.fetch(`https://x.com/api/campaigns/${id}`, { headers: AUTH })
    const camp = (await detail.json()) as { status: string; total: number }
    expect(['sending', 'scheduled']).toContain(camp.status)
    expect(camp.total).toBeGreaterThanOrEqual(1)
  })
  it('dispatch de template não aprovado → 400', async () => {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO templates (name, language, category, status, components)
       VALUES ('pendente', 'pt_BR', 'MARKETING', 'PENDING', '[]')`).run()
    const create = await SELF.fetch('https://x.com/api/campaigns', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ name: 'X', template_name: 'pendente' }),
    })
    const { id } = (await create.json()) as { id: string }
    const dispatch = await SELF.fetch(`https://x.com/api/campaigns/${id}/dispatch`, {
      method: 'POST', headers: AUTH, body: JSON.stringify({}),
    })
    expect(dispatch.status).toBe(400)
  })
})

describe('pause/resume/cancel (contrato com o binding de Workflows)', () => {
  it('persiste o status e chama o método certo no workflow', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Controle', template_name: 'promo_teste' })
    await cdb.setWorkflowId(campaign.id, 'wf-1')
    // Fake do binding: só a interface mínima que as funções de controle exigem
    const instance = {
      pause: vi.fn(async () => {}), resume: vi.fn(async () => {}), terminate: vi.fn(async () => {}),
    }
    const wf = { get: async (_id: string) => instance }

    await pauseCampaign(env.DB, wf, campaign.id)
    expect(instance.pause).toHaveBeenCalledOnce()
    expect((await cdb.get(campaign.id))!.status).toBe('paused')

    await resumeCampaign(env.DB, wf, campaign.id)
    expect(instance.resume).toHaveBeenCalledOnce()
    expect((await cdb.get(campaign.id))!.status).toBe('sending')

    await cancelCampaign(env.DB, wf, campaign.id)
    expect(instance.terminate).toHaveBeenCalledOnce()
    expect((await cdb.get(campaign.id))!.status).toBe('cancelled')
  })
  it('pause sem workflow ativo → 409', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Sem WF', template_name: 'promo_teste' })
    const wf = { get: async (_id: string) => { throw new Error('não deveria chamar') } }
    const r = await pauseCampaign(env.DB, wf, campaign.id)
    expect(r).toEqual({ ok: false, status: 409, error: 'campanha sem workflow ativo' })
  })
})
```

Run: `npx vitest run tests/campaigns.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar repos e domain**

`src/domain/audience.ts`:
```ts
export async function resolveAudience(
  db: D1Database, opts: { tags?: string[] },
): Promise<{ eligible: { id: string; phone: string }[]; skipped: number }> {
  const tagJoin = opts.tags?.length
    ? `JOIN contact_tags ct ON ct.contact_id = c.id
       JOIN tags t ON t.id = ct.tag_id AND t.name IN (${opts.tags.map((_, i) => `?${i + 1}`).join(',')})`
    : ''
  const binds = opts.tags ?? []
  const eligible = (await db.prepare(
    `SELECT DISTINCT c.id, c.phone FROM contacts c ${tagJoin}
     WHERE c.status = 'opt_in'
       AND c.phone NOT IN (
         SELECT phone FROM suppressions
         WHERE expires_at IS NULL OR expires_at > datetime('now'))`
  ).bind(...binds).all<{ id: string; phone: string }>()).results
  const totalCandidates = (await db.prepare(
    `SELECT COUNT(DISTINCT c.id) as n FROM contacts c ${tagJoin}`
  ).bind(...binds).first<{ n: number }>())!.n
  return { eligible, skipped: totalCandidates - eligible.length }
}
```

`src/db/campaigns.ts`:
```ts
export type Campaign = {
  id: string; name: string; template_name: string
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused' | 'failed' | 'cancelled'
  scheduled_at: string | null; workflow_id: string | null
  total: number; sent: number; delivered: number; read: number; failed: number
  created_at: string; completed_at: string | null
}
export type Counters = { total: number; sent: number; delivered: number; read: number; failed: number }

export function campaignsDb(db: D1Database) {
  return {
    async create(input: { name: string; template_name: string; scheduled_at?: string }): Promise<Campaign> {
      const id = crypto.randomUUID()
      await db.prepare(
        `INSERT INTO campaigns (id, name, template_name, status, scheduled_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      ).bind(id, input.name, input.template_name,
        input.scheduled_at ? 'draft' : 'draft', input.scheduled_at ?? null).run()
      return (await this.get(id))!
    },
    async get(id: string) {
      return db.prepare('SELECT * FROM campaigns WHERE id = ?1').bind(id).first<Campaign>()
    },
    async list() {
      return (await db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all<Campaign>()).results
    },
    async setStatus(id: string, status: Campaign['status']) {
      const completed = ['completed', 'failed', 'cancelled'].includes(status)
      await db.prepare(
        `UPDATE campaigns SET status = ?2${completed ? ", completed_at = datetime('now')" : ''} WHERE id = ?1`
      ).bind(id, status).run()
    },
    async setWorkflowId(id: string, wfId: string) {
      await db.prepare('UPDATE campaigns SET workflow_id = ?2 WHERE id = ?1').bind(id, wfId).run()
    },
    async setTotal(id: string, total: number) {
      await db.prepare('UPDATE campaigns SET total = ?2 WHERE id = ?1').bind(id, total).run()
    },
    async updateCounters(id: string, d: Partial<Counters>) {
      await db.prepare(
        `UPDATE campaigns SET sent = sent + ?2, delivered = delivered + ?3,
         read = read + ?4, failed = failed + ?5 WHERE id = ?1`
      ).bind(id, d.sent ?? 0, d.delivered ?? 0, d.read ?? 0, d.failed ?? 0).run()
    },
    async isCancelled(id: string): Promise<boolean> {
      const r = await db.prepare('SELECT status FROM campaigns WHERE id = ?1').bind(id).first<{ status: string }>()
      return r?.status === 'cancelled'
    },
  }
}
```

`src/db/campaign-contacts.ts`:
```ts
export function campaignContactsDb(db: D1Database) {
  return {
    async bulkInsert(campaignId: string, rows: { contactId: string; phone: string; status: 'pending' | 'skipped' }[]) {
      if (!rows.length) return
      // Lotes de 50 para respeitar limites de variáveis do D1
      for (let i = 0; i < rows.length; i += 50) {
        await db.batch(rows.slice(i, i + 50).map((r) =>
          db.prepare(
            `INSERT OR IGNORE INTO campaign_contacts (campaign_id, contact_id, phone, status)
             VALUES (?1, ?2, ?3, ?4)`
          ).bind(campaignId, r.contactId, r.phone, r.status)))
      }
    },
    async claimPending(campaignId: string, limit: number) {
      const rows = (await db.prepare(
        `SELECT contact_id, phone FROM campaign_contacts
         WHERE campaign_id = ?1 AND status = 'pending' LIMIT ?2`
      ).bind(campaignId, limit).all<{ contact_id: string; phone: string }>()).results
      if (rows.length) {
        const marks = rows.map((_, i) => `?${i + 2}`).join(',')
        await db.prepare(
          `UPDATE campaign_contacts SET status = 'sending', updated_at = datetime('now')
           WHERE campaign_id = ?1 AND contact_id IN (${marks})`
        ).bind(campaignId, ...rows.map((r) => r.contact_id)).run()
      }
      return rows
    },
    async markResult(campaignId: string, contactId: string,
      r: { status: string; message_id?: string; error_code?: string; error_detail?: string }) {
      await db.prepare(
        `UPDATE campaign_contacts SET status = ?3, message_id = ?4, error_code = ?5,
         error_detail = ?6, updated_at = datetime('now')
         WHERE campaign_id = ?1 AND contact_id = ?2`
      ).bind(campaignId, contactId, r.status, r.message_id ?? null, r.error_code ?? null, r.error_detail ?? null).run()
    },
    async updateByMessageId(messageId: string, status: string): Promise<{ campaign_id: string; applied: boolean } | null> {
      // UPDATE condicional ATÔMICO: só progride status (delivered não volta pra sent;
      // read não volta pra delivered). Sem read-then-write — dois consumers processando
      // o mesmo evento em paralelo não aplicam a transição duas vezes: `meta.changes`
      // diz se ESTA chamada foi a que aplicou. É daqui que vem a idempotência dos
      // contadores de campanha sob retry da Queue.
      const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 9 }
      const res = await db.prepare(
        `UPDATE campaign_contacts SET status = ?2, updated_at = datetime('now')
         WHERE message_id = ?1
           AND CASE status WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2
               WHEN 'read' THEN 3 WHEN 'failed' THEN 9 ELSE 0 END < ?3`
      ).bind(messageId, status, rank[status] ?? 0).run()
      // message_id inexistente OU evento atrasado/duplicado → nada a contar
      if (!res.meta.changes) return null
      // SELECT separada só quando a transição aplicou (caminho raro por evento duplicado)
      const row = await db.prepare(
        'SELECT campaign_id FROM campaign_contacts WHERE message_id = ?1'
      ).bind(messageId).first<{ campaign_id: string }>()
      return row ? { campaign_id: row.campaign_id, applied: true } : null
    },
    async countByStatus(campaignId: string): Promise<Record<string, number>> {
      const rows = (await db.prepare(
        'SELECT status, COUNT(*) as n FROM campaign_contacts WHERE campaign_id = ?1 GROUP BY status'
      ).bind(campaignId).all<{ status: string; n: number }>()).results
      return Object.fromEntries(rows.map((r) => [r.status, r.n]))
    },
    async listByCampaign(campaignId: string, page: number, pageSize = 50) {
      return (await db.prepare(
        `SELECT cc.*, c.name FROM campaign_contacts cc
         LEFT JOIN contacts c ON c.id = cc.contact_id
         WHERE cc.campaign_id = ?1 ORDER BY cc.updated_at DESC LIMIT ?2 OFFSET ?3`
      ).bind(campaignId, pageSize, (page - 1) * pageSize).all()).results
    },
  }
}
```

- [ ] **Step 3: Implementar rotas**

`src/api/campaigns.ts`:
```ts
import { Hono } from 'hono'
import { z } from 'zod'
import { campaignsDb } from '../db/campaigns'
import { campaignContactsDb } from '../db/campaign-contacts'
import { templatesDb } from '../db/templates'
import { resolveAudience } from '../domain/audience'
import { estimateCampaignCostBRL } from '../domain/pricing'
import { assertSameOrigin } from './origin'

const audienceSchema = z.object({ tags: z.array(z.string()).optional() })

// Binding mínimo de Workflows — interface estreita para as funções de controle
// serem testáveis com fake (o binding real `env.CAMPAIGN_WF` a satisfaz por estrutura)
export type WorkflowBinding = {
  get(id: string): Promise<{ pause(): Promise<void>; resume(): Promise<void>; terminate(): Promise<void> }>
}
type ControlResult = { ok: true } | { ok: false; status: 404 | 409; error: string }

export async function cancelCampaign(db: D1Database, wf: WorkflowBinding, id: string): Promise<ControlResult> {
  const cdb = campaignsDb(db)
  const campaign = await cdb.get(id)
  if (!campaign) return { ok: false, status: 404, error: 'campanha não encontrada' }
  await cdb.setStatus(campaign.id, 'cancelled') // Workflow checa a flag a cada batch
  if (campaign.workflow_id) {
    try { await (await wf.get(campaign.workflow_id)).terminate() } catch { /* já finalizado */ }
  }
  return { ok: true }
}

export async function pauseCampaign(db: D1Database, wf: WorkflowBinding, id: string): Promise<ControlResult> {
  const cdb = campaignsDb(db)
  const campaign = await cdb.get(id)
  if (!campaign?.workflow_id) return { ok: false, status: 409, error: 'campanha sem workflow ativo' }
  await (await wf.get(campaign.workflow_id)).pause()
  await cdb.setStatus(campaign.id, 'paused')
  return { ok: true }
}

export async function resumeCampaign(db: D1Database, wf: WorkflowBinding, id: string): Promise<ControlResult> {
  const cdb = campaignsDb(db)
  const campaign = await cdb.get(id)
  if (!campaign?.workflow_id) return { ok: false, status: 409, error: 'campanha sem workflow ativo' }
  await (await wf.get(campaign.workflow_id)).resume()
  await cdb.setStatus(campaign.id, 'sending')
  return { ok: true }
}

export const campaignsRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => c.json({ items: await campaignsDb(c.env.DB).list() }))
  .post('/', async (c) => {
    const body = z.object({
      name: z.string().min(1), template_name: z.string().min(1),
      scheduled_at: z.string().datetime().optional(),
    }).safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'payload inválido' }, 400)
    const template = await templatesDb(c.env.DB).get(body.data.template_name)
    if (!template) return c.json({ error: 'template não encontrado — sincronize com a Meta' }, 400)
    const campaign = await campaignsDb(c.env.DB).create(body.data)
    return c.json(campaign, 201)
  })
  .get('/:id', async (c) => {
    const campaign = await campaignsDb(c.env.DB).get(c.req.param('id'))
    if (!campaign) return c.json({ error: 'campanha não encontrada' }, 404)
    const template = await templatesDb(c.env.DB).get(campaign.template_name)
    const cost = estimateCampaignCostBRL(String(template?.category ?? 'MARKETING'), campaign.total)
    return c.json({ ...campaign, cost: { unit: cost.unit, estimated: cost.total, real: cost.unit * campaign.sent } })
  })
  .get('/:id/contacts', async (c) => {
    const page = Math.max(1, Number(c.req.query('page') ?? 1))
    return c.json({ items: await campaignContactsDb(c.env.DB).listByCampaign(c.req.param('id'), page) })
  })
  .post('/:id/estimate', async (c) => {
    const campaign = await campaignsDb(c.env.DB).get(c.req.param('id'))
    if (!campaign) return c.json({ error: 'campanha não encontrada' }, 404)
    const body = audienceSchema.safeParse(await c.req.json().catch(() => ({})))
    const { eligible, skipped } = await resolveAudience(c.env.DB, body.success ? body.data : {})
    const template = await templatesDb(c.env.DB).get(campaign.template_name)
    const { unit, total } = estimateCampaignCostBRL(String(template?.category ?? 'MARKETING'), eligible.length)
    return c.json({ recipients: eligible.length, skipped, unit, total })
  })
  .post('/:id/dispatch', async (c) => {
    const denied = assertSameOrigin(c) // mutação sensível: Origin cross-site → 403
    if (denied) return denied
    const id = c.req.param('id')
    const cdb = campaignsDb(c.env.DB)
    const campaign = await cdb.get(id)
    if (!campaign) return c.json({ error: 'campanha não encontrada' }, 404)
    if (!['draft', 'scheduled'].includes(campaign.status))
      return c.json({ error: `campanha em status ${campaign.status} não pode ser disparada` }, 409)
    const template = await templatesDb(c.env.DB).get(campaign.template_name)
    if (!template || template.status !== 'APPROVED')
      return c.json({ error: 'template não aprovado pela Meta' }, 400)

    const body = audienceSchema.safeParse(await c.req.json().catch(() => ({})))
    const { eligible } = await resolveAudience(c.env.DB, body.success ? body.data : {})
    if (!eligible.length) return c.json({ error: 'audiência vazia (nenhum contato opt-in elegível)' }, 400)

    await campaignContactsDb(c.env.DB).bulkInsert(id,
      eligible.map((e) => ({ contactId: e.id, phone: e.phone, status: 'pending' as const })))
    await cdb.setTotal(id, eligible.length)
    await cdb.setStatus(id, campaign.scheduled_at ? 'scheduled' : 'sending')

    const instance = await c.env.CAMPAIGN_WF.create({ params: { campaignId: id } })
    await cdb.setWorkflowId(id, instance.id)
    return c.json({ workflowId: instance.id }, 202)
  })
  .post('/:id/cancel', async (c) => {
    const denied = assertSameOrigin(c) // mutação sensível: Origin cross-site → 403
    if (denied) return denied
    const r = await cancelCampaign(c.env.DB, c.env.CAMPAIGN_WF, c.req.param('id'))
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status)
  })
  .post('/:id/pause', async (c) => {
    const r = await pauseCampaign(c.env.DB, c.env.CAMPAIGN_WF, c.req.param('id'))
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status)
  })
  .post('/:id/resume', async (c) => {
    const r = await resumeCampaign(c.env.DB, c.env.CAMPAIGN_WF, c.req.param('id'))
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status)
  })
```

Em `src/api/router.ts`:
```ts
import { campaignsRoutes } from './campaigns'
app.route('/api/campaigns', campaignsRoutes)
```

- [ ] **Step 4: Rodar testes e commitar**

Run: `npx vitest run tests/campaigns.test.ts` — Expected: PASS.
```bash
git add -A && git commit -m "feat: campanhas com audiência opt-in, custo estimado e dispatch via workflow"
```

---

### Task 11: CampaignSendWorkflow — pipeline durável de envio

**Files:**
- Modify: `src/workflows/CampaignSendWorkflow.ts` (substituir stub)
- Test: `tests/workflow.test.ts` (funções extraídas testadas com D1/DO reais + `vi.stubGlobal('fetch')`) — a execução fim-a-fim é coberta pelo teste manual do Step 3

**Interfaces:**
- Consumes: `campaignsDb`/`campaignContactsDb` (Task 10), `whatsappClient`+`mapWhatsAppError` (Task 6), `getCredentials` (Task 7), `PhoneThrottle.acquire` (Task 8, via `env.THROTTLE.getByName` tipado), `broadcastToHub` (Task 9).
- Produces: workflow `campaign-send` com steps `load-schedule` → `wait-schedule?` (`step.sleepUntil`) → `load-config` → N× `send-batch-{i}` (com teto de iterações) → `complete`. Funções **exportadas** (testáveis fora do runtime de Workflows; `run()` é só o coordenador):
  - `loadSendConfig(env, campaignId): Promise<{creds: Credentials; rate: number; total: number} | null>` — `null` quando a campanha foi cancelada durante o agendamento; `rate` validado com default seguro 10.
  - `sendCampaignBatch(env, campaignId, creds, rate): Promise<boolean>` — `true` quando não há mais pendentes (ou cancelada); recupera rows presas em `sending` antes de reivindicar novo batch.
  - `nextBatchPlan(counters: {pending: number}, batchSize: number): number` — dimensiona o teto de batches do loop (protege o limite de steps do Workflow: 1.024 Free / 10k Paid).

- [ ] **Step 1: Implementar o workflow**

`src/workflows/CampaignSendWorkflow.ts`:
```ts
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { campaignsDb } from '../db/campaigns'
import { campaignContactsDb } from '../db/campaign-contacts'
import { whatsappClient } from '../whatsapp/client'
import { mapWhatsAppError } from '../whatsapp/errors'
import { getCredentials, type Credentials } from '../whatsapp/credentials'
import { broadcastToHub } from '../api/realtime'
import { settingsDb } from '../db/settings'

export type CampaignWorkflowParams = { campaignId: string }
const BATCH_SIZE = 50

export function nextBatchPlan(counters: { pending: number }, batchSize: number): number {
  return Math.ceil(counters.pending / batchSize)
}

/**
 * Carrega a config de envio. Retorna null se a campanha foi cancelada
 * (ex.: durante o agendamento). Exportada para ser testável sem o runtime de Workflows.
 */
export async function loadSendConfig(
  env: Env, campaignId: string,
): Promise<{ creds: Credentials; rate: number; total: number } | null> {
  const cdb = campaignsDb(env.DB)
  const campaign = await cdb.get(campaignId)
  if (!campaign) throw new NonRetryableError('campanha não existe')
  if (campaign.status === 'cancelled') return null
  const creds = await getCredentials(env)
  if (!creds) throw new NonRetryableError('credenciais Meta ausentes')
  // Defensivo: valor inválido em settings (string livre, NaN, 0) não pode
  // desligar o throttle — cai no default seguro de 10 msg/s.
  const raw = Number((await settingsDb(env.DB).get('throttle_mps')) ?? 10)
  const rate = Number.isFinite(raw) && raw >= 1 ? raw : 10
  await cdb.setStatus(campaignId, 'sending')
  return { creds, rate, total: campaign.total }
}

/**
 * Envia um batch. Retorna true quando não há mais pendentes (ou cancelada).
 * Exportada para ser testável com D1/DO reais e fetch stubado.
 */
export async function sendCampaignBatch(
  env: Env, campaignId: string, creds: Credentials, rate: number,
): Promise<boolean> {
  const cdb = campaignsDb(env.DB)
  const ccdb = campaignContactsDb(env.DB)
  if (await cdb.isCancelled(campaignId)) return true

  // Recuperação de retry do step: rows presas em 'sending' por crash no meio do
  // batch anterior. COM message_id → a Meta já aceitou: marca 'sent'. SEM
  // message_id → volta pra 'pending' e será reenviada. Janela at-least-once
  // documentada: se o crash ocorreu ENTRE o aceite da Meta e a gravação do
  // message_id, o contato pode receber a mensagem 2x (raro; preferível a
  // deixar rows órfãs em 'sending' para sempre).
  await env.DB.prepare(
    `UPDATE campaign_contacts SET status = 'sent', updated_at = datetime('now')
     WHERE campaign_id = ?1 AND status = 'sending' AND message_id IS NOT NULL`
  ).bind(campaignId).run()
  await env.DB.prepare(
    `UPDATE campaign_contacts SET status = 'pending', updated_at = datetime('now')
     WHERE campaign_id = ?1 AND status = 'sending' AND message_id IS NULL`
  ).bind(campaignId).run()

  const batch = await ccdb.claimPending(campaignId, BATCH_SIZE)
  if (!batch.length) return true

  const campaign = (await cdb.get(campaignId))!
  const client = whatsappClient(creds)
  // Env tipado com DurableObjectNamespace<PhoneThrottle> — RPC direto, sem casts
  const throttle = env.THROTTLE.getByName(creds.phoneId)
  await throttle.configure(rate)

  let sent = 0, failed = 0
  for (const row of batch) {
    const waitMs = await throttle.acquire() // produção: sem argumento (now = Date.now() no DO)
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs)) // wall-time, não CPU
    const result = await client.sendTemplate(row.phone, {
      name: campaign.template_name, language: 'pt_BR',
    })
    if (result.ok) {
      await ccdb.markResult(campaignId, row.contact_id, { status: 'sent', message_id: result.messageId })
      sent++
    } else {
      const info = mapWhatsAppError(result.code)
      if (info.critical) {
        await cdb.setStatus(campaignId, 'failed')
        throw new NonRetryableError(`erro crítico Meta ${result.code}: ${info.message}`)
      }
      if (info.optOut) {
        await env.DB.prepare('UPDATE contacts SET status = ?2 WHERE id = ?1')
          .bind(row.contact_id, 'opt_out').run()
      }
      await ccdb.markResult(campaignId, row.contact_id, {
        status: 'failed', error_code: String(result.code), error_detail: info.message,
      })
      failed++
    }
  }
  await cdb.updateCounters(campaignId, { sent, failed })
  const updated = (await cdb.get(campaignId))!
  await broadcastToHub(env, {
    type: 'progress', campaignId,
    counters: { sent: updated.sent, delivered: updated.delivered, read: updated.read, failed: updated.failed, total: updated.total },
  })
  return batch.length < BATCH_SIZE
}

export class CampaignSendWorkflow extends WorkflowEntrypoint<Env, CampaignWorkflowParams> {
  // Coordenador fino: toda a lógica mora nas funções exportadas acima
  async run(event: WorkflowEvent<CampaignWorkflowParams>, step: WorkflowStep) {
    const { campaignId } = event.payload
    const cdb = campaignsDb(this.env.DB)
    const ccdb = campaignContactsDb(this.env.DB)

    // 1. Agendamento: sleepUntil é determinístico entre replays (nenhum
    //    cálculo de delta com Date.now() fora de step)
    const scheduledAt = await step.do('load-schedule', async () => {
      const c = await cdb.get(campaignId)
      if (!c) throw new NonRetryableError('campanha não existe')
      return c.scheduled_at
    })
    if (scheduledAt) await step.sleepUntil('wait-schedule', new Date(scheduledAt))

    // 2. Config: cancelamento + credenciais + throttle
    const config = await step.do('load-config', async () => loadSendConfig(this.env, campaignId))
    if (!config) return // cancelada durante o agendamento

    // 3. Batches — cada um é um step durável independente (retry só re-envia o batch).
    //    Teto de iterações: batches da campanha inteira + folga para retries que
    //    reivindicam batch vazio — nunca estoura o limite de steps do Workflow.
    const maxBatches = nextBatchPlan({ pending: config.total }, BATCH_SIZE) + 5
    let done = false
    for (let i = 0; i < maxBatches; i++) {
      done = await step.do(`send-batch-${i}`, { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' } },
        async () => sendCampaignBatch(this.env, campaignId, config.creds, config.rate))
      if (done) break
    }
    if (!done) {
      await step.do('fail-max-batches', async () => { await cdb.setStatus(campaignId, 'failed') })
      throw new NonRetryableError(
        `campanha ${campaignId} excedeu o teto de ${maxBatches} batches — abortada para não estourar o limite de steps`)
    }

    // 4. Fechamento
    await step.do('complete', async () => {
      const counts = await ccdb.countByStatus(campaignId)
      const stillCancelled = await cdb.isCancelled(campaignId)
      if (!stillCancelled) await cdb.setStatus(campaignId, 'completed')
      const c = (await cdb.get(campaignId))!
      await broadcastToHub(this.env, {
        type: 'progress', campaignId,
        counters: { sent: c.sent, delivered: c.delivered, read: c.read, failed: c.failed, total: c.total },
      })
      await broadcastToHub(this.env, { type: 'invalidate', keys: [['campaigns'], ['dashboard']] })
      console.log(`[campaign ${campaignId}] concluída`, counts)
    })
  }
}
```

- [ ] **Step 2: Testes das funções extraídas (D1/DO reais, fetch stubado)**

`tests/workflow.test.ts`:
```ts
import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadSendConfig, nextBatchPlan, sendCampaignBatch } from '../src/workflows/CampaignSendWorkflow'
import { campaignsDb } from '../src/db/campaigns'
import { campaignContactsDb } from '../src/db/campaign-contacts'
import { contactsDb } from '../src/db/contacts'
import type { Credentials } from '../src/whatsapp/credentials'

const creds: Credentials = { token: 't', phoneId: '111', wabaId: 'w' }
// Telefones únicos por execução — os arquivos de teste compartilham o mesmo D1
const uniquePhone = () => '+55119' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 10)

afterEach(() => vi.unstubAllGlobals())

async function seedCampaign(phones: string[]) {
  const cdb = campaignsDb(env.DB)
  const ccdb = campaignContactsDb(env.DB)
  const campaign = await cdb.create({ name: 'WF', template_name: 'promo_wf' })
  const rows: { contactId: string; phone: string; status: 'pending' }[] = []
  for (const phone of phones) {
    const contact = await contactsDb(env.DB).create({ phone, status: 'opt_in' })
    rows.push({ contactId: contact.id, phone, status: 'pending' })
  }
  await ccdb.bulkInsert(campaign.id, rows)
  await cdb.setTotal(campaign.id, rows.length)
  return campaign
}

const metaOk = (id: string) =>
  new Response(JSON.stringify({ messages: [{ id }] }), { status: 200 })
const metaError = (code: number) =>
  new Response(JSON.stringify({ error: { code, message: `erro ${code}` } }), { status: 400 })

describe('sendCampaignBatch', () => {
  it('marca sent/failed por contato e 131050 vira opt_out do contato', async () => {
    const pOk = uniquePhone(); const pOut = uniquePhone()
    const campaign = await seedCampaign([pOk, pOut])
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { to: string }
      return body.to === pOut ? metaError(131050) : metaOk('wamid.' + crypto.randomUUID())
    }))
    const done = await sendCampaignBatch(env, campaign.id, creds, 80)
    expect(done).toBe(true) // batch menor que BATCH_SIZE encerra
    const counts = await campaignContactsDb(env.DB).countByStatus(campaign.id)
    expect(counts.sent).toBe(1)
    expect(counts.failed).toBe(1)
    expect((await contactsDb(env.DB).getByPhone(pOut))!.status).toBe('opt_out')
    const after = (await campaignsDb(env.DB).get(campaign.id))!
    expect(after.sent).toBe(1)
    expect(after.failed).toBe(1)
  })

  it('erro crítico 131042 marca a campanha como failed e lança NonRetryableError', async () => {
    const campaign = await seedCampaign([uniquePhone()])
    vi.stubGlobal('fetch', vi.fn(async () => metaError(131042)))
    await expect(sendCampaignBatch(env, campaign.id, creds, 80)).rejects.toThrow(/131042/)
    expect((await campaignsDb(env.DB).get(campaign.id))!.status).toBe('failed')
  })

  it('campanha cancelada não chama a Meta e encerra com true', async () => {
    const campaign = await seedCampaign([uniquePhone()])
    await campaignsDb(env.DB).setStatus(campaign.id, 'cancelled')
    const spy = vi.fn(async () => metaOk('wamid.x'))
    vi.stubGlobal('fetch', spy)
    expect(await sendCampaignBatch(env, campaign.id, creds, 80)).toBe(true)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('loadSendConfig', () => {
  it('campanha cancelada durante o agendamento → null', async () => {
    const cdb = campaignsDb(env.DB)
    const campaign = await cdb.create({ name: 'Agendada', template_name: 'promo_wf' })
    await cdb.setStatus(campaign.id, 'cancelled')
    expect(await loadSendConfig(env, campaign.id)).toBeNull()
  })
})

describe('nextBatchPlan', () => {
  it('130 pendentes em batches de 50 = 3 batches', () => {
    expect(nextBatchPlan({ pending: 130 }, 50)).toBe(3)
  })
})
```

Run: `npx vitest run tests/workflow.test.ts` — Expected: PASS (5 testes). Run: `npx vitest run` — Expected: suíte inteira PASS (o workflow compila dentro do worker de teste).

- [ ] **Step 3: Verificação manual do fluxo (dev)**

```bash
npm run dev
# noutro terminal: criar campanha e disparar contra a Graph API mockada é coberto no e2e;
# aqui apenas conferir que o worker sobe sem erro de bindings
curl -s http://localhost:5173/api/health
```
Expected: `{"ok":true}` e nenhum erro de binding no console.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: workflow durável de envio com throttle, recuperação de retry e teto de batches"
```

---

### Task 12: Webhook Meta — rota fail-closed + consumer da Queue

**Files:**
- Create: `src/api/webhook.ts`, `src/queue/webhook-consumer.ts`, `src/db/status-events.ts`
- Modify: `src/api/router.ts` (montar `/webhook` FORA de `/api`), `src/index.ts` (handler `queue`)
- Test: `tests/webhook.test.ts`

**Interfaces:**
- Consumes: `verifyMetaSignature` (Task 6), `timingSafeEqualStr` (Task 3), `campaignContactsDb.updateByMessageId` atômico/`campaignsDb.updateCounters` (Task 10), `broadcastToHub` (Task 9).
- Produces: `GET /webhook` (verificação `hub.challenge` da Meta — `hub.verify_token` comparado em tempo constante com o secret dedicado `META_VERIFY_TOKEN`, nunca o `META_APP_SECRET`); `POST /webhook` valida HMAC, extrai e valida os statuses com `MetaStatusSchema` (zod) e enfileira via `sendBatch` em fatias de 100 — cada mensagem da Queue é um `MetaStatus` pequeno e tipado (o payload agregado da Meta nunca encosta no limite de 128 KB/msg); `MetaStatus`/`MetaStatusSchema` exportados de `src/api/webhook.ts` (tipam `WEBHOOK_QUEUE: Queue<MetaStatus>` no Env); `handleWebhookBatch(statuses: MetaStatus[], env)` exportado do consumer (status_events → update atômico por message_id → contadores agregados por campanha → broadcast). A idempotência sob retry da Queue vem do UPDATE condicional de `updateByMessageId` — não existe DO de dedup.

- [ ] **Step 1: Teste que falha**

`tests/webhook.test.ts`:
```ts
import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { handleWebhookBatch } from '../src/queue/webhook-consumer'
import type { MetaStatus } from '../src/api/webhook'
import { campaignsDb } from '../src/db/campaigns'
import { campaignContactsDb } from '../src/db/campaign-contacts'
import { contactsDb } from '../src/db/contacts'

// Telefones únicos por execução — os arquivos de teste compartilham o mesmo D1
const uniquePhone = () => '+55119' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 10)

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return 'sha256=' + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function statusPayload(messageId: string, status: string) {
  return { entry: [{ changes: [{ value: { statuses: [
    { id: messageId, status, timestamp: '1', recipient_id: '5511999990201' },
  ] } }] }] }
}

describe('GET /webhook (verificação da Meta)', () => {
  it('token correto ecoa o challenge', async () => {
    const res = await SELF.fetch(
      'https://x.com/webhook?hub.mode=subscribe&hub.verify_token=dev-verify&hub.challenge=42')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('42')
  })
  it('token errado → 403 sem vazar o challenge', async () => {
    const res = await SELF.fetch(
      'https://x.com/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42')
    expect(res.status).toBe(403)
    expect(await res.text()).not.toContain('42')
  })
})

describe('POST /webhook (fail-closed)', () => {
  it('sem assinatura → 401', async () => {
    const res = await SELF.fetch('https://x.com/webhook', { method: 'POST', body: '{}' })
    expect(res.status).toBe(401)
  })
  it('assinatura válida → 200 rápido', async () => {
    const body = JSON.stringify(statusPayload('wamid.a', 'delivered'))
    const res = await SELF.fetch('https://x.com/webhook', {
      method: 'POST', body,
      headers: { 'x-hub-signature-256': await sign('dev-meta-secret', body) },
    })
    expect(res.status).toBe(200)
  })
})

describe('handleWebhookBatch', () => {
  it('atualiza status por message_id e agrega contador por campanha', async () => {
    const phone = uniquePhone()
    const mid = 'wamid.' + crypto.randomUUID()
    const contact = await contactsDb(env.DB).create({ phone, status: 'opt_in' })
    const campaign = await campaignsDb(env.DB).create({ name: 'W', template_name: 'promo_teste' })
    await campaignContactsDb(env.DB).bulkInsert(campaign.id,
      [{ contactId: contact.id, phone: contact.phone, status: 'pending' }])
    await campaignContactsDb(env.DB).markResult(campaign.id, contact.id, { status: 'sent', message_id: mid })
    await campaignsDb(env.DB).updateCounters(campaign.id, { sent: 1 })

    const evt: MetaStatus = { id: mid, status: 'delivered', timestamp: '1', recipient_id: '5511999990201' }
    await handleWebhookBatch([evt], env)
    const after = (await campaignsDb(env.DB).get(campaign.id))!
    expect(after.delivered).toBe(1)

    // Retry da Queue reentrega o MESMO evento: o UPDATE condicional atômico de
    // updateByMessageId não progride status repetido → não conta duas vezes
    await handleWebhookBatch([evt], env)
    expect(((await campaignsDb(env.DB).get(campaign.id))!).delivered).toBe(1)
  })
})
```

Run: `npx vitest run tests/webhook.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar rota + consumer**

`src/db/status-events.ts`:
```ts
export function statusEventsDb(db: D1Database) {
  return {
    async insertMany(events: { message_id: string | null; status: string; raw: string }[]) {
      if (!events.length) return
      await db.batch(events.map((e) =>
        db.prepare('INSERT INTO status_events (message_id, status, raw) VALUES (?1, ?2, ?3)')
          .bind(e.message_id, e.status, e.raw)))
    },
  }
}
```

`src/api/webhook.ts`:
```ts
import { Hono } from 'hono'
import { z } from 'zod'
import { verifyMetaSignature } from '../whatsapp/webhook-verify'
import { timingSafeEqualStr } from '../middleware/auth'

// Validação na fronteira: só statuses bem-formados entram na Queue
export const MetaStatusSchema = z.object({
  id: z.string(), status: z.string(), timestamp: z.string(), recipient_id: z.string(),
})
export type MetaStatus = z.infer<typeof MetaStatusSchema>

type MetaWebhook = { entry?: { changes?: { value?: { statuses?: unknown[] } }[] }[] }

export const webhookRoutes = new Hono<{ Bindings: Env }>()
  // Verificação inicial da Meta (GET com hub.challenge). O verify token é um
  // secret DEDICADO de baixo sigilo (digitado no painel da Meta) — nunca o
  // META_APP_SECRET, que é a chave HMAC. Comparação em tempo constante.
  .get('/', async (c) => {
    const mode = c.req.query('hub.mode')
    const token = c.req.query('hub.verify_token')
    const challenge = c.req.query('hub.challenge')
    if (mode === 'subscribe' && token && challenge
      && (await timingSafeEqualStr(token, c.env.META_VERIFY_TOKEN)))
      return c.text(challenge)
    return c.text('forbidden', 403)
  })
  // Eventos: valida HMAC, extrai/valida os statuses e responde 200 rápido;
  // o processamento pesado fica no consumer da Queue
  .post('/', async (c) => {
    const raw = await c.req.text()
    const ok = await verifyMetaSignature(
      c.env.META_APP_SECRET, raw, c.req.header('x-hub-signature-256') ?? null)
    if (!ok) return c.json({ error: 'assinatura inválida' }, 401)

    // Cada mensagem enfileirada é um MetaStatus pequeno e tipado — o payload
    // agregado da Meta (que pode ser grande) nunca encosta no limite de
    // 128 KB/msg da Queue. Statuses inválidos são descartados com log.
    const payload = JSON.parse(raw) as MetaWebhook
    const statuses: MetaStatus[] = []
    for (const entry of payload.entry ?? [])
      for (const change of entry.changes ?? [])
        for (const s of change.value?.statuses ?? []) {
          const parsed = MetaStatusSchema.safeParse(s)
          if (parsed.success) statuses.push(parsed.data)
          else console.warn('[webhook] status inválido descartado', parsed.error.issues)
        }

    // sendBatch aceita no máximo 100 mensagens por chamada → fatias de 100
    for (let i = 0; i < statuses.length; i += 100) {
      await c.env.WEBHOOK_QUEUE.sendBatch(
        statuses.slice(i, i + 100).map((s) => ({ body: s })))
    }
    return c.json({ ok: true })
  })
```

`src/queue/webhook-consumer.ts`:
```ts
import { campaignsDb, type Counters } from '../db/campaigns'
import { campaignContactsDb } from '../db/campaign-contacts'
import { statusEventsDb } from '../db/status-events'
import { broadcastToHub } from '../api/realtime'
import type { MetaStatus } from '../api/webhook'

export async function handleWebhookBatch(statuses: MetaStatus[], env: Env): Promise<void> {
  if (!statuses.length) return

  // 1. Log bruto (histórico para o futuro inbox). Queues são at-least-once:
  //    duplicatas aqui são TOLERADAS — status_events é log, não fonte de contadores.
  await statusEventsDb(env.DB).insertMany(
    statuses.map((s) => ({ message_id: s.id, status: s.status, raw: JSON.stringify(s) })))

  // 2. Updates individuais. A idempotência mora no UPDATE condicional ATÔMICO de
  //    updateByMessageId: um retry do mesmo evento não progride o status de novo
  //    (applied=false/null) e portanto não incrementa contador duas vezes.
  const ccdb = campaignContactsDb(env.DB)
  const deltas = new Map<string, Partial<Counters>>()
  for (const s of statuses) {
    if (!['delivered', 'read', 'failed'].includes(s.status)) continue
    const updated = await ccdb.updateByMessageId(s.id, s.status)
    if (!updated?.applied) continue
    const d = deltas.get(updated.campaign_id) ?? {}
    if (s.status === 'delivered') d.delivered = (d.delivered ?? 0) + 1
    if (s.status === 'read') d.read = (d.read ?? 0) + 1
    if (s.status === 'failed') d.failed = (d.failed ?? 0) + 1
    deltas.set(updated.campaign_id, d)
  }

  // 3. Um UPDATE de contadores por campanha por batch + broadcast
  const cdb = campaignsDb(env.DB)
  for (const [campaignId, d] of deltas) {
    await cdb.updateCounters(campaignId, d)
    await broadcastToHub(env, { type: 'invalidate', keys: [['campaigns'], ['campaign', campaignId], ['dashboard']] })
  }
}
```

`src/index.ts` — adicionar handler de queue:
```ts
import { handleWebhookBatch } from './queue/webhook-consumer'
import type { MetaStatus } from './api/webhook'

export default {
  fetch: app.fetch,
  async queue(batch, env) {
    // O body de cada mensagem já é um MetaStatus validado na rota — sem re-extração
    await handleWebhookBatch(batch.messages.map((m) => m.body), env)
    batch.ackAll()
  },
} satisfies ExportedHandler<Env, MetaStatus>
```

Em `src/api/router.ts` (webhook é público por assinatura — fora de `/api/*`):
```ts
import { webhookRoutes } from './webhook'
app.route('/webhook', webhookRoutes)
```

- [ ] **Step 3: Rodar testes e commitar**

Run: `npx vitest run tests/webhook.test.ts` — Expected: PASS.
```bash
git add -A && git commit -m "feat: webhook fail-closed com queue tipada e contadores idempotentes por update atômico"
```

---

### Task 13: Cron de reconciliação + dashboard stats

**Files:**
- Create: `src/cron/reconcile.ts`, `src/api/dashboard.ts`
- Modify: `src/index.ts` (handler `scheduled`), `src/api/router.ts`
- Test: `tests/reconcile.test.ts`

**Interfaces:**
- Consumes: repos (Task 10).
- Produces: `reconcileCampaignCounters(db): Promise<number>` (recalcula contadores de campanhas ativas via COUNT — corrige drift; retorna nº corrigidas); `GET /api/dashboard` → `{sent30d, deliveryRate, readRate, failed30d, recentCampaigns}`.

- [ ] **Step 1: Teste que falha**

`tests/reconcile.test.ts`:
```ts
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { reconcileCampaignCounters } from '../src/cron/reconcile'
import { campaignsDb } from '../src/db/campaigns'

// migrations aplicadas automaticamente via setupFiles (tests/apply-migrations.ts)

describe('reconcile', () => {
  it('corrige contador divergente a partir do COUNT real', async () => {
    const cdb = campaignsDb(env.DB)
    const c = await cdb.create({ name: 'R', template_name: 'promo_teste' })
    await cdb.setStatus(c.id, 'sending')
    await env.DB.prepare(
      `INSERT INTO campaign_contacts (campaign_id, contact_id, phone, status, message_id)
       VALUES (?1, 'x1', '+5511999990301', 'delivered', 'wamid.r1')`
    ).bind(c.id).run()
    // contador denormalizado errado de propósito (0)
    const fixed = await reconcileCampaignCounters(env.DB)
    expect(fixed).toBeGreaterThanOrEqual(1)
    expect((await cdb.get(c.id))!.delivered).toBe(1)
  })

  it('é idempotente — segunda chamada não corrige nada', async () => {
    const cdb = campaignsDb(env.DB)
    const c = await cdb.create({ name: 'R2', template_name: 'promo_teste' })
    await cdb.setStatus(c.id, 'sending')
    await env.DB.prepare(
      `INSERT INTO campaign_contacts (campaign_id, contact_id, phone, status, message_id)
       VALUES (?1, 'x2', '+5511999990302', 'delivered', 'wamid.r2')`
    ).bind(c.id).run()
    await reconcileCampaignCounters(env.DB) // primeira passada corrige o drift
    const second = await reconcileCampaignCounters(env.DB)
    expect(second).toBe(0) // nada mais divergente: reconcile é idempotente
  })

  it('não toca campanha concluída há mais de 1 dia', async () => {
    const cdb = campaignsDb(env.DB)
    const c = await cdb.create({ name: 'R3', template_name: 'promo_teste' })
    await env.DB.prepare(
      `INSERT INTO campaign_contacts (campaign_id, contact_id, phone, status, message_id)
       VALUES (?1, 'x3', '+5511999990303', 'delivered', 'wamid.r3')`
    ).bind(c.id).run()
    // concluída há 2 dias, com contador divergente de propósito — fora da janela do cron
    await env.DB.prepare(
      `UPDATE campaigns SET status = 'completed',
         completed_at = datetime('now', '-2 days'), delivered = 99 WHERE id = ?1`
    ).bind(c.id).run()
    await reconcileCampaignCounters(env.DB)
    expect((await cdb.get(c.id))!.delivered).toBe(99) // intocada: fora da janela de 1 dia
  })
})

describe('dashboard', () => {
  it('retorna agregados', async () => {
    const res = await SELF.fetch('https://x.com/api/dashboard', { headers: { 'x-api-key': 'dev-api-key' } })
    expect(res.status).toBe(200)
    const data = (await res.json()) as { sent30d: number; recentCampaigns: unknown[] }
    expect(typeof data.sent30d).toBe('number')
    expect(Array.isArray(data.recentCampaigns)).toBe(true)
  })
})
```

Run: `npx vitest run tests/reconcile.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar**

`src/cron/reconcile.ts`:
```ts
// Contadores denormalizados podem sofrer drift (webhooks perdidos, retries).
// A cada 15min o COUNT real vence.
export async function reconcileCampaignCounters(db: D1Database): Promise<number> {
  const active = (await db.prepare(
    `SELECT id FROM campaigns WHERE status IN ('sending','paused')
     OR completed_at > datetime('now', '-1 day')`
  ).all<{ id: string }>()).results
  let fixed = 0
  for (const { id } of active) {
    const r = await db.prepare(
      `UPDATE campaigns SET
         sent = (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status IN ('sent','delivered','read')),
         delivered = (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status IN ('delivered','read')),
         read = (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status = 'read'),
         failed = (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status = 'failed')
       WHERE id = ?1 AND (
         sent != (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status IN ('sent','delivered','read'))
         OR delivered != (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status IN ('delivered','read'))
         OR read != (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status = 'read')
         OR failed != (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?1 AND status = 'failed'))`
    ).bind(id).run()
    fixed += r.meta.changes ?? 0
  }
  return fixed
}
```

`src/api/dashboard.ts`:
```ts
import { Hono } from 'hono'

export const dashboardRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => {
    const agg = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(sent),0) as sent, COALESCE(SUM(delivered),0) as delivered,
              COALESCE(SUM(read),0) as read, COALESCE(SUM(failed),0) as failed
       FROM campaigns WHERE created_at > datetime('now', '-30 day')`
    ).first<{ sent: number; delivered: number; read: number; failed: number }>()
    const recent = (await c.env.DB.prepare(
      'SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 5').all()).results
    return c.json({
      sent30d: agg!.sent,
      deliveryRate: agg!.sent ? agg!.delivered / agg!.sent : 0,
      readRate: agg!.sent ? agg!.read / agg!.sent : 0,
      failed30d: agg!.failed,
      recentCampaigns: recent,
    })
  })
```

`src/index.ts` — handler scheduled:
```ts
import { reconcileCampaignCounters } from './cron/reconcile'

// dentro do export default:
  async scheduled(_event, env) {
    const fixed = await reconcileCampaignCounters(env.DB)
    if (fixed) console.log(`[cron] contadores reconciliados: ${fixed}`)
  },
```

Em `src/api/router.ts`:
```ts
import { dashboardRoutes } from './dashboard'
app.route('/api/dashboard', dashboardRoutes)
```

- [ ] **Step 3: Rodar testes e commitar**

Run: `npx vitest run` — Expected: suíte inteira PASS.
```bash
git add -A && git commit -m "feat: cron de reconciliação de contadores e dashboard stats"
```

---

### Task 14: SPA — tokens, API client, roteamento, login e shell

**Files:**
- Modify: `app/index.css`, `app/App.tsx`
- Create: `app/lib/api.ts`, `app/hooks/useAuth.ts`, `app/pages/Login.tsx`, `app/components/Shell.tsx`

**Interfaces:**
- Consumes: rotas de auth (Task 3).
- Produces: `api<T>(path, init?): Promise<T>` (fetch wrapper que lança `ApiError{status,message}` e redireciona para `/login` em 401); tokens Tailwind (`--color-primary-*`, superfícies zinc, cores de status — de `docs/smartzap-cf-design.md`); rotas `/login`, `/` (dashboard), `/campaigns`, `/campaigns/new`, `/campaigns/:id`, `/contacts`, `/templates`, `/settings` dentro de `<Shell>` (sidebar).

**Nota de design:** ao implementar CADA página das Tasks 14–16, consultar a tela correspondente no projeto Claude Design "SmartZap CF — Design System" (`templates/<tela>/<Tela>.dc.html`, via `DesignSync get_file`) — é a referência visual aprovada.

- [ ] **Step 1: Tokens e app shell**

`app/index.css`:
```css
@import 'tailwindcss';

@theme {
  --color-primary-50: #ecfdf5; --color-primary-100: #d1fae5; --color-primary-200: #a7f3d0;
  --color-primary-300: #6ee7b7; --color-primary-400: #34d399; --color-primary-500: #10b981;
  --color-primary-600: #059669; --color-primary-700: #047857; --color-primary-800: #065f46;
  --color-primary-900: #064e3b; --color-primary-950: #022c22;
  --color-status-sent: #60a5fa; --color-status-delivered: #34d399; --color-status-read: #10b981;
  --color-status-failed: #f87171; --color-status-pending: #a1a1aa; --color-status-skipped: #fbbf24;
  --radius-app: 0.625rem;
}

html { color-scheme: dark; }
body { @apply bg-zinc-950 text-zinc-50 antialiased; }
```

`app/lib/api.ts`:
```ts
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  if (res.status === 401 && location.pathname !== '/login') {
    location.href = '/login'
    throw new ApiError(401, 'não autenticado')
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`)
  return data as T
}
```

`app/hooks/useAuth.ts`:
```ts
import { useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useLogin() {
  return useMutation({
    mutationFn: (input: { password: string; turnstileToken?: string }) =>
      api<{ ok: true }>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => { location.href = '/' },
  })
}
```

`app/pages/Login.tsx` (referência visual: `templates/login/Login.dc.html`):
```tsx
import { useState } from 'react'
import { useLogin } from '../hooks/useAuth'

export default function Login() {
  const [password, setPassword] = useState('')
  const login = useLogin()
  return (
    <div className="flex min-h-screen items-center justify-center">
      <form
        className="w-80 space-y-4 rounded-[--radius-app] bg-zinc-900 p-8"
        onSubmit={(e) => { e.preventDefault(); login.mutate({ password }) }}
      >
        <h1 className="text-xl font-semibold text-primary-400">SmartZap</h1>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha mestra" autoFocus
          className="w-full rounded-[--radius-app] border border-zinc-700 bg-zinc-800 px-3 py-2 outline-none focus:border-primary-500"
        />
        {/* Turnstile: widget carregado quando TURNSTILE_SITE_KEY estiver configurada (produção) */}
        {login.error && <p className="text-sm text-status-failed">{login.error.message}</p>}
        <button
          type="submit" disabled={login.isPending}
          className="w-full rounded-[--radius-app] bg-primary-600 py-2 font-medium hover:bg-primary-500 disabled:opacity-50"
        >
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
```

`app/components/Shell.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet } from 'react-router'
import { LayoutDashboard, Megaphone, Users, FileText, Settings } from 'lucide-react'
import { api } from '../lib/api'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/campaigns', label: 'Campanhas', icon: Megaphone },
  { to: '/contacts', label: 'Contatos', icon: Users },
  { to: '/templates', label: 'Templates', icon: FileText },
  { to: '/settings', label: 'Configurações', icon: Settings },
]

export default function Shell() {
  // Guarda de rota: em navegação direta sem sessão, esta query recebe 401 e o
  // próprio api() redireciona para /login; throwOnError evita error boundary
  useQuery({
    queryKey: ['auth-status'],
    queryFn: () => api<{ authenticated: boolean }>('/api/auth/status'),
    throwOnError: false,
    retry: false,
  })
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-6 text-lg font-semibold text-primary-400">SmartZap</div>
        <nav className="space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-[--radius-app] px-3 py-2 text-sm ${
                  isActive ? 'bg-zinc-800 text-primary-400' : 'text-zinc-400 hover:bg-zinc-800/50'}`}>
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8"><Outlet /></main>
    </div>
  )
}
```

`app/App.tsx` (substituir):
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router'
import Shell from './components/Shell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Campaigns from './pages/Campaigns'
import CampaignNew from './pages/CampaignNew'
import CampaignDetail from './pages/CampaignDetail'
import Contacts from './pages/Contacts'
import Templates from './pages/Templates'
import SettingsPage from './pages/Settings'
import { useRealtime } from './hooks/useRealtime'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

function AuthedApp() {
  useRealtime() // WS de invalidação — Task 17
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/new" element={<CampaignNew />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="templates" element={<Templates />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<AuthedApp />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
```

Nota: as páginas importadas que ainda não existem entram nas Tasks 15–16; para compilar nesta task, criar cada uma como componente mínimo `export default function X() { return <div /> }` e o `useRealtime` como hook vazio `export function useRealtime() {}` — substituídos nas tasks seguintes.

- [ ] **Step 2: Verificar e commitar**

Run: `npm run dev` e abrir `http://localhost:5173/login` — Expected: tela de login renderiza; login com `dev` redireciona para `/`.
```bash
git add -A && git commit -m "feat: SPA com tokens, api client, login e shell de navegação"
```

---

### Task 15: SPA — Dashboard e Campanhas (lista, wizard, detalhe)

**Files:**
- Create/Modify: `app/pages/Dashboard.tsx`, `app/pages/Campaigns.tsx`, `app/pages/CampaignNew.tsx`, `app/pages/CampaignDetail.tsx`, `app/hooks/useCampaigns.ts`, `app/hooks/useDashboard.ts`, `app/components/StatusBadge.tsx`, `app/components/ProgressBar.tsx`

**Interfaces:**
- Consumes: `api` (Task 14); rotas de campanhas/dashboard (Tasks 10, 13).
- Produces: hooks `useDashboard()`, `useCampaigns()`, `useCampaign(id)`, `useCampaignContacts(id)`, `useEstimate(id)`, `useDispatch(id)`, mutations `useCancel/usePause/useResume`. Query keys canônicas: `['dashboard']`, `['campaigns']`, `['campaign', id]` — TÊM de casar com as keys que o RealtimeHub envia (Task 12).

- [ ] **Step 1: Hooks**

`app/hooks/useDashboard.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export type DashboardData = {
  sent30d: number; deliveryRate: number; readRate: number; failed30d: number
  recentCampaigns: CampaignRow[]
}
export type CampaignRow = {
  id: string; name: string; template_name: string; status: string
  total: number; sent: number; delivered: number; read: number; failed: number
  scheduled_at: string | null; created_at: string
}

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardData>('/api/dashboard') })
}
```

`app/hooks/useCampaigns.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { CampaignRow } from './useDashboard'

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api<{ items: CampaignRow[] }>('/api/campaigns'),
  })
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api<CampaignRow & { cost: { unit: number; estimated: number; real: number } }>(`/api/campaigns/${id}`),
    refetchInterval: (q) => (q.state.data?.status === 'sending' ? 5000 : false), // fallback do WS
  })
}

export function useCampaignContacts(id: string, page = 1) {
  return useQuery({
    queryKey: ['campaign', id, 'contacts', page],
    queryFn: () => api<{ items: Record<string, unknown>[] }>(`/api/campaigns/${id}/contacts?page=${page}`),
  })
}

export function useCampaignAction(id: string, action: 'dispatch' | 'cancel' | 'pause' | 'resume') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body?: { tags?: string[] }) =>
      api(`/api/campaigns/${id}/${action}`, { method: 'POST', body: JSON.stringify(body ?? {}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      qc.invalidateQueries({ queryKey: ['campaign', id] })
    },
  })
}

export function useCreateCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; template_name: string; scheduled_at?: string }) =>
      api<CampaignRow>('/api/campaigns', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useEstimate(id: string) {
  return useMutation({
    mutationFn: (body: { tags?: string[] }) =>
      api<{ recipients: number; skipped: number; unit: number; total: number }>(
        `/api/campaigns/${id}/estimate`, { method: 'POST', body: JSON.stringify(body) }),
  })
}
```

- [ ] **Step 2: Componentes compartilhados**

`app/components/StatusBadge.tsx`:
```tsx
const STYLES: Record<string, string> = {
  draft: 'bg-zinc-700 text-zinc-300', scheduled: 'bg-blue-950 text-status-sent',
  sending: 'bg-primary-950 text-primary-400 animate-pulse', completed: 'bg-primary-950 text-primary-400',
  paused: 'bg-amber-950 text-status-skipped', failed: 'bg-red-950 text-status-failed',
  cancelled: 'bg-zinc-800 text-zinc-500',
  pending: 'bg-zinc-700 text-zinc-300', skipped: 'bg-amber-950 text-status-skipped',
  sent: 'bg-blue-950 text-status-sent', delivered: 'bg-primary-950 text-status-delivered',
  read: 'bg-primary-900 text-status-read',
}
const LABELS: Record<string, string> = {
  draft: 'Rascunho', scheduled: 'Agendada', sending: 'Enviando', completed: 'Concluída',
  paused: 'Pausada', failed: 'Falhou', cancelled: 'Cancelada', pending: 'Pendente',
  skipped: 'Pulada', sent: 'Enviada', delivered: 'Entregue', read: 'Lida',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status] ?? STYLES.draft}`}>
      {LABELS[status] ?? status}
    </span>
  )
}
```

`app/components/ProgressBar.tsx`:
```tsx
export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className="h-full bg-primary-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}
```

- [ ] **Step 3: Páginas** (referência visual: `templates/dashboard/`, `templates/campanhas/`, `templates/nova-campanha/`, `templates/campanha-detalhe/` no Claude Design)

`app/pages/Dashboard.tsx`:
```tsx
import { Link } from 'react-router'
import { useDashboard } from '../hooks/useDashboard'
import { StatusBadge } from '../components/StatusBadge'
import { ProgressBar } from '../components/ProgressBar'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[--radius-app] bg-zinc-900 p-4">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const { data } = useDashboard()
  if (!data) return <div className="text-zinc-500">Carregando…</div>
  const pct = (n: number) => `${Math.round(n * 100)}%`
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Enviadas (30d)" value={String(data.sent30d)} />
        <Stat label="Taxa de entrega" value={pct(data.deliveryRate)} />
        <Stat label="Taxa de leitura" value={pct(data.readRate)} />
        <Stat label="Falhas (30d)" value={String(data.failed30d)} />
      </div>
      <section>
        <h2 className="mb-3 text-lg font-medium">Campanhas recentes</h2>
        {data.recentCampaigns.length === 0 ? (
          <div className="rounded-[--radius-app] bg-zinc-900 p-8 text-center text-zinc-400">
            Nenhuma campanha ainda. <Link className="text-primary-400" to="/contacts">Importe seus contatos</Link> para começar.
          </div>
        ) : (
          <div className="space-y-2">
            {data.recentCampaigns.map((c) => (
              <Link key={c.id} to={`/campaigns/${c.id}`}
                className="flex items-center gap-4 rounded-[--radius-app] bg-zinc-900 p-4 hover:bg-zinc-800">
                <span className="flex-1 font-medium">{c.name}</span>
                <StatusBadge status={c.status} />
                <div className="w-40"><ProgressBar value={c.sent} total={c.total} /></div>
                <span className="text-sm text-zinc-400">{c.sent}/{c.total}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
```

`app/pages/Campaigns.tsx`:
```tsx
import { Link } from 'react-router'
import { useCampaigns } from '../hooks/useCampaigns'
import { StatusBadge } from '../components/StatusBadge'

export default function Campaigns() {
  const { data } = useCampaigns()
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campanhas</h1>
        <Link to="/campaigns/new"
          className="rounded-[--radius-app] bg-primary-600 px-4 py-2 text-sm font-medium hover:bg-primary-500">
          Nova campanha
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-400">
          <tr className="border-b border-zinc-800">
            <th className="py-2">Nome</th><th>Template</th><th>Status</th>
            <th>Enviadas</th><th>Entregues</th><th>Lidas</th><th>Falhas</th>
          </tr>
        </thead>
        <tbody>
          {(data?.items ?? []).map((c) => (
            <tr key={c.id} className="border-b border-zinc-800/50 hover:bg-zinc-900">
              <td className="py-3"><Link className="font-medium hover:text-primary-400" to={`/campaigns/${c.id}`}>{c.name}</Link></td>
              <td className="text-zinc-400">{c.template_name}</td>
              <td><StatusBadge status={c.status} /></td>
              <td>{c.sent}</td><td>{c.delivered}</td><td>{c.read}</td>
              <td className={c.failed ? 'text-status-failed' : ''}>{c.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

`app/pages/CampaignNew.tsx` — wizard de 4 passos (template → audiência → revisão de variáveis → custo + disparo). O passo de custo chama `useEstimate` e mostra `R$ {total}` ANTES do botão de disparo:
```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useCreateCampaign, useEstimate, useCampaignAction } from '../hooks/useCampaigns'

type Template = { name: string; language: string; category: string; status: string }

export default function CampaignNew() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [templateName, setTemplateName] = useState<string | null>(null)
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<{ recipients: number; skipped: number; unit: number; total: number } | null>(null)

  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api<{ items: Template[] }>('/api/templates') })
  const create = useCreateCampaign()
  const estimateMut = useEstimate(campaignId ?? '')
  const dispatch = useCampaignAction(campaignId ?? '', 'dispatch')

  const approved = (templates.data?.items ?? []).filter((t) => t.status === 'APPROVED')

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Nova campanha — passo {step}/3</h1>

      {step === 1 && (
        <div className="space-y-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da campanha"
            className="w-full rounded-[--radius-app] border border-zinc-700 bg-zinc-900 px-3 py-2" />
          <div className="grid grid-cols-2 gap-3">
            {approved.map((t) => (
              <button key={t.name} onClick={() => setTemplateName(t.name)}
                className={`rounded-[--radius-app] border p-4 text-left ${
                  templateName === t.name ? 'border-primary-500 bg-primary-950/30' : 'border-zinc-800 bg-zinc-900'}`}>
                <div className="font-medium">{t.name}</div>
                <div className="mt-1 text-xs text-zinc-400">{t.category} · {t.language}</div>
              </button>
            ))}
          </div>
          <button disabled={!name || !templateName}
            onClick={async () => {
              const c = await create.mutateAsync({ name, template_name: templateName! })
              setCampaignId(c.id); setStep(2)
            }}
            className="rounded-[--radius-app] bg-primary-600 px-4 py-2 disabled:opacity-50">Continuar</button>
        </div>
      )}

      {step === 2 && campaignId && (
        <div className="space-y-4">
          <p className="text-zinc-400">Audiência: todos os contatos com opt-in (filtro por tags disponível na API).</p>
          <button onClick={async () => { setEstimate(await estimateMut.mutateAsync({})); setStep(3) }}
            className="rounded-[--radius-app] bg-primary-600 px-4 py-2">Calcular audiência e custo</button>
        </div>
      )}

      {step === 3 && estimate && campaignId && (
        <div className="space-y-4 rounded-[--radius-app] bg-zinc-900 p-6">
          <div className="flex justify-between"><span className="text-zinc-400">Destinatários</span><b>{estimate.recipients}</b></div>
          <div className="flex justify-between"><span className="text-zinc-400">Pulados (opt-out/supressão)</span><b>{estimate.skipped}</b></div>
          <div className="flex justify-between border-t border-zinc-800 pt-4 text-lg">
            <span>Custo estimado Meta</span>
            <b className="text-primary-400">
              {estimate.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </b>
          </div>
          <p className="text-xs text-zinc-500">R$ {estimate.unit} por mensagem entregue (tarifa oficial Meta, categoria do template).</p>
          <button onClick={async () => { await dispatch.mutateAsync({}); navigate(`/campaigns/${campaignId}`) }}
            className="w-full rounded-[--radius-app] bg-primary-600 py-2 font-medium hover:bg-primary-500">
            Disparar agora
          </button>
        </div>
      )}
    </div>
  )
}
```

`app/pages/CampaignDetail.tsx`:
```tsx
import { useParams } from 'react-router'
import { useCampaign, useCampaignContacts, useCampaignAction } from '../hooks/useCampaigns'
import { StatusBadge } from '../components/StatusBadge'
import { ProgressBar } from '../components/ProgressBar'

export default function CampaignDetail() {
  const { id = '' } = useParams()
  const { data: c } = useCampaign(id)
  const { data: contacts } = useCampaignContacts(id)
  const pause = useCampaignAction(id, 'pause')
  const resume = useCampaignAction(id, 'resume')
  const cancel = useCampaignAction(id, 'cancel')
  if (!c) return <div className="text-zinc-500">Carregando…</div>
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="flex-1 text-2xl font-semibold">{c.name}</h1>
        <StatusBadge status={c.status} />
        {c.status === 'sending' && <button onClick={() => pause.mutate(undefined)} className="rounded-[--radius-app] bg-zinc-800 px-3 py-1.5 text-sm">Pausar</button>}
        {c.status === 'paused' && <button onClick={() => resume.mutate(undefined)} className="rounded-[--radius-app] bg-zinc-800 px-3 py-1.5 text-sm">Retomar</button>}
        {['sending', 'paused', 'scheduled'].includes(c.status) && (
          <button onClick={() => confirm('Cancelar a campanha?') && cancel.mutate(undefined)}
            className="rounded-[--radius-app] bg-red-950 px-3 py-1.5 text-sm text-status-failed">Cancelar</button>
        )}
      </div>
      <div className="rounded-[--radius-app] bg-zinc-900 p-6">
        <ProgressBar value={c.sent} total={c.total} />
        <div className="mt-4 grid grid-cols-5 gap-4 text-center text-sm">
          <div><div className="text-xl font-semibold">{c.total}</div><div className="text-zinc-400">Total</div></div>
          <div><div className="text-xl font-semibold text-status-sent">{c.sent}</div><div className="text-zinc-400">Enviadas</div></div>
          <div><div className="text-xl font-semibold text-status-delivered">{c.delivered}</div><div className="text-zinc-400">Entregues</div></div>
          <div><div className="text-xl font-semibold text-status-read">{c.read}</div><div className="text-zinc-400">Lidas</div></div>
          <div><div className="text-xl font-semibold text-status-failed">{c.failed}</div><div className="text-zinc-400">Falhas</div></div>
        </div>
        <div className="mt-4 text-right text-sm text-zinc-400">
          Custo real: <b className="text-zinc-200">{c.cost.real.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-400">
          <tr className="border-b border-zinc-800"><th className="py-2">Contato</th><th>Telefone</th><th>Status</th><th>Erro</th></tr>
        </thead>
        <tbody>
          {(contacts?.items ?? []).map((r, i) => (
            <tr key={i} className="border-b border-zinc-800/50">
              <td className="py-2">{String(r.name ?? '—')}</td>
              <td className="text-zinc-400">{String(r.phone)}</td>
              <td><StatusBadge status={String(r.status)} /></td>
              <td className="text-xs text-zinc-500" title={String(r.error_detail ?? '')}>{String(r.error_code ?? '')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Verificar e commitar**

Run: `npm run dev` — criar campanha pelo wizard com a Graph API não configurada deve falhar com mensagem clara no dispatch (credenciais ausentes) e a UI exibir o erro. Expected: fluxo navegável de ponta a ponta.
```bash
git add -A && git commit -m "feat: dashboard e campanhas na SPA com custo estimado no wizard"
```

---

### Task 16: SPA — Contatos (import CSV com opt-in), Templates e Settings

**Files:**
- Create/Modify: `app/pages/Contacts.tsx`, `app/pages/Templates.tsx`, `app/pages/Settings.tsx`, `app/hooks/useContacts.ts`

**Interfaces:**
- Consumes: rotas das Tasks 5 e 7.
- Produces: página de contatos com modal de import (textarea/arquivo CSV + mapeamento + **checkbox de opt-in obrigatório** que habilita o botão); templates em grid com badge de aprovação e botão de sync; settings com formulário das 4 chaves editáveis (token mascarado).

- [ ] **Step 1: Hook + página de contatos** (referência: `templates/contatos/Contatos.dc.html`)

`app/hooks/useContacts.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export type Contact = { id: string; phone: string; name: string | null; status: string; created_at: string }

export function useContacts(q = '', page = 1) {
  return useQuery({
    queryKey: ['contacts', q, page],
    queryFn: () => api<{ items: Contact[]; total: number }>(`/api/contacts?q=${encodeURIComponent(q)}&page=${page}`),
  })
}

export function useImportContacts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { csv: string; mapping: { phone: string; name?: string }; optInConfirmed: boolean }) =>
      api<{ imported: number; duplicates: number; invalid: number }>(
        '/api/contacts/import', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}
```

`app/pages/Contacts.tsx`:
```tsx
import { useState } from 'react'
import { useContacts, useImportContacts } from '../hooks/useContacts'
import { StatusBadge } from '../components/StatusBadge'

export default function Contacts() {
  const [q, setQ] = useState('')
  const [showImport, setShowImport] = useState(false)
  const { data } = useContacts(q)
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contatos <span className="text-base text-zinc-500">({data?.total ?? 0})</span></h1>
        <button onClick={() => setShowImport(true)}
          className="rounded-[--radius-app] bg-primary-600 px-4 py-2 text-sm font-medium">Importar CSV</button>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou telefone…"
        className="w-72 rounded-[--radius-app] border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" />
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-400">
          <tr className="border-b border-zinc-800"><th className="py-2">Nome</th><th>Telefone</th><th>Status</th></tr>
        </thead>
        <tbody>
          {(data?.items ?? []).map((c) => (
            <tr key={c.id} className="border-b border-zinc-800/50">
              <td className="py-2">{c.name ?? '—'}</td>
              <td className="text-zinc-400">{c.phone}</td>
              <td><StatusBadge status={c.status === 'opt_in' ? 'delivered' : c.status === 'opt_out' ? 'failed' : 'pending'} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const [csv, setCsv] = useState('')
  const [phoneCol, setPhoneCol] = useState('telefone')
  const [nameCol, setNameCol] = useState('nome')
  const [optIn, setOptIn] = useState(false)
  const importMut = useImportContacts()
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-[32rem] space-y-4 rounded-[--radius-app] bg-zinc-900 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-medium">Importar contatos</h2>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6}
          placeholder={'telefone,nome\n11999990001,Ana'}
          className="w-full rounded-[--radius-app] border border-zinc-700 bg-zinc-800 p-3 font-mono text-xs" />
        <div className="flex gap-2">
          <input value={phoneCol} onChange={(e) => setPhoneCol(e.target.value)} placeholder="coluna do telefone"
            className="flex-1 rounded-[--radius-app] border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm" />
          <input value={nameCol} onChange={(e) => setNameCol(e.target.value)} placeholder="coluna do nome (opcional)"
            className="flex-1 rounded-[--radius-app] border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm" />
        </div>
        <label className="flex items-start gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-0.5" />
          Confirmo que esta lista possui consentimento documentado dos titulares (LGPD art. 7º) e
          atende à política anti-spam da Meta.
        </label>
        {importMut.data && (
          <p className="text-sm text-primary-400">
            {importMut.data.imported} importados · {importMut.data.duplicates} duplicados · {importMut.data.invalid} inválidos
          </p>
        )}
        {importMut.error && <p className="text-sm text-status-failed">{importMut.error.message}</p>}
        <button disabled={!optIn || !csv || importMut.isPending}
          onClick={() => importMut.mutate({ csv, mapping: { phone: phoneCol, name: nameCol || undefined }, optInConfirmed: optIn })}
          className="w-full rounded-[--radius-app] bg-primary-600 py-2 font-medium disabled:opacity-40">
          Importar
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Templates e Settings** (referências: `templates/templates-meta/`, `templates/settings/`)

`app/pages/Templates.tsx`:
```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

type Template = { name: string; language: string; category: string; status: string }

export default function Templates() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['templates'], queryFn: () => api<{ items: Template[] }>('/api/templates') })
  const sync = useMutation({
    mutationFn: () => api<{ synced: number }>('/api/templates/sync', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
  const badge = (s: string) =>
    s === 'APPROVED' ? 'bg-primary-950 text-primary-400' : s === 'REJECTED' ? 'bg-red-950 text-status-failed' : 'bg-amber-950 text-status-skipped'
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <button onClick={() => sync.mutate()} disabled={sync.isPending}
          className="rounded-[--radius-app] bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50">
          {sync.isPending ? 'Sincronizando…' : 'Sincronizar com a Meta'}
        </button>
      </div>
      {sync.error && <p className="text-sm text-status-failed">{sync.error.message}</p>}
      <div className="grid grid-cols-3 gap-4">
        {(data?.items ?? []).map((t) => (
          <div key={t.name} className="rounded-[--radius-app] bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{t.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${badge(t.status)}`}>{t.status}</span>
            </div>
            <div className="mt-2 text-xs text-zinc-400">{t.category} · {t.language}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

`app/pages/Settings.tsx`:
```tsx
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

const FIELDS: { key: string; label: string; sensitive?: boolean }[] = [
  { key: 'whatsapp_token', label: 'Token de acesso Meta', sensitive: true },
  { key: 'whatsapp_phone_id', label: 'Phone Number ID' },
  { key: 'whatsapp_waba_id', label: 'WABA ID' },
  { key: 'throttle_mps', label: 'Mensagens por segundo (throttle)' },
]

export default function SettingsPage() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api<Record<string, string | null>>('/api/settings') })
  const [form, setForm] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: () => api('/api/settings', { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: () => { setForm({}); qc.invalidateQueries({ queryKey: ['settings'] }) },
  })
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label className="mb-1 block text-sm text-zinc-400">{f.label}</label>
          <input
            type={f.sensitive ? 'password' : 'text'}
            placeholder={data?.[f.key] ?? ''}
            value={form[f.key] ?? ''}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            className="w-full rounded-[--radius-app] border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          />
        </div>
      ))}
      {save.error && <p className="text-sm text-status-failed">{save.error.message}</p>}
      <button onClick={() => save.mutate()} disabled={!Object.keys(form).length || save.isPending}
        className="rounded-[--radius-app] bg-primary-600 px-4 py-2 text-sm font-medium disabled:opacity-40">
        Salvar
      </button>
      <p className="text-xs text-zinc-500">
        Webhook da Meta: configure a URL <code className="text-zinc-300">https://SEU-DOMINIO/webhook</code> com
        o verify token igual ao META_APP_SECRET.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Verificar e commitar**

Run: `npm run dev` — importar CSV pelo modal (botão só habilita com o checkbox de opt-in), sincronizar templates com credenciais dev deve exibir erro claro. Expected: fluxos navegáveis.
```bash
git add -A && git commit -m "feat: contatos com import opt-in, templates e settings na SPA"
```

---

### Task 17: SPA — hook de realtime (WS + invalidação TanStack Query)

**Files:**
- Modify: `app/hooks/useRealtime.ts` (substituir stub da Task 14)

**Interfaces:**
- Consumes: `GET /api/realtime` (Task 9); eventos `RealtimeEvent` (invalidate/progress).
- Produces: `useRealtime()` — conecta WS autenticado, invalida query keys recebidas, atualiza cache de `['campaign', id]` com contadores de `progress`, reconecta com backoff (1s→30s), re-invalida tudo ao reconectar e envia `ping` a cada 30s (keepalive).

- [ ] **Step 1: Implementar**

`app/hooks/useRealtime.ts`:
```ts
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

type RealtimeEvent =
  | { type: 'invalidate'; keys: string[][] }
  | { type: 'progress'; campaignId: string; counters: { sent: number; delivered: number; read: number; failed: number; total: number } }

export function useRealtime() {
  const qc = useQueryClient()
  const backoff = useRef(1000)

  useEffect(() => {
    let ws: WebSocket | null = null
    let closed = false
    let timer: ReturnType<typeof setTimeout>
    let pingTimer: ReturnType<typeof setInterval> | undefined

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/api/realtime`)
      ws.onopen = () => {
        if (backoff.current > 1000) qc.invalidateQueries() // reconectou: estado converge
        backoff.current = 1000
        // keepalive: NATs/proxies derrubam WS ocioso; o servidor responde 'pong'
        // via setWebSocketAutoResponse — sem acordar o DO da hibernação
        pingTimer = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), 30_000)
      }
      ws.onmessage = (e) => {
        const event = JSON.parse(e.data as string) as RealtimeEvent
        if (event.type === 'invalidate') {
          for (const key of event.keys) qc.invalidateQueries({ queryKey: key })
        } else if (event.type === 'progress') {
          qc.setQueryData(['campaign', event.campaignId], (old: object | undefined) =>
            old ? { ...old, ...event.counters } : old)
          qc.invalidateQueries({ queryKey: ['campaigns'] })
        }
      }
      ws.onclose = () => {
        clearInterval(pingTimer)
        if (closed) return
        timer = setTimeout(connect, backoff.current)
        backoff.current = Math.min(backoff.current * 2, 30_000)
      }
    }
    connect()
    return () => { closed = true; clearTimeout(timer); clearInterval(pingTimer); ws?.close() }
  }, [qc])
}
```

- [ ] **Step 2: Verificar e commitar**

Run: `npm run dev` — abrir o dashboard, e em outro terminal: `curl -X POST http://localhost:5173/api/contacts -H 'x-api-key: dev-api-key' -H 'content-type: application/json' -d '{"phone":"+5511999990999"}'`. Expected: sem erros de WS no console do navegador (a invalidação dispara quando um evento chega).
```bash
git add -A && git commit -m "feat: realtime na SPA com reconexão e invalidação de queries"
```

---

### Task 18: E2E smoke + runbook de deploy

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`, `README.md`

**Interfaces:**
- Consumes: tudo acima.
- Produces: smoke E2E (login → dashboard → contatos → import) e README com o runbook completo de provisionamento/deploy.

- [ ] **Step 1: Playwright**

```bash
npm i -D @playwright/test && npx playwright install chromium
```

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173/api/health', reuseExistingServer: true },
})
```

`e2e/smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test'

test('login → dashboard → import de contato', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('Senha mestra').fill('dev')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await page.getByRole('link', { name: 'Contatos' }).click()
  await page.getByRole('button', { name: 'Importar CSV' }).click()
  await page.getByPlaceholder(/telefone,nome/).fill('telefone,nome\n11999990501,E2E')
  const importBtn = page.getByRole('button', { name: 'Importar' })
  await expect(importBtn).toBeDisabled() // sem opt-in não importa
  await page.getByRole('checkbox').check()
  await importBtn.click()
  await expect(page.getByText(/1 importados/)).toBeVisible()
})

test('guarda de rota: sem sessão, /campaigns redireciona para /login', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/campaigns')
  // o Shell (Task 14) consulta /api/auth/status ao montar; o 401 dispara o
  // redirect para /login feito pelo próprio api client
  await expect(page).toHaveURL(/\/login/)
})
```

Run: `npm run e2e` — Expected: PASS.

- [ ] **Step 2: README com runbook de deploy**

`README.md` (seções mínimas):
```markdown
# SmartZap CF

Automação de campanhas WhatsApp (API oficial Meta) — 100% Cloudflare Workers.

## Deploy (produção)

1. `wrangler d1 create smartzap` → copiar `database_id` para wrangler.jsonc
2. `wrangler kv namespace create CACHE` → copiar `id`
3. `wrangler r2 bucket create smartzap-media`
4. `wrangler queues create meta-webhooks`
5. `wrangler queues create meta-webhooks-dlq`   # dead-letter queue do consumer
6. Secrets:
   wrangler secret put MASTER_PASSWORD
   wrangler secret put META_APP_SECRET      # app secret do app Meta (HMAC do webhook)
   wrangler secret put META_VERIFY_TOKEN    # token de verificação do webhook — valor
                                            # DIFERENTE do META_APP_SECRET; é ele que
                                            # se digita no painel da Meta
   wrangler secret put WHATSAPP_TOKEN       # fallback; o oficial vive em Settings
   wrangler secret put TURNSTILE_SECRET     # widget criado no dashboard Cloudflare
   wrangler secret put SMARTZAP_API_KEY
7. `npm run deploy`
8. `wrangler d1 migrations apply smartzap --remote`
9. Meta App Dashboard → WhatsApp → Webhook: URL `https://<worker>/webhook`,
   verify token = META_VERIFY_TOKEN, campos: `messages`
10. Login no dashboard → Settings → preencher token/phone_id/waba_id → Sincronizar templates

## Checklist pós-deploy

- [ ] `TURNSTILE_SECRET` setado — em produção o login é fail-closed sem ele (conferir
      com `wrangler secret list`)
- [ ] `GET https://<worker>/api/health` responde JSON (confirma `run_worker_first` ok)
- [ ] Webhook configurado na Meta com o `META_VERIFY_TOKEN` (GET de verificação passa)

## Dev

cp .dev.vars.example .dev.vars && npm install && npm run dev
npm test        # worker (vitest pool workers)
npm run e2e     # smoke Playwright
```

- [ ] **Step 3: Commit final**

```bash
git add -A && git commit -m "feat: e2e smoke e runbook de deploy"
```

---

## Self-review do plano (executado na escrita)

1. **Cobertura da spec:** login/sessões/Turnstile/rate-limit (T3), schema §6 (T2), contatos+CSV+opt-in (T5, T16), templates+credenciais (T7), fluxo de envio §7.1 (T10, T11), webhook §7.2 (T12), realtime §7.3 (T9, T17), contadores+reconcile (T13), custo pré-dispatch (T4, T10, T15), dashboard (T13, T15), settings (T7, T16), deploy (T18). Mídia/R2: binding criado (T1) mas SEM task de upload — MVP usa templates sem header de mídia; upload de mídia entra em onda futura (decisão de escopo, ver "Fora do MVP" na spec).
2. **Placeholders:** nenhum "TBD/TODO"; os únicos stubs são explícitos e temporários dentro da própria sequência (T1 cria stubs que T8/T9/T11 substituem; T14 cria páginas mínimas que T15/T16/T17 substituem).
3. **Consistência de tipos:** `RealtimeEvent` (T9) = consumido em T17; query keys `['campaigns']/['campaign',id]/['dashboard']` (T12/T13) = usadas em T15; `Credentials` (T7) = consumida em T11; `claimPending/markResult/updateByMessageId` (T10) = usadas em T11/T12.

