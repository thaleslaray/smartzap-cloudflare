# Auditoria do plano — smartzap-cf

**Fase 6 da /planejar** · 2026-07-05 · Plano auditado: `docs/superpowers/plans/2026-07-05-smartzap-cf.md`
5 auditores paralelos: Workers best practices, Durable Objects, Segurança, Testes, Fact-check de APIs Cloudflare (docs vivas, 42 verificações).
Conflitos entre auditores resolvidos pela evidência de doc viva (regra: doc viva vence).

## P0 — corrigir antes de qualquer execução (bloqueiam build ou perdem dados)

| ID | Achado | Seção | Correção |
|---|---|---|---|
| P0-1 | **Dedup marca IDs antes de persistir** → retry da Queue perde eventos de status para sempre (Queues são at-least-once). Convergência de 2 auditores. Agravante: o DO é redundante — a idempotência real deve vir do D1 | Task 12 | **Eliminar o `WebhookDedupe` DO por completo.** Tornar `updateByMessageId` atômico: um único `UPDATE ... WHERE message_id=? AND rank(status) < ?` usando `meta.changes` como "aplicou" (o read-then-write atual tem corrida). `status_events` tolera duplicata (é log). Elimina também P0-2 e o gargalo singleton |
| P0-2 | **`storage.get/put/delete` do DO limitados a 128 chaves** — batch de 50 payloads × N statuses estoura → exceção em loop; `alarm()` lista tudo sem paginação | Task 8 | Resolvido pela remoção do DO (P0-1). Se algum dedup DO voltar no futuro: usar `ctx.storage.sql` (SQLite, sem limite de 128) |
| P0-3 | **Payload da Meta pode estourar 128 KB da Queue** — `send(JSON.parse(raw))` com webhook agregado grande → exceção → 500 → Meta desabilita a subscription no pico | Task 12 | Extrair os `statuses` na rota e enfileirar em `sendBatch` (fatias de 100, cada msg pequena e tipada `Queue<MetaStatus>`) |
| P0-4 | **Retry de `send-batch-{i}` deixa contatos órfãos em `sending`** — claimPending só pega `pending`; campanha "completa" com rows fantasma. Convergência de 2 auditores | Tasks 10/11 | No início de cada `sendBatch`: rows `sending` COM `message_id` → `sent`; SEM `message_id` → `pending` (reenvio raro documentado como at-least-once) |
| P0-5 | **`unsafe.bindings` ratelimit é sintaxe antiga** — doc atual usa array top-level `ratelimits` (wrangler ≥ 4.36) | Task 1 | `"ratelimits": [{ "name": "LOGIN_LIMITER", "namespace_id": "1001", "simple": { "limit": 5, "period": 60 } }]`; `Env` usa tipo oficial `RateLimit` |
| P0-6 | **`defineWorkersConfig` foi removido** no vitest-pool-workers v0.13 (Vitest 4) — o que o npm instala hoje | Task 1 | Plugin `cloudflareTest()` de `@cloudflare/vitest-pool-workers` dentro de `defineConfig` do vitest |
| P0-7 | **`tests/helpers.ts` com `split(';')` + `db.exec` quebra** (exec fatia por `\n`; split quebra com `;` em strings). Convergência de 2 auditores | Task 2 | `readD1Migrations` no config + `applyD1Migrations` em `setupFiles` (`tests/apply-migrations.ts`); apagar `helpers.ts` |
| P0-8 | **Teste de WebSocket+DO não roda com isolamento por arquivo** (known issue oficial) | Task 9 | `"test": "vitest run --max-workers=1 --no-isolate"` (ou script separado para realtime.test.ts) |
| P0-9 | **`CampaignSendWorkflow` sem teste real** — `sendBatch` é privado não-testável; `nextBatchPlan` é código morto testado no lugar; zero cobertura de erro crítico/opt-out/cancelamento | Task 11 | Extrair `loadSendConfig(env, id)` e `sendCampaignBatch(env, id, creds, rate)` como funções exportadas; `run()` vira coordenador fino; testes com D1/DO reais e fetch mockado |
| P0-10 | **GET /webhook compara `hub.verify_token` com `===`** (não timing-safe) num endpoint público sem rate limit — o secret comparado é a própria chave HMAC | Task 12 | `timingSafeEqualStr` + secret dedicado `META_VERIFY_TOKEN` (ver P1-1) |
| P0-11 | **Turnstile fail-open silencioso** — sem `TURNSTILE_SECRET` em produção, anti-bot desliga sem aviso | Task 3 | Var `ENVIRONMENT` no wrangler.jsonc; em `production` sem secret → fail-closed com `console.error`; dev → bypass explícito |
| P0-12 | **`POST /api/contacts` hardcoda `opt_in` sem confirmação** — bypassa o controle LGPD que o import impõe | Task 5 | Exigir `optInConfirmed: true` no cadastro único também |

## P1 — corrigir no plano (arquitetura/robustez)

| ID | Achado | Seção | Correção |
|---|---|---|---|
| P1-1 | `META_APP_SECRET` reutilizado como verify_token digitado no painel Meta (canal de baixo sigilo) | Tasks 12/18 | Secret dedicado `META_VERIFY_TOKEN` (runbook + Env) |
| P1-2 | Consentimento opt-in não persistido — boolean efêmero não é evidência (LGPD art. 8º, ônus do controlador) | Tasks 2/5 | Tabela `consent_events` (batch id, texto da declaração, contagem, timestamp) gravada no import e no cadastro |
| P1-3 | `timingSafeEqualStr` com early-return por comprimento vaza tamanho do secret; cast `as unknown` desnecessário | Task 3 | Padrão canônico: SHA-256 de ambos os lados + `crypto.subtle.timingSafeEqual` (vira async; tipos oficiais já cobrem) |
| P1-4 | `throttle_mps` aceita string livre → `NaN` desativa o throttle | Tasks 7/11 | `z.coerce.number().int().positive().max(80)` no PUT /settings + default seguro no workflow |
| P1-5 | `Env` escrito à mão + casts `as unknown as DurableObjectStub & {...}` em 3 pontos | Tasks 1/9/11 | `DurableObjectNamespace<import('./do/X').X>` tipado (e `wrangler types` como fonte no tsconfig); remover todos os casts; usar `getByName()` |
| P1-6 | Loop de batches sem teto vs limite de steps do Workflow (1.024 Free / 10k Paid) | Task 11 | Guarda com `nextBatchPlan` (deixa de ser código morto): cota máxima de iterações + erro claro se exceder; documentar teto de campanha |
| P1-7 | `contactsDb.bulkInsert` sem chunking (Task 10 chunka, Task 5 não) — CSV 50k = batch de 50k statements | Task 5 | Mesmo chunking de 50; teto de tamanho de CSV por request (413 acima de ~20k linhas) |
| P1-8 | Consumer sem `max_retries`/`dead_letter_queue` — mensagens descartadas silenciosamente após 3 falhas | Tasks 1/18 | `max_retries: 5` + `dead_letter_queue: meta-webhooks-dlq` (+ criar a fila no runbook) |
| P1-9 | `PhoneThrottle.nextSlot` só em memória — eviction no meio da campanha causa burst acima da taxa | Task 8 | `blockConcurrencyWhile` no construtor + `void ctx.storage.put('nextSlot', ...)` (coalescido; output gate garante) |
| P1-10 | Nota do fetchMock na Task 7 está errada — `fetchMock` de `cloudflare:test` foi REMOVIDO no v0.13; `vi.stubGlobal('fetch')` é o padrão documentado (main Worker roda no mesmo isolate dos testes) | Task 7 | Apagar a nota; padronizar `vi.stubGlobal`/`vi.spyOn(globalThis, 'fetch')` em todos os testes |
| P1-11 | `step.sleep` com delta `Date.now()` fora de step é não-determinístico entre replays | Task 11 | `step.sleepUntil('wait-schedule', new Date(scheduledAt))` |
| P1-12 | Sem testes de pause/resume, cancelamento durante agendamento, cookie inválido, GET /webhook challenge, reconcile idempotente | Tasks 3/10/12/13 | Adicionar os testes propostos pelo auditor de testes (com `vi.stubGlobal`, não fetchMock) |

## P2 — boas práticas (aplicar no plano quando barato)

| ID | Achado | Correção |
|---|---|---|
| P2-1 | `assets` sem `binding` mas Env declara `ASSETS: Fetcher` (não existe em runtime) | Remover `ASSETS` do Env (código nunca usa) |
| P2-2 | Navegação de browser em `/api/*` devolve index.html (SPA fallback casa antes do Worker) | `"run_worker_first": ["/api/*", "/webhook"]` |
| P2-3 | Sem `app.onError` no Hono — 500 sem log estruturado | Handler global com `console.error` JSON estruturado |
| P2-4 | Payload do webhook sem validação de schema na fronteira (cast puro) | Zod `MetaStatusSchema` na rota antes de enfileirar |
| P2-5 | Sem checagem de `Origin` em mutações sensíveis e no WS (CSRF defesa única = SameSite Lax) | Checar `Origin` no upgrade do WS e em dispatch/cancel |
| P2-6 | Ping/pong acorda o DO da hibernação; cliente nunca envia ping (conexão morre em NAT) | `setWebSocketAutoResponse('ping'→'pong')` no construtor + `setInterval` de ping 30s no `useRealtime` |
| P2-7 | Testes dependem de `.dev.vars` (gitignored) → CI quebra | Bindings de teste no próprio vitest config (miniflare.bindings) |
| P2-8 | tsconfig fixa `workers-types/2023-07-01` com compat date 2026 | `wrangler types` → `worker-configuration.d.ts` no tsconfig |
| P2-9 | Token Meta mascarado vaza 4 chars; cache KV replica o token | Retornar só `configured: boolean`; cachear apenas phoneId/wabaId (token lido de D1/env por uso) — registrar trade-off do token em D1 |
| P2-10 | `webSocketClose` incompleto; sem `webSocketError` | Completar handshake com código/razão + handler de erro |
| P2-11 | Isolamento entre arquivos de teste assumido com telefones fixos | Helper `uniquePhone()` + comentário da premissa no config |
| P2-12 | `PhoneThrottle.acquire` 1 RPC por mensagem; branch de tempo decorrido sem teste | `acquire(now = Date.now())` injetável + (P3) `acquireBatch` |

## P3 — opcionais registrados (não bloqueiam)

observability com sampling explícito · logs JSON estruturados · `LOGIN_LIMITER` é por datacenter (documentar) · logout com consistência eventual do KV (~60s, documentar) · `batch.ackAll()` redundante · `confirm()` nativo no cancelar · cookie `secure:true` em dev HTTP (documentar) · `verifyTurnstile` sem log de error-codes · e2e adicional: guarda de rota sem sessão redireciona para /login · segundo cenário e2e de estimativa de custo.

## Conflitos resolvidos

1. **fetchMock vs vi.stubGlobal** — auditor de testes recomendou fetchMock como primário; fact-checker provou com a doc de migração viva que `fetchMock` foi removido no v0.13. **Veredito: vi.stubGlobal.** Os testes propostos pelo auditor de testes serão adaptados.
2. **Manter vs remover WebhookDedupe** — auditor de DO propôs consertar (SQL + check/mark separados); auditor de Workers propôs remover (idempotência via D1). **Veredito: remover** — menos um componente, mata 3 achados de uma vez; o `updateByMessageId` atômico é necessário nos dois cenários.

## Resultado da Fase 7 (correção) — 2026-07-05

- **12/12 P0 aplicados** · **12/12 P1 aplicados** · **12/12 P2 aplicados** ao plano, por reescrita de seção (4 agentes, blocos Tasks 1-3 / 5-9 / 10-12 / 13-18).
- **P3 aplicados**: e2e de guarda de rota (+ guard no Shell). **P3 deferidos conscientemente** (não bloqueiam; registrados para a implementação): observability com sampling explícito, logs JSON estruturados, documentação de LOGIN_LIMITER por datacenter e da consistência eventual do logout KV, `confirm()` nativo, cookie secure em dev HTTP, log de error-codes do Turnstile, e2e de estimativa de custo, `acquireBatch` no PhoneThrottle.
- Verificação de resíduos (grep no plano inteiro): WebhookDedupe/DEDUPE/applyMigrations/fetchMock/defineWorkersConfig/unsafe/helpers.ts = **0 ocorrências**. Plano final: 3.854 linhas.

## Estatísticas

- **12 P0** · **12 P1** · **12 P2** · **10 P3** (após deduplicação; 8 achados reportados por ≥2 auditores independentes)
- Concentração: camada de testes (escrita contra API antiga do pool workers) e o caminho webhook→contadores (consistência sob retry).
- O desenho macro (Worker único, Workflows, D1, Hono, SPA) foi confirmado pelos 5 auditores — nenhum achado pede mudança de arquitetura.
