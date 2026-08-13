-- SmartZap schema 2 -> 3
-- Repara exclusivamente o ledger público após rollback para runtimes anteriores
-- à rc.18. A baseline pública já contém as colunas de reconciliação; portanto,
-- nesse produto o marcador interno 0035 nunca representa uma alteração física.

DELETE FROM d1_migrations
WHERE name = '0035_status_event_reconciliation.sql';
