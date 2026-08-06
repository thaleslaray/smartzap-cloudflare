const TERMINAL_SUCCESS = new Set(["delivered", "read"]);
const STATUS_PRIORITY = new Map([
  ["read", 5],
  ["delivered", 4],
  ["failed", 3],
  ["sent", 2],
  ["accepted", 1],
]);

function truthy(value) {
  return value === true || value === 1;
}

export function evaluateMetaBsuidHomologation(input) {
  const official = input?.official ?? {};
  const outbound = input?.outbound ?? {};
  const cleanup = input?.cleanup ?? {};

  const checks = {
    officialWebhookScenario:
      truthy(official.observed) &&
      truthy(official.usernamePresent) &&
      truthy(official.userIdPresent),
    phoneOmitted:
      truthy(official.phoneOmitted) &&
      String(official.storedPhoneKind ?? "") === "bsuid-placeholder",
    bsuidPersisted:
      truthy(official.userIdPresent) && Number(official.contactRows) === 1,
    conversationAssociated:
      Number(official.conversationRows) === 1 &&
      Number(official.inboundMessageRows) === 1 &&
      Number(official.inboundEventRows) === 1,
    officialReplyAccepted:
      outbound.recipientMode === "bsuid" &&
      truthy(outbound.phoneFieldOmitted) &&
      Number(outbound.providerCallCount) === 1 &&
      truthy(outbound.accepted) &&
      Boolean(outbound.messageId),
    statusProgressed:
      TERMINAL_SUCCESS.has(String(outbound.status ?? "").toLowerCase()),
    idempotencyConfirmed:
      truthy(outbound.operationalContractPassed) &&
      Number(outbound.providerCallCount) === 1 &&
      Number(outbound.ledgerRows) === 1 &&
      Number(outbound.pilotRunRows) === 1,
    cleanupPassed:
      truthy(cleanup.callbackRestored) &&
      Number(cleanup.officialContactRows) === 0 &&
      Number(cleanup.officialConversationRows) === 0 &&
      Number(cleanup.officialInboundMessageRows) === 0 &&
      Number(cleanup.outboundStatusRows) === 0 &&
      Number(cleanup.pilotRunActiveRows) === 0 &&
      Number(cleanup.pilotLedgerRetainedRows) === 1,
  };

  const labels = {
    officialWebhookScenario: "cenário oficial sem telefone não foi observado",
    phoneOmitted: "a omissão real do telefone não foi comprovada",
    bsuidPersisted: "o BSUID não foi persistido de forma única",
    conversationAssociated: "Inbox/conversa inbound não foi associada de forma única",
    officialReplyAccepted: "o envio oficial estritamente por BSUID não foi aceito",
    statusProgressed: "o envio não chegou a delivered/read",
    idempotencyConfirmed: "o replay idempotente não foi comprovado",
    cleanupPassed: "callback ou artefatos de homologação não foram limpos",
  };
  const issues = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([key]) => labels[key]);

  return {
    status: issues.length ? "failed" : "passed",
    checks,
    issues,
  };
}

export function selectBestMetaStatusEvent(events) {
  return [...(Array.isArray(events) ? events : [])]
    .filter((event) => String(event?.status ?? "").trim())
    .sort((left, right) => {
      const priority =
        (STATUS_PRIORITY.get(String(right.status).toLowerCase()) ?? 0) -
        (STATUS_PRIORITY.get(String(left.status).toLowerCase()) ?? 0);
      if (priority) return priority;
      return String(right.received_at ?? "").localeCompare(
        String(left.received_at ?? ""),
      );
    })[0] ?? null;
}

export function isOfficialUsernameOnlyCandidate(contact, preparedAt) {
  const rawCreatedAt = String(contact?.created_at ?? "");
  const createdAt = Date.parse(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawCreatedAt)
      ? `${rawCreatedAt.replace(" ", "T")}Z`
      : rawCreatedAt,
  );
  const threshold = Date.parse(String(preparedAt ?? ""));
  return Boolean(
    contact?.id &&
    Number.isFinite(createdAt) &&
    Number.isFinite(threshold) &&
    createdAt >= threshold &&
    String(contact?.phone ?? "").startsWith("bsuid:") &&
    String(contact?.user_id ?? "").trim() &&
    String(contact?.username ?? "").trim(),
  );
}

export function buildStrictBsuidTemplatePayload(input) {
  const recipient = String(input?.recipient ?? "").trim();
  const templateName = String(input?.templateName ?? "").trim();
  const language = String(input?.language ?? "").trim();
  const opaqueId = String(input?.opaqueId ?? "").trim();
  if (
    recipient.length < 6 ||
    recipient.length > 512 ||
    recipient.startsWith("+") ||
    recipient.startsWith("bsuid:") ||
    /\s/.test(recipient)
  )
    throw new Error("BSUID inválido para homologação.");
  if (!/^[a-z0-9_]{1,512}$/.test(templateName))
    throw new Error("Template Meta inválido para homologação.");
  if (!/^[a-z]{2}_[A-Z]{2}$/.test(language))
    throw new Error("Idioma Meta inválido para homologação.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(opaqueId))
    throw new Error("Identificador opaco inválido para homologação.");
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    recipient,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
    },
    biz_opaque_callback_data: opaqueId,
  };
}

export function maskPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 8
    ? `+${digits.slice(0, 4)} *****-${digits.slice(-4)}`
    : "[TELEFONE_MASCARADO]";
}
