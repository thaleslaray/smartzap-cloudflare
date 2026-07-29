import { campaignContactsDb } from "../db/campaign-contacts";
import { statusEventsDb } from "../db/status-events";

export type StatusEventReconciliation = {
  scanned: number;
  applied: number;
  alreadyCanonical: number;
  unmatched: number;
  errors: number;
  campaignIds: string[];
};

/**
 * Reaplica callbacks que chegaram antes de `campaign_contacts.message_id`.
 * `updateByMessageId` é monotônico/idempotente: callbacks repetidos ou fora de
 * ordem não voltam o status nem inflam contadores.
 */
export async function reconcilePendingStatusEvents(
  db: D1Database,
  limit = 200,
): Promise<StatusEventReconciliation> {
  const inbox = statusEventsDb(db);
  const pending = await inbox.pending(limit);
  const campaignIds = new Set<string>();
  let applied = 0;
  let alreadyCanonical = 0;
  let unmatched = 0;
  let errors = 0;

  for (const event of pending) {
    try {
      const result = await campaignContactsDb(db).updateByMessageId(
        event.message_id,
        event.status,
        event.status === "failed"
          ? {
              code: event.error_code ?? undefined,
              detail: event.error_detail ?? undefined,
            }
          : undefined,
      );
      if (!result) {
        unmatched += 1;
        await inbox.markPending(event.event_key, "campaign_contact_not_found");
        continue;
      }
      campaignIds.add(result.campaign_id);
      if (result.applied) applied += 1;
      else alreadyCanonical += 1;
      await inbox.markApplied(event.event_key, {
        campaignId: result.campaign_id,
        contactId: result.contact_id,
      });
    } catch (error) {
      errors += 1;
      await inbox.markPending(
        event.event_key,
        error instanceof Error ? error.message : "reconciliation_error",
      );
    }
  }

  return {
    scanned: pending.length,
    applied,
    alreadyCanonical,
    unmatched,
    errors,
    campaignIds: [...campaignIds],
  };
}
