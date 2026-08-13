# Migrações posteriores à baseline

Instalações novas recebem somente `provisioner/baseline/0001_fresh_install.sql`.
Migrações adicionadas depois da versão pública inicial ficam nesta pasta, são
append-only e precisam ser declaradas em `release/migrations.json`.

Nunca mova as 51 migrações históricas para cá: elas já foram consolidadas na
baseline final. Nunca altere uma migration depois de publicada.

`0002_release_history.sql` é a primeira prova pós-baseline. Ela cria somente
estrutura nova, continua compatível com o código do schema 1 e registra a
identidade de cada instalação ou atualização. O bootstrap valida o SHA-256 do
manifesto antes de consultar ou alterar qualquer recurso remoto.

`0003_repair_legacy_status_marker.sql` remove exclusivamente o marcador interno
`0035` que runtimes anteriores à rc.18 podiam recriar durante um rollback. Em
uma instalação pública ele nunca representa uma migration real, porque a
baseline final já contém todas as colunas correspondentes. A migration não
altera schema nem dados de negócio.
