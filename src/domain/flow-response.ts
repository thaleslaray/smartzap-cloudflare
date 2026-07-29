import { contactsDb, type CustomFieldDef, type CustomValue } from "../db/contacts";

export type FlowMapping = {
  contact?: { nameField?: string; emailField?: string };
  contactFields?: { name?: string; email?: string };
  customFields?: Record<string, string>;
};

export type FlowConfirmation = {
  enabled?: boolean;
  title?: string;
  footer?: string;
  fields?: string[];
  labels?: Record<string, string>;
};

const technicalKeys = new Set([
  "flow_id",
  "flow_token",
  "flow_name",
  "event_id",
  "success",
  "message",
  "send_confirmation",
  "__send_confirmation",
  "confirmation_title",
  "confirmation_footer",
  "confirmation_fields",
  "confirmation_labels",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function valueForField(response: Record<string, unknown>, field?: string) {
  if (!field) return undefined;
  return response[field];
}

function valueForCustomField(field: CustomFieldDef, value: unknown): CustomValue | null {
  if (field.type === "text") {
    if (typeof value === "string") return value.slice(0, 1024);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map(String).join(", ").slice(0, 1024);
    return null;
  }
  if (field.type === "number") {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (field.type === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1" || value === 1) return true;
    if (value === "false" || value === "0" || value === 0) return false;
    return null;
  }
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

export async function applyFlowMappingToContact(input: {
  db: D1Database;
  contactId: string;
  response: unknown;
  mapping: unknown;
}): Promise<Record<string, unknown> | null> {
  if (!isObject(input.response) || !isObject(input.mapping)) return null;
  const mapping = input.mapping as FlowMapping;
  const contactMapping = isObject(mapping.contact) ? mapping.contact : {};
  const legacyMapping = isObject(mapping.contactFields) ? mapping.contactFields : {};
  const name = nonEmptyString(
    valueForField(input.response, contactMapping.nameField || legacyMapping.name),
  );
  const email = nonEmptyString(
    valueForField(input.response, contactMapping.emailField || legacyMapping.email),
  );
  const mapped: Record<string, unknown> = {};
  if (name || email) {
    await input.db
      .prepare(
        `UPDATE contacts SET name=COALESCE(?2,name),email=COALESCE(?3,email),
         updated_at=datetime('now') WHERE id=?1`,
      )
      .bind(input.contactId, name, email)
      .run();
    if (name) mapped.name = name;
    if (email) mapped.email = email;
  }

  if (isObject(mapping.customFields)) {
    const definitions = await contactsDb(input.db).listCustomFieldDefs();
    const byId = new Map(definitions.map((field) => [field.id, field]));
    const byKey = new Map(definitions.map((field) => [field.key, field]));
    const customFields: Record<string, unknown> = {};
    for (const [fieldRef, responseField] of Object.entries(mapping.customFields)) {
      if (typeof responseField !== "string") continue;
      const field = byId.get(fieldRef) ?? byKey.get(fieldRef);
      if (!field) continue;
      const rawValue = valueForField(input.response, responseField);
      if (rawValue === undefined) continue;
      const value = valueForCustomField(field, rawValue);
      if (value === null) continue;
      await contactsDb(input.db).setCustomValue(input.contactId, field.id, value);
      customFields[field.key] = value;
    }
    if (Object.keys(customFields).length) mapped.custom_fields = customFields;
  }
  if (!Object.keys(mapped).length) return null;
  await contactsDb(input.db).recordHistory(
    input.contactId,
    "flow_response_mapped",
    "Resposta de MiniApp aplicada ao contato",
    { fields: Object.keys(mapped) },
  );
  return mapped;
}

function displayValue(value: unknown, options?: Record<string, string>): string {
  if (Array.isArray(value)) return value.map((item) => displayValue(item, options)).join(", ");
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "string" && options?.[value]) return options[value];
  if (isObject(value)) return JSON.stringify(value);
  return String(value);
}

export function buildFlowConfirmation(input: {
  response: unknown;
  confirmation: unknown;
  fieldLabels?: Record<string, string>;
  optionLabels?: Record<string, Record<string, string>>;
}): string | null {
  if (!isObject(input.response)) return null;
  const response = input.response;
  const confirmation = isObject(input.confirmation)
    ? (input.confirmation as FlowConfirmation)
    : {};
  const responseFlag = response.send_confirmation ?? response.__send_confirmation;
  if (confirmation.enabled === false || responseFlag === false || responseFlag === "false")
    return null;
  const selected = Array.isArray(confirmation.fields)
    ? new Set(confirmation.fields.filter((item) => typeof item === "string"))
    : null;
  const labels = isObject(confirmation.labels) ? confirmation.labels : {};
  const lines = Object.entries(response)
    .filter(([key, value]) => {
      if (technicalKeys.has(key) || (selected && !selected.has(key))) return false;
      return value !== null && value !== undefined && value !== "";
    })
    .map(([key, value]) => {
      const label = nonEmptyString(labels[key])
        ?? input.fieldLabels?.[key]
        ?? key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
      return `${label}: ${displayValue(value, input.optionLabels?.[key])}`;
    });
  const title = nonEmptyString(confirmation.title)
    ?? nonEmptyString(response.confirmation_title)
    ?? "Resposta registrada ✅";
  const footer = nonEmptyString(confirmation.footer)
    ?? nonEmptyString(response.confirmation_footer)
    ?? "Qualquer ajuste, responda esta mensagem.";
  return [title, lines.length ? "" : null, ...lines, footer ? "" : null, footer]
    .filter((line) => line !== null)
    .join("\n")
    .slice(0, 4096);
}

export function flowFieldCatalog(definition: unknown) {
  const labels: Record<string, string> = {};
  const options: Record<string, Record<string, string>> = {};
  if (!isObject(definition) || !Array.isArray(definition.screens))
    return { labels, options };
  for (const screen of definition.screens) {
    if (!isObject(screen) || !Array.isArray(screen.blocks)) continue;
    for (const block of screen.blocks) {
      if (!isObject(block) || typeof block.name !== "string") continue;
      labels[block.name] = nonEmptyString(block.label) ?? block.name;
      if (Array.isArray(block.options)) {
        options[block.name] = Object.fromEntries(
          block.options
            .filter(isObject)
            .map((option) => [String(option.id ?? ""), String(option.title ?? option.id ?? "")])
            .filter(([id]) => id),
        );
      }
    }
  }
  return { labels, options };
}
