import { normalizePhone } from "./phone";

export type ContactRecipient =
  | string
  | { userId?: string; parentUserId?: string };

/**
 * Prefere telefone quando a Meta ainda o fornece. Para contatos username-only,
 * usa BSUID (ou parent BSUID) no campo `recipient` da Messages API.
 */
export function resolveContactRecipient(input: {
  phone?: string | null;
  userId?: string | null;
  parentUserId?: string | null;
}): ContactRecipient | null {
  const phone = input.phone && !input.phone.startsWith("bsuid:")
    ? normalizePhone(input.phone)
    : null;
  if (phone) return phone;
  if (input.userId || input.parentUserId)
    return {
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.parentUserId ? { parentUserId: input.parentUserId } : {}),
    };
  return null;
}

export function recipientAuditKey(recipient: ContactRecipient): string {
  return typeof recipient === "string"
    ? recipient
    : recipient.userId ?? recipient.parentUserId ?? "";
}

