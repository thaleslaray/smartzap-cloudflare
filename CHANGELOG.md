# Changelog

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento segue SemVer.

## [Unreleased]

## [1.0.0-rc.21] - 2026-08-12

### Corrigido

- o verificador de fork agora aceita corretamente a conta pessoal autenticada
  do instalador e recusa somente o proprietário do repositório upstream;
- a candidata `rc.20` comparava incorretamente o login autenticado ao destino,
  bloqueando o caso normal de um cliente validar o próprio fork.

### Adicionado

- ensaio local e isolado das três situações de atualização: patch limpo,
  customização sem conflito e conflito intencional;
- o conflito precisa interromper o merge sem resolução automática, e o aborto
  precisa restaurar integralmente o fork anterior.

## [1.0.0-rc.20] - 2026-08-12

### Adicionado

- verificador executável de fork verdadeiro, que exige o vínculo GitHub com o
  upstream oficial, proprietário esperado, branch padrão `main` e visibilidade
  pública;
- preparação idempotente da branch `upstream-sync` a partir do SHA exato de
  `main`, sem criar customizações artificiais nem tocar na Cloudflare;
- documentação e cobertura automatizada para rejeitar cópia independente,
  upstream falso ou repositório no proprietário errado.

## [1.0.0-rc.19] - 2026-08-12

### Segurança

- adiciona uma política fail-closed para Workers Builds: somente `main`
  publica produção e somente `staging/*` pode criar o ambiente físico de
  homologação;
- branches `sync/*`, `customer/*` e quaisquer outras branches não autorizadas
  concluem a validação sem chamar Wrangler, migrar D1 ou publicar recursos;
- ausência de `WORKERS_CI_BRANCH` interrompe o comando em vez de assumir um
  ambiente.

### Adicionado

- o workflow de atualização passa a materializar no Pull Request o changelog
  exato, a matriz de migrations, incompatibilidades, recuperação e checklist
  de aprovação do proprietário;
- o pacote público reprova a build se o executor de branches, a política ou o
  gerador auditável do Pull Request estiverem ausentes.

## [1.0.0-rc.18] - 2026-08-12

### Corrigido

- o fallback de reconciliação não registra mais a migration legada `0035` ao
  apenas verificar uma baseline nova que já possui todas as colunas.

## [1.0.0-rc.17] - 2026-08-12

### Segurança

- remove o `.dev.vars` gerado pelo plugin Vite tanto em `smartzap` quanto no
  nome legado `smartzap_cf`;
- o deploy fork-first recusa artefatos sem `dist/client` ou com qualquer
  `.dev.vars`, mesmo quando o build foi invocado fora do pipeline recomendado.

## [1.0.0-rc.16] - 2026-08-12

### Corrigido

- inclui no Git os módulos de validação de migrations e de assinatura usados
  pelos entrypoints públicos;
- o contrato da distribuição agora reprova a release quando qualquer módulo
  transitivo do deploy, rollback ou verificação estiver ausente.

## [1.0.0-rc.15] - 2026-08-12

### Adicionado

- primeira migration pública pós-baseline (`schema 1 → 2`), expansiva e sem
  downtime, com histórico imutável das releases instaladas;
- validação fail-closed de sequência, metadados e SHA-256 de todas as migrations
  antes de qualquer operação na Cloudflare;
- postchecks que vinculam versão, commit e schema realmente persistidos.

## [1.0.0-rc.14] - 2026-08-12

### Corrigido

- o checkpoint de upgrade não usa `commit` como alias SQL reservado no D1.

## [1.0.0-rc.13] - 2026-08-12

### Corrigido

- a retomada consulta diretamente o bucket R2 pelo nome, evitando o limite da
  listagem da conta e impedindo tentativas de recriação durante upgrades.

## [1.0.0-rc.12] - 2026-08-12

### Corrigido

- o instalador confirma o trigger agendado somente após o deploy bem-sucedido,
  permitindo validar a infraestrutura sem aguardar a primeira execução do cron.

## [1.0.0-rc.11] - 2026-08-12

### Corrigido

- bootstrap D1 passa a obter o UUID pela listagem JSON estruturada do Wrangler;
- tabelas internas `_cf_*` deixam de ser confundidas com conteúdo pré-existente;
- retomada segura da instalação após a criação física do D1.

## [1.0.0-rc.10] - 2026-08-12

### Adicionado

- fluxo fork-first com código próprio e Workers Builds;
- instalação rápida OAuth preservada como versão fixa;
- bootstrap isolado de D1, R2, Queues, Workflows, Durable Objects e secrets;
- contratos de atualização, suporte, segurança, OAuth e marca;
- workflow opcional de sincronização por tag e pull request;
- metadados de migration e procedimento duplo de rollback.

## [1.0.0] - não publicada

Primeira release Community será publicada somente após o gate de homologação
descrito em `jornada.md` e `Auditoria.md`.
