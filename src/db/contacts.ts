export type Contact = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  status: "opt_in" | "opt_out" | "unknown";
  wa_id: string | null;
  user_id: string | null;
  parent_user_id: string | null;
  username: string | null;
  custom_fields: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomFieldDef = {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean";
};

export type CustomValue = string | number | boolean;

const CONSENT_PURPOSE = "marketing_messages";
const CONSENT_VERSION = "smartzap-opt-in-v1";

export function contactsDb(db: D1Database) {
  return {
    async create(input: {
      phone: string;
      name?: string;
      email?: string;
      status?: Contact["status"];
    }): Promise<Contact> {
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO contacts (id, phone, name, email, status) VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(id, input.phone, input.name ?? null, input.email ?? null, input.status ?? "unknown")
        .run();
      return (await this.getByPhone(input.phone))!;
    },
    async createIfAbsent(input: {
      phone: string;
      name?: string;
      email?: string;
      status?: Contact["status"];
    }): Promise<Contact | null> {
      const id = crypto.randomUUID();
      const result = await db
        .prepare(
          "INSERT OR IGNORE INTO contacts (id, phone, name, email, status) VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(id, input.phone, input.name ?? null, input.email ?? null, input.status ?? "unknown")
        .run();
      if (result.meta.changes !== 1) return null;
      return this.getByPhone(input.phone);
    },
    async createOptInWithConsent(
      input: { phone: string; name?: string; email?: string },
      declarationText: string,
    ): Promise<Contact | null> {
      const id = crypto.randomUUID();
      try {
        // D1 executa batch como transação: o contato não pode nascer opt-in se a
        // evidência falhar, nem a evidência pode existir sem o contato.
        await db.batch([
          db
            .prepare(
              "INSERT INTO contacts (id, phone, name, email, status) VALUES (?1, ?2, ?3, ?4, 'opt_in')",
            )
            .bind(id, input.phone, input.name ?? null, input.email ?? null),
          db
            .prepare(
              `INSERT INTO consent_events
               (id, source, declaration_text, contact_count, contact_id, source_detail, purpose, declaration_version)
             VALUES (?1, 'manual', ?2, 1, ?3, 'manual_dashboard', ?4, ?5)`,
            )
            .bind(
              crypto.randomUUID(),
              declarationText,
              id,
              CONSENT_PURPOSE,
              CONSENT_VERSION,
            ),
        ]);
      } catch (error) {
        // Uma corrida de cadastro pelo mesmo telefone é conflito, não erro 500.
        // Qualquer outra falha (inclusive ao persistir consentimento) continua subindo.
        if (await this.getByPhone(input.phone)) return null;
        throw error;
      }
      return this.getByPhone(input.phone);
    },
    /**
     * O destinatário de teste é cadastrado deliberadamente pelo operador nas
     * configurações. Ele precisa existir como contato elegível para que a
     * mesma prévia, pré-validação e fila usadas no disparo possam ser usadas
     * no teste — sem abrir exceção nas regras da audiência normal.
     */
    async ensureTestRecipient(input: { phone: string; name?: string }): Promise<Contact> {
      const declaration = "Declaro que este número foi configurado pelo operador como destinatário autorizado de teste via WhatsApp.";
      let contact = await this.getByPhone(input.phone);
      if (!contact) {
        contact = await this.createOptInWithConsent(input, declaration);
        if (contact) return contact;
        contact = await this.getByPhone(input.phone);
      }
      if (!contact) throw new Error("não foi possível preparar o contato de teste");

      if (contact.status !== "opt_in") {
        await this.setOptInWithConsent([contact.id], declaration);
      } else {
        // Dados antigos podem já estar como opt-in, mas sem a evidência que a
        // audiência exige. Registra somente se ainda não houver consentimento
        // ativo para este contato.
        await db.prepare(
          `INSERT INTO consent_events
             (id, source, declaration_text, contact_count, contact_id, source_detail, purpose, declaration_version)
           SELECT ?1, 'manual', ?2, 1, ?3, 'test_contact_settings', ?4, ?5
           WHERE NOT EXISTS (
             SELECT 1 FROM consent_events
              WHERE contact_id = ?3 AND purpose = ?4 AND revoked_at IS NULL
           )`,
        ).bind(
          crypto.randomUUID(), declaration, contact.id,
          CONSENT_PURPOSE, CONSENT_VERSION,
        ).run();
      }
      return (await this.getByPhone(input.phone))!;
    },
    async getByPhone(phone: string): Promise<Contact | null> {
      return db
        .prepare("SELECT * FROM contacts WHERE phone = ?1")
        .bind(phone)
        .first<Contact>();
    },
    async getByWaId(waId: string): Promise<Contact | null> {
      return db
        .prepare("SELECT * FROM contacts WHERE wa_id = ?1")
        .bind(waId)
        .first<Contact>();
    },
    async getByUserId(userId: string): Promise<Contact | null> {
      return db
        .prepare("SELECT * FROM contacts WHERE user_id = ?1")
        .bind(userId)
        .first<Contact>();
    },
    async updateIdentity(
      contactId: string,
      input: { name: string | null; phone: string; email?: string | null },
    ): Promise<Contact | null> {
      const current = await db
        .prepare("SELECT * FROM contacts WHERE id = ?1")
        .bind(contactId)
        .first<Contact>();
      if (!current) return null;
      await db
        .prepare(
          `UPDATE contacts SET name = ?2, phone = ?3, email = ?4, updated_at = datetime('now') WHERE id = ?1`,
        )
        .bind(contactId, input.name, input.phone, input.email ?? current.email)
        .run();
      await this.recordHistory(
        contactId,
        "contact_updated",
        "Dados principais do contato atualizados",
        {
          changed: [
            current.name !== input.name ? "name" : null,
            current.phone !== input.phone ? "phone" : null,
            input.email !== undefined && current.email !== input.email ? "email" : null,
          ].filter(Boolean),
        },
      );
      return db
        .prepare("SELECT * FROM contacts WHERE id = ?1")
        .bind(contactId)
        .first<Contact>();
    },
    async delete(contactId: string): Promise<boolean> {
      const exists = await db
        .prepare("SELECT id FROM contacts WHERE id = ?1")
        .bind(contactId)
        .first();
      if (!exists) return false;
      await db
        .prepare("DELETE FROM contacts WHERE id = ?1")
        .bind(contactId)
        .run();
      return true;
    },
    async deleteMany(contactIds: string[]): Promise<number> {
      if (!contactIds.length) return 0;
      const placeholders = contactIds.map((_, index) => `?${index + 1}`).join(",");
      const result = await db
        .prepare(`DELETE FROM contacts WHERE id IN (${placeholders})`)
        .bind(...contactIds)
        .run();
      return result.meta.changes ?? 0;
    },
    async listByIds(contactIds: string[]) {
      if (!contactIds.length) return [] as Contact[];
      const placeholders = contactIds.map((_, index) => `?${index + 1}`).join(",");
      return (
        await db
          .prepare(`SELECT * FROM contacts WHERE id IN (${placeholders}) ORDER BY created_at DESC`)
          .bind(...contactIds)
          .all<Contact>()
      ).results;
    },
    async countExistingPhones(phones: string[]) {
      const unique = [...new Set(phones)];
      let count = 0;
      for (let offset = 0; offset < unique.length; offset += 90) {
        const batch = unique.slice(offset, offset + 90);
        const placeholders = batch.map((_, index) => `?${index + 1}`).join(",");
        const row = await db
          .prepare(`SELECT COUNT(*) AS n FROM contacts WHERE phone IN (${placeholders})`)
          .bind(...batch)
          .first<{ n: number }>();
        count += row?.n ?? 0;
      }
      return count;
    },
    async ensureInboundContact(input: {
      phone?: string;
      waId?: string;
      userId?: string;
      parentUserId?: string;
      username?: string;
      profileName?: string;
    }): Promise<Contact> {
      if (!input.phone && !input.userId)
        throw new Error("contato inbound sem telefone nem BSUID");
      const stableId = input.userId ?? input.waId ?? input.phone!.replace(/^\+/, "");
      const storedPhone = input.phone ?? `bsuid:${stableId}`;
      const byUser = input.userId ? await this.getByUserId(input.userId) : null;
      const byWa = input.waId ? await this.getByWaId(input.waId) : null;
      const byPhone = input.phone ? await this.getByPhone(input.phone) : null;
      const identities = [byUser, byWa, byPhone].filter(Boolean) as Contact[];
      if (new Set(identities.map((contact) => contact.id)).size > 1)
        throw new Error("conflito entre telefone e BSUID no contato inbound");
      const existing = identities[0] ?? null;
      if (existing) {
        if (existing.user_id && input.userId && existing.user_id !== input.userId)
          throw new Error("conflito de BSUID no contato inbound");
        if (
          existing.wa_id && input.waId && existing.wa_id !== input.waId &&
          !(existing.user_id && input.userId === existing.user_id)
        )
          throw new Error("conflito de identidade WhatsApp no contato inbound");
        await db
          .prepare(
            `UPDATE contacts SET
             wa_id = COALESCE(wa_id, ?2),
             user_id = COALESCE(user_id, ?3),
             parent_user_id = COALESCE(?4, parent_user_id),
             username = COALESCE(?5, username),
             phone = CASE WHEN phone LIKE 'bsuid:%' AND ?6 IS NOT NULL THEN ?6 ELSE phone END,
             name = CASE WHEN name IS NULL AND ?7 IS NOT NULL THEN ?7 ELSE name END,
             updated_at = datetime('now')
           WHERE id = ?1`,
          )
          .bind(
            existing.id,
            input.waId ?? stableId,
            input.userId ?? null,
            input.parentUserId ?? null,
            input.username ?? null,
            input.phone ?? null,
            input.profileName ?? null,
          )
          .run();
        return (
          (input.userId ? await this.getByUserId(input.userId) : null) ??
          (input.waId ? await this.getByWaId(input.waId) : null) ??
          (await this.getByPhone(input.phone ?? storedPhone))!
        );
      }

      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT OR IGNORE INTO contacts
           (id, phone, name, status, wa_id, user_id, parent_user_id, username)
         VALUES (?1, ?2, ?3, 'unknown', ?4, ?5, ?6, ?7)`,
        )
        .bind(
          id,
          storedPhone,
          input.profileName ?? null,
          input.waId ?? stableId,
          input.userId ?? null,
          input.parentUserId ?? null,
          input.username ?? null,
        )
        .run();
      const created =
        (input.userId ? await this.getByUserId(input.userId) : null) ??
        (input.waId ? await this.getByWaId(input.waId) : null) ??
        (await this.getByPhone(storedPhone));
      if (!created)
        throw new Error("não foi possível materializar o contato inbound");
      return created;
    },
    async list(opts: {
      q?: string;
      status?: Contact["status"] | "suppressed";
      tagId?: string;
      limit: number;
      offset: number;
    }) {
      const where: string[] = [];
      const binds: unknown[] = [];
      const activeSuppression = `EXISTS (SELECT 1 FROM suppressions sx WHERE sx.phone = c.phone
        AND (sx.expires_at IS NULL OR sx.expires_at > datetime('now')))`;
      if (opts.status === "suppressed") where.push(activeSuppression);
      else if (opts.status) {
        where.push(`c.status = ?${binds.length + 1}`);
        binds.push(opts.status);
        where.push(`NOT ${activeSuppression}`);
      }
      if (opts.q) {
        const escaped = opts.q.replace(/[\\%_]/g, "\\$&");
        where.push(
          `(name LIKE ?${binds.length + 1} ESCAPE '\\' OR phone LIKE ?${binds.length + 1} ESCAPE '\\')`,
        );
        binds.push(`%${escaped}%`);
      }
      if (opts.tagId === "NONE")
        where.push(
          "NOT EXISTS (SELECT 1 FROM contact_tags ct0 WHERE ct0.contact_id = c.id)",
        );
      else if (opts.tagId) {
        where.push(
          `EXISTS (SELECT 1 FROM contact_tags ct0 WHERE ct0.contact_id = c.id AND ct0.tag_id = ?${binds.length + 1})`,
        );
        binds.push(opts.tagId);
      }
      const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const items = (
        await db
          .prepare(
            `SELECT c.*,
          CASE WHEN ${activeSuppression} THEN 'suppressed' ELSE c.status END AS status,
          (SELECT sx.reason FROM suppressions sx WHERE sx.phone = c.phone
            AND (sx.expires_at IS NULL OR sx.expires_at > datetime('now')) LIMIT 1) AS suppression_reason,
          COALESCE((SELECT json_group_array(json_object('id', tx.id, 'name', tx.name)) FROM (
            SELECT t.id, t.name FROM tags t JOIN contact_tags ct ON ct.tag_id = t.id
            WHERE ct.contact_id = c.id ORDER BY t.name COLLATE NOCASE
          ) tx), '[]') AS tags_json,
          (SELECT conv.last_message_at FROM conversations conv WHERE conv.contact_id = c.id) AS last_message_at
         FROM contacts c ${w} ORDER BY c.created_at DESC LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`,
          )
          .bind(...binds, opts.limit, opts.offset)
          .all<
            Contact & { tags_json: string; last_message_at: number | null }
          >()
      ).results;
      const total = (await db
        .prepare(`SELECT COUNT(*) as n FROM contacts c ${w}`)
        .bind(...binds)
        .first<{ n: number }>())!.n;
      return { items, total };
    },
    async listIds(opts: {
      q?: string;
      status?: Contact["status"] | "suppressed";
      tagId?: string;
      limit: number;
    }) {
      const result = await this.list({ ...opts, offset: 0 });
      return result.items.map((item) => item.id);
    },
    async stats() {
      return (await db
        .prepare(
          `SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status = 'opt_in' THEN 1 ELSE 0 END), 0) AS optIn,
        COALESCE(SUM(CASE WHEN status = 'opt_out' THEN 1 ELSE 0 END), 0) AS optOut
        FROM contacts`,
        )
        .first<{ total: number; optIn: number; optOut: number }>())!;
    },
    async bulkInsert(
      rows: { phone: string; name?: string }[],
      status: Contact["status"],
    ): Promise<number> {
      if (!rows.length) return 0;
      let inserted = 0;
      // Chunks de 50 statements — mesmo limite usado em campaign_contacts (Task 10);
      // evita mandar um batch gigante para o D1 num CSV grande.
      for (let i = 0; i < rows.length; i += 50) {
        const stmts = rows
          .slice(i, i + 50)
          .map((r) =>
            db
              .prepare(
                "INSERT OR IGNORE INTO contacts (id, phone, name, status) VALUES (?1, ?2, ?3, ?4)",
              )
              .bind(crypto.randomUUID(), r.phone, r.name ?? null, status),
          );
        const results = await db.batch(stmts);
        inserted += results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
      }
      return inserted;
    },
    async bulkInsertOptInWithConsent(
      rows: { phone: string; name?: string; email?: string }[],
      declarationText: string,
    ): Promise<{
      inserted: number;
      skipped: number;
      contacts: Array<{ id: string; phone: string }>;
    }> {
      if (!rows.length) return { inserted: 0, skipped: 0, contacts: [] };
      let inserted = 0;
      const contacts: Array<{ id: string; phone: string }> = [];
      for (let i = 0; i < rows.length; i += 50) {
        const prepared = rows.slice(i, i + 50).map((row) => ({
          ...row,
          id: crypto.randomUUID(),
        }));
        const inserts = prepared.map((row) =>
          db
            .prepare(
              "INSERT OR IGNORE INTO contacts (id, phone, name, email, status) VALUES (?1, ?2, ?3, ?4, 'opt_in')",
            )
            .bind(row.id, row.phone, row.name ?? null, row.email ?? null),
        );
        const evidences = prepared.map((row) =>
          db
            .prepare(
              `INSERT INTO consent_events
             (id, source, declaration_text, contact_count, contact_id, source_detail, purpose, declaration_version)
           SELECT ?1, 'import', ?2, 1, ?3, 'csv_import_dashboard', ?4, ?5
           WHERE EXISTS (SELECT 1 FROM contacts WHERE id = ?3)`,
            )
            .bind(
              crypto.randomUUID(),
              declarationText,
              row.id,
              CONSENT_PURPOSE,
              CONSENT_VERSION,
            ),
        );
        const results = await db.batch([...inserts, ...evidences]);
        inserted += results
          .slice(0, inserts.length)
          .reduce((total, result) => total + (result.meta.changes ?? 0), 0);
        results.slice(0, inserts.length).forEach((result, index) => {
          if ((result.meta.changes ?? 0) === 1)
            contacts.push({ id: prepared[index].id, phone: prepared[index].phone });
        });
      }
      // INSERT OR IGNORE evita recriar um telefone existente. O número de
      // linhas ignoradas precisa voltar para a UI como duplicata.
      return { inserted, skipped: rows.length - inserted, contacts };
    },
    async bulkInsertUnknown(
      rows: { phone: string; name?: string; email?: string }[],
    ): Promise<{
      inserted: number;
      skipped: number;
      contacts: Array<{ id: string; phone: string }>;
    }> {
      if (!rows.length) return { inserted: 0, skipped: 0, contacts: [] };
      let inserted = 0;
      const contacts: Array<{ id: string; phone: string }> = [];
      for (let i = 0; i < rows.length; i += 50) {
        const prepared = rows.slice(i, i + 50).map((row) => ({ ...row, id: crypto.randomUUID() }));
        const results = await db.batch(prepared.map((row) =>
          db.prepare(
            "INSERT OR IGNORE INTO contacts (id, phone, name, email, status) VALUES (?1, ?2, ?3, ?4, 'unknown')",
          ).bind(row.id, row.phone, row.name ?? null, row.email ?? null),
        ));
        inserted += results.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
        results.forEach((result, index) => {
          if ((result.meta.changes ?? 0) === 1)
            contacts.push({ id: prepared[index].id, phone: prepared[index].phone });
        });
      }
      return { inserted, skipped: rows.length - inserted, contacts };
    },
    async setStatus(ids: string[], status: Contact["status"]): Promise<number> {
      const uniqueIds = [...new Set(ids)];
      let changed = 0;
      for (let i = 0; i < uniqueIds.length; i += 80) {
        const chunk = uniqueIds.slice(i, i + 80);
        const marks = chunk.map((_, index) => `?${index + 2}`).join(",");
        const history = chunk.map((contactId) =>
          db.prepare(
            `INSERT INTO contact_history_events
             (id,contact_id,event_type,summary,metadata_json,actor_type)
             SELECT ?1,id,'status_updated','Status atualizado em lote',?2,'admin'
             FROM contacts WHERE id=?3 AND status<>?4`,
          ).bind(
            crypto.randomUUID(),
            JSON.stringify({ status }),
            contactId,
            status,
          ),
        );
        const update = db
          .prepare(
            `UPDATE contacts SET status = ?1, updated_at = datetime('now')
           WHERE id IN (${marks}) AND status <> ?1`,
          )
          .bind(status, ...chunk);
        if (status === "opt_out") {
          const revoke = db
            .prepare(
              `UPDATE consent_events SET revoked_at = datetime('now'), revoked_reason = 'manual_opt_out'
             WHERE contact_id IN (${marks}) AND revoked_at IS NULL`,
            )
            .bind(status, ...chunk);
          const results = await db.batch([...history, revoke, update]);
          changed += results[results.length - 1].meta.changes ?? 0;
        } else {
          const results = await db.batch([...history, update]);
          changed += results[results.length - 1].meta.changes ?? 0;
        }
      }
      return changed;
    },
    async setOptInWithConsent(
      ids: string[],
      declarationText: string,
    ): Promise<number> {
      const uniqueIds = [...new Set(ids)];
      let changed = 0;
      // Reserva parâmetros para id/declaration/status além dos IDs do contato.
      for (let i = 0; i < uniqueIds.length; i += 40) {
        const chunk = uniqueIds.slice(i, i + 40);
        const updateMarks = chunk.map((_, index) => `?${index + 2}`).join(",");
        const evidences = chunk.map((contactId) =>
          db
            .prepare(
              `INSERT INTO consent_events
             (id, source, declaration_text, contact_count, contact_id, source_detail, purpose, declaration_version)
           SELECT ?1, 'manual', ?2, 1, id, 'bulk_status_dashboard', ?3, ?4
           FROM contacts WHERE id = ?5 AND status <> 'opt_in'`,
            )
            .bind(
              crypto.randomUUID(),
              declarationText,
              CONSENT_PURPOSE,
              CONSENT_VERSION,
              contactId,
            ),
        );
        const history = chunk.map((contactId) =>
          db.prepare(
            `INSERT INTO contact_history_events
             (id,contact_id,event_type,summary,metadata_json,actor_type)
             SELECT ?1,id,'status_updated','Status atualizado em lote',?2,'admin'
             FROM contacts WHERE id=?3 AND status<>'opt_in'`,
          ).bind(
            crypto.randomUUID(),
            JSON.stringify({ status: "opt_in" }),
            contactId,
          ),
        );
        const update = db
          .prepare(
            `UPDATE contacts SET status = ?1, updated_at = datetime('now')
           WHERE id IN (${updateMarks}) AND status <> ?1`,
          )
          .bind("opt_in", ...chunk);
        // A evidência lê o estado anterior; o UPDATE seguinte e ela são atômicos.
        const results = await db.batch([...evidences, ...history, update]);
        changed += results[results.length - 1].meta.changes ?? 0;
      }
      return changed;
    },
    async setWaId(contactId: string, waId: string): Promise<void> {
      await db
        .prepare(
          `UPDATE contacts SET wa_id = ?2, updated_at = datetime('now')
         WHERE id = ?1 AND (wa_id IS NULL OR wa_id = ?2)`,
        )
        .bind(contactId, waId)
        .run();
    },
    async setUserId(contactId: string, userId: string): Promise<void> {
      await db
        .prepare(
          `UPDATE contacts SET user_id = ?2, updated_at = datetime('now')
         WHERE id = ?1 AND (user_id IS NULL OR user_id = ?2)`,
        )
        .bind(contactId, userId)
        .run();
    },
    async applyUserPreference(
      identity: { waId?: string; userId?: string },
      value: "stop" | "resume",
    ): Promise<number> {
      // `resume` não recria consentimento legal automaticamente: volta para unknown
      // e exige confirmação explícita no painel antes de novo disparo.
      const nextStatus: Contact["status"] =
        value === "stop" ? "opt_out" : "unknown";
      const update = db
        .prepare(
          `UPDATE contacts SET status = ?2, updated_at = datetime('now')
         WHERE ((?1 IS NOT NULL AND (wa_id = ?1 OR REPLACE(phone, '+', '') = ?1))
             OR (?3 IS NOT NULL AND user_id = ?3)) AND status <> ?2`,
        )
        .bind(identity.waId ?? null, nextStatus, identity.userId ?? null);
      const revokedReason =
        value === "stop"
          ? "meta_user_preferences_stop"
          : "meta_user_preferences_resume_requires_reconsent";
      const revoke = db
        .prepare(
          `UPDATE consent_events SET revoked_at = datetime('now'), revoked_reason = ?2
         WHERE contact_id IN (
           SELECT id FROM contacts WHERE wa_id = ?1 OR REPLACE(phone, '+', '') = ?1
             OR (?3 IS NOT NULL AND user_id = ?3)
         ) AND revoked_at IS NULL`,
        )
        .bind(identity.waId ?? null, revokedReason, identity.userId ?? null);
      const results = await db.batch([revoke, update]);
      return results[1].meta.changes ?? 0;
    },
    async listTags(): Promise<{ id: string; name: string }[]> {
      return (
        await db
          .prepare("SELECT id, name FROM tags ORDER BY name COLLATE NOCASE, id")
          .all()
      ).results as {
        id: string;
        name: string;
      }[];
    },
    async createTag(name: string) {
      const id = crypto.randomUUID();
      await db
        .prepare("INSERT INTO tags (id, name) VALUES (?1, ?2)")
        .bind(id, name)
        .run();
      return { id, name };
    },
    async deleteTag(id: string): Promise<boolean> {
      const result = await db
        .prepare("DELETE FROM tags WHERE id = ?1")
        .bind(id)
        .run();
      return result.meta.changes === 1;
    },
    async setContactTags(contactId: string, tagIds: string[]): Promise<void> {
      const unique = [...new Set(tagIds)];
      const existing = unique.length
        ? (
            await db
              .prepare(
                `SELECT id FROM tags WHERE id IN (${unique.map((_, i) => `?${i + 1}`).join(",")})`,
              )
              .bind(...unique)
              .all<{ id: string }>()
          ).results
        : [];
      if (existing.length !== unique.length)
        throw new Error("tag não encontrada");
      await db.batch([
        db
          .prepare("DELETE FROM contact_tags WHERE contact_id = ?1")
          .bind(contactId),
        ...unique.map((tagId) =>
          db
            .prepare(
              "INSERT INTO contact_tags (contact_id, tag_id) VALUES (?1, ?2)",
            )
            .bind(contactId, tagId),
        ),
      ]);
      await this.recordHistory(contactId, "tags_updated", "Tags atualizadas", {
        tagIds: unique,
      });
    },
    async bulkSetTags(
      contactIds: string[],
      tagIds: string[],
      mode: "add" | "remove" | "replace",
    ): Promise<number> {
      const contacts = [...new Set(contactIds)];
      const tags = [...new Set(tagIds)];
      if (!contacts.length || !tags.length) return 0;
      const existing = (
        await db
          .prepare(
            `SELECT id FROM tags WHERE id IN (${tags.map((_, index) => `?${index + 1}`).join(",")})`,
          )
          .bind(...tags)
          .all<{ id: string }>()
      ).results;
      if (existing.length !== tags.length)
        throw new Error("tag não encontrada");
      const statements: D1PreparedStatement[] = [];
      for (const contactId of contacts) {
        if (mode === "replace") {
          statements.push(
            db
              .prepare("DELETE FROM contact_tags WHERE contact_id=?1")
              .bind(contactId),
            ...tags.map((tagId) =>
              db
                .prepare(
                  "INSERT OR IGNORE INTO contact_tags(contact_id,tag_id) VALUES(?1,?2)",
                )
                .bind(contactId, tagId),
            ),
          );
        } else if (mode === "add") {
          statements.push(
            ...tags.map((tagId) =>
              db
                .prepare(
                  "INSERT OR IGNORE INTO contact_tags(contact_id,tag_id) VALUES(?1,?2)",
                )
                .bind(contactId, tagId),
            ),
          );
        } else {
          const marks = tags.map((_, index) => `?${index + 2}`).join(",");
          statements.push(
            db.prepare(
              `DELETE FROM contact_tags WHERE contact_id=?1 AND tag_id IN (${marks})`,
            )
              .bind(contactId, ...tags),
          );
        }
        statements.push(
          db.prepare(
            `INSERT INTO contact_history_events
             (id,contact_id,event_type,summary,metadata_json)
             VALUES(?1,?2,'tags_updated','Tags atualizadas em lote',?3)`,
          ).bind(
            crypto.randomUUID(),
            contactId,
            JSON.stringify({ tagIds: tags, mode }),
          ),
        );
      }
      for (let index = 0; index < statements.length; index += 90)
        await db.batch(statements.slice(index, index + 90));
      return contacts.length;
    },
    async listCustomFieldDefs(): Promise<CustomFieldDef[]> {
      return (
        await db
          .prepare(
            "SELECT id, key, label, type FROM custom_field_defs ORDER BY label COLLATE NOCASE, id",
          )
          .all()
      ).results as CustomFieldDef[];
    },
    async createCustomField(
      input: Omit<CustomFieldDef, "id">,
    ): Promise<CustomFieldDef> {
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO custom_field_defs (id, key, label, type) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(id, input.key, input.label, input.type)
        .run();
      return { id, ...input };
    },
    async deleteCustomField(id: string): Promise<boolean> {
      const result = await db
        .prepare("DELETE FROM custom_field_defs WHERE id = ?1")
        .bind(id)
        .run();
      return result.meta.changes === 1;
    },
    async getContactProfile(id: string) {
      const contact = await db
        .prepare("SELECT * FROM contacts WHERE id = ?1")
        .bind(id)
        .first<Contact>();
      if (!contact) return null;
      const [tags, fields] = await db.batch([
        db
          .prepare(
            `SELECT t.id, t.name FROM tags t JOIN contact_tags ct ON ct.tag_id = t.id
          WHERE ct.contact_id = ?1 ORDER BY t.name COLLATE NOCASE`,
          )
          .bind(id),
        db
          .prepare(
            `SELECT d.id, d.key, d.label, d.type, cv.value_text, cv.value_number, cv.value_date, cv.value_boolean
          FROM custom_field_defs d LEFT JOIN contact_custom_values cv
          ON cv.field_id = d.id AND cv.contact_id = ?1 ORDER BY d.label COLLATE NOCASE`,
          )
          .bind(id),
      ]);
      const values = fields.results.map((row) => {
        const r = row as Record<string, unknown>;
        const value =
          r.value_text ??
          r.value_number ??
          r.value_date ??
          (r.value_boolean === null ? null : Boolean(r.value_boolean));
        return { id: r.id, key: r.key, label: r.label, type: r.type, value };
      });
      return {
        ...contact,
        tags: tags.results as Array<{ id: string; name: string }> ,
        customValues: values,
      };
    },
    async setCustomValue(
      contactId: string,
      fieldId: string,
      value: CustomValue,
    ): Promise<void> {
      const field = await db
        .prepare("SELECT id, type FROM custom_field_defs WHERE id = ?1")
        .bind(fieldId)
        .first<Pick<CustomFieldDef, "id" | "type">>();
      if (!field) throw new Error("campo personalizado não encontrado");
      const valid =
        (field.type === "text" && typeof value === "string") ||
        (field.type === "number" &&
          typeof value === "number" &&
          Number.isFinite(value)) ||
        (field.type === "date" &&
          typeof value === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(value)) ||
        (field.type === "boolean" && typeof value === "boolean");
      if (!valid) throw new Error("valor incompatível com o tipo do campo");
      const columns =
        field.type === "text" || field.type === "date"
          ? {
              text: value,
              number: null,
              date: field.type === "date" ? value : null,
              bool: null,
            }
          : field.type === "number"
            ? { text: null, number: value, date: null, bool: null }
            : { text: null, number: null, date: null, bool: value ? 1 : 0 };
      if (field.type === "date") columns.text = null;
      await db
        .prepare(
          `INSERT INTO contact_custom_values
          (contact_id, field_id, value_text, value_number, value_date, value_boolean, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
         ON CONFLICT(contact_id, field_id) DO UPDATE SET
           value_text = excluded.value_text, value_number = excluded.value_number,
           value_date = excluded.value_date, value_boolean = excluded.value_boolean,
           updated_at = excluded.updated_at`,
        )
        .bind(
          contactId,
          fieldId,
          columns.text,
          columns.number,
          columns.date,
          columns.bool,
        )
        .run();
      await this.recordHistory(
        contactId,
        "custom_field_updated",
        "Campo personalizado atualizado",
        { fieldId },
      );
    },
    async bulkSetCustomValue(
      contactIds: string[],
      fieldId: string,
      value: CustomValue,
    ): Promise<number> {
      const contacts = [...new Set(contactIds)];
      const field = await db
        .prepare("SELECT id,type FROM custom_field_defs WHERE id=?1")
        .bind(fieldId)
        .first<Pick<CustomFieldDef, "id" | "type">>();
      if (!field) throw new Error("campo personalizado não encontrado");
      const valid =
        (field.type === "text" && typeof value === "string") ||
        (field.type === "number" && typeof value === "number" && Number.isFinite(value)) ||
        (field.type === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) ||
        (field.type === "boolean" && typeof value === "boolean");
      if (!valid) throw new Error("valor incompatível com o tipo do campo");
      const columns = field.type === "text"
        ? { text: value, number: null, date: null, bool: null }
        : field.type === "date"
          ? { text: null, number: null, date: value, bool: null }
          : field.type === "number"
            ? { text: null, number: value, date: null, bool: null }
            : { text: null, number: null, date: null, bool: value ? 1 : 0 };
      const statements = contacts.flatMap((contactId) => [
        db.prepare(
          `INSERT INTO contact_custom_values
           (contact_id,field_id,value_text,value_number,value_date,value_boolean,updated_at)
           VALUES(?1,?2,?3,?4,?5,?6,datetime('now'))
           ON CONFLICT(contact_id,field_id) DO UPDATE SET
             value_text=excluded.value_text,value_number=excluded.value_number,
             value_date=excluded.value_date,value_boolean=excluded.value_boolean,
             updated_at=excluded.updated_at`,
        ).bind(contactId, fieldId, columns.text, columns.number, columns.date, columns.bool),
        db.prepare(
          `INSERT INTO contact_history_events
           (id,contact_id,event_type,summary,metadata_json)
           VALUES(?1,?2,'custom_field_updated','Campo personalizado atualizado',?3)`,
        ).bind(crypto.randomUUID(), contactId, JSON.stringify({ fieldId })),
      ]);
      for (let index = 0; index < statements.length; index += 90)
        await db.batch(statements.slice(index, index + 90));
      return contacts.length;
    },
    async unsuppress(contactId: string): Promise<boolean> {
      const contact = await db
        .prepare("SELECT phone FROM contacts WHERE id=?1")
        .bind(contactId)
        .first<{ phone: string }>();
      if (!contact) return false;
      await db
        .prepare("DELETE FROM suppressions WHERE phone=?1")
        .bind(contact.phone)
        .run();
      await this.recordHistory(
        contactId,
        "suppression_removed",
        "Contato removido da supressão",
      );
      return true;
    },
    async recordHistory(
      contactId: string,
      eventType: string,
      summary: string,
      metadata?: unknown,
    ): Promise<void> {
      await db
        .prepare(
          `INSERT INTO contact_history_events (id, contact_id, event_type, summary, metadata_json)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
        .bind(
          crypto.randomUUID(),
          contactId,
          eventType,
          summary,
          metadata === undefined ? null : JSON.stringify(metadata),
        )
        .run();
    },
  };
}
