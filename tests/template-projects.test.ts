import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

const AUTH = { "x-api-key": "dev-api-key", "content-type": "application/json" };
const api = (path: string, init: RequestInit = {}) =>
  SELF.fetch(`https://x.com${path}`, { ...init, headers: { ...AUTH, ...init.headers } });
const createProject = async (suffix = crypto.randomUUID()) => {
  const response = await api("/api/template-projects", {
    method: "POST",
    body: JSON.stringify({ title: `AUTOQA Projeto ${suffix}`, strategy: "utility", source: "manual" }),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ id: string; title: string }>;
};
const validItem = (name = `autoqa_${crypto.randomUUID().replaceAll("-", "_")}`) => ({
  name,
  content: "Olá {{1}}, sua confirmação está disponível.",
  language: "pt_BR",
  category: "UTILITY",
  variables: { "1": "Ana" },
});
const createItem = async (projectId: string, item = validItem()) => {
  const response = await api(`/api/template-projects/${projectId}/items`, {
    method: "POST",
    body: JSON.stringify(item),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ id: string; sample_variables: Record<string, string> }>;
};
const configureMeta = async () => {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings(key,value)VALUES('whatsapp_phone_id','11111') ON CONFLICT(key) DO UPDATE SET value='11111'"),
    env.DB.prepare("INSERT INTO settings(key,value)VALUES('whatsapp_waba_id','22222') ON CONFLICT(key) DO UPDATE SET value='22222'"),
  ]);
};
afterEach(() => vi.unstubAllGlobals());

describe("Projetos/Fábrica — contratos e integridade", () => {
  it("cria, lista e reabre o mesmo projeto", async () => {
    const project = await createProject();
    const list = (await (await api("/api/template-projects")).json()) as { items: Array<{ id: string }> };
    expect(list.items.some((item) => item.id === project.id)).toBe(true);
    expect((await api(`/api/template-projects/${project.id}`)).status).toBe(200);
  });

  it("renomeia projeto legado bypass sem reativar criação bypass", async () => {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO template_projects(id,title,strategy)VALUES(?1,'Legado','bypass')").bind(id).run();
    const renamed = await api(`/api/template-projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Legado renomeado", strategy: "bypass" }),
    });
    expect(renamed.status).toBe(200);
    const creating = await api("/api/template-projects", {
      method: "POST",
      body: JSON.stringify({ title: "Bypass novo", strategy: "bypass" }),
    });
    expect(creating.status).toBe(400);
  });

  it("remove projeto composto somente por rascunhos", async () => {
    const project = await createProject();
    await createItem(project.id);
    expect((await api(`/api/template-projects/${project.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await api(`/api/template-projects/${project.id}`)).status).toBe(404);
  });

  it("retorna 404 para projeto e item inexistentes", async () => {
    expect((await api(`/api/template-projects/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await api(`/api/template-projects/items/${crypto.randomUUID()}`, { method: "DELETE" })).status).toBe(404);
  });

  it("rejeita campos extras no projeto", async () => {
    const response = await api("/api/template-projects", {
      method: "POST",
      body: JSON.stringify({ title: "Inválido", strategy: "utility", admin: true }),
    });
    expect(response.status).toBe(400);
  });

  it("persiste variables também como exemplos quando sampleVariables não é enviado", async () => {
    const project = await createProject();
    const item = await createItem(project.id);
    expect(item.sample_variables).toEqual({ "1": "Ana" });
  });

  it.each([
    ["Autenticação genérica", { ...validItem(), category: "AUTHENTICATION" }, 400],
    ["corpo acima do limite", { ...validItem(), content: `Olá {{1}}, ${"x".repeat(1100)}` }, 400],
    ["sintaxe quebrada", { ...validItem(), content: "Olá {1}, confirmação disponível." }, 400],
    ["variável na borda", { ...validItem(), content: "Confirmação para {{1}}" }, 400],
    ["lacuna", { ...validItem(), content: "Olá {{2}}, confirmação disponível.", variables: { "2": "Ana" } }, 400],
    ["exemplo ausente", { ...validItem(), variables: {} }, 400],
  ])("rejeita %s antes de persistir", async (_label, item, status) => {
    const project = await createProject();
    const response = await api(`/api/template-projects/${project.id}/items`, {
      method: "POST",
      body: JSON.stringify(item),
    });
    expect(response.status).toBe(status);
  });

  it("rejeita nomes repetidos dentro do lote gerado", async () => {
    const item = validItem("nome_repetido");
    const response = await api("/api/template-projects/save-generated", {
      method: "POST",
      body: JSON.stringify({ title: "Duplicado", strategy: "utility", prompt: "Teste", items: [item, item] }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "DUPLICATE_TEMPLATE_NAME" });
  });

  it("rejeita nome repetido ao adicionar ou renomear item", async () => {
    const project = await createProject();
    const first = await createItem(project.id, validItem("mesmo_nome"));
    const duplicate = await api(`/api/template-projects/${project.id}/items`, {
      method: "POST",
      body: JSON.stringify(validItem("mesmo_nome")),
    });
    expect(duplicate.status).toBe(409);
    const second = await createItem(project.id, validItem("outro_nome"));
    const renamed = await api(`/api/template-projects/items/${second.id}`, {
      method: "PATCH",
      body: JSON.stringify(validItem("mesmo_nome")),
    });
    expect(renamed.status).toBe(409);
    expect(first.id).not.toBe(second.id);
  });

  it("atualiza contadores, estado e data do projeto após mutações", async () => {
    const project = await createProject();
    const before = (await (await api(`/api/template-projects/${project.id}`)).json()) as { updated_at: string };
    const item = await createItem(project.id);
    const afterCreate = (await (await api(`/api/template-projects/${project.id}`)).json()) as { template_count: number; status: string; updated_at: string };
    expect(afterCreate).toMatchObject({ template_count: 1, status: "draft" });
    expect(afterCreate.updated_at >= before.updated_at).toBe(true);
    await api(`/api/template-projects/items/${item.id}`, { method: "DELETE" });
    expect(await (await api(`/api/template-projects/${project.id}`)).json()).toMatchObject({ template_count: 0, status: "draft" });
  });

  it("bloqueia edição e exclusão local de item publicado", async () => {
    const project = await createProject();
    const item = await createItem(project.id);
    await env.DB.prepare("UPDATE template_project_items SET meta_id='meta-1',meta_status='PENDING' WHERE id=?1").bind(item.id).run();
    expect((await api(`/api/template-projects/items/${item.id}`, { method: "PATCH", body: JSON.stringify(validItem()) })).status).toBe(409);
    const removed = await api(`/api/template-projects/items/${item.id}`, { method: "DELETE" });
    expect(removed.status).toBe(409);
    expect(await removed.json()).toMatchObject({ code: "REMOTE_TEMPLATE_DELETE_BLOCKED" });
  });

  it("bloqueia exclusão local de projeto com item publicado", async () => {
    const project = await createProject();
    const item = await createItem(project.id);
    await env.DB.prepare("UPDATE template_project_items SET meta_id='meta-2' WHERE id=?1").bind(item.id).run();
    const removed = await api(`/api/template-projects/${project.id}`, { method: "DELETE" });
    expect(removed.status).toBe(409);
    expect(await removed.json()).toMatchObject({ code: "REMOTE_PROJECT_DELETE_BLOCKED" });
  });

  it("envia exemplos na chamada Meta e persiste ID e estado", async () => {
    await configureMeta();
    const project = await createProject();
    const item = await createItem(project.id);
    const fetchMock = vi.fn(async () => Response.json({ id: "meta-template-1", status: "PENDING" }));
    vi.stubGlobal("fetch", fetchMock);
    const submitted = await api(`/api/template-projects/${project.id}/submit`, {
      method: "POST",
      body: JSON.stringify({ itemIds: [item.id] }),
    });
    expect(submitted.status).toBe(200);
    const payload = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(payload.components.find((component: { type: string }) => component.type === "BODY").example).toEqual({ body_text: [["Ana"]] });
    expect(await env.DB.prepare("SELECT meta_id,meta_status,status FROM template_project_items WHERE id=?1").bind(item.id).first()).toEqual({ meta_id: "meta-template-1", meta_status: "PENDING", status: "submitted" });
  });

  it("falha fechado quando a Meta não devolve ID e permite reteste", async () => {
    await configureMeta();
    const project = await createProject();
    const item = await createItem(project.id);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "PENDING" })));
    const submitted = await api(`/api/template-projects/${project.id}/submit`, {
      method: "POST",
      body: JSON.stringify({ itemIds: [item.id] }),
    });
    expect(submitted.status).toBe(207);
    expect(await env.DB.prepare("SELECT meta_id,status FROM template_project_items WHERE id=?1").bind(item.id).first()).toEqual({ meta_id: null, status: "draft" });
  });

  it("expõe o diagnóstico seguro e acionável devolvido pela Meta", async () => {
    await configureMeta();
    const project = await createProject();
    const item = await createItem(project.id);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      error: {
        code: 100,
        message: "Invalid parameter",
        error_user_msg: "O corpo possui variáveis demais para a quantidade de texto.",
      },
    }, { status: 400 })));
    const submitted = await api(`/api/template-projects/${project.id}/submit`, {
      method: "POST",
      body: JSON.stringify({ itemIds: [item.id] }),
    });
    expect(submitted.status).toBe(207);
    expect(await submitted.json()).toMatchObject({
      failed: [{ id: item.id, error: "O corpo possui variáveis demais para a quantidade de texto." }],
    });
  });

  it("impede duas publicações concorrentes do mesmo item", async () => {
    await configureMeta();
    const project = await createProject();
    const item = await createItem(project.id);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = vi.fn(async () => { await gate; return Response.json({ id: "meta-once", status: "PENDING" }); });
    vi.stubGlobal("fetch", fetchMock);
    const first = api(`/api/template-projects/${project.id}/submit`, { method: "POST", body: JSON.stringify({ itemIds: [item.id] }) });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const second = await api(`/api/template-projects/${project.id}/submit`, { method: "POST", body: JSON.stringify({ itemIds: [item.id] }) });
    release();
    const firstResult = await first;
    expect([firstResult.status, second.status].sort()).toEqual([200, 207]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sincroniza aprovação e motivo de rejeição pelo nome", async () => {
    await configureMeta();
    const project = await createProject();
    await createItem(project.id, validItem("aprovado_sync"));
    await createItem(project.id, validItem("rejeitado_sync"));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [
      { id: "meta-a", name: "aprovado_sync", language: "pt_BR", category: "UTILITY", status: "APPROVED", components: [] },
      { id: "meta-r", name: "rejeitado_sync", language: "pt_BR", category: "UTILITY", status: "REJECTED", rejected_reason: "INVALID_FORMAT", components: [] },
    ] })));
    const synced = await api(`/api/template-projects/${project.id}/sync`, { method: "POST" });
    expect(synced.status).toBe(200);
    expect(await synced.json()).toEqual({ updated: 2 });
    const rows = (await env.DB.prepare("SELECT name,meta_status,rejected_reason FROM template_project_items WHERE project_id=?1 ORDER BY name").bind(project.id).all()).results;
    expect(rows).toEqual([
      { name: "aprovado_sync", meta_status: "APPROVED", rejected_reason: null },
      { name: "rejeitado_sync", meta_status: "REJECTED", rejected_reason: "INVALID_FORMAT" },
    ]);
  });
});

const p95 = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] || 0;
};
const deleteProjects = async (ids: string[]) => {
  for (let offset = 0; offset < ids.length; offset += 100) {
    await env.DB.batch(
      ids.slice(offset, offset + 100).map((id) =>
        env.DB.prepare("DELETE FROM template_projects WHERE id=?1").bind(id),
      ),
    );
  }
};
const seedDenseProjects = async (projectCount: number, itemCount: number) => {
  const prefix = `AUTOQA_STRESS_${crypto.randomUUID()}`;
  const ids = Array.from({ length: projectCount }, () => crypto.randomUUID());
  for (let offset = 0; offset < ids.length; offset += 100) {
    await env.DB.batch(
      ids.slice(offset, offset + 100).map((id, index) =>
        env.DB.prepare(
          "INSERT INTO template_projects(id,title,strategy,source,template_count)VALUES(?1,?2,'utility','AUTOQA',?3)",
        ).bind(id, `${prefix}_${offset + index}`, itemCount),
      ),
    );
  }
  const statements = ids.flatMap((projectId, projectIndex) =>
    Array.from({ length: itemCount }, (_, itemIndex) =>
      env.DB.prepare(
        `INSERT INTO template_project_items(id,project_id,name,content,language,category,variables_json,sample_variables_json)
         VALUES(?1,?2,?3,'Olá {{1}}, confirmação disponível.','pt_BR','UTILITY','{"1":"Ana"}','{"1":"Ana"}')`,
      ).bind(
        crypto.randomUUID(),
        projectId,
        `autoqa_stress_${projectIndex}_${itemIndex}`,
      ),
    ),
  );
  for (let offset = 0; offset < statements.length; offset += 100)
    await env.DB.batch(statements.slice(offset, offset + 100));
  return { ids, prefix };
};

describe("Projetos/Fábrica — carga e resiliência", () => {
  it("lista 200 projetos com 4.000 templates sem perder contadores", async () => {
    const seeded = await seedDenseProjects(200, 20);
    try {
      const latencies: number[] = [];
      let matched = 0;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const started = performance.now();
        const response = await api("/api/template-projects");
        latencies.push(performance.now() - started);
        expect(response.status).toBe(200);
        const body = (await response.json()) as {
          items: Array<{ title: string; template_count: number }>;
        };
        matched = body.items.filter((item) => item.title.startsWith(seeded.prefix)).length;
        expect(
          body.items
            .filter((item) => item.title.startsWith(seeded.prefix))
            .every((item) => Number(item.template_count) === 20),
        ).toBe(true);
      }
      expect(matched).toBe(200);
      expect(p95(latencies)).toBeLessThan(3_000);
    } finally {
      await deleteProjects(seeded.ids);
    }
  }, 90_000);

  it("abre projeto com 500 itens dentro do orçamento local", async () => {
    const seeded = await seedDenseProjects(1, 500);
    try {
      const latencies: number[] = [];
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const started = performance.now();
        const response = await api(`/api/template-projects/${seeded.ids[0]}`);
        latencies.push(performance.now() - started);
        expect(response.status).toBe(200);
        expect(((await response.json()) as { items: unknown[] }).items).toHaveLength(500);
      }
      expect(p95(latencies)).toBeLessThan(3_000);
    } finally {
      await deleteProjects(seeded.ids);
    }
  }, 60_000);

  it("serializa dez gravações e dez renomeações concorrentes sem erro interno", async () => {
    const project = await createProject();
    try {
      const creations = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          api(`/api/template-projects/${project.id}/items`, {
            method: "POST",
            body: JSON.stringify(validItem(`concorrente_${index}`)),
          }),
        ),
      );
      expect(creations.map((response) => response.status)).toEqual(Array(10).fill(201));
      const renames = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          api(`/api/template-projects/${project.id}`, {
            method: "PATCH",
            body: JSON.stringify({ title: `Renomeado ${index}`, strategy: "utility" }),
          }),
        ),
      );
      expect(renames.every((response) => response.status === 200)).toBe(true);
      const detail = (await (await api(`/api/template-projects/${project.id}`)).json()) as {
        title: string;
        items: unknown[];
      };
      expect(detail.items).toHaveLength(10);
      expect(detail.title).toMatch(/^Renomeado \d$/);
    } finally {
      await deleteProjects([project.id]);
    }
  });

  it("mantém unicidade do nome sob dez criações simultâneas", async () => {
    const project = await createProject();
    try {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          api(`/api/template-projects/${project.id}/items`, {
            method: "POST",
            body: JSON.stringify(validItem("mesmo_nome_concorrente")),
          }),
        ),
      );
      expect(results.filter((response) => response.status === 201)).toHaveLength(1);
      expect(results.filter((response) => response.status === 409)).toHaveLength(9);
      const count = await env.DB.prepare(
        "SELECT COUNT(*) total FROM template_project_items WHERE project_id=?1 AND lower(name)='mesmo_nome_concorrente'",
      ).bind(project.id).first<{ total: number }>();
      expect(Number(count?.total)).toBe(1);
    } finally {
      await deleteProjects([project.id]);
    }
  });

  it("aceita lote máximo de 20 itens e rejeita 21 sem persistência parcial", async () => {
    const items = Array.from({ length: 20 }, (_, index) =>
      validItem(`limite_${String(index).padStart(2, "0")}`),
    );
    const accepted = await api("/api/template-projects/save-generated", {
      method: "POST",
      body: JSON.stringify({ title: "AUTOQA limite 20", strategy: "utility", prompt: "Limite", items }),
    });
    expect(accepted.status).toBe(201);
    const acceptedId = ((await accepted.json()) as { id: string }).id;
    try {
      const rejected = await api("/api/template-projects/save-generated", {
        method: "POST",
        body: JSON.stringify({ title: "AUTOQA limite 21", strategy: "utility", prompt: "Limite", items: [...items, validItem("limite_20")] }),
      });
      expect(rejected.status).toBe(400);
      const leaked = await env.DB.prepare("SELECT COUNT(*) total FROM template_projects WHERE title='AUTOQA limite 21'").first<{ total: number }>();
      expect(Number(leaked?.total)).toBe(0);
    } finally {
      await deleteProjects([acceptedId]);
    }
  });

  it("sincroniza catálogo remoto com 500 templates e seus estados", async () => {
    await configureMeta();
    const seeded = await seedDenseProjects(1, 500);
    try {
      const remote = Array.from({ length: 500 }, (_, index) => ({
        id: `meta-${index}`,
        name: `autoqa_stress_0_${index}`,
        language: "pt_BR",
        category: "UTILITY",
        status: index % 7 === 0 ? "REJECTED" : "APPROVED",
        rejected_reason: index % 7 === 0 ? "INVALID_FORMAT" : undefined,
        components: [],
      }));
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: remote })));
      const response = await api(`/api/template-projects/${seeded.ids[0]}/sync`, { method: "POST" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ updated: 500 });
      const counts = await env.DB.prepare(
        "SELECT COUNT(*) total,SUM(meta_status='APPROVED') approved,SUM(meta_status='REJECTED') rejected FROM template_project_items WHERE project_id=?1",
      ).bind(seeded.ids[0]).first<{ total: number; approved: number; rejected: number }>();
      expect(Number(counts?.total)).toBe(500);
      expect(Number(counts?.approved) + Number(counts?.rejected)).toBe(500);
    } finally {
      await deleteProjects(seeded.ids);
    }
  }, 60_000);

  it("executa vinte ciclos completos e remove todos os artefatos", async () => {
    const ids: string[] = [];
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const project = await createProject(`ciclo_${cycle}_${crypto.randomUUID()}`);
      ids.push(project.id);
      const item = await createItem(project.id, validItem(`ciclo_item_${cycle}`));
      expect((await api(`/api/template-projects/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...validItem(`ciclo_item_${cycle}`), content: "Olá {{1}}, ciclo atualizado." }),
      })).status).toBe(200);
      expect((await api(`/api/template-projects/${project.id}`, { method: "DELETE" })).status).toBe(200);
    }
    const placeholders = ids.map(() => "?").join(",");
    const residue = await env.DB.prepare(
      `SELECT COUNT(*) total FROM template_projects WHERE id IN (${placeholders})`,
    ).bind(...ids).first<{ total: number }>();
    expect(Number(residue?.total)).toBe(0);
  });

  it("recupera envio após indisponibilidade do provedor sem duplicar template", async () => {
    await configureMeta();
    const project = await createProject();
    try {
      const item = await createItem(project.id, validItem("recuperacao_meta"));
      vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("provider_timeout"); }));
      const failed = await api(`/api/template-projects/${project.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ itemIds: [item.id] }),
      });
      expect(failed.status).toBe(207);
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "meta-recovered", status: "PENDING" })));
      const recovered = await api(`/api/template-projects/${project.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ itemIds: [item.id] }),
      });
      expect(recovered.status).toBe(200);
      expect(await env.DB.prepare("SELECT meta_id,status FROM template_project_items WHERE id=?1").bind(item.id).first()).toEqual({
        meta_id: "meta-recovered",
        status: "submitted",
      });
    } finally {
      await env.DB.prepare("UPDATE template_project_items SET meta_id=NULL WHERE project_id=?1").bind(project.id).run();
      await deleteProjects([project.id]);
    }
  });
});
