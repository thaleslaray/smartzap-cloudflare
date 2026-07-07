# Status do Planejamento — smartzap-cf

Rebuild greenfield do SmartZap 100% Cloudflare. Conduzido pela skill `/planejar`.

## Fases

| Fase | Status | Data |
|---|---|---|
| 0 — Preflight | ✅ Concluída (tudo instalado) | 2026-07-05 |
| 1 — Brainstorm | ✅ Concluída e aprovada | 2026-07-05 |
| 2 — Discovery (mercado/persona) | ✅ Concluída e aprovada | 2026-07-05 |
| 3 — Consolidar stack (já pesquisada) | ✅ Documento consolidado | 2026-07-05 |
| 4 — Design (redesign no Claude Design) | ✅ Concluída e aprovada | 2026-07-05 |
| 5 — Plano de implementação | ✅ Escrito e salvo (18 tasks) | 2026-07-05 |
| 6 — Auditoria | ✅ 5 auditores, 46 achados (12 P0) em docs/smartzap-cf-audit.md | 2026-07-05 |
| 7 — Correção | ✅ Todos P0/P1/P2 aplicados (4 agentes) | 2026-07-05 |
| 8 — Montagem | ✅ Plano final consistente (18 tasks, 3.854 linhas) | 2026-07-05 |

## Decisões tomadas

- **Escopo MVP**: loop de marketing (campanhas + contatos/CSV + templates + webhook + dashboard + settings).
- **Morre**: installer, builder de workflows no-code. **Congelado** (decisão futura): WhatsApp Flows, lead forms, Google Calendar. **Onda pós-MVP**: inbox com IA (Agents SDK + AI Search).
- **Dados**: começar do zero (sem migração Supabase→D1).
- **Repo**: novo, `smartzap-cf`. **Topologia**: Worker único (SPA assets + Hono + DOs + Workflow + Queue).
- **Stack**: decidida via cloudflare-atlas com fact-check adversarial nesta sessão (ver design doc, seção 3).
- **Fases ajustadas com o usuário**: Fase 2 EXECUTA (pesquisa de mercado/persona); Fase 3 vira consolidação de documento (pesquisa já feita); Fase 4 = redesign das telas no Claude Design apenas (mantém handoff web↔terminal).

## Artefatos

- Design doc (Fase 1): `docs/superpowers/specs/2026-07-05-smartzap-cf-design.md`
- Perfil de mercado/persona (Fase 2): `docs/smartzap-cf-perfil.md` — relatório completo em `~/pesquisas/pesquisa-mercado-whatsapp-smartzap-2026-07-05.md`
- Decisão de stack (Fase 3): `docs/smartzap-cf-stack.md`

## Descoberta crítica da Fase 2

Meta cobra R$ 0,035/resposta não-template a partir de 01/10/2026 (templates inalterados) — favorece o MVP de campanhas; onda do inbox precisa de análise de custo própria. Implicações no produto registradas no perfil (opt-in como feature, custo estimado pré-dispatch, throttle anti-ban).

## PLANEJAMENTO CONCLUÍDO — 2026-07-05

Todas as 8 fases concluídas. Artefatos finais:
- **Plano de implementação (auditado e corrigido)**: `docs/superpowers/plans/2026-07-05-smartzap-cf.md` (18 tasks, 3.854 linhas)
- **Auditoria**: `docs/smartzap-cf-audit.md` (46 achados; P0/P1/P2 todos aplicados; P3 deferidos listados)
- **Design**: `docs/smartzap-cf-design.md` + projeto Claude Design `4704246e-4447-4264-a57e-bb3b1710641b` (8 telas)
- **Stack**: `docs/smartzap-cf-stack.md` · **Perfil/mercado**: `docs/smartzap-cf-perfil.md` · **Spec**: `docs/superpowers/specs/2026-07-05-smartzap-cf-design.md`

**Próximo passo (execução)**: criar o repo `~/Projetos/smartzap-cf` e executar o plano com `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`.
