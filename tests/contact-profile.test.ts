import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { contactsDb } from "../src/db/contacts";

const AUTH = { "x-api-key": "dev-api-key", "content-type": "application/json" };

describe("tags e campos personalizados", () => {
  it("tipa valores, relaciona tags e registra histórico", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const contact = await contactsDb(env.DB).create({
      phone: `+55349${Date.now().toString().slice(-8)}`,
      name: "Perfil",
    });
    const tagResponse = await SELF.fetch("https://x.com/api/contacts/tags", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ name: `VIP-${suffix}` }),
    });
    const tag = (await tagResponse.json()) as { id: string };
    const fieldResponse = await SELF.fetch(
      "https://x.com/api/contacts/custom-fields",
      {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({
          key: `score_${suffix}`,
          label: `Score ${suffix}`,
          type: "number",
        }),
      },
    );
    const field = (await fieldResponse.json()) as { id: string };

    expect(
      (
        await SELF.fetch(`https://x.com/api/contacts/${contact.id}/tags`, {
          method: "PUT",
          headers: AUTH,
          body: JSON.stringify({ tagIds: [tag.id] }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await SELF.fetch(
          `https://x.com/api/contacts/${contact.id}/custom-values/${field.id}`,
          {
            method: "PUT",
            headers: AUTH,
            body: JSON.stringify({ value: 7 }),
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await SELF.fetch(
          `https://x.com/api/contacts/${contact.id}/custom-values/${field.id}`,
          {
            method: "PUT",
            headers: AUTH,
            body: JSON.stringify({ value: "sete" }),
          },
        )
      ).status,
    ).toBe(400);

    const profile = await SELF.fetch(
      `https://x.com/api/contacts/${contact.id}/profile`,
      { headers: AUTH },
    );
    const body = (await profile.json()) as {
      tags: { id: string }[];
      customValues: { id: string; value: unknown }[];
    };
    expect(body.tags).toEqual([expect.objectContaining({ id: tag.id })]);
    // O perfil devolve todos os campos definidos, inclusive os ainda sem valor,
    // para que a tela possa editá-los. A suíte compartilhada pode ter outras
    // definições criadas por cenários anteriores; o contrato desta jornada é
    // que o valor tipado deste campo esteja presente.
    expect(body.customValues).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: field.id, value: 7 })]),
    );
    const history = await SELF.fetch(
      `https://x.com/api/contacts/${contact.id}/history`,
      { headers: AUTH },
    );
    expect(
      (
        (await history.json()) as { events: { event_type: string }[] }
      ).events.map((item) => item.event_type),
    ).toEqual(expect.arrayContaining(["tags_updated", "custom_field_updated"]));
  });
  it("permite corrigir e apagar memória de forma versionada", async () => {
    const contact = await contactsDb(env.DB).create({
      phone: `+55359${Date.now().toString().slice(-8)}`,
      name: "Memória",
    });
    for (const summary of [
      "Prefere atendimento pela manhã.",
      "Prefere atendimento à tarde.",
    ]) {
      expect(
        (
          await SELF.fetch(`https://x.com/api/contacts/${contact.id}/memory`, {
            method: "PUT",
            headers: AUTH,
            body: JSON.stringify({ summary }),
          })
        ).status,
      ).toBe(200);
    }
    const current = await SELF.fetch(
      `https://x.com/api/contacts/${contact.id}/memory`,
      { headers: AUTH },
    );
    expect(await current.json()).toMatchObject({
      memory: { summary: "Prefere atendimento à tarde.", version: 2 },
    });
    const removed = await SELF.fetch(
      `https://x.com/api/contacts/${contact.id}/memory`,
      { method: "DELETE", headers: AUTH },
    );
    expect(await removed.json()).toEqual({ ok: true, deleted: true });
  });
  it("lista tags e atividade e permite excluir pela interface", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const contact = await contactsDb(env.DB).create({
      phone: `+55219${Date.now().toString().slice(-8)}`,
      name: "Lista completa",
      status: "opt_in",
    });
    const tag = (await (
      await SELF.fetch("https://x.com/api/contacts/tags", {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({ name: `Lista-${suffix}` }),
      })
    ).json()) as { id: string; name: string };
    await SELF.fetch(`https://x.com/api/contacts/${contact.id}/tags`, {
      method: "PUT",
      headers: AUTH,
      body: JSON.stringify({ tagIds: [tag.id] }),
    });
    const response = await SELF.fetch(
      `https://x.com/api/contacts?tagId=${tag.id}`,
      { headers: AUTH },
    );
    const body = (await response.json()) as {
      items: Array<{ id: string; tags: Array<{ id: string }> }>;
      stats: { total: number; optIn: number };
    };
    expect(body.items).toEqual([
      expect.objectContaining({
        id: contact.id,
        tags: [expect.objectContaining({ id: tag.id })],
      }),
    ]);
    expect(body.stats.total).toBeGreaterThan(0);
    expect(body.stats.optIn).toBeGreaterThan(0);
    expect(
      (
        await SELF.fetch(`https://x.com/api/contacts/${contact.id}`, {
          method: "DELETE",
          headers: AUTH,
        })
      ).status,
    ).toBe(200);
    expect(await contactsDb(env.DB).getByPhone(contact.phone)).toBeNull();
  });
  it("seleciona ids filtrados e altera tags e campo personalizado em lote", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const contacts = await Promise.all([
      contactsDb(env.DB).create({
        phone: `+55719${Date.now().toString().slice(-8)}`,
        name: `Lote ${suffix} A`,
      }),
      contactsDb(env.DB).create({
        phone: `+55729${(Date.now() + 1).toString().slice(-8)}`,
        name: `Lote ${suffix} B`,
      }),
    ]);
    const tag = (await (
      await SELF.fetch("https://x.com/api/contacts/tags", {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({ name: `Lote-${suffix}` }),
      })
    ).json()) as { id: string };
    const field = (await (
      await SELF.fetch("https://x.com/api/contacts/custom-fields", {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({
          key: `lote_${suffix}`,
          label: `Lote ${suffix}`,
          type: "text",
        }),
      })
    ).json()) as { id: string };
    const ids = (await (
      await SELF.fetch(`https://x.com/api/contacts/ids?q=${suffix}`, {
        headers: AUTH,
      })
    ).json()) as { ids: string[] };
    expect(ids.ids.sort()).toEqual(contacts.map((item) => item.id).sort());
    expect(
      (
        await SELF.fetch("https://x.com/api/contacts/bulk-tags", {
          method: "POST",
          headers: AUTH,
          body: JSON.stringify({ ids: ids.ids, tagIds: [tag.id], mode: "add" }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await SELF.fetch("https://x.com/api/contacts/bulk-custom-field", {
          method: "POST",
          headers: AUTH,
          body: JSON.stringify({
            ids: ids.ids,
            fieldId: field.id,
            value: "aplicado",
          }),
        })
      ).status,
    ).toBe(200);
    for (const contact of contacts) {
      const profile = (await (
        await SELF.fetch(`https://x.com/api/contacts/${contact.id}/profile`, {
          headers: AUTH,
        })
      ).json()) as {
        tags: { id: string }[];
        customValues: { id: string; value: unknown }[];
      };
      expect(profile.tags).toContainEqual(
        expect.objectContaining({ id: tag.id }),
      );
      expect(profile.customValues).toContainEqual(
        expect.objectContaining({ id: field.id, value: "aplicado" }),
      );
    }
  });
  it("expõe contatos suprimidos e permite remover a supressão", async () => {
    const contact = await contactsDb(env.DB).create({
      phone: `+55819${Date.now().toString().slice(-8)}`,
      name: "Suprimido",
      status: "opt_in",
    });
    await env.DB.prepare("INSERT INTO suppressions(phone,reason) VALUES(?1,?2)")
      .bind(contact.phone, "solicitação do titular")
      .run();
    const list = (await (
      await SELF.fetch("https://x.com/api/contacts?status=suppressed", {
        headers: AUTH,
      })
    ).json()) as {
      items: Array<{ id: string; status: string; suppression_reason: string }>;
    };
    expect(list.items).toContainEqual(
      expect.objectContaining({
        id: contact.id,
        status: "suppressed",
        suppression_reason: "solicitação do titular",
      }),
    );
    expect(
      (
        await SELF.fetch(
          `https://x.com/api/contacts/${contact.id}/unsuppress`,
          {
            method: "POST",
            headers: AUTH,
          },
        )
      ).status,
    ).toBe(200);
    const after = (await (
      await SELF.fetch("https://x.com/api/contacts?status=suppressed", {
        headers: AUTH,
      })
    ).json()) as { items: { id: string }[] };
    expect(after.items).not.toContainEqual(
      expect.objectContaining({ id: contact.id }),
    );
  });
});
