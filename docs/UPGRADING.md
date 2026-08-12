# Atualizar um fork

1. Escolha uma tag exata no repositório oficial e leia o GitHub Release.
2. Confirme commit e checksums.
3. Execute manualmente o workflow **Propor atualização oficial** ou crie
   `sync/vX.Y.Z` a partir da tag.
4. Revise o PR contra `main`; ele materializa changelog, migrations,
   incompatibilidades e recuperação. O bot não resolve conflitos.
5. Execute `npm ci`, `npm run release:validate`, `npm test` e `npm run build`.
6. Capture bookmark D1 e os backups necessários.
7. Faça deploy em staging com recursos próprios e execute migrations.
8. Valide `/setup`, Meta, filas, DLQs, cron e regressão.
9. Aprove o merge. Somente então Workers Builds de produção publica `main`.

Antes de usar uma conta real, execute `npm run qa:fork:updates`. O ensaio cria
somente repositórios Git temporários e comprova três comportamentos: patch
limpo, customização do proprietário sem conflito e conflito intencional. No
terceiro caso, a atualização precisa parar, não pode resolver nada sozinha e o
cancelamento deve restaurar o fork anterior. Esse ensaio não substitui o PR e o
staging físicos exigidos para aprovar `UPD-02`.

O deploy do fork captura automaticamente versão ativa e bookmark D1 antes da
primeira migration pendente e salva o checkpoint em `.smartzap/checkpoints/`.
Guarde esse arquivo até o fim da homologação; ele não contém secrets.

Se houver conflito, preserve suas customizações em `customer/*`, compare o
changelog e resolva manualmente. Nunca force uma atualização para “ficar verde”.

No Workers Builds, use `npm run fork:branch` como comando não produtivo. Uma
branch `sync/*` executa somente a validação já concluída pelo build e não chama
Wrangler. Para homologação física, crie deliberadamente `staging/*`; somente
esse prefixo pode executar o bootstrap com recursos `-staging`.
