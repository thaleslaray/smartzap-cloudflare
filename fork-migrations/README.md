# Migrações posteriores à baseline

Instalações novas recebem somente `provisioner/baseline/0001_fresh_install.sql`.
Migrações adicionadas depois da versão pública inicial ficam nesta pasta, são
append-only e precisam ser declaradas em `release/migrations.json`.

Nunca mova as 51 migrações históricas para cá: elas já foram consolidadas na
baseline final. Nunca altere uma migration depois de publicada.
