# Design — smartzap-cf (rebuild 100% Cloudflare)

**Data:** 2026-07-05
**Status:** Aprovado (brainstorm Fase 1 da /planejar)
**Origem:** análise adversarial de viabilidade conduzida com `cloudflare-atlas` nesta mesma data — claims verificadas contra docs vivas + fact-check adversarial independente.

## 1. O que é

Rebuild greenfield do SmartZap (SaaS single-tenant de automação de marketing via WhatsApp) 100% na Cloudflare, em repositório novo (`smartzap-cf`). O repo atual (Next.js + Supabase + Upstash + Vercel) segue rodando até o cutover e serve como referência de lógica de negócio.

## 2. Decisões de escopo

| Decisão | Valor |
|---|---|
| MVP | Loop de marketing completo: campanhas + contatos (com import CSV) + templates + webhook de status + dashboard + settings |
| Morre permanentemente | Installer/wizard de instalação; builder de workflows no-code (lib/builder, ~110 componentes + codegen + executor) |
| Congelado (decisão futura, fora do MVP) | WhatsApp Flows nativos, lead forms públicos, integração Google Calendar |
| Ondas pós-MVP (planejadas) | Inbox/atendimento com agente de IA (Agents SDK + AI Search + Agent Memory) |
| Dados de produção | Começar do zero — sem migração Supabase→D1; recadastrar credenciais e reimportar contatos por CSV |
| Repositório | Novo: `smartzap-cf` |
| Topologia | Worker único (Abordagem A): SPA assets + Hono API + DOs + Workflow + Queue consumer num só deploy |

## 3. Stack (decidida via cloudflare-atlas, verificada ao vivo)

| Camada | Escolha | Substitui |
|---|---|---|
| Frontend | SPA React 19 + Vite, servida por Static Assets (grátis/ilimitado) | Next.js 16 na Vercel |
| API | Hono no Worker | 212 API routes Next.js |
| Banco | D1 (SQLite, schema redesenhado) | Supabase Postgres |
| Pipeline de envio | Cloudflare Workflows (`step.do`/`step.sleep`) | Upstash Workflow (`context.run`) |
| Webhook processing | Queues (batch até 50) | Processamento inline no route handler |
| Cache/sessões | KV (TTL nativo) | Upstash Redis + tokens em settings |
| Dedup atômico + throttle | Durable Objects (PhoneThrottle por número; WebhookDedupe para event_id) | Redis SETNX |
| Realtime | Durable Object RealtimeHub (WebSocket Hibernation) | Supabase Realtime (postgres_changes + broadcast) |
| Mídia | R2 (público + presigned) | Supabase Storage (`wa-template-media`) |
| IA — geração | Gemini via AI Gateway (observabilidade/cache/retry) | Gemini direto + Helicone |
| IA — RAG (pós-MVP) | AI Search (open beta — validar limites antes da onda do inbox) | pgvector + embeddings + reranking manuais |
| Agendamento | Workflow `step.sleep` (até 1 ano) + flag de cancelamento em D1 | QStash publish com delay + messages.delete |
| Cron | Cron Triggers (`scheduled()`) — reconcile de contadores | (inexistente hoje) |
| Anti-abuso | Turnstile no login + rate limiting binding (10/60s, por datacenter) | (inexistente hoje) |
| Web Push | Lib `web-push` com `nodejs_compat` (guia oficial CF) | Idem hoje |

Fatos-limite verificados que sustentam as escolhas: Workflows com 10k steps default/25k máx, sleep 365d, payload 1 MiB; Queues delay máx 24h (por isso agendamento fica no Workflow); Workers Paid CPU até 5 min, 10k subrequests default; DO SQLite 10 GB/objeto; D1 10 GB/database.

## 4. Arquitetura (topologia A — Worker único)

```
                    ┌─────────────────────────────────────────────┐
                    │  Worker: smartzap-cf (único deploy)         │
Browser ──HTTPS──▶  │  ┌─────────────┐  ┌──────────────────────┐  │
  │                 │  │ Static      │  │ Hono API (/api/*)    │  │
  │◀──WebSocket───▶ │  │ Assets(SPA) │  │ auth middleware      │  │
                    │  └─────────────┘  └──────┬───────────────┘  │
Meta ──webhook───▶  │                          │                  │
                    │  ┌───────────────────────┼───────────────┐  │
                    │  │ Durable Objects       │               │  │
                    │  │  RealtimeHub (WS hib.)│ PhoneThrottle │  │
                    │  └───────────────────────┼───────────────┘  │
                    │  ┌──────────────┐  ┌─────▼──────────────┐   │
                    │  │ Queue        │  │ CampaignSendWF     │   │
                    │  │ consumer     │  │ (Workflows)        │   │
                    │  │ (webhooks)   │  └────────────────────┘   │
                    │  └──────────────┘  cron: scheduled()        │
                    └──────┬──────────────────┬───────────────────┘
                    D1 (dados) · KV (cache/sessões) · R2 (mídia)
                    Externos: Meta Graph API · Gemini (via AI Gateway)
```

Racional da topologia única: single-tenant, um desenvolvedor, superfície operacional mínima. Divisão futura possível via service bindings sem mudança de URL.

## 5. Estrutura do repositório

```
smartzap-cf/
  wrangler.jsonc
  src/                        # backend (o Worker)
    index.ts                  # entry: fetch (Hono+assets), queue, scheduled
    api/                      # rotas Hono por domínio (campaigns, contacts,
                              #   templates, webhook, dashboard, settings, auth)
    domain/                   # lógica de negócio pura (porta de lib/business/)
    db/                       # repositórios D1 por domínio + schema/migrations
    do/                       # RealtimeHub.ts, PhoneThrottle.ts, WebhookDedupe.ts
    workflows/                # CampaignSendWorkflow.ts
    queue/                    # consumer de webhooks Meta
    whatsapp/                 # cliente Graph API ÚNICO
  app/                        # frontend (SPA Vite + React 19)
    src/{pages,hooks,services,components}
  tests/                      # Vitest + @cloudflare/vitest-pool-workers
```

Lições do repo atual embutidas: (1) `domain/` isola lógica pura testável — sem route handlers de 2.600 linhas; (2) cliente WhatsApp único — hoje há 3 blocos `fetch` duplicados para a Graph API; (3) monorepo com build Vite separado, Worker serve o `dist/`.

## 6. Modelo de dados (D1)

```sql
contacts            id, phone (UNIQUE, E.164), name, status ('opt_in'|'opt_out'|'unknown'),
                    custom_fields (TEXT/JSON), created_at, updated_at
tags                id, name (UNIQUE)
contact_tags        contact_id, tag_id  (PK composta)
custom_field_defs   id, key, label, type
templates           name (PK), language, category, status, components (TEXT/JSON), synced_at
campaigns           id, name, template_name, status ('draft'|'scheduled'|'sending'|
                    'completed'|'paused'|'failed'|'cancelled'), scheduled_at,
                    workflow_id, total, sent, delivered, read, failed,
                    created_at, completed_at
campaign_contacts   campaign_id, contact_id, phone, status ('pending'|'skipped'|'sending'|
                    'sent'|'delivered'|'read'|'failed'), message_id, error_code, error_detail,
                    updated_at  (PK: campaign_id+contact_id; índices: message_id, status)
suppressions        phone, reason, expires_at
settings            key (PK), value (TEXT/JSON), updated_at
status_events       id, message_id, status, raw (TEXT/JSON), received_at
```

Decisões:
1. **Sessões em KV, não D1** — TTL nativo expira de graça.
2. **Contadores denormalizados + reconcile** — increments agregados por batch do consumer (1 UPDATE por campanha por batch); cron de 15 min recalcula via COUNT sobre `campaign_contacts` para cobrir drift.
3. **`message_id` indexado** — caminho quente do webhook de status.
4. **JSON como TEXT** — funções `json_*` do SQLite.
5. **Sem tabelas especulativas** de inbox/flows/builder (YAGNI) — ondas futuras trazem suas migrations.
6. **`status_events` grava mensagens inbound desde o MVP** — preserva histórico para o futuro inbox sem construí-lo agora.
7. **Dedup de webhook** não é tabela — é DO.

## 7. Fluxos principais

### 7.1 Envio de campanha (Workflow)

```
POST /api/campaigns/:id/dispatch (Hono)
 ├─ valida template + precheck de variáveis (domain/)
 ├─ resolve audiência, filtra opt-out + suppressions
 ├─ INSERT campaign_contacts (pending/skipped) em batch
 └─ env.CAMPAIGN_WF.create({ campaignId, scheduledAt? })  → 202

CampaignSendWorkflow:
  step.sleep até scheduledAt (se agendada)
  step.do('check-cancelled')     → flag em D1; cancelada? encerra
  step.do('load-config')         → credenciais (KV cache→D1) + throttle
  para cada lote de N contatos:
    step.do(`send-batch-${i}`)   → DO PhoneThrottle (rate adaptativo)
                                 → POST graph.facebook.com por contato
                                 → UPDATE campaign_contacts + message_id
                                 → RealtimeHub.broadcast(progresso)
  step.do('complete')            → status final + contadores + broadcast
```

Erros: cada `step.do` tem retry automático com backoff. Erro crítico Meta (131042 pagamento, auth) falha a campanha + alerta; erro por contato (131056 pair limit) marca só o contato e segue. Pausar = `pause()` na instância via `workflow_id`; cancelar = flag em D1 (checada por batch) + `terminate()`.

### 7.2 Webhook de status (Queue)

```
POST /webhook (Hono) — HMAC fail-closed (sem META_APP_SECRET = 401)
 └─ WEBHOOK_QUEUE.send(payload)  → 200 em <50ms

Consumer (batch até 50):
 ├─ dedup por event_id no DO WebhookDedupe (atômico, TTL de retenção curto)
 ├─ statuses → UPDATE campaign_contacts por message_id + agrega contadores
 ├─ erros críticos → account_alert + broadcast
 └─ RealtimeHub.broadcast(invalidate: ['campaigns', id])
```

### 7.3 Realtime (RealtimeHub DO)

Instância global única. SPA conecta via WebSocket (`/api/realtime`, autenticado por sessão). Hibernation API zera custo em idle. Eventos: `invalidate` (SPA invalida query keys do TanStack Query) e `progress` (progresso de campanha). Reconexão com backoff; ao reconectar, invalida tudo (estado converge).

## 8. Auth, segurança, erros e testes

### Auth e segurança
- Login: `MASTER_PASSWORD` (wrangler secret) + Turnstile + rate limiting binding (5/60s por IP).
- Sessão: token aleatório em KV com TTL 7d; cookie httpOnly/secure/sameSite=lax.
- Middleware Hono único em `/api/*`: valida sessão no KV (não só presença de cookie) OU API key com `timingSafeEqual`. Allowlist pública mínima: `/webhook`, `/api/auth/login`, `/api/health`.
- Webhook fail-closed. Secrets só via `wrangler secret`.
- Corrige os 3 buracos do sistema atual: cookie não-validado no proxy, comparação `===` de API keys, lista pública inchada.

### Erros e observabilidade
- Mapa de erros Meta portado de `lib/whatsapp-errors.ts` (vira módulo de `whatsapp/`).
- `observability.enabled` + Workers Logs; instâncias de Workflow visíveis no dashboard (status, step, retries). `traceId` próprio permanece só em `status_events`.
- Gemini via AI Gateway: log, custo, cache, retry sem código.

### Testes
- Vitest + `@cloudflare/vitest-pool-workers` (workerd real; D1/KV/DO/Queues via miniflare).
- Fluxos críticos nascem testados: Workflow de campanha (mock só da Graph API), consumer de webhook (fixtures de payloads reais da Meta), middleware de auth.
- `domain/` porta os testes existentes de `lib/business/` (já puros).
- Playwright: smoke E2E (login → criar campanha → dispatch mockado).

## 9. Custo estimado

~US$ 5/mês (Workers Paid) na escala atual. Externos remanescentes: Gemini API e Meta WhatsApp API (o produto em si). Deixa de pagar: Vercel, Upstash, Supabase.

## 10. Fora deste design

- Redesign visual das telas: Fase 4 da /planejar (Claude Design), documento próprio.
- Plano de implementação passo a passo: Fase 5 (`superpowers:writing-plans`).
- Detalhes da onda inbox/IA (Agents SDK, AI Search, Agent Memory): design próprio quando a onda chegar; validar disponibilidade/limites do AI Search e Agent Memory nesse momento.
