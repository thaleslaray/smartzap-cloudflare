export function selectMetaCanaryRecipients(recipients, sendCount) {
  if (!Array.isArray(recipients) || recipients.length === 0)
    throw new Error("A allowlist do canário está vazia.");
  if (!Number.isInteger(sendCount) || sendCount < 1 || sendCount > recipients.length)
    throw new Error("O número de envios excede os destinatários autorizados.");
  return recipients.slice(0, sendCount);
}

export function assertExistingMetaCanaryContact(contact, maskedPhone) {
  if (!contact) return;
  if (contact.status !== "opt_in")
    throw new Error(
      `Stop-the-line: ${maskedPhone} existe sem opt-in comprovado.`,
    );
}
