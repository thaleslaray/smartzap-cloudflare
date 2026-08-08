import { conversionsDb, type ClaimedConversion } from "../db/conversions";
import { settingsDb } from "../db/settings";
import { assertConversionTime } from "../domain/conversions";
import { redactOperationalDetail } from "../domain/redaction";
import { broadcastToHub } from "../api/realtime";
import { getCredentials } from "../whatsapp/credentials";
import { businessMessagingCapi } from "../whatsapp/conversions";

export type ConversionQueueEvent = {
  kind: "conversion_delivery";
  eventId: string;
};

export type ConversionDeadLetterEvent = {
  kind: "conversion_dead_letter";
  eventId: string;
  attempts: number;
  failedAt: number;
};

export type ConversionProcessingResult =
  | { action: "ack" }
  | { action: "retry"; delaySeconds: number };

const MAX_QUEUE_ATTEMPTS = 5;

async function configuration(env: Env) {
  const settings = settingsDb(env.DB);
  const [enabled, datasetId, verifiedWabaId, canaryEventId] = await Promise.all([
    settings.get("capi_enabled"),
    settings.get("capi_dataset_id"),
    settings.get("capi_dataset_verified_waba_id"),
    settings.get("capi_canary_event_id"),
  ]);
  return {
    enabled: enabled === "true",
    datasetId,
    verifiedWabaId,
    canaryEventId,
  };
}

function retryDelay(attempts: number, requested?: number) {
  if (requested !== undefined)
    return Math.max(5, Math.min(3600, Math.ceil(requested)));
  return Math.min(3600, 10 * 2 ** Math.max(0, attempts - 1));
}

async function deferConfiguration(
  db: ReturnType<typeof conversionsDb>,
  claim: ClaimedConversion,
  detail: string,
) {
  await db.finishClaim(claim, {
    outcome: "temporary_failed",
    errorCode: "configuration_unavailable",
    errorDetail: detail,
    nextAttemptAt: Math.floor(Date.now() / 1000) + 15 * 60,
  });
}

export async function handleConversionQueueMessage(
  event: ConversionQueueEvent,
  env: Env,
  queueAttempts: number,
): Promise<ConversionProcessingResult> {
  if (event.kind !== "conversion_delivery" || !/^[0-9a-f-]{36}$/i.test(event.eventId))
    return { action: "ack" };
  const config = await configuration(env);
  // Desativar a integração não perde fatos já registrados. O cron somente volta
  // a enfileirá-los quando o operador reativar uma configuração verificada.
  const isCanary = config.canaryEventId === event.eventId;
  if (!config.enabled && !isCanary) return { action: "ack" };

  const db = conversionsDb(env.DB);
  const claim = await db.claim(event.eventId);
  if (!claim) return { action: "ack" };
  try {
    assertConversionTime(claim.event_time);
  } catch (error) {
    await db.finishClaim(claim, {
      outcome: "permanent_failed",
      errorCode: "event_time_invalid",
      errorDetail: error instanceof Error ? error.message : "horário inválido",
    });
    return { action: "ack" };
  }

  if (
    !config.datasetId ||
    config.datasetId !== claim.dataset_id ||
    config.verifiedWabaId !== claim.waba_id
  ) {
    await deferConfiguration(db, claim, "Dataset não está verificado para a WABA do evento");
    return { action: "ack" };
  }
  const credentials = await getCredentials(env);
  if (!credentials || credentials.wabaId !== claim.waba_id) {
    await deferConfiguration(db, claim, "credenciais da WABA indisponíveis");
    return { action: "ack" };
  }

  const result = await businessMessagingCapi({
    token: credentials.token,
    graphVersion: credentials.graphVersion,
  }).sendEvent({
    datasetId: claim.dataset_id,
    eventId: claim.event_id,
    eventName: claim.event_name,
    eventTime: claim.event_time,
    wabaId: claim.waba_id,
    ctwaClid: claim.ctwa_clid,
    valueMinor: claim.value_minor,
    currency: claim.currency,
  });

  if (result.outcome === "accepted") {
    await db.finishClaim(claim, {
      outcome: "accepted",
      httpStatus: result.httpStatus,
      eventsReceived: result.eventsReceived,
      fbtraceId: result.fbtraceId,
    });
    if (isCanary) {
      const settings = settingsDb(env.DB);
      await Promise.all([
        settings.set("capi_canary_accepted_at", new Date().toISOString()),
        settings.set("capi_canary_dataset_id", claim.dataset_id),
        settings.set("capi_canary_waba_id", claim.waba_id),
      ]);
    }
    await broadcastToHub(env, {
      type: "invalidate",
      keys: [
        ["conversions"],
        ["conversions", "conversation", claim.conversation_id],
        ["conversations", "detail", claim.conversation_id],
      ],
    });
    return { action: "ack" };
  }

  if (result.outcome === "unknown") {
    await db.finishClaim(claim, {
      outcome: "unknown",
      httpStatus: result.httpStatus,
      errorCode: result.code,
      errorSubcode: result.subcode,
      errorDetail: result.detail,
      fbtraceId: result.fbtraceId,
    });
    return { action: "ack" };
  }

  if (result.outcome === "permanent_failed") {
    await db.finishClaim(claim, {
      outcome: "permanent_failed",
      httpStatus: result.httpStatus,
      errorCode: result.code,
      errorSubcode: result.subcode,
      errorDetail: result.detail,
      fbtraceId: result.fbtraceId,
    });
    return { action: "ack" };
  }

  if (queueAttempts >= MAX_QUEUE_ATTEMPTS) {
    await db.finishClaim(claim, {
      outcome: "dead_letter",
      httpStatus: result.httpStatus,
      errorCode: result.code,
      errorSubcode: result.subcode,
      errorDetail: result.detail,
      fbtraceId: result.fbtraceId,
    });
    await env.CAPI_DLQ.send({
      kind: "conversion_dead_letter",
      eventId: claim.id,
      attempts: queueAttempts,
      failedAt: Math.floor(Date.now() / 1000),
    } satisfies ConversionDeadLetterEvent);
    return { action: "ack" };
  }

  const delaySeconds = retryDelay(queueAttempts, result.retryAfterSeconds);
  await db.finishClaim(claim, {
    outcome: "temporary_failed",
    httpStatus: result.httpStatus,
    errorCode: result.code,
    errorSubcode: result.subcode,
    errorDetail: result.detail,
    fbtraceId: result.fbtraceId,
    nextAttemptAt: Math.floor(Date.now() / 1000) + delaySeconds,
  });
  return { action: "retry", delaySeconds };
}

export async function sweepConversionOutbox(env: Env) {
  const config = await configuration(env);
  if ((!config.enabled && !config.canaryEventId) || !config.datasetId || !config.verifiedWabaId)
    return { queued: 0, skipped: true };
  const rows = await conversionsDb(env.DB).due(
    100,
    config.enabled ? null : config.canaryEventId,
  );
  if (!rows.length) return { queued: 0, skipped: false };
  await env.CAPI_QUEUE.sendBatch(rows.map((row) => ({
    body: {
      kind: "conversion_delivery",
      eventId: row.event_id,
    } satisfies ConversionQueueEvent,
  })));
  return { queued: rows.length, skipped: false };
}

export function logConversionQueueFailure(error: unknown, attempts: number) {
  console.error(JSON.stringify({
    level: "error",
    msg: "processamento interno da Queue de conversões falhou",
    attempts,
    error: redactOperationalDetail(error instanceof Error ? error.message : error),
  }));
}
