# Atualizar um fork

1. Escolha uma tag exata no repositório oficial e leia o GitHub Release.
2. Confirme commit e checksums.
3. Execute manualmente o workflow **Propor atualização oficial** ou crie
   `sync/vX.Y.Z` a partir da tag.
4. Revise o PR contra `main`; o bot não resolve conflitos.
5. Execute `npm ci`, `npm run release:validate`, `npm test` e `npm run build`.
6. Capture bookmark D1 e os backups necessários.
7. Faça deploy em staging com recursos próprios e execute migrations.
8. Valide `/setup`, Meta, filas, DLQs, cron e regressão.
9. Aprove o merge. Somente então Workers Builds de produção publica `main`.

O deploy do fork captura automaticamente versão ativa e bookmark D1 antes da
primeira migration pendente e salva o checkpoint em `.smartzap/checkpoints/`.
Guarde esse arquivo até o fim da homologação; ele não contém secrets.

Se houver conflito, preserve suas customizações em `customer/*`, compare o
changelog e resolva manualmente. Nunca force uma atualização para “ficar verde”.
