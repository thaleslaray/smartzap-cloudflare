import { Hono } from "hono";
import { z } from "zod";
import { contactsDb } from "../db/contacts";
import { parseContactsCsv } from "../domain/csv-import";
import { normalizePhone } from "../domain/phone";
import { parsePage } from "../domain/pagination";
import { readJsonBody } from "./body";

const PAGE_SIZE = 50;
const MAX_IMPORT_ROWS = 20_000; // teto por request — acima disso, dividir o CSV
const MAX_CSV_BYTES = 5_000_000;
const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["opt_in", "opt_out", "unknown", "suppressed"]).optional(),
  tagId: z.string().trim().max(128).optional(),
});
const tagSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const customFieldSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,63}$/),
    label: z.string().trim().min(1).max(120),
    type: z.enum(["text", "number", "date", "boolean"]),
  })
  .strict();
const memorySchema = z
  .object({ summary: z.string().trim().min(1).max(4096) })
  .strict();
const importPreviewSchema = z
  .object({
    csv: z.string().min(1).max(MAX_CSV_BYTES),
    mapping: z.object({
      phone: z.string().trim().min(1).max(128),
      name: z.string().trim().min(1).max(128).optional(),
      email: z.string().trim().min(1).max(128).optional(),
      tags: z.string().trim().min(1).max(128).optional(),
      defaultTags: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
      customFields: z.record(z.string().uuid(), z.string().trim().min(1).max(128)).optional(),
    }).strict(),
  }).strict();
// Mesmo texto exibido ao lado do checkbox na UI — gravado como evidência do consentimento
const OPT_IN_DECLARATION =
  "Declaro que estes contatos consentiram em receber mensagens deste negócio via WhatsApp.";

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  // Impede formula injection ao abrir a exportação em Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export const contactsRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) => {
    const query = listQuerySchema.safeParse({
      q: c.req.query("q") || undefined,
      status: c.req.query("status") || undefined,
      tagId: c.req.query("tagId") || undefined,
    });
    if (!query.success) return c.json({ error: "filtros inválidos" }, 400);
    const page = parsePage(c.req.query("page"));
    if (page === null) return c.json({ error: "página inválida" }, 400);
    const { items, total } = await contactsDb(c.env.DB).list({
      ...query.data,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
    return c.json({
      items: items.map((item) => ({
        ...item,
        tags: JSON.parse(item.tags_json || "[]"),
        tags_json: undefined,
      })),
      total,
      stats: await contactsDb(c.env.DB).stats(),
    });
  })
  .post("/", async (c) => {
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({
        phone: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(200).optional(),
        email: z.string().trim().email().max(320).optional(),
        optInConfirmed: z.boolean().optional(),
      })
      .strict()
      .safeParse(raw.value);
    if (!body.success) return c.json({ error: "payload inválido" }, 400);
    const phone = normalizePhone(body.data.phone);
    if (!phone)
      return c.json(
        { error: "telefone inválido (esperado E.164 ou nacional BR)" },
        400,
      );
    // O cadastro manual original não pede consentimento no modal. Para não
    // inferir opt-in, ele cria um contato unknown; somente a declaração
    // explícita promove o registro a opt_in e grava a evidência LGPD.
    const contact = body.data.optInConfirmed === true
      ? await contactsDb(c.env.DB).createOptInWithConsent(
          { phone, name: body.data.name, email: body.data.email?.toLowerCase() },
          OPT_IN_DECLARATION,
        )
      : await contactsDb(c.env.DB).create({
          phone,
          name: body.data.name,
          email: body.data.email?.toLowerCase(),
          status: "unknown",
        });
    if (!contact) return c.json({ error: "contato já cadastrado" }, 409);
    return c.json(contact, 201);
  })
  .post("/import", async (c) => {
    const raw = await readJsonBody(c, 6_000_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({
        csv: z.string().min(1).max(MAX_CSV_BYTES),
        mapping: z
          .object({
            phone: z.string().trim().min(1).max(128),
            name: z.string().trim().min(1).max(128).optional(),
            email: z.string().trim().min(1).max(128).optional(),
            tags: z.string().trim().min(1).max(128).optional(),
            defaultTags: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
            customFields: z.record(z.string().uuid(), z.string().trim().min(1).max(128)).optional(),
          })
          .strict(),
        optInConfirmed: z.boolean().optional(),
      })
      .strict()
      .safeParse(raw.value);
    if (!body.success) return c.json({ error: "payload inválido" }, 400);
    const parsed = parseContactsCsv(
      body.data.csv,
      body.data.mapping,
      MAX_IMPORT_ROWS,
    );
    if (parsed.tooManyRows)
      return c.json(
        {
          error: `CSV excede o teto de ${MAX_IMPORT_ROWS} linhas por import — divida o arquivo`,
        },
        413,
      );
    if (parsed.malformed)
      return c.json(
        { error: "CSV malformado ou coluna mapeada não encontrada" },
        400,
      );
    // A UI original não pede uma declaração no fluxo de CSV. Sem confirmação
    // explícita, conservamos os contatos como unknown: eles não entram em
    // campanhas até que o consentimento seja registrado depois.
    const imported = body.data.optInConfirmed === true
      ? await contactsDb(c.env.DB).bulkInsertOptInWithConsent(parsed.valid, OPT_IN_DECLARATION)
      : await contactsDb(c.env.DB).bulkInsertUnknown(parsed.valid);
    const insertedByPhone = new Map(imported.contacts.map((contact) => [contact.phone, contact.id]));
    const definitions = new Map(
      (await contactsDb(c.env.DB).listCustomFieldDefs()).map((field) => [field.id, field]),
    );
    const existingTags = await contactsDb(c.env.DB).listTags();
    const tagsByName = new Map(existingTags.map((tag) => [tag.name.toLocaleLowerCase("pt-BR"), tag]));
    for (const row of parsed.valid) {
      const contactId = insertedByPhone.get(row.phone);
      if (!contactId) continue;
      const tagIds: string[] = [];
      for (const name of row.tags) {
        const key = name.toLocaleLowerCase("pt-BR");
        let tag = tagsByName.get(key);
        if (!tag) {
          tag = await contactsDb(c.env.DB).createTag(name);
          tagsByName.set(key, tag);
        }
        tagIds.push(tag.id);
      }
      if (tagIds.length) await contactsDb(c.env.DB).setContactTags(contactId, tagIds);
      for (const [fieldId, rawValue] of Object.entries(row.customFields)) {
        const field = definitions.get(fieldId);
        if (!field) continue;
        let value: string | number | boolean = rawValue;
        if (field.type === "number") value = Number(rawValue);
        else if (field.type === "boolean") value = /^(true|1|sim|yes)$/i.test(rawValue);
        if (field.type === "number" && !Number.isFinite(value)) continue;
        try {
          await contactsDb(c.env.DB).setCustomValue(contactId, fieldId, value);
        } catch {
          // Uma célula incompatível não invalida as demais colunas do contato.
        }
      }
    }
    return c.json({
      imported: imported.inserted,
      updated: 0,
      duplicates: parsed.duplicates + imported.skipped,
      invalid: parsed.invalid.length,
    });
  })
  .post("/import-preview", async (c) => {
    const raw = await readJsonBody(c, 6_000_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = importPreviewSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "payload inválido" }, 400);
    const parsed = parseContactsCsv(body.data.csv, body.data.mapping, MAX_IMPORT_ROWS);
    if (parsed.tooManyRows) return c.json({ error: `CSV excede o teto de ${MAX_IMPORT_ROWS} linhas por import — divida o arquivo` }, 413);
    if (parsed.malformed) return c.json({ error: "CSV malformado ou coluna mapeada não encontrada" }, 400);
    const existing = await contactsDb(c.env.DB).countExistingPhones(parsed.valid.map((row) => row.phone));
    return c.json({ total: parsed.valid.length + parsed.invalid.length + parsed.duplicates, valid: parsed.valid.length, existing, duplicates: parsed.duplicates, invalid: parsed.invalid.length, sample: parsed.valid.slice(0, 3).map((row) => ({ phone: row.phone, name: row.name ?? "", email: row.email ?? "" })) });
  })
  .post("/bulk-status", async (c) => {
    const raw = await readJsonBody(c, 2_000_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({
        ids: z.array(z.string().min(1).max(128)).min(1).max(MAX_IMPORT_ROWS),
        status: z.enum(["opt_in", "opt_out", "unknown"]),
        optInConfirmed: z.boolean().optional(),
      })
      .strict()
      .safeParse(raw.value);
    if (!body.success) return c.json({ error: "payload inválido" }, 400);
    if (body.data.status === "opt_in" && body.data.optInConfirmed !== true)
      return c.json(
        { error: "declaração de opt-in é obrigatória para ativar contatos" },
        400,
      );
    const changed =
      body.data.status === "opt_in"
        ? await contactsDb(c.env.DB).setOptInWithConsent(
            body.data.ids,
            OPT_IN_DECLARATION,
          )
        : await contactsDb(c.env.DB).setStatus(body.data.ids, body.data.status);
    return c.json({ ok: true, changed });
  })
  .post("/bulk-delete", async (c) => {
    const raw = await readJsonBody(c, 2_000_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({ ids: z.array(z.string().uuid()).min(1).max(MAX_IMPORT_ROWS) })
      .strict()
      .safeParse(raw.value);
    if (!body.success) return c.json({ error: "contatos inválidos" }, 400);
    return c.json({ ok: true, deleted: await contactsDb(c.env.DB).deleteMany(body.data.ids) });
  })
  .get("/ids", async (c) => {
    const query = listQuerySchema.safeParse({
      q: c.req.query("q") || undefined,
      status: c.req.query("status") || undefined,
      tagId: c.req.query("tagId") || undefined,
    });
    if (!query.success) return c.json({ error: "filtros inválidos" }, 400);
    const ids = await contactsDb(c.env.DB).listIds({
      ...query.data,
      limit: 20_000,
    });
    return c.json({ ids, total: ids.length });
  })
  .post("/bulk-tags", async (c) => {
    const raw = await readJsonBody(c, 2_000_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(MAX_IMPORT_ROWS),
        tagIds: z.array(z.string().uuid()).min(1).max(100),
        mode: z.enum(["add", "remove", "replace"]),
      })
      .strict()
      .safeParse(raw.value);
    if (!body.success)
      return c.json({ error: "operação de tags inválida" }, 400);
    try {
      const changed = await contactsDb(c.env.DB).bulkSetTags(
        body.data.ids,
        body.data.tagIds,
        body.data.mode,
      );
      return c.json({ ok: true, changed });
    } catch (error) {
      if (error instanceof Error && error.message === "tag não encontrada")
        return c.json({ error: error.message }, 400);
      throw error;
    }
  })
  .post("/bulk-custom-field", async (c) => {
    const raw = await readJsonBody(c, 2_000_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(2_000),
        fieldId: z.string().uuid(),
        value: z.union([
          z.string().max(1024),
          z.number().finite(),
          z.boolean(),
        ]),
      })
      .strict()
      .safeParse(raw.value);
    if (!body.success)
      return c.json({ error: "operação de campo inválida" }, 400);
    try {
      const changed = await contactsDb(c.env.DB).bulkSetCustomValue(
        body.data.ids,
        body.data.fieldId,
        body.data.value,
      );
      return c.json({ ok: true, changed });
    } catch (error) {
      if (
        error instanceof Error &&
        /campo personalizado|valor incompatível/.test(error.message)
      )
        return c.json({ error: error.message }, 400);
      throw error;
    }
  })
  .get("/tags", async (c) =>
    c.json({ items: await contactsDb(c.env.DB).listTags() }),
  )
  .post("/tags", async (c) => {
    const raw = await readJsonBody(c, 4_096);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = tagSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "tag inválida" }, 400);
    try {
      return c.json(await contactsDb(c.env.DB).createTag(body.data.name), 201);
    } catch (error) {
      if (
        error instanceof Error &&
        /UNIQUE constraint failed/.test(error.message)
      )
        return c.json({ error: "já existe uma tag com esse nome" }, 409);
      throw error;
    }
  })
  .delete("/tags/:id", async (c) => {
    const removed = await contactsDb(c.env.DB).deleteTag(c.req.param("id"));
    return removed
      ? c.json({ ok: true })
      : c.json({ error: "tag não encontrada" }, 404);
  })
  .get("/custom-fields", async (c) =>
    c.json({ items: await contactsDb(c.env.DB).listCustomFieldDefs() }),
  )
  .post("/custom-fields", async (c) => {
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = customFieldSchema.safeParse(raw.value);
    if (!body.success)
      return c.json({ error: "campo personalizado inválido" }, 400);
    try {
      return c.json(
        await contactsDb(c.env.DB).createCustomField(body.data),
        201,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        /UNIQUE constraint failed/.test(error.message)
      )
        return c.json({ error: "chave ou rótulo de campo já existe" }, 409);
      throw error;
    }
  })
  .delete("/custom-fields/:id", async (c) => {
    const removed = await contactsDb(c.env.DB).deleteCustomField(
      c.req.param("id"),
    );
    return removed
      ? c.json({ ok: true })
      : c.json({ error: "campo não encontrado" }, 404);
  })
  .post("/:id/unsuppress", async (c) => {
    const changed = await contactsDb(c.env.DB).unsuppress(c.req.param("id"));
    return changed
      ? c.json({ ok: true })
      : c.json({ error: "contato não encontrado" }, 404);
  })
  .get("/export.csv", async (c) => {
    const query = listQuerySchema.safeParse({
      q: c.req.query("q") || undefined,
      status: c.req.query("status") || undefined,
    });
    if (!query.success) return c.json({ error: "filtros inválidos" }, 400);
    const rawIds = c.req.query("ids");
    const ids = rawIds ? [...new Set(rawIds.split(",").filter(Boolean))] : [];
    if (ids.length > 20_000 || ids.some((id) => !z.string().uuid().safeParse(id).success))
      return c.json({ error: "seleção inválida" }, 400);
    const items = ids.length
      ? await contactsDb(c.env.DB).listByIds(ids)
      : (await contactsDb(c.env.DB).list({ ...query.data, limit: 20_000, offset: 0 })).items;
    const lines = [
      ["nome", "email", "telefone", "status", "criado_em", "atualizado_em"]
        .map(csvCell)
        .join(","),
      ...items.map((contact) =>
        [
          contact.name,
          contact.email,
          contact.phone,
          contact.status,
          contact.created_at,
          contact.updated_at,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    c.header("content-type", "text/csv; charset=utf-8");
    c.header("content-disposition", 'attachment; filename="contatos.csv"');
    return c.body(`\uFEFF${lines.join("\r\n")}`);
  })
  .get("/:id/history", async (c) => {
    const contact = await c.env.DB.prepare(
      "SELECT id, name, phone, status, created_at, updated_at FROM contacts WHERE id = ?1",
    )
      .bind(c.req.param("id"))
      .first();
    if (!contact) return c.json({ error: "contato não encontrado" }, 404);
    const events = (
      await c.env.DB.prepare(
        `SELECT id, event_type, actor_type, summary, metadata_json, created_at
       FROM contact_history_events WHERE contact_id = ?1
       ORDER BY created_at DESC, id DESC LIMIT 200`,
      )
        .bind(c.req.param("id"))
        .all()
    ).results.map((event) => ({
      ...event,
      metadata:
        typeof event.metadata_json === "string"
          ? JSON.parse(event.metadata_json)
          : null,
      metadata_json: undefined,
    }));
    return c.json({ contact, events });
  })
  .get("/:id/profile", async (c) => {
    const profile = await contactsDb(c.env.DB).getContactProfile(
      c.req.param("id"),
    );
    return profile
      ? c.json(profile)
      : c.json({ error: "contato não encontrado" }, 404);
  })
  .patch("/:id", async (c) => {
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({
        name: z.string().trim().max(200).nullable(),
        email: z.string().trim().email().max(320).nullable().optional(),
        phone: z.string().trim().min(1).max(64),
      })
      .strict()
      .safeParse(raw.value);
    if (!body.success)
      return c.json({ error: "dados do contato inválidos" }, 400);
    const phone = normalizePhone(body.data.phone);
    if (!phone)
      return c.json(
        { error: "telefone inválido (esperado E.164 ou nacional BR)" },
        400,
      );
    try {
      const updated = await contactsDb(c.env.DB).updateIdentity(
        c.req.param("id"),
        {
          name: body.data.name || null,
          phone,
          email: body.data.email || null,
        },
      );
      return updated
        ? c.json(updated)
        : c.json({ error: "contato não encontrado" }, 404);
    } catch (error) {
      if (
        error instanceof Error &&
        /UNIQUE constraint failed/.test(error.message)
      )
        return c.json(
          { error: "telefone já cadastrado em outro contato" },
          409,
        );
      throw error;
    }
  })
  .delete("/:id", async (c) => {
    const removed = await contactsDb(c.env.DB).delete(c.req.param("id"));
    return removed
      ? c.json({ ok: true })
      : c.json({ error: "contato não encontrado" }, 404);
  })
  .put("/:id/tags", async (c) => {
    const raw = await readJsonBody(c, 32_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({ tagIds: z.array(z.string().uuid()).max(100) })
      .strict()
      .safeParse(raw.value);
    if (!body.success) return c.json({ error: "tags inválidas" }, 400);
    const exists = await c.env.DB.prepare(
      "SELECT id FROM contacts WHERE id = ?1",
    )
      .bind(c.req.param("id"))
      .first();
    if (!exists) return c.json({ error: "contato não encontrado" }, 404);
    try {
      await contactsDb(c.env.DB).setContactTags(
        c.req.param("id"),
        body.data.tagIds,
      );
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === "tag não encontrada")
        return c.json({ error: error.message }, 400);
      throw error;
    }
  })
  .put("/:id/custom-values/:fieldId", async (c) => {
    const raw = await readJsonBody(c, 8_192);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = z
      .object({
        value: z.union([
          z.string().max(1024),
          z.number().finite(),
          z.boolean(),
        ]),
      })
      .strict()
      .safeParse(raw.value);
    if (!body.success) return c.json({ error: "valor inválido" }, 400);
    const exists = await c.env.DB.prepare(
      "SELECT id FROM contacts WHERE id = ?1",
    )
      .bind(c.req.param("id"))
      .first();
    if (!exists) return c.json({ error: "contato não encontrado" }, 404);
    try {
      await contactsDb(c.env.DB).setCustomValue(
        c.req.param("id"),
        c.req.param("fieldId"),
        body.data.value,
      );
      return c.json({ ok: true });
    } catch (error) {
      if (
        error instanceof Error &&
        /campo personalizado|valor incompatível/.test(error.message)
      )
        return c.json({ error: error.message }, 400);
      throw error;
    }
  })
  .get("/:id/memory", async (c) => {
    const contact = await c.env.DB.prepare(
      "SELECT id FROM contacts WHERE id = ?1",
    )
      .bind(c.req.param("id"))
      .first();
    if (!contact) return c.json({ error: "contato não encontrado" }, 404);
    const memory = await c.env.DB.prepare(
      "SELECT id, summary, version, source_message_at, created_at, updated_at FROM contact_memories WHERE contact_id = ?1",
    )
      .bind(c.req.param("id"))
      .first();
    return c.json({ memory });
  })
  .put("/:id/memory", async (c) => {
    const raw = await readJsonBody(c, 16_384);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = memorySchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "memória inválida" }, 400);
    const contact = await c.env.DB.prepare(
      "SELECT id FROM contacts WHERE id = ?1",
    )
      .bind(c.req.param("id"))
      .first();
    if (!contact) return c.json({ error: "contato não encontrado" }, 404);
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO contact_memories (id, contact_id, summary, version)
       VALUES (?1, ?2, ?3, 1)
       ON CONFLICT(contact_id) DO UPDATE SET summary = excluded.summary,
         version = contact_memories.version + 1, updated_at = datetime('now')`,
    )
      .bind(id, c.req.param("id"), body.data.summary)
      .run();
    await contactsDb(c.env.DB).recordHistory(
      c.req.param("id"),
      "memory_updated",
      "Memória do contato atualizada",
    );
    return c.json({ ok: true });
  })
  .delete("/:id/memory", async (c) => {
    const result = await c.env.DB.prepare(
      "DELETE FROM contact_memories WHERE contact_id = ?1",
    )
      .bind(c.req.param("id"))
      .run();
    if (result.meta.changes)
      await contactsDb(c.env.DB).recordHistory(
        c.req.param("id"),
        "memory_deleted",
        "Memória do contato apagada",
      );
    return c.json({ ok: true, deleted: result.meta.changes === 1 });
  });
