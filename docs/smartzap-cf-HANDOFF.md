# HANDOFF — smartzap-cf

Documento único de passagem de bastão. Se você (ou outra sessão, ou outro engenheiro) está lendo isto sem ter acompanhado a conversa, **comece aqui**. Tudo que foi decidido e produzido no planejamento está referenciado abaixo.

Data do planejamento: **2026-07-05**. Autor da sessão: Claude (via `/planejar`). Repositório de origem (referência): `~/Projetos/smartzap - claudflare` (branch `refactor/gemini-only`).

---

## 1. O que é isto em uma frase

Plano completo, auditado e corrigido para **reconstruir o SmartZap do zero, 100% na Cloudflare**, num repositório novo (`smartzap-cf`), substituindo a stack atual (Next.js + Supabase + Upstash + Vercel). O planejamento acabou; falta **executar**.

## 2. Como chegamos aqui (a linha do tempo da decisão)

1. **Análise da codebase atual** — SaaS single-tenant de campanhas WhatsApp (~251k linhas TS, 212 rotas). Diagnóstico: saudável, mas com monólitos críticos sem teste (`workflow/route.ts` 2.640 linhas, `webhook/route.ts`, `supabase-db.ts`), realtime fragmentado, e 3 buracos de segurança (cookie não-validado no proxy, API key não timing-safe, lista pública inchada).
2. **Viabilidade adversarial da migração** (via skill `cloudflare-atlas` + fact-check ao vivo): 100% Cloudflare é viável. Dois obstáculos que eu previa (`web-push`, `node:fs`) foram **refutados** pelas docs vivas — o Node.js compat dos Workers evoluiu muito desde 2024.
3. **Decisões do dono** que transformaram "migração" em "rebuild greenfield": trocar de framework (não precisa ser Next), remover o installer, banco livre (não precisa ser cópia do Postgres), e usar AI Search + AI Gateway + Agents SDK no lugar de Vectorize/pgvector/Mem0.
4. **8 fases da `/planejar`**: brainstorm → discovery de mercado (com Phase Gate verificado) → stack consolidada → design de 8 telas no Claude Design → escrita do plano → auditoria multi-agente → correção → montagem.

## 3. Decisões congeladas (não re-litigar sem motivo novo)

| Tema | Decisão |
|---|---|
| **Escopo do MVP** | Loop de marketing: campanhas + contatos (import CSV) + templates + webhook de status + dashboard + settings |
| **Morre no rebuild** | Installer/wizard; builder de workflows no-code |
| **Congelado (decisão futura)** | WhatsApp Flows nativos, lead forms públicos, Google Calendar |
| **Onda 2 (pós-MVP, planejada)** | Inbox/atendimento com IA (Agents SDK + AI Search + AI Gateway + Agent Memory) |
| **Dados** | Começar do zero — sem migração Supabase→D1 |
| **Repo** | Novo: `smartzap-cf` |
| **Topologia** | Worker único: SPA (Static Assets) + Hono API + D1 + Workflows + Queues + KV + R2 + Durable Objects |
| **Framework** | SPA React 19 + Vite (dashboard atrás de login não precisa de SSR) + Hono para a API |
| **IA (onda 2)** | Gemini via AI Gateway; AI Search para RAG; Agents SDK para o agente de inbox |

## 4. Arquitetura-alvo (mapa de peças)

```
Worker único smartzap-cf:
  SPA React (Static Assets, grátis) + Hono API (/api/*)  ← Browser (HTTPS + WebSocket)
  Durable Objects: RealtimeHub (WS hibernation) · PhoneThrottle (por número)
  Queue consumer (webhooks Meta) · CampaignSendWorkflow (envio durável) · Cron (reconcile 15min)
  Bindings: D1 (dados) · KV (sessões/cache) · R2 (mídia) · rate limit · Turnstile
  Externos: Meta Graph API (o produto) · Gemini via AI Gateway (onda 2)
```

Custo estimado na escala atual: **~US$ 5/mês** (Workers Paid). Deixa de pagar Vercel + Upstash + Supabase.

Decisão de auditoria que mudou o desenho original: o **DO de dedup de webhook foi eliminado** — a idempotência mora no D1 via UPDATE condicional atômico (mais simples e sem o modo de falha "marcar-antes-de-persistir" que perderia eventos no retry da Queue).

## 5. Os artefatos — o que ler, em que ordem

Todos em `~/Projetos/smartzap - claudflare/docs/` (⚠️ ver aviso sobre git no item 8).

| Ordem | Arquivo | O que é | Quando ler |
|---|---|---|---|
| 1 | `smartzap-cf-HANDOFF.md` | **Este documento** | Primeiro, sempre |
| 2 | `smartzap-cf-planejamento-status.md` | Estado das 8 fases, para retomar | Para saber "onde paramos" |
| 3 | `superpowers/specs/2026-07-05-smartzap-cf-design.md` | Spec/design doc (arquitetura, schema, fluxos, segurança) | Para entender o "porquê" de cada decisão |
| 4 | `superpowers/plans/2026-07-05-smartzap-cf.md` | **O PLANO** — 18 tasks, 58 steps, código completo, TDD | Para executar |
| 5 | `smartzap-cf-audit.md` | 46 achados de auditoria + o que foi corrigido + P3 deferidos | Para saber o que já foi blindado e o que ficou para depois |
| — | `smartzap-cf-stack.md` | Tabela de decisão de stack (limites verificados ao vivo) | Referência de "por que Cloudflare X" |
| — | `smartzap-cf-perfil.md` | Persona/mercado + a mudança de pricing da Meta | Contexto de produto |
| — | `smartzap-cf-design.md` | Inventário das 8 telas + tokens | Ao construir a SPA |
| — | `~/pesquisas/pesquisa-mercado-whatsapp-smartzap-2026-07-05.md` | Pesquisa completa (fontes, CRAAP) | Fundo da pesquisa |

Design visual: projeto **"SmartZap CF — Design System"** no claude.ai/design, `projectId 4704246e-4447-4264-a57e-bb3b1710641b` (8 telas em `templates/<tela>/<Tela>.dc.html`). As telas são a referência visual; puxe cada uma via a ferramenta DesignSync na hora de construí-la.

## 6. O plano em uma olhada (18 tasks)

Cada task = teste que falha → implementação → teste que passa → commit. Ordem de dependência:

| # | Task | Entrega |
|---|---|---|
| 1 | Scaffold | Worker Hono + SPA Vite + health check + vitest-pool-workers |
| 2 | Schema D1 | migration + repos de contatos/settings + tabela `consent_events` |
| 3 | Auth | sessões KV, Turnstile (fail-closed em prod), rate limit, timing-safe async |
| 4 | Domain puro | E.164, pricing BRL, parser CSV |
| 5 | Contatos | CRUD + import CSV com opt-in obrigatório + evidência de consentimento |
| 6 | Cliente WhatsApp | Graph API único + mapa de erros + HMAC fail-closed |
| 7 | Templates/Settings | sync da Meta + credenciais com cache KV (token não cacheado) |
| 8 | PhoneThrottle | DO de throttle por número, resistente a eviction |
| 9 | RealtimeHub | DO WebSocket hibernation + auto-response + broadcast |
| 10 | Campanhas | audiência opt-in, custo estimado em R$, dispatch, pause/resume/cancel |
| 11 | CampaignSendWorkflow | pipeline durável (`loadSendConfig`+`sendCampaignBatch` testáveis), teto de steps, recuperação de retry |
| 12 | Webhook | fail-closed, Queue com fatiamento (128KB), idempotência atômica no D1 |
| 13 | Cron + Dashboard | reconciliação de contadores + stats |
| 14 | SPA base | tokens, api client, login, shell, guard de rota |
| 15 | SPA campanhas | dashboard + lista + wizard (custo antes do disparo) + detalhe ao vivo |
| 16 | SPA contatos/templates/settings | import com checkbox LGPD |
| 17 | SPA realtime | WS com reconexão + keepalive |
| 18 | E2E + runbook | smoke Playwright + README de deploy |

## 7. Estado da auditoria (o que já está blindado)

- **12 P0, 12 P1, 12 P2 — todos aplicados** ao plano. Verificação por grep: zero resíduos de componentes removidos.
- **P3 deferidos conscientemente** (não bloqueiam a execução; retomar durante a implementação): observability com sampling explícito, logs JSON estruturados, documentar LOGIN_LIMITER por datacenter e consistência eventual do logout KV, `confirm()` nativo → modal, cookie secure em dev HTTP, log de error-codes do Turnstile, e2e de estimativa de custo, `acquireBatch` no PhoneThrottle.
- **Fora do MVP por decisão de escopo** (binding já existe, sem task): upload de mídia (R2) para templates com header de mídia.

## 8. ⚠️ Avisos importantes antes de executar

1. **`docs/` está no `.gitignore` deste repo.** Todos os artefatos acima existem **em disco, mas não versionados**. Se quiser preservá-los no git, use `git add -f docs/...` ou mova para o repo novo. Ao criar o `smartzap-cf`, copie a pasta `docs/` para lá.
2. **Pricing da Meta é volátil.** As tarifas BRL no plano (marketing R$ 0,3217, utility/auth R$ 0,035) têm fonte e data (2026-07-05). A Meta só muda no dia 1º de cada trimestre — **revalidar antes de cada deploy**. Nota crítica: a cobrança de respostas não-template entra em **01/10/2026** (afeta a onda 2 do inbox, não o MVP).
3. **Secrets nunca no código.** O runbook (Task 18) lista todos: `MASTER_PASSWORD`, `META_APP_SECRET` (HMAC), `META_VERIFY_TOKEN` (verify token do painel Meta — valor diferente!), `WHATSAPP_TOKEN`, `TURNSTILE_SECRET`, `SMARTZAP_API_KEY`.
4. **O plano foi verificado contra as docs vivas de 2026-07-05.** APIs Cloudflare mudam; se algo falhar no scaffold (Task 1), confira a doc viva antes de assumir bug no plano.

## 9. Próximo passo — como executar

```bash
# 1. Criar o repo novo e levar os docs junto
mkdir -p ~/Projetos/smartzap-cf && cp -r "~/Projetos/smartzap - claudflare/docs" ~/Projetos/smartzap-cf/

# 2. Numa sessão de Claude Code dentro de ~/Projetos/smartzap-cf, executar o plano:
#    Opção A (recomendada): subagent por task, review entre tasks
#      → skill superpowers:subagent-driven-development, apontando para
#        docs/superpowers/plans/2026-07-05-smartzap-cf.md
#    Opção B: execução inline com checkpoints
#      → skill superpowers:executing-plans
```

O plano é auto-contido: cada task tem os arquivos exatos, o código completo e os comandos com output esperado. Um engenheiro (ou agente) consegue executar lendo só o plano.

## 10. Frase de retomada

Se você é uma nova sessão e o dono disser "vamos continuar o smartzap-cf": leia `docs/smartzap-cf-planejamento-status.md`, confirme que o planejamento está 100% e ofereça iniciar a **execução** do plano via `superpowers:subagent-driven-development`. Não recomece o planejamento — ele está pronto.
