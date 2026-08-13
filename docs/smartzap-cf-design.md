# Design — smartzap-cf

**Fase 4 da /planejar** · 2026-07-05
Telas desenhadas no Claude Design pelo usuário a partir de brief + tokens preparados nesta sessão.

## Projeto Claude Design (fonte de verdade do design)

- **Projeto**: "SmartZap CF — Design System" · projectId `4704246e-4447-4264-a57e-bb3b1710641b` · claude.ai/design
- **Design system**: `styles.css` (global) → importa `tokens/smartzap-tokens.css` — a identidade atual do produto foi mantida (emerald sobre zinc, dark-first, radius 10px, badges semânticos de status).
- **Brief**: `brief/telas-mvp.md` (8 telas do MVP com conteúdo real).

## Telas aprovadas (handoff bundle no projeto)

| Tela | Arquivo no projeto |
|---|---|
| Login (senha mestra + Turnstile) | `templates/login/Login.dc.html` |
| Dashboard (stat cards + recentes) | `templates/dashboard/Dashboard.dc.html` |
| Campanhas — lista | `templates/campanhas/Campanhas.dc.html` |
| Nova campanha — wizard 4 passos (com custo estimado Meta em R$) | `templates/nova-campanha/NovaCampanha.dc.html` |
| Campanha — detalhe (progresso ao vivo via WS) | `templates/campanha-detalhe/CampanhaDetalhe.dc.html` |
| Contatos (+ import CSV com opt-in LGPD) | `templates/contatos/Contatos.dc.html` |
| Templates Meta (sync, read-only) | `templates/templates-meta/TemplatesMeta.dc.html` |
| Settings (credenciais, webhook, throttle, sessões) | `templates/settings/Settings.dc.html` |

Cada tela acompanha `ds-base.js` + `support.js` (runtime de preview do Claude Design — referência visual, não código de produção).

## Tokens (base para o Tailwind/CSS da SPA)

Fonte: `tokens/smartzap-tokens.css` no projeto (cópia local: scratchpad da sessão de planejamento; recriável do projeto a qualquer momento).

- **Primary**: escala emerald completa, `#10b981` (500) como ação primária, `#34d399` (400) para focus/acento.
- **Superfícies**: zinc-950 página / zinc-900 cards / zinc-800 overlays; borda zinc-700. Dark é o tema default.
- **Status de mensagem**: sent `#60a5fa` · delivered `#34d399` · read `#10b981` · failed `#f87171` · pending `#a1a1aa` · skipped `#fbbf24`.
- **Forma**: radius 0.625rem; ícones lucide 16–20px; UI pt-BR; densidade compacta em tabelas.

## Como a implementação consome isso (Fase 5+)

1. Os tokens viram o tema Tailwind v4 da SPA (`@theme` no CSS) — mapeamento 1:1.
2. As telas `.dc.html` são a referência visual por página: durante a implementação, puxar a tela correspondente via `DesignSync get_file` quando for construí-la (não versionar os HTMLs de preview no repo — a fonte de verdade é o projeto Claude Design).
3. Componentes shadcn/ui (new-york) continuam sendo a base de componentes; o design define aparência e composição, não substitui a biblioteca.
