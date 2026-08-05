import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFlowRequest } from "../src/whatsapp/flow-endpoint";

const AUTH = { "x-api-key": "dev-api-key", "content-type": "application/json" };

const definition = (label = "Teste", inputId?: string) => ({
  version: "7.3",
  screens: [{
    id: "start",
    title: label,
    final: true,
    buttonText: "Concluir",
    blocks: [
      { id: "body", type: "TextBody", text: label },
      ...(inputId ? [{ id: inputId, type: "TextInput", name: inputId, label: "Resposta", inputType: "text" }] : []),
    ],
  }],
});

async function createFlow(name: string) {
  const response = await SELF.fetch("https://x.com/api/flows", {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({ name, definition: definition(name) }),
  });
  expect(response.status).toBe(201);
  return await response.json() as { id: string; local_revision: number };
}

async function configureMeta() {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO settings(key,value)VALUES('whatsapp_phone_id','11111') ON CONFLICT(key) DO UPDATE SET value='11111'",
    ),
    env.DB.prepare(
      "INSERT INTO settings(key,value)VALUES('whatsapp_waba_id','22222') ON CONFLICT(key) DO UPDATE SET value='22222'",
    ),
  ]);
}

function graphMock(delayCreateMs = 0) {
  let sequence = 0;
  let messages = 0;
  let creations = 0;
  let deprecations = 0;
  const statuses = new Map<string, string>();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const pathname = new URL(url).pathname;
    const method = init?.method || "GET";
    if (/\/22222\/flows$/.test(pathname) && method === "POST") {
      creations += 1;
      if (delayCreateMs) await new Promise((resolve) => setTimeout(resolve, delayCreateMs));
      const id = String(9_000_000_000 + ++sequence);
      statuses.set(id, "DRAFT");
      return Response.json({ id, success: true, validation_errors: [] });
    }
    const id = [...statuses.keys()].find((candidate) => pathname.includes(`/${candidate}`));
    if (id && pathname.endsWith(`/${id}/publish`) && method === "POST") {
      statuses.set(id, "PUBLISHED");
      return Response.json({ success: true });
    }
    if (id && pathname.endsWith(`/${id}/deprecate`) && method === "POST") {
      deprecations += 1;
      statuses.set(id, "DEPRECATED");
      return Response.json({ success: true });
    }
    if (id && pathname.endsWith(`/${id}/preview`) && method === "GET")
      return Response.json({ preview: { preview_url: `https://example.test/${id}` } });
    if (id && pathname.endsWith(`/${id}`) && method === "GET")
      return Response.json({ id, status: statuses.get(id), validation_errors: [] });
    if (/\/11111\/messages$/.test(pathname) && method === "POST")
      return Response.json({ messages: [{ id: `wamid.soak.${++messages}` }] });
    return Response.json({ success: true, validation_errors: [] });
  });
  return {
    fetchMock,
    counts: () => ({ creations, deprecations, messages }),
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

afterEach(() => vi.unstubAllGlobals());

describe("MINI-10 — estresse dos MiniApps", () => {
  it("MS-CONCURRENT-SAVE recusa uma das duas edições da mesma revisão", async () => {
    const flow = await createFlow(`AUTOQA STRESS SAVE ${crypto.randomUUID()}`);
    const responses = await Promise.all([
      SELF.fetch(`https://x.com/api/flows/${flow.id}`, {
        method: "PATCH", headers: AUTH,
        body: JSON.stringify({
          name: "Edição concorrente A",
          definition: definition("A", "answer"),
          mapping: { customFields: { qa_concurrent_a: "answer" } },
          expectedRevision: 1,
        }),
      }),
      SELF.fetch(`https://x.com/api/flows/${flow.id}`, {
        method: "PATCH", headers: AUTH,
        body: JSON.stringify({
          name: "Edição concorrente B",
          definition: definition("B", "answer"),
          mapping: { customFields: { qa_concurrent_b: "answer" } },
          expectedRevision: 1,
        }),
      }),
    ]);
    const responseBodies = await Promise.all(responses.map((response) => response.clone().json()));
    expect(
      responses.map((response) => response.status).sort(),
      JSON.stringify(responseBodies),
    ).toEqual([200, 409]);
    const conflict = responses.find((response) => response.status === 409)!;
    expect(await conflict.json()).toMatchObject({ code: "FLOW_REVISION_CONFLICT" });
    const stored = await env.DB.prepare(
      "SELECT name,local_revision FROM flows WHERE id=?1",
    ).bind(flow.id).first<{ name: string; local_revision: number }>();
    expect(stored?.local_revision).toBe(2);
    expect(["Edição concorrente A", "Edição concorrente B"]).toContain(stored?.name);
    const provisioned = await env.DB.prepare(
      "SELECT key FROM custom_field_defs WHERE key IN ('qa_concurrent_a','qa_concurrent_b') ORDER BY key",
    ).all<{ key: string }>();
    expect(provisioned.results).toHaveLength(1);
    expect(["qa_concurrent_a", "qa_concurrent_b"]).toContain(provisioned.results[0]?.key);
  });

  it("MS-CONCURRENT-PUBLISH cria somente um Flow remoto", async () => {
    await configureMeta();
    const flow = await createFlow(`AUTOQA STRESS PUBLISH ${crypto.randomUUID()}`);
    const graph = graphMock(40);
    vi.stubGlobal("fetch", graph.fetchMock);
    const responses = await Promise.all([
      SELF.fetch(`https://x.com/api/flows/${flow.id}/meta/publish`, {
        method: "POST", headers: AUTH, body: JSON.stringify({ publish: true }),
      }),
      SELF.fetch(`https://x.com/api/flows/${flow.id}/meta/publish`, {
        method: "POST", headers: AUTH, body: JSON.stringify({ publish: true }),
      }),
    ]);
    const responseBodies = await Promise.all(responses.map((response) => response.clone().json()));
    expect(
      responses.map((response) => response.status).sort(),
      JSON.stringify(responseBodies),
    ).toEqual([200, 409]);
    expect(graph.counts().creations).toBe(1);
    expect(await env.DB.prepare(
      "SELECT publish_claim_token,publish_claimed_at FROM flows WHERE id=?1",
    ).bind(flow.id).first()).toEqual({ publish_claim_token: null, publish_claimed_at: null });
    expect((await SELF.fetch(`https://x.com/api/flows/${flow.id}`, {
      method: "DELETE", headers: AUTH,
    })).status).toBe(200);
    expect(graph.counts().deprecations).toBe(1);
  });

  it("MS-ENDPOINT-REPLAY mantém uma mutação e recupera claim abandonado", async () => {
    const localId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    const token = `smartzap:7788999911:${submissionId}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO flows(id,name,status,meta_id,definition_json)
         VALUES(?1,'AUTOQA STRESS REPLAY','DRAFT','7788999911',?2)`,
      ).bind(localId, JSON.stringify(definition("Replay"))),
      env.DB.prepare(
        `INSERT INTO flow_submissions(id,flow_local_id,meta_flow_id,flow_token,status)
         VALUES(?1,?2,'7788999911',?3,'sent')`,
      ).bind(submissionId, localId, token),
    ]);
    const request = {
      action: "data_exchange" as const,
      screen: "SCREEN_A",
      data: { answer: "ok" },
      flow_token: token,
    };
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () => handleFlowRequest(env.DB, request)),
    );
    expect(attempts.some((attempt) => attempt.status === "fulfilled")).toBe(true);
    const replay = await handleFlowRequest(env.DB, request);
    expect(replay).toMatchObject({ screen: "SUCCESS" });
    expect(await env.DB.prepare(
      "SELECT COUNT(*) total FROM flow_endpoint_actions WHERE flow_token_hash=?1",
    ).bind(await sha256(token)).first("total")).toBe(1);

    const recoverySubmission = crypto.randomUUID();
    const recoveryToken = `smartzap:7788999911:${recoverySubmission}`;
    const recoveryRequest = {
      action: "data_exchange" as const,
      screen: "SCREEN_A",
      data: { answer: "recovered" },
      flow_token: recoveryToken,
    };
    await env.DB.prepare(
      `INSERT INTO flow_submissions(id,flow_local_id,meta_flow_id,flow_token,status)
       VALUES(?1,?2,'7788999911',?3,'sent')`,
    ).bind(recoverySubmission, localId, recoveryToken).run();
    await env.DB.prepare(
      `INSERT INTO flow_endpoint_actions
       (id,flow_token_hash,screen,action,request_hash,status,claim_token,claimed_at,updated_at)
       VALUES(?1,?2,'SCREEN_A','data_exchange',?3,'processing','abandoned',
       datetime('now','-2 minutes'),datetime('now','-2 minutes'))`,
    ).bind(
      crypto.randomUUID(),
      await sha256(recoveryToken),
      await sha256(JSON.stringify(recoveryRequest)),
    ).run();
    await expect(handleFlowRequest(env.DB, recoveryRequest))
      .resolves.toMatchObject({ screen: "SUCCESS" });
    expect(await env.DB.prepare(
      "SELECT status FROM flow_endpoint_actions WHERE flow_token_hash=?1",
    ).bind(await sha256(recoveryToken)).first("status")).toBe("completed");
  });

  it("MS-LIST-SCALE pagina 600 MiniApps sem repetição", async () => {
    const prefix = `AUTOQA STRESS LIST ${crypto.randomUUID()}`;
    const statements = Array.from({ length: 600 }, (_, index) =>
      env.DB.prepare(
        `INSERT INTO flows(id,name,definition_json,mapping_json,updated_at)
         VALUES(?1,?2,'{}','{}',datetime('now'))`,
      ).bind(crypto.randomUUID(), `${prefix} ${String(index).padStart(3, "0")}`));
    for (let index = 0; index < statements.length; index += 50)
      await env.DB.batch(statements.slice(index, index + 50));
    const seen = new Set<string>();
    const latencies: number[] = [];
    let cursor: string | null = null;
    do {
      const started = performance.now();
      const response = await SELF.fetch(
        `https://x.com/api/flows?limit=75${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        { headers: AUTH },
      );
      latencies.push(performance.now() - started);
      expect(response.status).toBe(200);
      const page = await response.json() as {
        items: Array<{ id: string; name: string }>;
        nextCursor: string | null;
      };
      page.items.filter((item) => item.name.startsWith(prefix)).forEach((item) => seen.add(item.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen.size).toBe(600);
    expect(Math.max(...latencies)).toBeLessThan(2_000);
  });

  it("MS-MAX-PAYLOAD aceita o máximo e recusa máximo mais um", async () => {
    const screens = Array.from({ length: 10 }, (_, screenIndex) => ({
      id: `screen_${screenIndex}`,
      title: `Tela ${screenIndex}`,
      final: screenIndex === 9,
      next: screenIndex < 9 ? `screen_${screenIndex + 1}` : null,
      buttonText: screenIndex === 9 ? "Concluir" : "Continuar",
      blocks: Array.from({ length: 48 }, (_, blockIndex) => ({
        id: `block_${screenIndex}_${blockIndex}`,
        type: "TextBody",
        text: "x",
      })),
    }));
    const accepted = await SELF.fetch("https://x.com/api/flows", {
      method: "POST", headers: AUTH,
      body: JSON.stringify({ name: "AUTOQA STRESS MAX", definition: { version: "7.3", screens } }),
    });
    expect(accepted.status).toBe(201);
    const overflow = structuredClone(screens);
    overflow[0].blocks.push({ id: "overflow", type: "TextBody", text: "x" });
    const rejected = await SELF.fetch("https://x.com/api/flows", {
      method: "POST", headers: AUTH,
      body: JSON.stringify({ name: "AUTOQA STRESS MAX PLUS ONE", definition: { version: "7.3", screens: overflow } }),
    });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({
      code: "INVALID_LOCAL_FLOW_DEFINITION",
      issues: [expect.objectContaining({ code: "TOO_MANY_BLOCKS" })],
    });
  });

  it("MS-SOAK completa oito ciclos sem Flow local ou remoto órfão", async () => {
    await configureMeta();
    const graph = graphMock();
    vi.stubGlobal("fetch", graph.fetchMock);
    const prefix = `AUTOQA STRESS SOAK ${crypto.randomUUID()}`;
    const flowIds: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      const flow = await createFlow(`${prefix} ${index}`);
      flowIds.push(flow.id);
      const edited = await SELF.fetch(`https://x.com/api/flows/${flow.id}`, {
        method: "PATCH", headers: AUTH,
        body: JSON.stringify({
          name: `${prefix} ${index} editado`,
          definition: definition(`Soak ${index}`),
          expectedRevision: 1,
        }),
      });
      expect(edited.status).toBe(200);
      const published = await SELF.fetch(`https://x.com/api/flows/${flow.id}/meta/publish`, {
        method: "POST", headers: AUTH, body: JSON.stringify({ publish: true }),
      });
      expect(
        published.status,
        JSON.stringify(await published.clone().json()),
      ).toBe(200);
      const sent = await SELF.fetch(`https://x.com/api/flows/${flow.id}/send`, {
        method: "POST", headers: AUTH,
        body: JSON.stringify({ to: "+5511999999999", mode: "published" }),
      });
      expect(sent.status).toBe(200);
      const submissionId = String((await sent.json() as { submissionId: string }).submissionId);
      const submission = await env.DB.prepare(
        "SELECT flow_token FROM flow_submissions WHERE id=?1",
      ).bind(submissionId).first<{ flow_token: string }>();
      await expect(handleFlowRequest(env.DB, {
        action: "data_exchange",
        screen: "SCREEN_A",
        data: { value: `cycle-${index}` },
        flow_token: submission!.flow_token,
      })).resolves.toMatchObject({ screen: "SUCCESS" });
      expect((await SELF.fetch(`https://x.com/api/flows/${flow.id}`, {
        method: "DELETE", headers: AUTH,
      })).status).toBe(200);
    }
    expect(await env.DB.prepare(
      `SELECT COUNT(*) total FROM flows WHERE id IN (${flowIds.map((_, index) => `?${index + 1}`).join(",")})`,
    ).bind(...flowIds).first("total")).toBe(0);
    expect(graph.counts()).toEqual({ creations: 8, deprecations: 8, messages: 8 });
  });
});
