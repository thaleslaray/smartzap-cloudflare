# Migrações e rollback

As migrations são append-only, imutáveis, idempotentes quando aplicável e usam
expand/contract para evitar que código e schema fiquem incompatíveis na mesma
release. `release/migrations.json` declara origem, destino, compatibilidade,
indisponibilidade, destrutividade, prechecks, postchecks e recuperação.

## Antes da escrita

1. Registre versão, commit e schema atuais.
2. Capture bookmark D1: `npx wrangler d1 time-travel info DB`.
3. Confirme DLQs e backlog zerados.
4. Teste a migration em staging físico.

`npm run fork:deploy` executa esse preflight automaticamente em uma atualização
e grava um checkpoint não secreto em `.smartzap/checkpoints/`. Sem bookmark ou
versão ativa anterior, a migration é interrompida.

Antes do inventário remoto, o comando também valida a sequência completa do
manifesto e o SHA-256 de cada arquivo. Arquivo ausente, checksum divergente,
salto de schema ou downgrade interrompem a execução antes de tocar a conta.
Depois da aplicação, a identidade persistida e os postchecks de schema precisam
corresponder à release; caso contrário, a atualização falha e o checkpoint deve
ser usado para recuperação.

## Rollback

- Worker: volte para a versão anterior em Versions & Deployments.
- D1 alterado: restaure o bookmark com D1 Time Travel; a restauração é
  destrutiva e gera outro bookmark que permite desfazer a restauração.
- R2: recupere objetos pela política de versionamento/backup definida pelo
  proprietário; não faz parte da versão do Worker.
- Queues: pause produtores/consumidores, preserve backlog e siga o runbook da
  migration; não apague fila para “reverter”.
- Durable Objects: mantenha classes antigas durante expand/contract e use uma
  release posterior para remoção; rollback do Worker não reverte storage.

Depois, execute postchecks, `/setup`, health, Queue, DLQs e reconciliação.

O comando abaixo apenas mostra o plano:

```bash
npm run fork:rollback -- --checkpoint=.smartzap/checkpoints/ARQUIVO.json
```

Para executar o rollback do Worker e também restaurar o D1 — operação
destrutiva e apropriada somente quando a migration alterou schema ou dados — use:

```bash
npm run fork:rollback -- --checkpoint=.smartzap/checkpoints/ARQUIVO.json --restore-d1 --execute
```
