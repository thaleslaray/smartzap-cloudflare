import { campaignContactsDb } from "../db/campaign-contacts";
import { statusEventsDb, type WebhookEventRecord } from "../db/status-events";
import { pricingDb } from "../db/pricing";
import { contactsDb } from "../db/contacts";
import { settingsDb } from "../db/settings";
import { templatesDb } from "../db/templates";
import { broadcastToHub } from "../api/realtime";
import type { MetaWebhookEvent } from "../api/webhook";
import { sanitizeMetaDetail } from "../whatsapp/client";
import { conversationsDb } from "../db/conversations";
import { normalizePhone } from "../domain/phone";
import { countryFromE164 } from "../domain/pricing";
import { conversationSendsDb } from "../db/conversation-sends";
import {
  automationDebounceSeconds,
  type AutomationEvent,
} from "../ai/automation";
import { getCredentials } from "../whatsapp/credentials";
import { whatsappClient } from "../whatsapp/client";
import {
  applyFlowMappingToContact,
  buildFlowConfirmation,
  flowFieldCatalog,
} from "../domain/flow-response";

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Bytes(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function persistInboundMedia(
  env: Env,
  conversationId: string,
  messageId: string,
  content?: Record<string, unknown>,
) {
  const mediaId = typeof content?.mediaId === "string" ? content.mediaId : null;
  if (!mediaId || !/^\d{1,512}$/.test(mediaId)) return;
  const existing = await env.DB.prepare(
    "SELECT message_id FROM conversation_media WHERE message_id = ?1",
  )
    .bind(messageId)
    .first();
  if (existing) return;
  const credentials = await getCredentials(env);
  if (!credentials)
    throw new Error("credenciais Meta ausentes para persistir mídia inbound");
  const media = await whatsappClient(credentials).downloadMedia(mediaId);
  const checksum = await sha256Bytes(media.bytes);
  const r2Key = `inbox-media/${conversationId}/${messageId}`;
  await env.MEDIA.put(r2Key, media.bytes, {
    httpMetadata: { contentType: media.contentType },
  });
  await env.DB.prepare(
    `INSERT OR IGNORE INTO conversation_media (message_id, conversation_id, r2_key, mime_type, byte_size, checksum)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(
      messageId,
      conversationId,
      r2Key,
      media.contentType.slice(0, 255),
      media.contentLength,
      checksum,
    )
    .run();
}

async function persistFlowSubmission(
  env: Env,
  message: Extract<MetaWebhookEvent, { kind: "inbound_message" }>["message"],
  contactId: string,
) {
  const response = message.content?.flowResponse;
  if (!response || typeof response !== "object" || Array.isArray(response)) return;
  const values = response as Record<string, unknown>;
  const messagePhone = message.phone ?? (
    !message.userId && /^\d{5,32}$/.test(message.from) ? message.from : undefined
  );
  const senderIdentifier = messagePhone ? `+${messagePhone}` : `bsuid:${message.userId}`;
  const flowToken = typeof values.flow_token === "string" ? values.flow_token : null;
  const tokenMetaId = flowToken?.match(/^smartzap:(\d{6,25})(?::|$)/)?.[1] ?? null;
  const flowId =
    typeof values.flow_id === "string" && /^\d{6,25}$/.test(values.flow_id)
      ? values.flow_id
      : tokenMetaId;
  const local = flowId
    ? await env.DB.prepare(
        "SELECT id,mapping_json,definition_json FROM flows WHERE meta_id=?1 LIMIT 1",
      )
        .bind(flowId)
        .first<{ id: string; mapping_json: string; definition_json: string }>()
    : null;
  const existing = await env.DB.prepare(
    "SELECT id FROM flow_submissions WHERE message_id=?1 OR (?2 IS NOT NULL AND flow_token=?2) LIMIT 1",
  )
    .bind(message.id, flowToken)
    .first<{ id: string }>();
  let submissionId: string;
  if (existing) {
    submissionId = existing.id;
    await env.DB.prepare(
      `UPDATE flow_submissions SET message_id=?2,flow_local_id=COALESCE(flow_local_id,?3),
       meta_flow_id=COALESCE(meta_flow_id,?4),flow_token=COALESCE(flow_token,?5),
       contact_id=?6,from_phone=?7,response_json=?8,status='completed',
       message_timestamp=?9,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?1`,
    )
      .bind(
        existing.id,
        message.id,
        local?.id ?? null,
        flowId,
        flowToken,
        contactId,
        senderIdentifier,
        JSON.stringify(values),
        new Date(Number(message.timestamp) * 1000).toISOString(),
      )
      .run();
  } else {
    submissionId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO flow_submissions
       (id,message_id,flow_local_id,meta_flow_id,flow_token,contact_id,from_phone,response_json,status,message_timestamp,completed_at)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'completed',?9,datetime('now'))`,
    )
      .bind(
        submissionId,
        message.id,
        local?.id ?? null,
        flowId,
        flowToken,
        contactId,
        senderIdentifier,
        JSON.stringify(values),
        new Date(Number(message.timestamp) * 1000).toISOString(),
      )
      .run();
  }

  if (!local) return;
  const definition = JSON.parse(local.definition_json || "{}") as Record<string, unknown>;
  const mapped = await applyFlowMappingToContact({
    db: env.DB,
    contactId,
    response: values,
    mapping: JSON.parse(local.mapping_json || "{}"),
  });
  if (mapped) {
    await env.DB.prepare(
      `UPDATE flow_submissions SET mapped_data_json=?2,mapped_at=datetime('now'),
       updated_at=datetime('now') WHERE id=?1`,
    )
      .bind(submissionId, JSON.stringify(mapped))
      .run();
  }

  const catalog = flowFieldCatalog(definition);
  const confirmation = buildFlowConfirmation({
    response: values,
    confirmation: definition.confirmation,
    fieldLabels: catalog.labels,
    optionLabels: catalog.options,
  });
  if (!confirmation) {
    await env.DB.prepare(
      `UPDATE flow_submissions SET confirmation_status='disabled',updated_at=datetime('now')
       WHERE id=?1 AND confirmation_status IS NULL`,
    )
      .bind(submissionId)
      .run();
    return;
  }
  const claim = await env.DB.prepare(
    `UPDATE flow_submissions SET confirmation_status='sending',updated_at=datetime('now')
     WHERE id=?1 AND confirmation_status IS NULL`,
  )
    .bind(submissionId)
    .run();
  if (claim.meta.changes !== 1) return;
  const credentials = await getCredentials(env);
  if (!credentials) {
    await env.DB.prepare(
      "UPDATE flow_submissions SET confirmation_status='rejected',updated_at=datetime('now') WHERE id=?1",
    )
      .bind(submissionId)
      .run();
    return;
  }
  const opaqueId = crypto.randomUUID();
  const sent = await whatsappClient(credentials).sendText(
    messagePhone ? `+${messagePhone}` : { userId: message.userId! },
    confirmation,
    opaqueId,
  );
  await env.DB.prepare(
    `UPDATE flow_submissions SET confirmation_status=?2,confirmation_message_id=?3,
     updated_at=datetime('now') WHERE id=?1`,
  )
    .bind(
      submissionId,
      sent.ok ? "sent" : sent.ambiguous ? "ambiguous" : "rejected",
      sent.ok ? sent.messageId : null,
    )
    .run();
}

function firstStatusError(
  event: Extract<MetaWebhookEvent, { kind: "status" }>,
) {
  const error = event.status.errors?.[0];
  if (!error) return null;
  return {
    code: String(error.code),
    detail: sanitizeMetaDetail(
      error.error_data?.details ?? error.message ?? error.title,
    ),
    fbtraceId: error.fbtrace_id ?? null,
  };
}

function operationalTemplateStatus(event: string): string {
  if (["APPROVED", "REINSTATED", "UNARCHIVED"].includes(event))
    return "APPROVED";
  return event;
}

async function recordFor(event: MetaWebhookEvent): Promise<WebhookEventRecord> {
  if (event.kind === "status") {
    const error = firstStatusError(event);
    return {
      event_kind: "message_status",
      event_key: await sha256(
        [
          event.wabaId,
          event.phoneNumberId,
          event.status.id,
          event.status.status,
        ].join(":"),
      ),
      waba_id: event.wabaId,
      phone_number_id: event.phoneNumberId,
      message_id: event.status.id,
      status: event.status.status,
      error_code: error?.code,
      error_detail: error?.detail,
      fbtrace_id: error?.fbtraceId,
      pricing_model: event.status.pricing?.pricing_model ?? null,
      pricing_type: event.status.pricing?.type ?? null,
      pricing_category: event.status.pricing?.category ?? null,
      pricing_billable: event.status.pricing?.billable ?? null,
      // Sem recipient_id/wa_id: apenas dados técnicos mínimos e já redigidos.
      raw: JSON.stringify({
        timestamp: event.status.timestamp,
        errors: error
          ? [{ code: error.code, detail: error.detail }]
          : undefined,
      }),
    };
  }
  if (event.kind === "inbound_message") {
    return {
      event_kind: "inbound_message",
      event_key: await sha256(
        [event.wabaId, event.phoneNumberId, event.message.id, "inbound"].join(
          ":",
        ),
      ),
      waba_id: event.wabaId,
      phone_number_id: event.phoneNumberId,
      message_id: event.message.id,
      status: "inbound_received",
      // Conteúdo e identidade ficam somente nas tabelas da inbox, com retenção
      // própria. O log técnico guarda apenas tipo e timestamp.
      raw: JSON.stringify({
        type: event.message.type,
        timestamp: event.message.timestamp,
      }),
    };
  }
  if (event.kind === "user_preference") {
    return {
      event_kind: "user_preference",
      event_key: await sha256(
        [
          event.wabaId,
          event.phoneNumberId,
          event.preference.user_id ?? event.preference.wa_id ?? "",
          event.preference.value,
          String(event.preference.timestamp),
        ].join(":"),
      ),
      waba_id: event.wabaId,
      phone_number_id: event.phoneNumberId,
      message_id: null,
      status: `user_preference_${event.preference.value}`,
      raw: JSON.stringify({
        category: event.preference.category,
        value: event.preference.value,
        timestamp: event.preference.timestamp,
      }),
    };
  }
  if (event.kind === "platform_error") {
    const detail = sanitizeMetaDetail(
      event.error.error_data?.details ??
        event.error.message ??
        event.error.title,
    );
    return {
      event_kind: "platform_error",
      event_key: await sha256(
        [
          event.wabaId,
          event.phoneNumberId,
          event.scope,
          event.referenceId ?? "",
          String(event.error.code),
          detail,
        ].join(":"),
      ),
      waba_id: event.wabaId,
      phone_number_id: event.phoneNumberId,
      message_id: event.referenceId ?? null,
      status: "platform_error",
      error_code: String(event.error.code),
      error_detail: detail,
      fbtrace_id: event.error.fbtrace_id ?? null,
      raw: JSON.stringify({
        scope: event.scope,
        code: event.error.code,
        detail,
      }),
    };
  }
  if (event.kind === "platform_event") {
    return {
      event_kind: event.field,
      event_key: await sha256([event.wabaId, event.field, JSON.stringify(event.summary)].join(":")),
      waba_id: event.wabaId,
      phone_number_id: null,
      message_id: null,
      status: `platform_${event.field}`,
      raw: JSON.stringify(event.summary),
    }
  }
  return {
    event_kind: "template_status",
    event_key: await sha256(
      [
        event.wabaId,
        String(event.template.message_template_id),
        event.template.event,
      ].join(":"),
    ),
    waba_id: event.wabaId,
    phone_number_id: null,
    message_id: null,
    status: `template_${event.template.event.toLowerCase()}`,
    raw: JSON.stringify({
      template_id: String(event.template.message_template_id),
      name: event.template.message_template_name,
      language: event.template.message_template_language,
      event: event.template.event,
      reason: event.template.reason ?? null,
    }),
  };
}

export async function handleWebhookBatch(
  events: MetaWebhookEvent[],
  env: Env,
): Promise<void> {
  if (!events.length) return;
  const eventRecords = await Promise.all(events.map(recordFor));
  const statusInbox = statusEventsDb(env.DB);
  await statusInbox.insertMany(eventRecords);

  const changedCampaigns = new Set<string>();
  let contactsChanged = false;
  let templatesChanged = false;
  const changedConversations = new Set<string>();

  for (const [eventIndex, event] of events.entries()) {
    const eventRecord = eventRecords[eventIndex];
    if (event.kind === "platform_error") continue;
    if (event.kind === "platform_event") {
      if (
        event.field === "account_update" &&
        event.summary.event === "VOLUME_BASED_PRICING_TIER_UPDATE"
      ) {
        const updateTime = Number(event.summary.tier_update_time);
        if (
          Number.isFinite(updateTime) &&
          typeof event.summary.region === "string" &&
          typeof event.summary.pricing_category === "string" &&
          typeof event.summary.effective_month === "string" &&
          typeof event.summary.tier === "string"
        ) {
          const [tierFromRaw, tierToRaw] = event.summary.tier.split(":");
          await pricingDb(env.DB).upsertTier({
            wabaId: event.wabaId,
            region: event.summary.region,
            category: event.summary.pricing_category,
            effectiveMonth: event.summary.effective_month,
            tier: event.summary.tier,
            tierFrom: Number.isFinite(Number(tierFromRaw)) ? Number(tierFromRaw) : null,
            tierTo: Number.isFinite(Number(tierToRaw)) ? Number(tierToRaw) : null,
            tierUpdateTime: updateTime,
            eventKey: eventRecord.event_key,
          });
        }
      } else if (event.field === "phone_number_quality_update") {
        // O preflight antes do disparo continua sendo a fonte autoritativa. O
        // webhook registra a mudança assim que a Meta a anuncia para que a UI e
        // a operação tenham evidência mesmo antes da próxima campanha.
        const limit = String(
          event.summary.max_daily_conversations_per_business ??
          event.summary.current_limit ?? "",
        ).toUpperCase();
        if (
          event.summary.event === "THROUGHPUT_UPGRADE" ||
          limit === "TIER_UNLIMITED"
        ) {
          const settings = settingsDb(env.DB);
          await Promise.all([
            settings.set("meta_throughput_webhook_level", "HIGH"),
            settings.set("meta_throughput_webhook_mps", "1000"),
            settings.set("meta_throughput_webhook_at", new Date().toISOString()),
          ]);
        }
      } else if (event.field === "template_category_update") {
        const templateId = String(event.summary.message_template_id ?? event.summary.id ?? "");
        const category = String(event.summary.category ?? "").toUpperCase();
        if (templateId && ["MARKETING", "UTILITY", "AUTHENTICATION"].includes(category)) {
          const template = await env.DB.prepare(
            "SELECT name,language,category FROM templates WHERE meta_id=?1 LIMIT 1",
          ).bind(templateId).first<{ name: string; language: string; category: string }>();
          if (template && template.category !== category) {
            await env.DB.batch([
              env.DB.prepare(
                `UPDATE templates SET category=?2,synced_at=datetime('now') WHERE meta_id=?1`,
              ).bind(templateId, category),
              env.DB.prepare(
                `INSERT INTO campaign_cost_snapshots
                 (id,campaign_id,state,amount,currency,breakdown_json,assumptions_json,source)
                 SELECT lower(hex(randomblob(16))),c.id,'unavailable',NULL,NULL,'[]',?3,?4
                 FROM campaigns c
                 WHERE c.template_name=?1 AND c.template_language=?2
                   AND c.status IN ('draft','scheduled')
                   AND NOT EXISTS (
                     SELECT 1 FROM campaign_cost_snapshots s
                     WHERE s.campaign_id=c.id AND s.source=?4
                   )`,
              ).bind(
                template.name,
                template.language,
                JSON.stringify(["Categoria efetiva alterada pela Meta; recalcule a estimativa"]),
                `template_category_webhook:${eventRecord.event_key}`,
              ),
            ]);
            templatesChanged = true;
          }
        }
      } else if (event.field === "flows") {
        const flowId = String(event.summary.flow_id ?? event.summary.id ?? "");
        const metaStatus = String(event.summary.status ?? "").toUpperCase();
        if (flowId) {
          const localStatus = metaStatus === "PUBLISHED"
            ? "PUBLISHED"
            : metaStatus === "DRAFT"
              ? "DRAFT"
              : ["BLOCKED", "THROTTLED", "DEPRECATED"].includes(metaStatus)
                ? "ACTION_REQUIRED"
                : "IN_REVIEW";
          await env.DB.prepare(
            `UPDATE flows SET meta_status=COALESCE(NULLIF(?2,''),meta_status),
             status=CASE WHEN ?2='' THEN status ELSE ?3 END,
             meta_health_json=?4,meta_last_checked_at=datetime('now'),
             updated_at=datetime('now') WHERE meta_id=?1`,
          ).bind(flowId, metaStatus, localStatus, JSON.stringify(event.summary)).run();
        }
      }
      await statusInbox.markIgnored(eventRecord.event_key);
      continue;
    }
    if (event.kind === "inbound_message") {
      const rawPhone = event.message.phone ?? (
        !event.message.userId && /^\d{5,32}$/.test(event.message.from)
          ? event.message.from
          : undefined
      );
      const phone = rawPhone
        ? normalizePhone(`+${rawPhone}`)
        : null;
      if (rawPhone && !phone)
        throw new Error("Meta enviou telefone inbound inválido");
      if (!phone && !event.message.userId)
        throw new Error("Meta enviou mensagem inbound sem telefone nem BSUID");
      const contact = await contactsDb(env.DB).ensureInboundContact({
        ...(phone ? { phone } : {}),
        waId: rawPhone,
        userId: event.message.userId,
        parentUserId: event.message.parentUserId,
        username: event.message.username,
        profileName: event.message.profileName,
      });
      contactsChanged = true;
      const ingested = await conversationsDb(env.DB).ingestInbound(contact, {
        id: event.message.id,
        phoneNumberId: event.phoneNumberId,
        messageType: event.message.type,
        textBody: event.message.textBody,
        content: event.message.content,
        timestamp: Number(event.message.timestamp),
      });
      changedConversations.add(ingested.conversationId);
      await persistFlowSubmission(env, event.message, contact.id);
      // A mídia é retomável independentemente da deduplicação da mensagem: se
      // o download/R2 falhar, a Queue repete o evento, ingestInbound não duplica
      // a conversa e esta etapa tenta completar apenas o artefato ausente.
      if (
        ["image", "video", "audio", "document", "sticker"].includes(
          event.message.type,
        )
      )
        await persistInboundMedia(
          env,
          ingested.conversationId,
          event.message.id,
          event.message.content,
        );
      if (
        ingested.inserted &&
        event.message.textBody?.trim() &&
        env.INBOX_AUTOMATION_ENABLED === "true"
      ) {
        await env.AUTOMATION_QUEUE.send(
          {
            kind: "inbound_automation",
            conversationId: ingested.conversationId,
            sourceMessageId: event.message.id,
          } satisfies AutomationEvent,
          {
            delaySeconds: await automationDebounceSeconds(
              env.DB,
              ingested.conversationId,
            ),
          },
        );
      }
      continue;
    }
    if (event.kind === "user_preference") {
      const changed = await contactsDb(env.DB).applyUserPreference(
        {
          waId: event.preference.wa_id,
          userId: event.preference.user_id,
        },
        event.preference.value,
      );
      contactsChanged ||= changed > 0;
      continue;
    }
    if (event.kind === "template_status") {
      const changed = await templatesDb(env.DB).setStatusFromWebhook({
        name: event.template.message_template_name,
        language: event.template.message_template_language,
        metaId: String(event.template.message_template_id),
        status: operationalTemplateStatus(event.template.event),
        category: event.template.message_template_category,
      });
      templatesChanged ||= changed > 0;
      continue;
    }

    const error = firstStatusError(event);
    // Estados intermediários de qualidade/aceite não são entrega. Persistimos
    // o evento para auditoria, mas não os gravamos nos estados legados da inbox.
    if (
      event.status.status === 'held_for_quality_assessment' ||
      event.status.status === 'paused'
    ) {
      await statusInbox.markIgnored(eventRecord.event_key);
      continue;
    }
    const internalStatus = event.status.status === 'accepted' ? 'sent' : event.status.status;
    const conversationUpdate = await conversationSendsDb(env.DB).applyStatus({
      messageId: event.status.id,
      opaqueId: event.status.biz_opaque_callback_data,
      phoneNumberId: event.phoneNumberId,
      status: internalStatus,
      timestamp: Number(event.status.timestamp),
      errorCode: error?.code,
      errorDetail: error?.detail,
    });
    if (conversationUpdate)
      changedConversations.add(conversationUpdate.conversationId);

    if (!["delivered", "read", "failed"].includes(event.status.status)) {
      await statusInbox.markIgnored(eventRecord.event_key);
      continue;
    }
    if (error?.code === "131050") {
      const campaignTarget = await env.DB.prepare(
        "SELECT contact_id FROM campaign_contacts WHERE message_id = ?1 LIMIT 1",
      )
        .bind(event.status.id)
        .first<{ contact_id: string }>();
      const contactId =
        conversationUpdate?.contactId ?? campaignTarget?.contact_id;
      if (contactId) {
        contactsChanged ||=
          (await contactsDb(env.DB).setStatus([contactId], "opt_out")) > 0;
      }
    }
    const updated = await campaignContactsDb(env.DB).updateByMessageId(
      event.status.id,
      event.status.status,
      error ? { code: error.code, detail: error.detail } : undefined,
    );
    const statusContactId = updated?.contact_id ?? conversationUpdate?.contactId;
    if (statusContactId && event.status.recipient_user_id)
      await contactsDb(env.DB).setUserId(
        statusContactId,
        event.status.recipient_user_id,
      );
    if (event.status.pricing) {
      const destination = event.status.recipient_id
        ? countryFromE164(event.status.recipient_id)
        : null;
      const pricing = pricingDb(env.DB);
      const cards = destination
        ? await pricing.activeRateCards(new Date(Number(event.status.timestamp) * 1000).toISOString())
        : [];
      const currency = destination
        ? cards.find((card) =>
            card.countryIso === destination.countryIso || card.market === destination.market,
          )?.currency ?? null
        : null;
      await pricing.recordMessagePricing({
        messageId: event.status.id,
        campaignId: updated?.campaign_id,
        contactId: updated?.contact_id,
        pricingModel: event.status.pricing.pricing_model,
        pricingType: event.status.pricing.type,
        pricingCategory: event.status.pricing.category,
        countryIso: destination?.countryIso,
        currency,
        eventKey: eventRecord.event_key,
      });
      if (updated?.campaign_id)
        await pricing.reconcileCampaignCost(updated.campaign_id);
    }
    if (!updated) {
      await statusInbox.markPending(
        eventRecord.event_key,
        "campaign_contact_not_found",
      );
      continue;
    }
    await statusInbox.markApplied(eventRecord.event_key, {
      campaignId: updated.campaign_id,
      contactId: updated.contact_id,
    });
    if (!updated.applied) continue;
    changedCampaigns.add(updated.campaign_id);

    if (error?.code === "132015" || error?.code === "132016") {
      const campaign = await env.DB.prepare(
        "SELECT template_name, template_language FROM campaigns WHERE id = ?1",
      )
        .bind(updated.campaign_id)
        .first<{ template_name: string; template_language: string }>();
      if (campaign) {
        templatesChanged ||=
          (await templatesDb(env.DB).setStatusFromWebhook({
            name: campaign.template_name,
            language: campaign.template_language,
            status: error.code === "132015" ? "PAUSED" : "DISABLED",
          })) > 0;
      }
    }
  }

  for (const campaignId of changedCampaigns) {
    await broadcastToHub(env, {
      type: "invalidate",
      keys: [["campaigns"], ["campaign", campaignId], ["dashboard"]],
    });
  }
  if (contactsChanged)
    await broadcastToHub(env, {
      type: "invalidate",
      keys: [["contacts"], ["dashboard"]],
    });
  if (templatesChanged)
    await broadcastToHub(env, {
      type: "invalidate",
      keys: [["templates"], ["campaigns"]],
    });
  for (const conversationId of changedConversations) {
    await broadcastToHub(env, {
      type: "invalidate",
      keys: [
        ["conversations"],
        ["conversations", "detail", conversationId],
        ["conversations", "messages", conversationId],
        ["conversations", "ai", conversationId],
      ],
    });
  }
}
