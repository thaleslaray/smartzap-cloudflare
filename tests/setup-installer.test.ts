import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handleWebhookBatch } from "../src/queue/webhook-consumer";
import type { MetaWebhookEvent } from "../src/api/webhook";

const AUTH = { "x-api-key": "dev-api-key", "content-type": "application/json" };

describe("instalação SmartZap", () => {
  it("executa um Workflow de diagnóstico antes de liberar a infraestrutura", async () => {
    const response = await SELF.fetch("https://x.com/api/setup/infrastructure/probe", {
      method: "POST",
      headers: AUTH,
    });
    expect(response.status).toBe(200);
    const state = await SELF.fetch("https://x.com/api/setup/status", { headers: AUTH })
      .then((result) => result.json() as Promise<{ infrastructure: { workflow: boolean }; checks: Record<string, { status: string }> }>);
    expect(state.checks.workflow_probe?.status).toBe("passed");
    expect(state.infrastructure.workflow).toBe(true);
  });

  it("expõe apenas estado e nunca devolve secrets", async () => {
    const response = await SELF.fetch("https://x.com/api/setup/status", { headers: AUTH });
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toContain("test-token");
    expect(raw).not.toContain("dev-meta-secret");
    expect(raw).not.toContain(env.SMARTZAP_VAULT_KEY as string);
    const data = JSON.parse(raw) as { infrastructure: Record<string, boolean>; vault: { configured: boolean } };
    expect(data.infrastructure.database).toBe(true);
    expect(data.vault.configured).toBe(true);
  });

  it("cifra a configuração Meta antes de persistir no D1", async () => {
    const token = `EA-test-${crypto.randomUUID()}-long-token`;
    const appSecret = `secret-${crypto.randomUUID()}`;
    const verifyToken = `verify-${crypto.randomUUID()}`;
    const response = await SELF.fetch("https://x.com/api/setup/meta", {
      method: "PUT",
      headers: AUTH,
      body: JSON.stringify({
        token,
        appId: "123456789",
        appSecret,
        verifyToken,
        phoneId: "111111111",
        wabaId: "222222222",
        graphVersion: "v25.0",
      }),
    });
    expect(response.status).toBe(200);
    const row = await env.DB.prepare(
      "SELECT ciphertext,iv FROM secret_vault WHERE name='meta_credentials'",
    ).first<{ ciphertext: string; iv: string }>();
    expect(row?.ciphertext).toBeTruthy();
    expect(row?.ciphertext).not.toContain(token);
    expect(row?.ciphertext).not.toContain(appSecret);
    expect(row?.ciphertext).not.toContain(verifyToken);
    const state = await SELF.fetch("https://x.com/api/setup/status", { headers: AUTH })
      .then((result) => result.json() as Promise<{ installation: { last_step: string } }>);
    expect(state.installation.last_step).toBe("meta");
  });

  it("não libera o núcleo sem evidência de Meta, templates e read", async () => {
    const response = await SELF.fetch("https://x.com/api/setup/complete", { method: "POST", headers: AUTH });
    expect(response.status).toBe(409);
    expect((await response.json() as { error: string }).error).toContain("núcleo ainda não está verde");
  });

  it("exige sent, delivered e read mesmo quando os callbacks chegam fora de ordem", async () => {
    const messageId = `wamid.${crypto.randomUUID()}`;
    await env.DB.prepare(
      `INSERT INTO settings(key,value,updated_at) VALUES('setup_test_message_id',?1,datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
    ).bind(messageId).run();
    const insert = (status: string) => env.DB.prepare(
      `INSERT INTO status_events(message_id,status,raw,received_at,event_kind)
       VALUES(?1,?2,'{}',datetime('now'),'message_status')`,
    ).bind(messageId, status).run();

    await insert("read");
    let response = await SELF.fetch("https://x.com/api/setup/test-message/status", { headers: AUTH });
    expect((await response.json() as { status: string }).status).toBe("incomplete");
    const premature = await env.DB.prepare(
      "SELECT status FROM setup_checks WHERE id='real_message'",
    ).first<{ status: string }>();
    expect(premature?.status).not.toBe("passed");

    await insert("delivered");
    await insert("sent");
    response = await SELF.fetch("https://x.com/api/setup/test-message/status", { headers: AUTH });
    expect((await response.json() as { status: string }).status).toBe("read");
    const completed = await env.DB.prepare(
      "SELECT status,detail FROM setup_checks WHERE id='real_message'",
    ).first<{ status: string; detail: string }>();
    expect(completed).toMatchObject({ status: "passed" });
    expect(completed?.detail).toContain("sent → delivered → read");
  });

  it("promove automaticamente o gate quando a Queue recebe o último callback", async () => {
    const messageId = `wamid.${crypto.randomUUID()}`;
    await env.DB.prepare(
      `INSERT INTO settings(key,value,updated_at) VALUES('setup_test_message_id',?1,datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
    ).bind(messageId).run();
    await env.DB.prepare(
      `INSERT INTO setup_checks(id,status,detail,checked_at)
       VALUES('real_message','pending','aguardando',datetime('now'))
       ON CONFLICT(id) DO UPDATE SET status='pending',detail='aguardando',checked_at=datetime('now')`,
    ).run();

    const statusEvent = (status: "sent" | "delivered" | "read"): MetaWebhookEvent => ({
      kind: "status",
      wabaId: "222222222",
      phoneNumberId: "111111111",
      status: {
        id: messageId,
        status,
        timestamp: "1749416383",
        recipient_id: "5511999999999",
      },
    });

    await handleWebhookBatch([statusEvent("read")], env);
    await handleWebhookBatch([statusEvent("delivered")], env);
    expect((await env.DB.prepare(
      "SELECT status FROM setup_checks WHERE id='real_message'",
    ).first<{ status: string }>())?.status).toBe("pending");

    await handleWebhookBatch([statusEvent("sent")], env);
    const completed = await env.DB.prepare(
      "SELECT status,detail FROM setup_checks WHERE id='real_message'",
    ).first<{ status: string; detail: string }>();
    const installation = await env.DB.prepare(
      "SELECT last_step FROM setup_installation WHERE id=1",
    ).first<{ last_step: string }>();
    expect(completed).toMatchObject({ status: "passed" });
    expect(completed?.detail).toContain("automaticamente");
    expect(installation?.last_step).toBe("real_message_read");
  });

  it("não mantém a liberação quando um gate operacional deixa de estar verde", async () => {
    await env.DB.prepare(
      `INSERT INTO settings(key,value,updated_at) VALUES('setup_complete','true',datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value='true',updated_at=excluded.updated_at`,
    ).run();
    const state = await SELF.fetch("https://x.com/api/setup/status", { headers: AUTH })
      .then((result) => result.json() as Promise<{ complete: boolean; infrastructure: { cron: boolean } }>);
    expect(state.infrastructure.cron).toBe(false);
    expect(state.complete).toBe(false);
    await env.DB.prepare("UPDATE settings SET value='false' WHERE key='setup_complete'").run();
  });
});
