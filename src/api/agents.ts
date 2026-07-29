import { Hono } from "hono";
import { z } from "zod";
import { readJsonBody } from "./body";
import { aiConfiguration, generateGroundedText } from "../ai/drafts";
import {
  agentKnowledgeDocumentIds,
  extractKnowledgeSources,
  searchKnowledge,
} from "../knowledge/service";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  instructions: z.string().trim().min(1).max(12_000),
  active: z.boolean().default(true),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().min(100).max(8192).default(1024),
  debounce_ms: z.number().int().min(0).max(30_000).default(5000),
  rag_similarity_threshold: z.number().min(0).max(1).default(0.5),
  rag_max_results: z.number().int().min(1).max(20).default(5),
  handoff_enabled: z.boolean().default(true),
  handoff_instructions: z.string().trim().max(4000).default(""),
}).strict();

export const agentsRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) => {
    const setting = await c.env.DB.prepare(
      "SELECT value FROM settings WHERE key='ai_global_enabled'",
    ).first<{ value: string }>();
    const rows = (
      await c.env.DB.prepare(
        `SELECT a.*,COUNT(ad.document_id) document_count
         FROM ai_agents a LEFT JOIN ai_agent_documents ad ON ad.agent_id=a.id
         GROUP BY a.id ORDER BY a.is_default DESC,a.created_at,a.id`,
      ).all()
    ).results;
    const items = rows.map((row) => ({
      ...row,
      active: Boolean(row.active),
      is_default: Boolean(row.is_default),
      handoff_enabled: Boolean(row.handoff_enabled),
    }));
    return c.json({ enabled: setting?.value === "true", items });
  })
  .put("/enabled", async (c) => {
    const raw = await readJsonBody(c, 1024);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z.object({ enabled: z.boolean() }).strict().safeParse(raw.value);
    if (!body.success) return c.json({ error: "estado inválido" }, 400);
    await c.env.DB.prepare(
      `INSERT INTO settings(key,value)VALUES('ai_global_enabled',?1)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')`,
    ).bind(String(body.data.enabled)).run();
    return c.json({ enabled: body.data.enabled });
  })
  .post("/", async (c) => {
    const raw = await readJsonBody(c, 20_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = schema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "agente inválido" }, 400);
    const id = crypto.randomUUID();
    const a = body.data;
    await c.env.DB.prepare(
      `INSERT INTO ai_agents
       (id,name,description,instructions,active,temperature,max_tokens,debounce_ms,
        rag_similarity_threshold,rag_max_results,handoff_enabled,handoff_instructions)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`,
    ).bind(
      id, a.name, a.description, a.instructions, a.active ? 1 : 0,
      a.temperature, a.max_tokens, a.debounce_ms, a.rag_similarity_threshold,
      a.rag_max_results, a.handoff_enabled ? 1 : 0, a.handoff_instructions,
    ).run();
    return c.json({ id }, 201);
  })
  .patch("/:id", async (c) => {
    const raw = await readJsonBody(c, 20_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = schema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "agente inválido" }, 400);
    const a = body.data;
    const result = await c.env.DB.prepare(
      `UPDATE ai_agents SET name=?2,description=?3,instructions=?4,active=?5,
       temperature=?6,max_tokens=?7,debounce_ms=?8,rag_similarity_threshold=?9,
       rag_max_results=?10,handoff_enabled=?11,handoff_instructions=?12,
       updated_at=datetime('now') WHERE id=?1`,
    ).bind(
      c.req.param("id"), a.name, a.description, a.instructions, a.active ? 1 : 0,
      a.temperature, a.max_tokens, a.debounce_ms, a.rag_similarity_threshold,
      a.rag_max_results, a.handoff_enabled ? 1 : 0, a.handoff_instructions,
    ).run();
    return result.meta.changes
      ? c.json({ ok: true })
      : c.json({ error: "agente não encontrado" }, 404);
  })
  .delete("/:id", async (c) => {
    const agent = await c.env.DB.prepare(
      "SELECT is_default FROM ai_agents WHERE id=?1",
    ).bind(c.req.param("id")).first<{ is_default: number }>();
    if (!agent) return c.json({ error: "agente não encontrado" }, 404);
    if (agent.is_default)
      return c.json({ error: "o agente padrão não pode ser excluído" }, 409);
    await c.env.DB.prepare("DELETE FROM ai_agents WHERE id=?1")
      .bind(c.req.param("id")).run();
    return c.json({ ok: true });
  })
  .get("/:id/documents", async (c) => {
    const rows = (
      await c.env.DB.prepare(
        `SELECT d.id,d.name,d.mime_type,d.status,d.created_at,d.r2_key,
         CASE WHEN ad.agent_id IS NULL THEN 0 ELSE 1 END attached
         FROM knowledge_documents d
         LEFT JOIN ai_agent_documents ad ON ad.document_id=d.id AND ad.agent_id=?1
         WHERE d.status<>'deleted' ORDER BY d.created_at DESC`,
      ).bind(c.req.param("id")).all()
    ).results;
    const items = await Promise.all(rows.map(async (row) => {
      const source = row.r2_key
        ? await c.env.MEDIA.head(String(row.r2_key)).catch(() => null)
        : null;
      const { r2_key: _r2Key, ...publicRow } = row;
      return {
        ...publicRow,
        attached: Boolean(row.attached),
        size_bytes: source?.size ?? null,
      };
    }));
    return c.json({ items });
  })
  .put("/:id/documents", async (c) => {
    const raw = await readJsonBody(c, 32_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z.object({ documentIds: z.array(z.string().uuid()).max(500) })
      .strict().safeParse(raw.value);
    if (!body.success) return c.json({ error: "documentos inválidos" }, 400);
    const statements = [
      c.env.DB.prepare("DELETE FROM ai_agent_documents WHERE agent_id=?1")
        .bind(c.req.param("id")),
      ...body.data.documentIds.map((documentId) =>
        c.env.DB.prepare(
          "INSERT OR IGNORE INTO ai_agent_documents(agent_id,document_id)VALUES(?1,?2)",
        ).bind(c.req.param("id"), documentId),
      ),
    ];
    await c.env.DB.batch(statements);
    return c.json({ ok: true });
  })
  .post("/:id/test", async (c) => {
    const agent = await c.env.DB.prepare(
      `SELECT instructions,temperature,max_tokens,rag_similarity_threshold,rag_max_results
       FROM ai_agents WHERE id=?1`,
    ).bind(c.req.param("id")).first<{
      instructions: string; temperature: number; max_tokens: number;
      rag_similarity_threshold: number; rag_max_results: number;
    }>();
    // O simulador não envia mensagens nem participa da automação do inbox.
    // Portanto deve permitir validar um agente desativado sem exigir que ele
    // seja exposto a conversas reais apenas para fins de teste.
    if (!agent) return c.json({ error: "agente inexistente" }, 404);
    const raw = await readJsonBody(c, 8192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z.object({ message: z.string().trim().min(2).max(2000) })
      .strict().safeParse(raw.value);
    if (!body.success) return c.json({ error: "mensagem inválida" }, 400);
    let sources: string[];
    try {
      const documentIds = await agentKnowledgeDocumentIds(
        c.env.DB,
        c.req.param("id"),
      );
      if (!documentIds.length)
        return c.json({
          text: "Este agente ainda não possui documentos vinculados. Vou encaminhar para uma pessoa.",
          grounded: false,
        });
      sources = extractKnowledgeSources(
        await searchKnowledge(c.env.AI_SEARCH, body.data.message, {
          maxResults: agent.rag_max_results,
          scoreThreshold: agent.rag_similarity_threshold,
          documentIds,
        }),
      ).slice(0, agent.rag_max_results);
    } catch {
      return c.json({
        text: "A base de conhecimento está temporariamente indisponível. Vou encaminhar para uma pessoa.",
        grounded: false,
      });
    }
    if (!sources.length)
      return c.json({
        text: "Não encontrei essa informação na base. Vou encaminhar para uma pessoa.",
        grounded: false,
      });
    try {
      const generated = await generateGroundedText(
        c.env.AI,
        aiConfiguration(c.env),
        [{
          id: "test",
          direction: "inbound",
          text: `REGRAS DO AGENTE: ${agent.instructions}\nPERGUNTA: ${body.data.message}`,
        }],
        sources,
        { temperature: agent.temperature, maxTokens: agent.max_tokens },
      );
      return c.json({ text: generated.text, grounded: true });
    } catch {
      return c.json({
        text: "Não consegui gerar uma resposta fundamentada. Vou encaminhar para uma pessoa.",
        grounded: false,
      });
    }
  });
