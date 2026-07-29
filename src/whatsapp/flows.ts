import { redactOperationalDetail } from "../domain/redaction";
import { dynamicBookingFlowJson } from "./dynamic-booking";
import { validateFlowJson, type FlowValidationIssue } from "../domain/flow-validation";

const GRAPH_ORIGIN = "https://graph.facebook.com";
const META_TIMEOUT_MS = 20_000;
const META_INPUT_COMPONENTS = new Set([
  "TextInput", "TextArea", "Dropdown", "RadioButtonsGroup",
  "CheckboxGroup", "CalendarPicker", "DatePicker", "OptIn",
]);
const META_TEXT_LIMITS: Record<string, number> = {
  TextHeading: 80,
  TextSubheading: 80,
  TextBody: 4096,
  TextCaption: 409,
};
const META_LABEL_LIMITS: Record<string, number> = {
  TextInput: 20,
  TextArea: 20,
  Dropdown: 20,
  RadioButtonsGroup: 30,
  CheckboxGroup: 30,
  CalendarPicker: 40,
  DatePicker: 40,
};

type LocalScreen = {
  id?: unknown;
  title?: unknown;
  final?: unknown;
  text?: unknown;
  buttonText?: unknown;
  next?: unknown;
  blocks?: unknown;
};

type LocalBranchRule = {
  field: string;
  op: string;
  value: unknown;
  next: string | null;
};

export type MetaFlowDetails = {
  id: string;
  status: string | null;
  validationErrors: unknown;
  healthStatus: unknown;
  endpointUri: string | null;
  dataApiVersion: string | null;
  applicationId: string | null;
};

export class MetaFlowApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
    this.name = "MetaFlowApiError";
  }
}

function graphBase(version: string): string {
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("versão Graph inválida");
  return `${GRAPH_ORIGIN}/${version}`;
}

async function graphRequest(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(META_TIMEOUT_MS),
  });
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") data = parsed;
  } catch {
    // A resposta bruta nunca é devolvida: pode conter dados operacionais.
  }
  if (!response.ok) {
    const graphError =
      data.error && typeof data.error === "object"
        ? (data.error as Record<string, unknown>)
        : data;
    const detail = redactOperationalDetail(
      graphError.error_user_msg ?? graphError.message ?? "Falha na API da Meta",
    );
    throw new MetaFlowApiError(
      detail,
      response.status,
      typeof graphError.code === "number" ? graphError.code : undefined,
      typeof graphError.error_subcode === "number"
        ? graphError.error_subcode
        : undefined,
    );
  }
  return data;
}

function cleanText(value: unknown, fallback: string, max: number): string {
  const normalized = String(value ?? "").trim();
  return (normalized || fallback).slice(0, max);
}

function metaScreenId(index: number): string {
  let value = index;
  let suffix = "";
  do {
    suffix = String.fromCharCode(65 + (value % 26)) + suffix;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return `SCREEN_${suffix}`;
}

function renderMetaBlock(value: unknown, index: number): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const block = value as Record<string, unknown>;
  const type = String(block.type ?? "");
  if (["TextHeading", "TextSubheading", "TextBody", "TextCaption"].includes(type))
    return { type, text: cleanText(block.text, "Texto", META_TEXT_LIMITS[type]) };
  if (type === "OptIn")
    return {
      type,
      name: cleanText(block.name, `optin_${index + 1}`, 48),
      label: cleanText(block.label ?? block.text, "Aceito receber mensagens.", 120),
      ...(block.required === true ? { required: true } : {}),
    };
  if (
    ![
      "TextInput",
      "TextArea",
      "Dropdown",
      "RadioButtonsGroup",
      "CheckboxGroup",
      "CalendarPicker",
      "DatePicker",
    ].includes(type)
  )
    return null;
  const rendered: Record<string, unknown> = {
    type,
    name: cleanText(block.name, `campo_${index + 1}`, 48),
    label: cleanText(block.label, "Preencha", META_LABEL_LIMITS[type] ?? 20),
    required: block.required === true,
  };
  if (type === "TextInput" && typeof block.inputType === "string")
    rendered["input-type"] = block.inputType;
  if (type === "CalendarPicker") rendered.mode = "single";
  if (["Dropdown", "RadioButtonsGroup", "CheckboxGroup"].includes(type)) {
    const maxOptions = type === "Dropdown" ? 200 : 20;
    const source = Array.isArray(block.options)
      ? block.options
          .filter((option) => option && typeof option === "object")
          .map((option, optionIndex) => {
            const item = option as Record<string, unknown>;
            return {
              id: cleanText(item.id, `opcao_${optionIndex + 1}`, 48),
              title: cleanText(item.title, `Opção ${optionIndex + 1}`, 30),
            };
          })
          .slice(0, maxOptions)
      : [];
    rendered["data-source"] = source.length
      ? source
      : [
          { id: "opcao_1", title: "Opção 1" },
          { id: "opcao_2", title: "Opção 2" },
        ];
  }
  return rendered;
}

/** Converte o editor simplificado no contrato estático oficial do Flow JSON. */
export function buildMetaFlowJson(
  definition: unknown,
  dataApiVersion: "3.0" | "4.0" = "3.0",
): Record<string, unknown> {
  const source =
    definition && typeof definition === "object"
      ? (definition as Record<string, unknown>)
      : {};
  if (source.dynamicBooking === true) return dynamicBookingFlowJson(dataApiVersion);
  const screens = Array.isArray(source.screens)
    ? (source.screens as LocalScreen[])
    : [];
  if (screens.length === 0) throw new Error("O MiniApp precisa ter ao menos uma tela");

  // IDs de Flow JSON aceitam somente letras e underscore (sem dígitos).
  const ids = screens.map((_, index) => metaScreenId(index));
  const localIds = new Map(
    screens.map((screen, index) => [String(screen.id ?? ""), ids[index]]),
  );
  const rawBranches =
    source.branchesByScreen && typeof source.branchesByScreen === "object"
      ? (source.branchesByScreen as Record<string, unknown>)
      : {};
  const branchesByScreen = new Map<string, LocalBranchRule[]>();
  for (const [localScreenId, value] of Object.entries(rawBranches)) {
    if (!Array.isArray(value)) continue;
    branchesByScreen.set(
      localScreenId,
      value
        .filter((rule) => rule && typeof rule === "object")
        .map((rule) => rule as Record<string, unknown>)
        .filter(
          (rule) =>
            typeof rule.field === "string" &&
            [
              "is_filled",
              "is_empty",
              "equals",
              "contains",
              "gt",
              "lt",
              "is_true",
              "is_false",
            ].includes(String(rule.op)),
        )
        .map((rule) => ({
          field: cleanText(rule.field, "", 48),
          op: String(rule.op),
          value: rule.value ?? "",
          next: typeof rule.next === "string" ? rule.next : null,
        })),
    );
  }
  const hasBranches = [...branchesByScreen.values()].some(
    (rules) => rules.length > 0,
  );
  const routingModel: Record<string, string[]> = {};
  const rendered = screens.map((screen, index) => {
    const isLast = index === screens.length - 1;
    const requestedNext =
      typeof screen.next === "string" ? localIds.get(screen.next) : undefined;
    const next = requestedNext ?? ids[index + 1];
    const localScreenId = String(screen.id ?? "");
    const branches = branchesByScreen.get(localScreenId) ?? [];
    const terminal = branches.length === 0 && (Boolean(screen.final) || isLast || !next);
    const action = terminal
        ? { name: "complete", payload: { flow_completed: true } }
      : branches.length > 0
        ? { name: "data_exchange", payload: {} as Record<string, string> }
        : {
            name: "navigate",
            next: { type: "screen", name: next },
            // O contrato da Meta exige payload no action de navegação;
            // mesmo sem campos, o objeto precisa estar presente.
            payload: {},
          };
    const blocks = Array.isArray(screen.blocks)
      ? screen.blocks
          .map((block, blockIndex) => renderMetaBlock(block, blockIndex))
          .filter((block): block is Record<string, unknown> => Boolean(block))
      : [];
    if (branches.length > 0) {
      const payload = (action as { payload: Record<string, string> }).payload;
      for (const block of Array.isArray(screen.blocks) ? screen.blocks : []) {
        if (!block || typeof block !== "object") continue;
        const name = (block as Record<string, unknown>).name;
        if (typeof name === "string" && name)
          payload[name] = `\${form.${name}}`;
      }
    }
    const destinations = new Set<string>();
    if (next) destinations.add(next);
    for (const branch of branches) {
      if (!branch.next) continue;
      const mapped = localIds.get(branch.next);
      if (mapped) destinations.add(mapped);
    }
    routingModel[ids[index]] = [...destinations];
    const footer = {
      type: "Footer",
      label: cleanText(
        screen.buttonText,
        terminal ? "Concluir" : "Continuar",
        35,
      ),
      "on-click-action": action,
    };
    const content = blocks.length
      ? blocks
      : [
          {
            type: "TextBody",
            text: cleanText(
              screen.text,
              "Continue para a próxima etapa.",
              4096,
            ),
          },
        ];
    const needsForm = content.some((block) => META_INPUT_COMPONENTS.has(String(block.type)));
    return {
      id: ids[index],
      title: cleanText(screen.title, `Tela ${index + 1}`, 80),
      terminal,
      layout: {
        type: "SingleColumnLayout",
        children: needsForm
          ? [{ type: "Form", name: `form_${ids[index].toLowerCase()}`, children: [...content, footer] }]
          : [...content, footer],
      },
    };
  });
  if (!rendered.some((screen) => screen.terminal)) {
    throw new Error("O MiniApp precisa ter uma tela final");
  }
  const flow = {
    version: "7.3",
    ...(hasBranches
      ? { data_api_version: dataApiVersion, routing_model: routingModel }
      : {}),
    screens: rendered,
  };
  const issues = validateFlowJson(flow);
  if (issues.length) {
    const first = issues[0];
    throw new Error(`${first.path} [${first.code}]: ${first.message}`);
  }
  return flow;
}

export function validateMetaFlowJsonDetailed(flow: Record<string, unknown>): FlowValidationIssue[] {
  return validateFlowJson(flow);
}

/** Compatibilidade com chamadas existentes; o contrato detalhado alimenta CLI e UI. */
export function validateMetaFlowJson(flow: Record<string, unknown>): string[] {
  return validateMetaFlowJsonDetailed(flow).map(
    (issue) => `${issue.path} [${issue.code}]: ${issue.message}`,
  );
}

export async function createMetaFlow(params: {
  token: string;
  version: string;
  wabaId: string;
  name: string;
  flowJson: Record<string, unknown>;
  publish: boolean;
  endpointUri?: string;
  applicationId?: string;
  cloneFlowId?: string;
  includeFlowJson?: boolean;
}): Promise<{ id: string; validationErrors: unknown }> {
  const data = await graphRequest(
    `${graphBase(params.version)}/${encodeURIComponent(params.wabaId)}/flows`,
    params.token,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: params.name,
        categories: ["OTHER"],
        ...(params.includeFlowJson === false
          ? {}
          : { flow_json: JSON.stringify(params.flowJson) }),
        publish: params.publish,
        ...(params.endpointUri ? { endpoint_uri: params.endpointUri } : {}),
        ...(params.applicationId ? { application_id: params.applicationId } : {}),
        ...(params.cloneFlowId ? { clone_flow_id: params.cloneFlowId } : {}),
      }),
    },
  );
  const id = String(data.id ?? "");
  if (!/^\d+$/.test(id)) throw new Error("A Meta não devolveu o ID do MiniApp");
  return { id, validationErrors: data.validation_errors ?? null };
}

export async function getMetaFlowDetails(params: {
  token: string;
  version: string;
  flowId: string;
  phoneId?: string;
}): Promise<MetaFlowDetails> {
  const health = params.phoneId
    ? `,health_status.phone_number(${params.phoneId})`
    : "";
  const fields = encodeURIComponent(
    `id,status,validation_errors,data_channel_uri,data_api_version,application${health}`,
  );
  const data = await graphRequest(
    `${graphBase(params.version)}/${encodeURIComponent(params.flowId)}?fields=${fields}`,
    params.token,
  );
  return {
    id: String(data.id ?? params.flowId),
    status: typeof data.status === "string" ? data.status : null,
    validationErrors: data.validation_errors ?? null,
    healthStatus: data.health_status ?? null,
    endpointUri:
      typeof data.data_channel_uri === "string"
        ? data.data_channel_uri
        : typeof data.endpoint_uri === "string"
          ? data.endpoint_uri
          : null,
    dataApiVersion: typeof data.data_api_version === "string" ? data.data_api_version : null,
    applicationId:
      data.application && typeof data.application === "object"
        ? String((data.application as Record<string, unknown>).id ?? "") || null
        : null,
  };
}

export async function updateMetaFlow(params: {
  token: string;
  version: string;
  flowId: string;
  name: string;
  flowJson: Record<string, unknown>;
  endpointUri?: string;
  applicationId?: string;
}): Promise<unknown> {
  await graphRequest(
    `${graphBase(params.version)}/${encodeURIComponent(params.flowId)}`,
    params.token,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: params.name,
        categories: ["OTHER"],
        ...(params.endpointUri ? { endpoint_uri: params.endpointUri } : {}),
        ...(params.applicationId ? { application_id: params.applicationId } : {}),
      }),
    },
  );
  const form = new FormData();
  form.append(
    "file",
    new Blob([JSON.stringify(params.flowJson)], { type: "application/json" }),
    "flow.json",
  );
  form.append("name", "flow.json");
  form.append("asset_type", "FLOW_JSON");
  const uploaded = await graphRequest(
    `${graphBase(params.version)}/${encodeURIComponent(params.flowId)}/assets`,
    params.token,
    { method: "POST", body: form },
  );
  return uploaded.validation_errors ?? null;
}

/** Publicação é separada do upload para que a validação seja consultada antes. */
export async function publishMetaFlow(params: {
  token: string;
  version: string;
  flowId: string;
}): Promise<void> {
  await graphRequest(
    `${graphBase(params.version)}/${encodeURIComponent(params.flowId)}/publish`,
    params.token,
    { method: "POST" },
  );
}

export async function setMetaFlowEncryptionPublicKey(params: {
  token: string;
  version: string;
  phoneId: string;
  publicKey: string;
}): Promise<void> {
  const body = new FormData();
  body.set("business_public_key", params.publicKey.trim().replace(/\r\n/g, "\n"));
  await graphRequest(
    `${graphBase(params.version)}/${encodeURIComponent(params.phoneId)}/whatsapp_business_encryption`,
    params.token,
    {
      method: "POST",
      body,
    },
  );
}

function canonicalPublicKey(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----/g, "")
    .replace(/\s/g, "");
}

export function flowPublicKeysMatch(local: string, remote: string | null): boolean {
  const left = canonicalPublicKey(local);
  const right = canonicalPublicKey(remote);
  return left.length > 0 && left === right;
}

export async function getMetaFlowEncryptionPublicKeyStatus(params: {
  token: string;
  version: string;
  phoneId: string;
}): Promise<{ status: string | null; publicKey: string | null }> {
  const data = await graphRequest(
    `${graphBase(params.version)}/${encodeURIComponent(params.phoneId)}/whatsapp_business_encryption`,
    params.token,
  );
  const item = Array.isArray(data.data) && data.data[0] && typeof data.data[0] === "object"
    ? data.data[0] as Record<string, unknown>
    : data;
  return {
    status:
      typeof item.business_public_key_signature_status === "string"
        ? item.business_public_key_signature_status
        : null,
    publicKey: typeof item.business_public_key === "string" ? item.business_public_key : null,
  };
}

function pemDer(pem: string): ArrayBuffer {
  const normalized = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(normalized);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    output[index] = binary.charCodeAt(index);
  return output.buffer;
}

export async function validateFlowEncryptionKeyPair(
  privateKeyPem: string,
  publicKeyPem: string,
): Promise<{ valid: true; modulusLength: number }> {
  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.importKey(
      "pkcs8",
      pemDer(privateKeyPem),
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["decrypt"],
    ),
    crypto.subtle.importKey(
      "spki",
      pemDer(publicKeyPem),
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"],
    ),
  ]);
  const [privateJwk, publicJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", privateKey),
    crypto.subtle.exportKey("jwk", publicKey),
  ]);
  const modulusLength = (privateKey.algorithm as RsaKeyAlgorithm).modulusLength;
  if (modulusLength !== 2048 || privateJwk.n !== publicJwk.n || privateJwk.e !== publicJwk.e)
    throw new Error("Par de chaves RSA 2048 inválido ou incompatível");
  return { valid: true, modulusLength };
}

export async function getMetaFlowPreview(params: {
  token: string;
  version: string;
  flowId: string;
}): Promise<string | null> {
  const data = await graphRequest(
    `${graphBase(params.version)}/${encodeURIComponent(params.flowId)}?fields=preview.invalidate(false)`,
    params.token,
  );
  const preview =
    data.preview && typeof data.preview === "object"
      ? (data.preview as Record<string, unknown>)
      : {};
  return typeof preview.preview_url === "string" ? preview.preview_url : null;
}

export const SMARTZAP_META_WEBHOOK_FIELDS = [
  "messages",
  "calls",
  "user_preferences",
  "message_template_status_update",
  "message_template_components_update",
  "message_template_quality_update",
  "account_update",
  "account_alerts",
  "account_review_update",
  "business_capability_update",
  "phone_number_quality_update",
  "phone_number_name_update",
  "security",
  "business_username_updates",
  "template_category_update",
  "flows",
] as const;

export const SMARTZAP_REQUIRED_META_WEBHOOK_FIELDS = [
  "messages",
  "user_preferences",
  "message_template_status_update",
  "account_update",
  "business_capability_update",
  "phone_number_quality_update",
  "template_category_update",
  "flows",
] as const;

export async function configureMetaAppWebhookSubscription(params: {
  version: string;
  appId: string;
  appSecret: string;
  callbackUrl: string;
  verifyToken: string;
}): Promise<void> {
  if (!/^\d{5,32}$/.test(params.appId)) throw new Error("App ID inválido");
  if (!params.appSecret || !params.verifyToken) throw new Error("Secrets do webhook ausentes");
  if (new URL(params.callbackUrl).protocol !== "https:") throw new Error("Callback precisa usar HTTPS");
  const body = new URLSearchParams();
  body.set("object", "whatsapp_business_account");
  body.set("callback_url", params.callbackUrl);
  body.set("verify_token", params.verifyToken);
  body.set("fields", SMARTZAP_META_WEBHOOK_FIELDS.join(","));
  body.set("include_values", "true");
  await graphRequest(
    `${graphBase(params.version)}/${params.appId}/subscriptions`,
    `${params.appId}|${params.appSecret}`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
  );
}
