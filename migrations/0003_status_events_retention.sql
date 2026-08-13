-- A Queue é at-least-once: o mesmo status pode chegar novamente. Mantemos um
-- único registro por mensagem/transição para conter crescimento e PII duplicada.
DELETE FROM status_events
WHERE message_id IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM status_events
    WHERE message_id IS NOT NULL
    GROUP BY message_id, status
  );

CREATE UNIQUE INDEX idx_se_message_status_unique
ON status_events(message_id, status)
WHERE message_id IS NOT NULL;
