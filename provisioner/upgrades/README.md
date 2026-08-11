# Upgrades do instalador

Instalações novas começam em `provisioner/baseline/0001_fresh_install.sql`.

Somente alterações posteriores ao baseline entram aqui, em arquivos SQL imutáveis e ordenados. As migrações históricas em `migrations/` servem para o desenvolvimento e para comprovar automaticamente que o baseline representa o schema final; elas não são enviadas nem executadas na conta de um novo cliente.
