# Wizard de Instalacao — Boas praticas e guia completo

Este documento descreve como criar um wizard de instalacao robusto, previsivel e observavel
para provisionamento completo (infra, banco, envs e bootstrap). Ele complementa os guias do
instalador ja existentes em `docs/`.

## Objetivos do wizard

- Conduzir o usuario em etapas claras e sequenciais.
- Evitar falhas silenciosas e explicar erros de forma acionavel.
- Reduzir tempo total de provisionamento e evitar timeouts (ex.: Vercel 300s).
- Garantir consistencia e idempotencia nas etapas criticas (db/migrations/bootstrap).
- Fornecer telemetria suficiente para diagnostico rapido.

## Princípios de arquitetura

- **Passos deterministas**: cada step deve ter inicio, fim e erro bem definidos.
- **Idempotencia**: steps podem ser reexecutados sem quebrar o estado.
- **Observabilidade**: logs e eventos SSE devem refletir o progresso real.
- **Falha segura**: se algo falhar, manter o sistema em estado recuperavel.
- **Fallbacks explicitos**: se o caminho primario falhar, registrar o fallback usado.

## Estrutura recomendada do fluxo

1. Validar credenciais (Vercel/Supabase/Upstash).
2. Criar/selecionar projeto (Supabase).
3. Aguardar projeto ficar pronto.
4. Resolver chaves e URL de DB.
5. Validar servicos externos (QStash/Redis).
6. Subir env vars.
7. Rodar migrations.
8. Bootstrap de dados iniciais.
9. Redeploy.
10. Aguardar deploy pronto.

## Boas praticas por etapa

### 1) Validacao inicial

- Use Zod ou schema equivalente.
- Falhe cedo se token estiver ausente ou formato invalido.
- Retorne erros curtos e diretos (sem stack em prod).

### 2) Criacao de projeto (Supabase)

- Pode demorar varios minutos. Use heartbeat no SSE para nao parecer travado.
- Registre nome final do projeto criado e o `projectRef`.
- Evite reuso de projetos antigos se o objetivo for instalacao limpa.

### 3) Espera de readiness

- Polling com timeout e atualizacoes de progresso (ex.: 4s).
- Use status do Supabase (`ACTIVE_HEALTHY`) antes de seguir.
- Trate o tempo de espera como parte do progresso do step.

### 4) Resolucao de DB URL

- **Preferir shared pooler** quando possivel.
- Quando houver `dbPass`, usar **usuario postgres** no pooler: `postgres.<ref>`.
- Se pooler falhar, usar **conexao direta** como fallback.
- Logar host, porta e user (sem senha).

### 5) Migrations

- Detectar schema existente antes de rodar.
- Rodar com retry em erros de conexao transitórios.
- Evitar dependencia de Storage se o produto nao usa.
- Use timeout claro e logue quando finalizar.

### 6) Bootstrap

- Persistir configuracoes minimas (ex.: `settings`).
- Ser idempotente (upsert).
- Em sistemas com auth tradicional, validar login no fim (opcional).

### 7) Redeploy

- Desabilitar o installer **apenas quando necessario**.
- Se o redeploy falhar, **reabilitar** o installer.
- Aguardar deploy finalizar e informar o usuario.

## SSE e UX

- Eventos recomendados: `progress`, `error`, `complete`, `retry`, `skip`.
- Sempre enviar `progress` com porcentagem (0-100).
- Heartbeat em steps longos (criar projeto, wait deploy).
- Em caso de erro, retornar o step para o qual o usuario deve voltar.
- Limpar o stream com `AbortController` no frontend.

## Erros comuns e como evitar

- **Timeout Vercel**: reduzir esperas desnecessarias, usar storage opt-in.
- **Tenant not found**: usar pooler com postgres user quando ha `dbPass`.
- **Permission denied**: nao usar `cli_login_*` para migrations.
- **DNS ENOTFOUND**: evitar conexao direta como primario em projeto novo.
- **Fallback silencioso**: sempre logar quando alterna a estrategia.

## Confiabilidade e seguranca

- Nunca logar senhas ou tokens.
- Evitar imprimir DB URL completa.
- Preferir logs curtos em prod (sem stack completo).
- Manter o installer protegido por flag (`INSTALLER_ENABLED=false`).

## Checklist rapido

- [ ] Payload validado e erros claros
- [ ] SSE com progress + heartbeat
- [ ] Pooler primario + fallback direto
- [ ] Migrations idempotentes
- [ ] Storage opt-in (se nao usar storage)
- [ ] Installer reabilitado se redeploy falhar
- [ ] Logs finais de sucesso

## Sugestoes de instrumentacao

- Log final unico: `INSTALLER_FINISHED_OK`.
- Persistir `installer_status` no banco (timestamp por step).
- Adicionar endpoint `health-check` para diagnostico rapido.

## Exemplos de mensagens de log

- `[provision] Step 3/12: Create Supabase Project - INICIANDO`
- `[provision] Step 5/12: DB URL pooler (postgres) resolvida`
- `[migrations] Storage nao e necessario, iniciando migrations...`
- `[provision] Redeploy falhou, reabilitando installer...`
- `[provision] PROVISIONING COMPLETE - ALL STEPS DONE!`
