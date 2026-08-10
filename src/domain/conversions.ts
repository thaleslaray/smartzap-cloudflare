import { z } from "zod";

export const CONVERSION_EVENT_NAMES = [
  "LeadSubmitted",
  "QualifiedLead",
  "Purchase",
] as const;

export type ConversionEventName = (typeof CONVERSION_EVENT_NAMES)[number];

export const ConversionEventInputSchema = z
  .object({
    requestKey: z.string().uuid(),
    attributionId: z.string().uuid(),
    eventName: z.enum(CONVERSION_EVENT_NAMES),
    eventTime: z.number().int().nonnegative().optional(),
    businessObjectType: z.enum(["lead", "opportunity", "order"]),
    businessObjectId: z.string().trim().min(1).max(256),
    correctionOf: z.string().uuid().optional(),
    value: z.number().finite().nonnegative().max(100_000_000).optional(),
    currency: z.string().trim().regex(/^[A-Za-z]{3}$/).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.eventName === "Purchase") {
      if (value.value === undefined)
        ctx.addIssue({ code: "custom", path: ["value"], message: "valor da compra é obrigatório" });
      if (!value.currency)
        ctx.addIssue({ code: "custom", path: ["currency"], message: "moeda da compra é obrigatória" });
      if (value.businessObjectType !== "order")
        ctx.addIssue({ code: "custom", path: ["businessObjectType"], message: "compra exige objeto do tipo pedido" });
    } else {
      if (value.value !== undefined || value.currency)
        ctx.addIssue({ code: "custom", path: ["value"], message: "valor e moeda são exclusivos de compra" });
      if (value.eventName === "LeadSubmitted" && value.businessObjectType !== "lead")
        ctx.addIssue({ code: "custom", path: ["businessObjectType"], message: "lead enviado exige objeto do tipo lead" });
      if (value.eventName === "QualifiedLead" && !["lead", "opportunity"].includes(value.businessObjectType))
        ctx.addIssue({ code: "custom", path: ["businessObjectType"], message: "lead qualificado exige lead ou oportunidade" });
    }
  });

export type ConversionEventInput = z.infer<typeof ConversionEventInputSchema>;

export const MAX_CONVERSION_AGE_SECONDS = 7 * 24 * 60 * 60;
export const MAX_CONVERSION_FUTURE_SECONDS = 5 * 60;

export function assertConversionTime(eventTime: number, now = Math.floor(Date.now() / 1000)) {
  if (!Number.isSafeInteger(eventTime) || eventTime < 0)
    throw new Error("horário da conversão inválido");
  if (eventTime < now - MAX_CONVERSION_AGE_SECONDS)
    throw new Error("a Meta não aceita conversões com mais de sete dias");
  if (eventTime > now + MAX_CONVERSION_FUTURE_SECONDS)
    throw new Error("horário da conversão está no futuro");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function conversionIdentity(input: {
  conversationId: string;
  eventName: ConversionEventName;
  businessObjectType: string;
  businessObjectId: string;
  correctionOf?: string;
}) {
  const hash = await sha256Hex([
    input.conversationId,
    input.eventName,
    input.businessObjectType,
    input.businessObjectId,
    input.correctionOf ?? "original",
  ].join("\u001f"));
  return {
    dedupeKey: hash,
    eventId: `sz_${hash.slice(0, 56)}`,
  };
}

export function toMinorUnits(value: number | undefined): number | null {
  if (value === undefined) return null;
  const minor = Math.round((value + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(minor) || minor < 0)
    throw new Error("valor da conversão inválido");
  return minor;
}

/** Remove query/hash para não persistir identificadores adicionais do anúncio. */
export function minimizeReferralUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || value.length > 4096) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    return `${url.origin}${url.pathname}`.slice(0, 2048);
  } catch {
    return undefined;
  }
}

export function maskedClickId(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
