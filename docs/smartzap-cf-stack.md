# Decisão de stack — smartzap-cf

**Fase 3 da /planejar (consolidação)** · 2026-07-05
Pesquisa técnica realizada em 2026-07-05 via `cloudflare-atlas`: claims verificadas contra docs vivas (developers.cloudflare.com) + fact-check adversarial independente (15 claims: 11 confirmadas, 2 refutadas a favor da migração, 1 qualificada, 1 parcial). Detalhes de arquitetura no design doc (`docs/superpowers/specs/2026-07-05-smartzap-cf-design.md`).

## Princípio

100% Cloudflare. Saídas só por cobertura (produto não existe) ou por ser o próprio produto (Meta API) / modelo de IA escolhido (Gemini, acessado via AI Gateway da Cloudflare).

## Tabela de decisão

| Camada | Escolha Cloudflare | Saiu? Por quê | Alternativa externa |
|---|---|---|---|
| Frontend | Workers Static Assets (SPA React 19 + Vite) | — | — |
| Framework API | Workers + Hono | — | — |
| Banco | D1 (SQLite) | — | — |
| Pipeline de envio | Workflows | — | — |
| Fila de webhooks | Queues | — | — |
| Cache + sessões | KV | — | — |
| Estado atômico (dedup, throttle) | Durable Objects | — | — |
| Realtime (WS) | Durable Object + WebSocket Hibernation | — | — |
| Mídia | R2 | — | — |
| Agendamento | Workflows `step.sleep` (Queues delay limita a 24h) | — | — |
| Cron | Cron Triggers | — | — |
| Anti-bot login | Turnstile | — | — |
| Rate limit | Rate limiting binding (nativo Workers) | — | — |
| Observabilidade | Workers Logs + `observability.enabled` + dashboard de Workflows | — | — |
| IA — gateway | AI Gateway | — | — |
| IA — RAG (onda 2) | AI Search (open beta; validar limites na onda) | — | — |
| IA — agentes (onda 2) | Agents SDK (Durable Objects) | — | — |
| IA — geração | via AI Gateway | **Modelo:** Gemini escolhido pelo produto (refactor gemini-only) — Workers AI não hospeda Gemini | Google Gemini API |
| Mensageria WhatsApp | — | **É o produto:** integração com Meta é a razão de existir do app | Meta WhatsApp Cloud API v24+ |
| Deploy/CI | Wrangler + Workers Builds (git) | — | — |

## Fatos-limite que sustentam as escolhas (verificados ao vivo em 2026-07-05)

- **Workflows**: steps 10k default/25k máx (Paid), `step.sleep` até 365 dias, duração total ilimitada, payload/retorno de step 1 MiB, instâncias em sleep não contam concorrência → cobre o pipeline de campanha e o agendamento.
- **Queues**: 128 KB/msg, 5.000 msg/s, delay máx 24h → por isso agendamento vai no Workflow, não na Queue.
- **Workers**: CPU até 5 min (Paid), wall-clock HTTP ilimitado, 10k subrequests default (elevável), request body 100 MB (Free/Pro) → cobre uploads de mídia (~16 MB) e loops de envio à Graph API.
- **Durable Objects**: WebSocket Hibernation (sem cobrança de duration em idle), SQLite 10 GB/objeto → realtime e throttle.
- **D1**: SQLite, 10 GB/database (Paid) → folga para single-tenant.
- **nodejs_compat**: `node:crypto` completo (HMAC do webhook), `web-push` funciona (guia oficial CF), `node:fs` lê `/bundle` → sem bloqueadores de runtime.
- **Rate limiting binding**: janelas de 10/60s, contadores por datacenter → adequado para brute-force de login, não para quota exata.

## Custo

Workers Paid **US$ 5/mês** cobre a escala atual (10M req, 30M CPU-ms, D1 25 bi reads, Queues 1M ops, DO 1M req + hibernation, R2 10 GB egress grátis). Custos externos: taxas Meta por mensagem (tabela BRL oficial — ver `docs/smartzap-cf-perfil.md`) e Gemini API. Deixa de existir: Vercel, Upstash, Supabase.

## O que fica de fora e por quê

- **Hyperdrive/Postgres externo**: descartado — decisão de rebuild com D1 e dados do zero (Fase 1).
- **Vectorize**: substituído por AI Search (RAG gerenciado) por decisão do usuário; se a onda 2 precisar de controle fino de embeddings, Vectorize volta a ser opção.
- **Pages**: Workers Static Assets é o caminho atual recomendado para full-stack (Pages em manutenção evolutiva).
- **Containers/Dynamic Workers**: sem necessidade — nenhum workload exige runtime fora do isolate.
