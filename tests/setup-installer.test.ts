import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleWebhookBatch } from "../src/queue/webhook-consumer";
import type { MetaWebhookEvent } from "../src/api/webhook";
import { workflowProbeOutputOk, workflowProbeStatusOk } from "../src/api/setup";

const AUTH = { "x-api-key": "dev-api-key", "content-type": "application/json" };

afterEach(() => vi.unstubAllGlobals());

describe("instalação SmartZap", () => {
  it("aceita a saída JSON serializada devolvida pelo Workflow da Cloudflare", () => {
    expect(workflowProbeOutputOk('{"ok":true,"checkedAt":"2026-08-11T00:00:00Z"}')).toBe(true);
    expect(workflowProbeOutputOk({ ok: true })).toBe(true);
    expect(workflowProbeOutputOk('{"ok":false}')).toBe(false);
  });

  it("aceita Workflow concluído quando a Cloudflare ainda não materializou o output", () => {
    expect(workflowProbeStatusOk({ status: "complete" })).toBe(true);
    expect(workflowProbeStatusOk({ status: "complete", output: { ok: true } })).toBe(true);
    expect(workflowProbeStatusOk({ status: "complete", output: { ok: false } })).toBe(false);
    expect(workflowProbeStatusOk({ status: "running" })).toBe(false);
  });

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

  it("configura app, WABA e número usando o Verify Token guardado no cofre", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO settings(key,value)VALUES('whatsapp_phone_id','11111') ON CONFLICT(key) DO UPDATE SET value='11111'",
      ),
      env.DB.prepare(
        "INSERT INTO settings(key,value)VALUES('whatsapp_waba_id','22222') ON CONFLICT(key) DO UPDATE SET value='22222'",
      ),
    ]);
    const callbackUrl = "https://x.com/webhook";
    const replies = [
      { success: true },
      { success: true },
      { success: true },
      {
        id: "11111",
        status: "CONNECTED",
        platform_type: "CLOUD_API",
        account_mode: "LIVE",
        quality_rating: "GREEN",
        code_verification_status: "VERIFIED",
        webhook_configuration: {
          phone_number: callbackUrl,
          whatsapp_business_account: callbackUrl,
          application: callbackUrl,
        },
      },
      { id: "22222" },
      { data: [{ id: "11111" }] },
      {
        data: [{
          whatsapp_business_api_data: { id: "123456789" },
          override_callback_uri: callbackUrl,
        }],
      },
      {
        data: {
          is_valid: true,
          app_id: "123456789",
          type: "SYSTEM_USER",
          scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
        },
      },
      {
        data: [{
          object: "whatsapp_business_account",
          active: true,
          callback_url: callbackUrl,
          fields: ["messages", "flows"],
        }],
      },
    ];
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify(replies[fetchMock.mock.calls.length - 1]),
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await SELF.fetch("https://x.com/api/setup/meta/webhook/configure", {
      method: "POST",
      headers: AUTH,
    });
    const raw = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(raw)).toEqual({ ok: true, callbackUrl });
    expect(raw).not.toContain("dev-meta-secret");
    expect(raw).not.toContain("dev-verify");
    expect(raw).not.toContain("test-token");

    expect(fetchMock).toHaveBeenCalledTimes(9);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(String(calls[0]?.[0])).toContain("/123456789/subscriptions");
    expect(String(calls[1]?.[0])).toContain("/22222/subscribed_apps");
    expect(String(calls[2]?.[0])).toContain("/11111");
    const appBody = new URLSearchParams(String(calls[0]?.[1]?.body));
    const wabaBody = JSON.parse(String(calls[1]?.[1]?.body)) as {
      override_callback_uri: string;
      verify_token: string;
    };
    const phoneBody = JSON.parse(String(calls[2]?.[1]?.body)) as {
      webhook_configuration: { override_callback_uri: string; verify_token: string };
    };
    expect(wabaBody.override_callback_uri).toBe(callbackUrl);
    expect(wabaBody.verify_token).toMatch(/^verify-/);
    expect(appBody.get("verify_token")).toBe(wabaBody.verify_token);
    expect(phoneBody).toEqual({
      webhook_configuration: {
        override_callback_uri: callbackUrl,
        verify_token: wabaBody.verify_token,
      },
    });
    expect((await env.DB.prepare(
      "SELECT status,detail FROM setup_checks WHERE id='meta_credentials'",
    ).first<{ status: string; detail: string }>())).toMatchObject({
      status: "passed",
    });
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
    expect((await env.DB.prepare(
      `SELECT status,apply_state,last_apply_error FROM status_events
       WHERE message_id=?1 ORDER BY CASE status
         WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 END`,
    ).bind(messageId).all()).results).toEqual([
      { status: "sent", apply_state: "ignored", last_apply_error: null },
      { status: "delivered", apply_state: "ignored", last_apply_error: null },
      { status: "read", apply_state: "ignored", last_apply_error: null },
    ]);
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

  it("reconhece cron recém-configurado pela API antes da primeira execução agendada", async () => {
    await env.DB.prepare(
      `INSERT INTO setup_checks(id,status,detail,checked_at)
       VALUES('cron_config','passed','confirmado pela API',datetime('now'))
       ON CONFLICT(id) DO UPDATE SET status='passed',detail='confirmado pela API',checked_at=datetime('now')`,
    ).run();
    const state = await SELF.fetch("https://x.com/api/setup/status", { headers: AUTH })
      .then((result) => result.json() as Promise<{ infrastructure: { cron: boolean } }>);
    expect(state.infrastructure.cron).toBe(true);
    await env.DB.prepare("DELETE FROM setup_checks WHERE id='cron_config'").run();
  });

  it("exige heartbeat real quando a confirmação inicial do cron envelhece", async () => {
    await env.DB.prepare(
      `INSERT INTO setup_checks(id,status,detail,checked_at)
       VALUES('cron_config','passed','confirmado pela API',datetime('now','-31 minutes'))
       ON CONFLICT(id) DO UPDATE SET status='passed',detail='confirmado pela API',checked_at=datetime('now','-31 minutes')`,
    ).run();
    const state = await SELF.fetch("https://x.com/api/setup/status", { headers: AUTH })
      .then((result) => result.json() as Promise<{ infrastructure: { cron: boolean } }>);
    expect(state.infrastructure.cron).toBe(false);
    await env.DB.prepare("DELETE FROM setup_checks WHERE id='cron_config'").run();
  });
});
