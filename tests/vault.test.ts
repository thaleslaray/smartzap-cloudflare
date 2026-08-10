import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  finalizeVaultRotation,
  getVaultRotationStatus,
  hasValidVaultKey,
  readVaultJson,
  recoverStaleVaultRotation,
  rotateVaultKey,
  writeVaultJson,
  writeVaultJsonWhenIdle,
} from "../src/security/vault";

const KEY_A = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY";
const KEY_B = "ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA";

describe("cofre de segredos", () => {
  it("aceita apenas chave base64url de 256 bits", () => {
    expect(hasValidVaultKey(KEY_A)).toBe(true);
    expect(hasValidVaultKey("curta")).toBe(false);
    expect(hasValidVaultKey(undefined)).toBe(false);
  });

  it("persiste somente ciphertext e autentica o registro", async () => {
    const name = `vault_${crypto.randomUUID().replaceAll("-", "")}`;
    const secret = `token-${crypto.randomUUID()}`;
    await writeVaultJson(env.DB, KEY_A, name, { secret, appId: "123456" });
    const row = await env.DB.prepare(
      "SELECT ciphertext,iv,key_version FROM secret_vault WHERE name=?1",
    ).bind(name).first<{ ciphertext: string; iv: string; key_version: number }>();
    expect(row?.ciphertext).not.toContain(secret);
    expect(row?.iv).not.toBe("");
    expect(row?.key_version).toBe(1);
    expect(await readVaultJson(env.DB, KEY_A, name)).toEqual({ secret, appId: "123456" });
    await expect(readVaultJson(env.DB, KEY_B, name)).rejects.toThrow("não foi possível abrir o cofre");
  });

  it("bloqueia gravações durante a rotação e só reabre após promoção", async () => {
    const name = `rotate_${crypto.randomUUID().replaceAll("-", "")}`;
    await writeVaultJson(env.DB, KEY_A, name, { value: "preservado" });
    const rotated = await rotateVaultKey(env.DB, KEY_A, KEY_B);
    expect(rotated).toBeGreaterThan(0);
    expect(await getVaultRotationStatus(env.DB)).toBe("awaiting_promotion");
    await expect(
      writeVaultJsonWhenIdle(env.DB, KEY_A, name, { value: "corrida" }),
    ).rejects.toThrow("cofre está em rotação");
    expect(await readVaultJson(env.DB, KEY_B, name)).toEqual({ value: "preservado" });
    await expect(readVaultJson(env.DB, KEY_A, name)).rejects.toThrow();
    await expect(finalizeVaultRotation(env.DB, KEY_A)).rejects.toThrow();
    await finalizeVaultRotation(env.DB, KEY_B);
    expect(await getVaultRotationStatus(env.DB)).toBe("idle");
    await writeVaultJsonWhenIdle(env.DB, KEY_B, name, { value: "novo" });
    expect(await readVaultJson(env.DB, KEY_B, name)).toEqual({ value: "novo" });

    await expect(rotateVaultKey(env.DB, KEY_A, KEY_B)).rejects.toThrow();
    expect(await getVaultRotationStatus(env.DB)).toBe("idle");
  });

  it("recupera com segurança um lock órfão e rejeita recuperação prematura", async () => {
    await env.DB.prepare("DELETE FROM secret_vault").run();
    await env.DB.prepare(
      "UPDATE vault_control SET status='idle',active_key_version=1,rotation_id=NULL,updated_at=datetime('now') WHERE id=1",
    ).run();
    const name = `stale_${crypto.randomUUID().replaceAll("-", "")}`;
    await writeVaultJson(env.DB, KEY_A, name, { value: "intacto" });
    const rotationId = crypto.randomUUID();
    await env.DB.prepare(
      `UPDATE vault_control
       SET status='rotating',rotation_id=?1,updated_at=datetime('now')
       WHERE id=1`,
    ).bind(rotationId).run();

    await expect(recoverStaleVaultRotation(env.DB, KEY_A)).rejects.toThrow("aguarde");
    await env.DB.prepare(
      "UPDATE vault_control SET updated_at=datetime('now','-20 minutes') WHERE id=1",
    ).run();
    await expect(recoverStaleVaultRotation(env.DB, KEY_B)).rejects.toThrow("não foi possível abrir o cofre");
    expect(await getVaultRotationStatus(env.DB)).toBe("rotating");

    await recoverStaleVaultRotation(env.DB, KEY_A);
    expect(await getVaultRotationStatus(env.DB)).toBe("idle");
    expect(await readVaultJson(env.DB, KEY_A, name)).toEqual({ value: "intacto" });
  });
});
