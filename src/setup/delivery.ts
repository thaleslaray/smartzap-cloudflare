import { settingsDb } from "../db/settings";

const REQUIRED_DELIVERY_STATUSES = ["sent", "delivered", "read"] as const;

export type SetupDeliveryEvidence = {
  passed: boolean;
  statuses: string[];
};

export function hasCompleteSetupDeliveryEvidence(statuses: string[]): boolean {
  // A Meta pode entregar callbacks fora de ordem. O estado do ciclo é
  // monotônico, mas a ordem de chegada na Queue não é uma garantia de contrato.
  const observed = new Set(statuses);
  return REQUIRED_DELIVERY_STATUSES.every((status) => observed.has(status));
}

/**
 * Atualiza o gate da mensagem de instalação assim que a Queue persiste o
 * último callback necessário. A leitura do endpoint continua idempotente, mas
 * deixa de ser necessária para o estado operacional acompanhar a Meta.
 */
export async function reconcileSetupMessageDelivery(
  db: D1Database,
  candidateMessageId?: string,
): Promise<SetupDeliveryEvidence> {
  const messageId = await settingsDb(db).get("setup_test_message_id");
  if (!messageId || (candidateMessageId && candidateMessageId !== messageId))
    return { passed: false, statuses: [] };

  const rows = await db.prepare(
    `SELECT status FROM status_events
     WHERE message_id=?1 AND event_kind='message_status'
     ORDER BY id`,
  ).bind(messageId).all<{ status: string }>();
  const statuses = [...new Set(rows.results.map((row) => row.status))];
  const passed = hasCompleteSetupDeliveryEvidence(statuses);

  if (passed) {
    await db.batch([
      db.prepare(
        `INSERT INTO setup_checks(id,status,detail,checked_at)
         VALUES('real_message','passed',?1,datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           status=excluded.status,detail=excluded.detail,checked_at=excluded.checked_at`,
      ).bind("sent → delivered → read confirmado automaticamente pelo webhook e Queue"),
      db.prepare(
        `UPDATE setup_installation
         SET status='configuring',last_step='real_message_read',last_error=NULL,
             revision=revision+1,updated_at=datetime('now')
         WHERE id=1 AND (last_step<>'real_message_read' OR status<>'configuring' OR last_error IS NOT NULL)`,
      ),
    ]);
  }

  return { passed, statuses };
}
