import { describe, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";
import {
  branchMatches,
  decryptFlowRequest,
  encryptFlowResponse,
  handleFlowRequest,
  isValidFlowSignature,
  isValidFlowTokenSignature,
} from "../src/whatsapp/flow-endpoint";
import {
  buildMetaFlowJson,
  flowPublicKeysMatch,
  getMetaFlowEncryptionPublicKeyStatus,
  validateFlowEncryptionKeyPair,
} from "../src/whatsapp/flows";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function pem(buffer: ArrayBuffer, label: string): string {
  const body = base64(buffer).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

describe("endpoint criptografado de MiniApps", () => {
  it("descriptografa a request e criptografa a resposta com o IV invertido", async () => {
    const keys = (await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"],
    )) as CryptoKeyPair;
    const rawAesKey = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aes = await crypto.subtle.importKey("raw", rawAesKey, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
    const requestBody = {
      action: "ping",
      version: "3.0",
    };
    const encryptedData = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aes,
      encoder.encode(JSON.stringify(requestBody)),
    );
    const encryptedKey = await crypto.subtle.encrypt(
      "RSA-OAEP",
      keys.publicKey,
      rawAesKey,
    );
    const privatePem = pem(
      await crypto.subtle.exportKey("pkcs8", keys.privateKey),
      "PRIVATE KEY",
    );
    const decrypted = await decryptFlowRequest(
      {
        encrypted_flow_data: base64(encryptedData),
        encrypted_aes_key: base64(encryptedKey),
        initial_vector: base64(iv.buffer),
      },
      privatePem,
    );
    expect(decrypted.body).toEqual(requestBody);

    const encryptedResponse = await encryptFlowResponse(
      { data: { status: "active" } },
      decrypted.aesKey,
      decrypted.initialVector,
    );
    const flipped = Uint8Array.from(iv, (byte) => byte ^ 0xff);
    const clearResponse = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: flipped },
      aes,
      Uint8Array.from(atob(encryptedResponse), (char) => char.charCodeAt(0)),
    );
    expect(JSON.parse(decoder.decode(clearResponse))).toEqual({
      data: { status: "active" },
    });
  });

  it("valida que as chaves configuradas formam um par RSA 2048", async () => {
    const first = await crypto.subtle.generateKey({
      name: "RSA-OAEP", modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256",
    }, true, ["encrypt", "decrypt"]) as CryptoKeyPair;
    const other = await crypto.subtle.generateKey({
      name: "RSA-OAEP", modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256",
    }, true, ["encrypt", "decrypt"]) as CryptoKeyPair;
    const privatePem = pem(await crypto.subtle.exportKey("pkcs8", first.privateKey), "PRIVATE KEY");
    const publicPem = pem(await crypto.subtle.exportKey("spki", first.publicKey), "PUBLIC KEY");
    const otherPublicPem = pem(await crypto.subtle.exportKey("spki", other.publicKey), "PUBLIC KEY");
    await expect(validateFlowEncryptionKeyPair(privatePem, publicPem))
      .resolves.toEqual({ valid: true, modulusLength: 2048 });
    await expect(validateFlowEncryptionKeyPair(privatePem, otherPublicPem))
      .rejects.toThrow("incompatível");
  });

  it("lê o status da chave no envelope data[] devolvido pela Meta", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
      data: [{
        business_public_key: "-----BEGIN PUBLIC KEY-----redacted",
        business_public_key_signature_status: "VALID",
      }],
    }), { status: 200 });
    try {
      await expect(getMetaFlowEncryptionPublicKeyStatus({
        token: "secret", version: "v25.0", phoneId: "123456789",
      })).resolves.toEqual({
        status: "VALID",
        publicKey: "-----BEGIN PUBLIC KEY-----redacted",
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("compara a chave remota com a local sem depender da formatação PEM", () => {
    expect(flowPublicKeysMatch(
      "-----BEGIN PUBLIC KEY-----\nABC DEF\n-----END PUBLIC KEY-----",
      "-----BEGIN PUBLIC KEY-----\nABCDEF\n-----END PUBLIC KEY-----",
    )).toBe(true);
    expect(flowPublicKeysMatch("ABC", "XYZ")).toBe(false);
  });

  it("valida a assinatura HMAC sem comparação antecipada", async () => {
    const raw = '{"hello":"flow"}';
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode("app-secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(raw)));
    const hex = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(await isValidFlowSignature(raw, `sha256=${hex}`, "app-secret")).toBe(true);
    expect(await isValidFlowSignature(`${raw}x`, `sha256=${hex}`, "app-secret")).toBe(false);
  });

  it("valida flow_token_signature HS256 da Data API 4.0", async () => {
    const encode = (value: unknown) => btoa(JSON.stringify(value))
      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const header = encode({ alg: "HS256", typ: "JWT" });
    const payload = encode({ flow_token: "smartzap:123456789:nonce" });
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode("app-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const signature = base64(await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${payload}`)))
      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const jwt = `${header}.${payload}.${signature}`;
    expect(await isValidFlowTokenSignature("smartzap:123456789:nonce", jwt, "app-secret")).toBe(true);
    expect(await isValidFlowTokenSignature("smartzap:123456789:outro", jwt, "app-secret")).toBe(false);
  });

  it("exige submissão exata e devolve a mesma resposta no replay", async () => {
    const localId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    const token = `smartzap:7788990011:${submissionId}`;
    const definition = {
      screens: [{ id: "only", final: true }],
    };
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO flows(id,name,status,meta_id,definition_json)
         VALUES(?1,'Flow replay','DRAFT','7788990011',?2)`,
      ).bind(localId, JSON.stringify(definition)),
      env.DB.prepare(
        `INSERT INTO flow_submissions(id,flow_local_id,meta_flow_id,flow_token,status)
         VALUES(?1,?2,'7788990011',?3,'sent')`,
      ).bind(submissionId, localId, token),
    ]);
    const request = {
      action: "data_exchange" as const,
      screen: "SCREEN_A",
      data: { answer: "ok" },
      flow_token: token,
    };
    const first = await handleFlowRequest(env.DB, request);
    const replay = await handleFlowRequest(env.DB, request);
    expect(replay).toEqual(first);
    expect((await env.DB.prepare(
      "SELECT COUNT(*) n FROM flow_endpoint_actions WHERE flow_token_hash IS NOT NULL",
    ).first<{ n: number }>())!.n).toBeGreaterThan(0);
    await expect(handleFlowRequest(env.DB, {
      ...request,
      flow_token: "smartzap:7788990011:fabricado",
    })).rejects.toThrow("Submissão");
  });

  it("rejeita flow_token expirado antes de executar qualquer ação", async () => {
    const localId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    const token = `smartzap:6677889900:${submissionId}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO flows(id,name,status,meta_id,definition_json)
         VALUES(?1,'Flow expirado','DRAFT','6677889900',?2)`,
      ).bind(localId, JSON.stringify({ screens: [{ id: "one", final: true }] })),
      env.DB.prepare(
        `INSERT INTO flow_submissions(id,flow_local_id,meta_flow_id,flow_token,status,created_at)
         VALUES(?1,?2,'6677889900',?3,'sent',datetime('now','-8 days'))`,
      ).bind(submissionId, localId, token),
    ]);
    await expect(handleFlowRequest(env.DB, {
      action: "INIT", flow_token: token,
    })).rejects.toThrow("expirado");
  });

  it("retorna 432 para HMAC inválido e 421 para payload que não pode ser descriptografado", async () => {
    const pair = await crypto.subtle.generateKey({
      name: "RSA-OAEP", modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256",
    }, true, ["encrypt", "decrypt"]) as CryptoKeyPair;
    const previous = env.FLOW_PRIVATE_KEY;
    (env as Env).FLOW_PRIVATE_KEY = pem(
      await crypto.subtle.exportKey("pkcs8", pair.privateKey), "PRIVATE KEY",
    );
    const body = JSON.stringify({
      encrypted_flow_data: "AAAA",
      encrypted_aes_key: "AAAA",
      initial_vector: "AAAA",
    });
    try {
      expect((await SELF.fetch("https://x.com/api/flows/endpoint", {
        method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + "0".repeat(64) }, body,
      })).status).toBe(432);
      const key = await crypto.subtle.importKey(
        "raw", encoder.encode(env.META_APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
      );
      const signature = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)))]
        .map((byte) => byte.toString(16).padStart(2, "0")).join("");
      expect((await SELF.fetch("https://x.com/api/flows/endpoint", {
        method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${signature}` }, body,
      })).status).toBe(421);
    } finally {
      (env as Env).FLOW_PRIVATE_KEY = previous;
    }
  });

  it("avalia todos os operadores aceitos pelo editor", () => {
    expect(branchMatches({ field: "nome", op: "is_filled" }, { nome: "Ana" })).toBe(true);
    expect(branchMatches({ field: "nome", op: "is_empty" }, { nome: "" })).toBe(true);
    expect(branchMatches({ field: "plano", op: "equals", value: "pro" }, { plano: "pro" })).toBe(true);
    expect(branchMatches({ field: "tags", op: "contains", value: "vip" }, { tags: ["vip"] })).toBe(true);
    expect(branchMatches({ field: "idade", op: "gt", value: "17" }, { idade: 18 })).toBe(true);
    expect(branchMatches({ field: "idade", op: "lt", value: "18" }, { idade: 17 })).toBe(true);
    expect(branchMatches({ field: "aceite", op: "is_true" }, { aceite: true })).toBe(true);
    expect(branchMatches({ field: "aceite", op: "is_false" }, { aceite: false })).toBe(true);
  });

  it("gera data_exchange e escolhe a primeira regra correspondente", async () => {
    const definition = {
      version: "7.3",
      screens: [
        {
          id: "start",
          title: "Escolha",
          final: false,
          buttonText: "Continuar",
          next: "basic",
          blocks: [
            {
              id: "field",
              type: "Dropdown",
              name: "plano",
              label: "Plano",
              options: [
                { id: "pro", title: "Pro" },
                { id: "basic", title: "Básico" },
              ],
            },
          ],
        },
        { id: "basic", title: "Básico", final: true, buttonText: "Concluir" },
        { id: "pro", title: "Pro", final: true, buttonText: "Concluir" },
      ],
      branchesByScreen: {
        start: [{ field: "plano", op: "equals", value: "pro", next: "pro" }],
      },
    };
    const generated = buildMetaFlowJson(definition) as {
      data_api_version: string;
      routing_model: Record<string, string[]>;
      screens: Array<Record<string, any>>;
    };
    expect(generated.data_api_version).toBe("3.0");
    expect(generated.routing_model.SCREEN_A).toEqual(["SCREEN_B", "SCREEN_C"]);
    const firstForm = generated.screens[0].layout.children[0] as Record<string, any>;
    expect(
      firstForm.children.at(-1)["on-click-action"],
    ).toEqual({ name: "data_exchange", payload: { plano: "${form.plano}" } });

    const localId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    const token = `smartzap:123456789:${submissionId}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO flows(id,name,status,meta_id,definition_json)
         VALUES(?1,'Flow branch','DRAFT','123456789',?2)`,
      ).bind(localId, JSON.stringify(definition)),
      env.DB.prepare(
        `INSERT INTO flow_submissions
         (id,flow_local_id,meta_flow_id,flow_token,status)
         VALUES(?1,?2,'123456789',?3,'sent')`,
      ).bind(submissionId, localId, token),
    ]);
    await expect(
      handleFlowRequest(env.DB, {
        action: "data_exchange",
        screen: "SCREEN_A",
        data: { plano: "pro" },
        flow_token: token,
      }),
    ).resolves.toEqual({ screen: "SCREEN_C", data: {} });
    await expect(
      handleFlowRequest(env.DB, {
        action: "data_exchange",
        screen: "SCREEN_A",
        data: { plano: "basic" },
        flow_token: token,
      }),
    ).resolves.toEqual({ screen: "SCREEN_B", data: {} });
  });

  it("gera o contrato dinâmico de agenda com endpoint Meta", () => {
    const generated = buildMetaFlowJson({
      version: "7.3",
      dynamicBooking: true,
      screens: [{ id: "local", title: "Agenda", final: true }],
    }) as {
      version: string;
      data_api_version: string;
      routing_model: Record<string, string[]>;
      screens: Array<{ id: string; layout: { children: Array<Record<string, unknown>> } }>;
    };
    expect(generated.version).toBe("7.3");
    expect(generated.data_api_version).toBe("3.0");
    expect(generated.routing_model.BOOKING_START).toEqual(["SELECT_TIME"]);
    expect(generated.screens.map((screen) => screen.id)).toEqual([
      "BOOKING_START",
      "SELECT_TIME",
      "CUSTOMER_INFO",
    ]);
  });
});
