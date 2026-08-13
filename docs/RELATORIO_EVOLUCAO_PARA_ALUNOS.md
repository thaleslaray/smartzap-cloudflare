# Relatório de Evolução (para alunos) — SmartZap

Este documento foi criado para **demonstrar o trabalho realizado** no projeto desde a criação do repositório, com uma visão técnica e didática.

> Repositório: https://github.com/thaleslaray/smartzap

## Visão geral

O SmartZap é um template educacional de um SaaS de automação/CRM para WhatsApp, construído com **Next.js (App Router)**, **React**, integração com **Supabase (Postgres)** e endpoints server-side para automações e integrações.

### Números do trabalho (extraídos do Git)

- Total de commits: **23**
- Contribuidores: **1** (thaleslaray)
- Alterações desde o primeiro commit até o HEAD:
  - **101 arquivos** mudados
  - **7.479 inserções** / **2.840 deleções** (diffstat do Git)
  - Somatório `numstat` (inclui arquivos grandes/remoções): **added=128.619 / removed=65.974**

> Observação didática: o somatório `numstat` pode parecer maior do que o diffstat porque inclui operações em massa (ex.: remoção/movimentação de arquivos grandes).

## O que foi construído (por módulos)

### 1) App (Next.js)

- App Router com páginas do dashboard (ex.: `/campaigns`, `/contacts`, `/templates`, `/settings`, `/setup`).
- Camada de UI separada (componentes de feature + UI reutilizável).
- Estrutura de hooks/controller (React Query + estado de UI) e services para chamadas às rotas.

### 2) API (rotas server-side)

Conjunto de rotas em `app/api/` para:

- **Campanhas**: criação/gestão, disparo em massa, workflow e endpoints auxiliares.
- **Contatos**: CRUD, importação CSV e estatísticas.
- **Templates**: listagem, criação e detalhes por nome.
- **Setup/Config**: bootstrap, validação, migração, leitura de env e wizard.
- **Operação**: health checks, system info, webhook e diagnósticos.
- **Vercel**: endpoints de info/redeploy (útil para demo de DevOps/entrega contínua).

### 3) Banco de dados (Supabase)

- Migração consolidada em `supabase/migrations/0001_initial_schema.sql`.
- Tabelas principais:
  - `campaigns`, `contacts`, `campaign_contacts`
  - `templates`, `settings`, `account_alerts`
  - `template_projects`, `template_project_items`
  - `custom_field_definitions`
- Índices relevantes e constraints para performance e integridade.
- RPCs:
  - `get_dashboard_stats()`
  - `increment_campaign_stat(campaign_id_input, field)`
- Realtime via publication `supabase_realtime` em tabelas-chave.

### 4) Qualidade e DX

- ESLint configurado para Next.js + TypeScript.
- Vitest configurado (base para unit/integration tests).

## Linha do tempo (todos os commits, do primeiro ao último)

Abaixo está o histórico completo (ordem cronológica), para mostrar a evolução incremental.

> Convenção: cada item referencia o commit no GitHub (basta trocar o hash curto pelo completo ou usar o link do commit na UI do GitHub).

- 2025-12-12 `8505c0f`: **first commit** (base do app: `app/`, `components/`, `hooks/`, `lib/`, `services/`, `supabase/`, configs do projeto).
- 2025-12-12 `fe463d0`: dependências: update `@upstash/workflow` para `0.3.0-rc` + `overrides` para `jsondiffpatch`.
- 2025-12-12 `c57e94e`: limpeza de dependência: remoção do `@google/genai`.
- 2025-12-12 `4248fe0`: qualidade: adiciona configuração do **ESLint** (Next.js/TS) e ajustes relacionados.
- 2025-12-12 `05f24b6`: refactor: organização/legibilidade e manutenção.
- 2025-12-13 `76b5375`: testes: adiciona configuração do **Vitest** (base para unit/integration).
- 2025-12-13 `3c6520f`: fix: timestamps nulos/indefinidos em campanhas (ex.: `completedAt`) + ajustes de tipos.
- 2025-12-13 `7aa3aa1`: fix: precheck de template passa a rastrear parâmetros obrigatórios e valores resolvidos (melhora diagnóstico).
- 2025-12-13 `a4150d8`: feat: pre-check de campanhas/contatos/variáveis + melhorias em endpoints de setup e views.
- 2025-12-13 `14607c3`: feat: **ContactQuickEditModal** + humanização de erros do precheck + melhorias em services + docs.
- 2025-12-13 `4d082d3`: feat(auth): **multi-sessão** (tokens) + ajustes em serviços/docs.
- 2025-12-13 `d8b8dfd`: refactor: remove CORS headers do `next.config.ts`.
- 2025-12-13 `a64695b`: fix: ajustes de import/tipagem em rotas.
- 2025-12-13 `dfc196e`: refactor: rotas de custom fields e lógica de update de contatos (fluxo mais robusto).
- 2025-12-13 `c9232ef`: feat: detalhes de campanha com **estatísticas** e melhorias de “real-time” na visualização.
- 2025-12-13 `64234dd`: feat: contatos passam a suportar **email** no banco e UI.
- 2025-12-13 `a540152`: refactor: manutenção e limpeza de artefatos.
- 2025-12-13 `4cf7629`: feat: melhora UX de edição rápida (foco) e suporte a múltiplos campos personalizados.
- 2025-12-13 `26d705c`: refactor: remove testes/artefatos não essenciais e grande volume de conteúdo de referência (diretório `.tmp/`).
- 2025-12-13 `6c0f5e2`: feat: campanhas consideram status **SKIPPED** na exibição/reenvio.
- 2025-12-13 `22e04cd`: feat: melhora headers/cache de contatos para reduzir dados obsoletos + ajustes em hooks/services.
- 2025-12-13 `613baf7`: feat: melhorias de realtime/alertas/cache/validação + ajustes de schema/migrations.
- 2025-12-13 `885be45`: feat: campanhas — adiciona `campaign_id` em updates de contatos e filtra updates inválidos.

## Como demonstrar em aula (sugestão de roteiro)

1) **Rodar o app** (UI do dashboard) e navegar pelos módulos: Contatos → Templates → Campanhas → Settings/Setup.
2) Mostrar o padrão “Page → Hook → Service → API” e como isso organiza responsabilidades.
3) Mostrar a migration do Supabase e explicar por que há índices/constraints (performance + integridade).
4) Mostrar o pre-check de campanha antes do disparo (evita falhas e melhora UX).
5) Mostrar como o projeto lida com *observability* e sanidade (health check + relatórios).

## Referências no repositório

- Changelog do projeto: `CHANGELOG.md`
- Migração Supabase (schema): `supabase/migrations/0001_initial_schema.sql`
- Script de diagnóstico (health report): `scripts/supabase_health_report.sql`

## Anexo prático (DB): Health Report do Supabase

O arquivo `scripts/supabase_health_report.sql` foi pensado para ser **um material de aula**:

- Ele roda somente **SELECTs** (não altera dados), com exceção de `CREATE TEMP VIEW` (escopo da sessão).
- Ele devolve vários *result sets* úteis para investigação, como:
  - existência de tabelas;
  - constraints e índices de `campaign_contacts`;
  - órfãos de FK (`campaign_contacts` → `campaigns` e `contacts`);
  - duplicidades por chave lógica (ex.: `campaign_id + contact_id`);
  - sanidade de `message_id` (útil para debug de webhook);
  - triagem de registros `skipped` sem motivo;
  - um “scoreboard” final com status **OK/ALERTA**.

### Como usar em aula (passo-a-passo)

1) Abrir o Supabase → **SQL Editor**.
2) Colar o conteúdo do `scripts/supabase_health_report.sql`.
3) Executar e ir analisando os blocos (0 → 13), explicando o *porquê* de cada verificação.

### O que isso prova (didaticamente)

- Que o projeto trata **integridade** (FKs/órfãos/duplicidades).
- Que existe uma preocupação real com **observabilidade** e depuração de incidentes.
- Que parte do trabalho de engenharia é criar ferramentas para investigar produção com segurança.

---

Se quiser, eu também posso gerar uma versão “slideável” (1 página) com tópicos curtos para você copiar direto para os slides.
