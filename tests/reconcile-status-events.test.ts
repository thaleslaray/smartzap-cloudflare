import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { MetaWebhookEvent } from "../src/api/webhook";
import { reconcilePendingStatusEvents } from "../src/cron/reconcile-status-events";
import { campaignsDb } from "../src/db/campaigns";
import { campaignContactsDb } from "../src/db/campaign-contacts";
import { contactsDb } from "../src/db/contacts";
import { handleWebhookBatch } from "../src/queue/webhook-consumer";
import { ensureStatusEventReconciliationSchema } from "../src/db/status-events";

function statusEvent(messageId: string, status: "delivered" | "read" | "failed"): MetaWebhookEvent {
  return {
    kind: "status",
    wabaId: "waba-reconcile",
    phoneNumberId: "phone-reconcile",
    status: {
      id: messageId,
      status,
      timestamp: "1749416383",
      recipient_id: "5511999999999",
    },
  };
}

describe("reconciliação de status órfãos", () => {
  it("mantém a preparação do schema idempotente e registra a migration", async () => {
    expect(await ensureStatusEventReconciliationSchema(env.DB)).toEqual({
      changed: false,
      columns: 6,
    });
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM d1_migrations WHERE name='0035_status_event_reconciliation.sql'",
      ).first(),
    ).toEqual({ n: 1 });
  });

  it("aplica callback que chegou antes de message_id ser persistido", async () => {
    await env.DB.prepare(
      "UPDATE status_events SET apply_state='ignored' WHERE apply_state='pending'",
    ).run();
    const messageId = `wamid.early.${crypto.randomUUID()}`;
    const contact = await contactsDb(env.DB).create({
      phone: `+5511${String(Date.now()).slice(-9)}`,
      status: "opt_in",
    });
    const campaign = await campaignsDb(env.DB).create({
      name: "Status antecipado",
      template_name: "promo_teste",
    });
    await campaignContactsDb(env.DB).bulkInsert(campaign.id, [
      { contactId: contact.id, phone: contact.phone, status: "pending" },
    ]);

    await handleWebhookBatch([statusEvent(messageId, "read")], env);
    const pending = await env.DB.prepare(
      "SELECT apply_state, apply_attempts FROM status_events WHERE message_id=?1",
    ).bind(messageId).first<{ apply_state: string; apply_attempts: number }>();
    expect(pending).toEqual({ apply_state: "pending", apply_attempts: 1 });

    await campaignContactsDb(env.DB).markResult(campaign.id, contact.id, {
      status: "sent",
      message_id: messageId,
    });
    await campaignsDb(env.DB).updateCounters(campaign.id, { sent: 1 });

    const result = await reconcilePendingStatusEvents(env.DB);
    expect(result).toMatchObject({ scanned: 1, applied: 1, unmatched: 0, errors: 0 });
    expect(result.campaignIds).toContain(campaign.id);
    expect(
      await env.DB.prepare(
        "SELECT status FROM campaign_contacts WHERE message_id=?1",
      ).bind(messageId).first(),
    ).toEqual({ status: "read" });
    expect(await campaignsDb(env.DB).get(campaign.id)).toMatchObject({
      sent: 1,
      delivered: 1,
      read: 1,
    });
    expect(
      await env.DB.prepare(
        "SELECT apply_state, campaign_id, campaign_contact_id FROM status_events WHERE message_id=?1",
      ).bind(messageId).first(),
    ).toEqual({
      apply_state: "applied",
      campaign_id: campaign.id,
      campaign_contact_id: contact.id,
    });

    expect(await reconcilePendingStatusEvents(env.DB)).toMatchObject({ scanned: 0 });
  });

  it("mantém órfão pendente e incrementa tentativas sem perder o evento", async () => {
    await env.DB.prepare(
      "UPDATE status_events SET apply_state='ignored' WHERE apply_state='pending'",
    ).run();
    const messageId = `wamid.missing.${crypto.randomUUID()}`;
    await handleWebhookBatch([statusEvent(messageId, "delivered")], env);
    const result = await reconcilePendingStatusEvents(env.DB);
    expect(result).toMatchObject({ scanned: 1, unmatched: 1, applied: 0 });
    const stored = await env.DB.prepare(
      "SELECT apply_state, apply_attempts, last_apply_error FROM status_events WHERE message_id=?1",
    ).bind(messageId).first();
    expect(stored).toEqual({
      apply_state: "pending",
      apply_attempts: 2,
      last_apply_error: "campaign_contact_not_found",
    });
  });

  it("encerra callback antigo da mensagem de setup sem tratá-lo como órfão de campanha", async () => {
    await env.DB.prepare(
      "UPDATE status_events SET apply_state='ignored' WHERE apply_state='pending'",
    ).run();
    const messageId = `wamid.setup.${crypto.randomUUID()}`;
    await env.DB.prepare(
      `INSERT INTO settings(key,value,updated_at) VALUES('setup_test_message_id',?1,datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
    ).bind(messageId).run();
    await env.DB.prepare(
      `INSERT INTO status_events(message_id,status,raw,received_at,event_kind,event_key,waba_id,apply_state,last_apply_error)
       VALUES(?1,'delivered','{}',datetime('now'),'message_status',?2,'waba-reconcile','pending','campaign_contact_not_found')`,
    ).bind(messageId, `status:${messageId}:delivered`).run();

    const result = await reconcilePendingStatusEvents(env.DB);
    expect(result).toMatchObject({
      scanned: 1,
      applied: 0,
      alreadyCanonical: 1,
      unmatched: 0,
      errors: 0,
    });
    expect(await env.DB.prepare(
      "SELECT apply_state,last_apply_error FROM status_events WHERE message_id=?1",
    ).bind(messageId).first()).toEqual({
      apply_state: "ignored",
      last_apply_error: null,
    });
  });
});
