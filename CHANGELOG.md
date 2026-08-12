# Changelog

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento segue SemVer.

## [Unreleased]

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
