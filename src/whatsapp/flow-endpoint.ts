const encoder = new TextEncoder();
const decoder = new TextDecoder();
import { handleDynamicBookingRequest } from "./dynamic-booking";

export type FlowEndpointRequest = {
  action: "ping" | "INIT" | "data_exchange" | "BACK";
  screen?: string;
  data?: Record<string, unknown>;
  flow_token?: string;
  flow_token_signature?: string;
  version?: string;
};

export type DecryptedFlowRequest = {
  body: FlowEndpointRequest;
  aesKey: ArrayBuffer;
  initialVector: Uint8Array<ArrayBuffer>;
};

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    output[index] = binary.charCodeAt(index);
  return output;
}

function toBase64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function pemBytes(pem: string): Uint8Array<ArrayBuffer> {
  const encoded = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  return fromBase64(encoded);
}

export async function decryptFlowRequest(
  encrypted: {
    encrypted_flow_data: string;
    encrypted_aes_key: string;
    initial_vector: string;
  },
  privateKeyPem: string,
): Promise<DecryptedFlowRequest> {
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(privateKeyPem),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
  const aesKey = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    fromBase64(encrypted.encrypted_aes_key),
  );
  const initialVector = fromBase64(encrypted.initial_vector);
  const aes = await crypto.subtle.importKey(
    "raw",
    aesKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: initialVector, tagLength: 128 },
    aes,
    fromBase64(encrypted.encrypted_flow_data),
  );
  return {
    body: JSON.parse(decoder.decode(clear)) as FlowEndpointRequest,
    aesKey,
    initialVector,
  };
}

export async function encryptFlowResponse(
  response: Record<string, unknown>,
  aesKey: ArrayBuffer,
  initialVector: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const responseIv = Uint8Array.from(initialVector, (byte) => byte ^ 0xff);
  const aes = await crypto.subtle.importKey(
    "raw",
    aesKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  return toBase64(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: responseIv, tagLength: 128 },
      aes,
      encoder.encode(JSON.stringify(response)),
    ),
  );
}

export async function isValidFlowSignature(
  rawBody: string,
  signature: string | undefined,
  appSecret: string,
): Promise<boolean> {
  if (!signature?.startsWith("sha256=") || !appSecret) return false;
  const expected = fromBase64(
    toBase64(
      await crypto.subtle.sign(
        "HMAC",
        await crypto.subtle.importKey(
          "raw",
          encoder.encode(appSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        ),
        encoder.encode(rawBody),
      ),
    ),
  );
  const suppliedHex = signature.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  const supplied = new Uint8Array(32);
  for (let index = 0; index < 32; index++)
    supplied[index] = Number.parseInt(suppliedHex.slice(index * 2, index * 2 + 2), 16);
  if (supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++)
    difference |= expected[index] ^ supplied[index];
  return difference === 0;
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
}

export async function isValidFlowTokenSignature(
  flowToken: string | undefined,
  jwt: string | undefined,
  appSecret: string,
): Promise<boolean> {
  if (!flowToken || !jwt || !appSecret) return false;
  const parts = jwt.split(".");
  if (parts.length !== 3) return false;
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(decoder.decode(fromBase64Url(parts[0])));
    payload = JSON.parse(decoder.decode(fromBase64Url(parts[1])));
  } catch {
    return false;
  }
  if (header.alg !== "HS256" || payload.flow_token !== flowToken) return false;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ),
    encoder.encode(`${parts[0]}.${parts[1]}`),
  );
  const expected = new Uint8Array(signature);
  const supplied = fromBase64Url(parts[2]);
  if (expected.length !== supplied.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ supplied[index];
  return difference === 0;
}

type BranchRule = {
  field?: unknown;
  op?: unknown;
  value?: unknown;
  next?: unknown;
};

export function branchMatches(rule: BranchRule, data: Record<string, unknown>): boolean {
  const actual = data[String(rule.field ?? "")];
  const expected = rule.value;
  switch (rule.op) {
    case "is_filled":
      return actual !== undefined && actual !== null && String(actual).trim() !== "";
    case "is_empty":
      return actual === undefined || actual === null || String(actual).trim() === "";
    case "is_true":
      return actual === true || actual === "true" || actual === 1 || actual === "1";
    case "is_false":
      return actual === false || actual === "false" || actual === 0 || actual === "0";
    case "equals":
      return String(actual ?? "") === String(expected ?? "");
    case "contains":
      return Array.isArray(actual)
        ? actual.map(String).includes(String(expected ?? ""))
        : String(actual ?? "").includes(String(expected ?? ""));
    case "gt":
      return Number(actual) > Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    default:
      return false;
  }
}

function flowReference(token: string | undefined): string | null {
  const match = String(token ?? "").match(
    /^smartzap:([0-9a-f-]{36}|\d{6,25})(?::|$)/i,
  );
  return match?.[1] ?? null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function metaScreenIndex(value: unknown): number {
  const match = /^SCREEN_([A-Z]+)$/.exec(String(value ?? ""));
  if (!match) return -1;
  let result = 0;
  for (const char of match[1]) result = result * 26 + char.charCodeAt(0) - 64;
  return result - 1;
}

function metaScreenName(index: number): string {
  let value = index;
  let suffix = "";
  do {
    suffix = String.fromCharCode(65 + (value % 26)) + suffix;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return `SCREEN_${suffix}`;
}

export async function handleFlowRequest(
  db: D1Database,
  request: FlowEndpointRequest,
  env?: Env,
): Promise<Record<string, unknown>> {
  if (request.action === "ping") return { data: { status: "active" } };
  if (request.data?.error) return { data: { acknowledged: true } };
  const reference = flowReference(request.flow_token);
  if (!reference) throw new Error("flow_token inválido");
  if (request.version === "4.0") {
    if (!env?.META_APP_SECRET || !(await isValidFlowTokenSignature(
      request.flow_token,
      request.flow_token_signature,
      env.META_APP_SECRET,
    ))) throw new Error("flow_token_signature inválida");
  }
  const row = await db
    .prepare(
      `SELECT f.id,f.definition_json,fs.id submission_id,fs.status submission_status,
              fs.meta_flow_id,fs.from_phone,fs.created_at
       FROM flow_submissions fs
       JOIN flows f ON f.id=fs.flow_local_id
       WHERE fs.flow_token=?1 AND (f.id=?2 OR f.meta_id=?2 OR fs.meta_flow_id=?2)
       LIMIT 1`,
    )
    .bind(request.flow_token, reference)
    .first<{
      id: string;
      definition_json: string;
      submission_id: string;
      submission_status: string;
      meta_flow_id: string | null;
      from_phone: string | null;
      created_at: string;
    }>();
  if (!row) throw new Error("Submissão do flow_token não encontrada");
  if (Date.parse(`${row.created_at.replace(" ", "T")}Z`) < Date.now() - 7 * 86_400_000)
    throw new Error("flow_token expirado");

  const tokenHash = await sha256(request.flow_token!);
  const requestHash = await sha256(JSON.stringify(request));
  const screen = request.screen ?? "_";
  const claimToken = crypto.randomUUID();
  const claimed = await db.prepare(
    `INSERT OR IGNORE INTO flow_endpoint_actions
     (id,flow_token_hash,screen,action,request_hash,status,claim_token)
     VALUES(?1,?2,?3,?4,?5,'processing',?6)`,
  ).bind(
    crypto.randomUUID(), tokenHash, screen, request.action, requestHash, claimToken,
  ).run();
  if ((claimed.meta.changes ?? 0) === 0) {
    const previous = await db.prepare(
      `SELECT status,response_json FROM flow_endpoint_actions
       WHERE flow_token_hash=?1 AND screen=?2 AND action=?3 AND request_hash=?4`,
    ).bind(tokenHash, screen, request.action, requestHash)
      .first<{ status: string; response_json: string | null }>();
    if (previous?.status === "completed" && previous.response_json)
      return JSON.parse(previous.response_json) as Record<string, unknown>;
    const reclaimed = await db.prepare(
      `UPDATE flow_endpoint_actions SET claim_token=?5,claimed_at=datetime('now'),
       updated_at=datetime('now'),error_code=NULL,response_json=NULL
       WHERE flow_token_hash=?1 AND screen=?2 AND action=?3 AND request_hash=?4
       AND status='processing' AND claimed_at<=datetime('now','-60 seconds')`,
    ).bind(tokenHash, screen, request.action, requestHash, claimToken).run();
    if ((reclaimed.meta.changes ?? 0) === 0)
      throw new Error("Ação do MiniApp já está em processamento");
  }
  if (row.submission_status === "completed") {
    await db.prepare(
      `UPDATE flow_endpoint_actions SET status='failed',error_code='SUBMISSION_COMPLETED',
       completed_at=datetime('now'),updated_at=datetime('now') WHERE flow_token_hash=?1
       AND screen=?2 AND action=?3 AND request_hash=?4 AND claim_token=?5`,
    ).bind(tokenHash, screen, request.action, requestHash, claimToken).run();
    throw new Error("Submissão do MiniApp já foi concluída");
  }

  try {
    const definition = JSON.parse(row.definition_json || "{}") as Record<string, unknown>;
    let response: Record<string, unknown>;
    if (definition.dynamicBooking === true) {
      if (!env) throw new Error("Configuração da agenda indisponível");
      response = await handleDynamicBookingRequest(env, db, request);
    } else {
      const screens = Array.isArray(definition.screens)
        ? (definition.screens as Array<Record<string, unknown>>)
        : [];
      if (screens.length === 0) throw new Error("MiniApp sem telas");
      if (request.action === "INIT") response = { screen: "SCREEN_A", data: {} };
      else if (request.action === "BACK")
        response = { screen: request.screen || "SCREEN_A", data: {} };
      else {
        const index = metaScreenIndex(request.screen);
        if (index < 0 || index >= screens.length) throw new Error("Tela inválida");
        const current = screens[index];
        const localId = String(current.id ?? "");
        const branches =
          definition.branchesByScreen && typeof definition.branchesByScreen === "object"
            ? ((definition.branchesByScreen as Record<string, unknown>)[localId] as unknown)
            : [];
        const matched = Array.isArray(branches)
          ? (branches as BranchRule[]).find((rule) => branchMatches(rule, request.data ?? {}))
          : undefined;
        const nextLocal = matched
          ? typeof matched.next === "string" ? matched.next : null
          : typeof current.next === "string" ? current.next : null;
        if (!nextLocal) {
          const responseData = request.data ?? {};
          response = {
            screen: "SUCCESS",
            data: {
              extension_message_response: {
                params: { flow_token: request.flow_token, ...responseData },
              },
            },
          };
        } else {
          const nextIndex = screens.findIndex((item) => item.id === nextLocal);
          if (nextIndex < 0) throw new Error("Destino da regra não encontrado");
          response = { screen: metaScreenName(nextIndex), data: {} };
        }
      }
    }
    if (response.screen === "SUCCESS") {
      const responseData = response.data && typeof response.data === "object" ? response.data : {};
      await db.prepare(
        `UPDATE flow_submissions SET response_json=?2,status='completed',
         completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?1 AND status='sent'`,
      ).bind(row.submission_id, JSON.stringify(responseData)).run();
    }
    await db.prepare(
      `UPDATE flow_endpoint_actions SET status='completed',response_json=?2,
       completed_at=datetime('now'),updated_at=datetime('now') WHERE flow_token_hash=?1
       AND screen=?3 AND action=?4 AND request_hash=?5 AND claim_token=?6`,
    ).bind(
      tokenHash, JSON.stringify(response), screen, request.action, requestHash, claimToken,
    ).run();
    return response;
  } catch (error) {
    await db.prepare(
      `UPDATE flow_endpoint_actions SET status='failed',error_code=?2,
       completed_at=datetime('now'),updated_at=datetime('now') WHERE flow_token_hash=?1
       AND screen=?3 AND action=?4 AND request_hash=?5 AND claim_token=?6`,
    ).bind(
      tokenHash,
      error instanceof Error ? error.message.slice(0, 120) : "FLOW_ACTION_FAILED",
      screen,
      request.action,
      requestHash,
      claimToken,
    ).run();
    throw error;
  }
}
