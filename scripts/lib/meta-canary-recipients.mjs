export function selectMetaCanaryRecipients(recipients, sendCount) {
  if (!Array.isArray(recipients) || recipients.length === 0)
    throw new Error("A allowlist do canário está vazia.");
  if (!Number.isInteger(sendCount) || sendCount < 1 || sendCount > recipients.length)
    throw new Error("O número de envios excede os destinatários autorizados.");
  return recipients.slice(0, sendCount);
}

export function resolveExistingMetaCanaryContact(
  contact,
  maskedPhone,
  temporaryOptInAuthorized,
) {
  if (!contact)
    return { temporaryOptInRequired: false, originalStatus: null };
  if (contact.status === "opt_in")
    return { temporaryOptInRequired: false, originalStatus: "opt_in" };
  if (contact.status === "suppressed")
    throw new Error(
      `Stop-the-line: ${maskedPhone} está suprimido e não pode participar do canário.`,
    );
  if (!temporaryOptInAuthorized)
    throw new Error(
      `Stop-the-line: ${maskedPhone} existe sem opt-in comprovado. Defina QA_META_TEMPORARY_OPT_IN=1 somente após autorização explícita do titular.`,
    );
  if (!["unknown", "opt_out"].includes(contact.status))
    throw new Error(
      `Stop-the-line: ${maskedPhone} possui status de consentimento desconhecido pelo executor.`,
    );
  return {
    temporaryOptInRequired: true,
    originalStatus: contact.status,
  };
}

export function metaCanaryStatusRestorationSteps(originalStatus) {
  if (originalStatus === "opt_in") return [];
  if (originalStatus === "opt_out") return ["opt_out"];
  if (originalStatus === "unknown") return ["opt_out", "unknown"];
  throw new Error("Status original não pode ser restaurado com segurança.");
}
