const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const META_VAULT_RECORD = "meta_credentials";

type VaultRow = {
  ciphertext: string;
  iv: string;
  key_version: number;
};

type EncryptedVaultValue = VaultRow & { name: string };

export type VaultRotationStatus = "idle" | "rotating" | "awaiting_promotion";

export type VaultRotationInfo = {
  status: VaultRotationStatus;
  updatedAt: string | null;
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("chave do cofre inválida");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("chave do cofre inválida");
  }
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function importVaultKey(raw: string): Promise<CryptoKey> {
  const bytes = fromBase64Url(raw.trim());
  if (bytes.byteLength !== 32)
    throw new Error("SMARTZAP_VAULT_KEY deve conter exatamente 256 bits");
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function fixedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
  copy.set(value);
  return copy;
}

function aad(name: string, keyVersion: number): Uint8Array<ArrayBuffer> {
  return fixedBytes(encoder.encode(`smartzap-vault:${keyVersion}:${name}`));
}

export function hasValidVaultKey(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return fromBase64Url(value.trim()).byteLength === 32;
  } catch {
    return false;
  }
}

async function encryptVaultValue(
  rootKey: string,
  name: string,
  value: unknown,
  keyVersion: number,
): Promise<EncryptedVaultValue> {
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(name)) throw new Error("nome de registro inválido");
  const key = await importVaultKey(rootKey);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const plaintext = fixedBytes(encoder.encode(JSON.stringify(value)));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(name, keyVersion), tagLength: 128 },
    key,
    plaintext,
  );
  return {
    name,
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    iv: toBase64Url(iv),
    key_version: keyVersion,
  };
}

function upsertVaultValue(db: D1Database, value: EncryptedVaultValue): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO secret_vault(name,ciphertext,iv,key_version,updated_at)
     VALUES(?1,?2,?3,?4,datetime('now'))
     ON CONFLICT(name) DO UPDATE SET
       ciphertext=excluded.ciphertext,
       iv=excluded.iv,
       key_version=excluded.key_version,
       updated_at=excluded.updated_at`,
  ).bind(value.name, value.ciphertext, value.iv, value.key_version);
}

function guardedUpsertVaultValue(
  db: D1Database,
  value: EncryptedVaultValue,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO secret_vault(name,ciphertext,iv,key_version,updated_at)
     SELECT ?1,?2,?3,?4,datetime('now')
     WHERE (SELECT status FROM vault_control WHERE id=1)='idle'
     ON CONFLICT(name) DO UPDATE SET
       ciphertext=excluded.ciphertext,
       iv=excluded.iv,
       key_version=excluded.key_version,
       updated_at=excluded.updated_at
     WHERE (SELECT status FROM vault_control WHERE id=1)='idle'`,
  ).bind(value.name, value.ciphertext, value.iv, value.key_version);
}

export async function getVaultRotationStatus(
  db: D1Database,
): Promise<VaultRotationStatus> {
  const row = await db.prepare(
    "SELECT status FROM vault_control WHERE id=1",
  ).first<{ status: VaultRotationStatus }>();
  return row?.status ?? "idle";
}

export async function getVaultRotationInfo(
  db: D1Database,
): Promise<VaultRotationInfo> {
  const row = await db.prepare(
    "SELECT status,updated_at FROM vault_control WHERE id=1",
  ).first<{ status: VaultRotationStatus; updated_at: string }>();
  return { status: row?.status ?? "idle", updatedAt: row?.updated_at ?? null };
}

export async function writeVaultJson(
  db: D1Database,
  rootKey: string,
  name: string,
  value: unknown,
  keyVersion = 1,
): Promise<void> {
  const encrypted = await encryptVaultValue(rootKey, name, value, keyVersion);
  await upsertVaultValue(db, encrypted).run();
}

export async function writeVaultJsonWhenIdle(
  db: D1Database,
  rootKey: string,
  name: string,
  value: unknown,
): Promise<void> {
  const control = await db.prepare(
    "SELECT active_key_version FROM vault_control WHERE id=1",
  ).first<{ active_key_version: number }>();
  const encrypted = await encryptVaultValue(
    rootKey,
    name,
    value,
    control?.active_key_version ?? 1,
  );
  const result = await guardedUpsertVaultValue(db, encrypted).run();
  if ((result.meta.changes ?? 0) !== 1)
    throw new Error("o cofre está em rotação; finalize a troca antes de salvar credenciais");
}

export async function readVaultJson<T>(
  db: D1Database,
  rootKey: string,
  name: string,
): Promise<T | null> {
  const row = await db.prepare(
    "SELECT ciphertext,iv,key_version FROM secret_vault WHERE name=?1",
  ).bind(name).first<VaultRow>();
  if (!row) return null;
  const key = await importVaultKey(rootKey);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64Url(row.iv),
        additionalData: aad(name, row.key_version),
        tagLength: 128,
      },
      key,
      fromBase64Url(row.ciphertext),
    );
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    throw new Error("não foi possível abrir o cofre; confira a chave de recuperação");
  }
}

export async function rotateVaultKey(
  db: D1Database,
  currentKey: string,
  nextKey: string,
): Promise<number> {
  if (currentKey === nextKey) throw new Error("a nova chave precisa ser diferente da chave atual");
  await importVaultKey(nextKey);
  const rotationId = crypto.randomUUID();
  const lock = await db.prepare(
    `UPDATE vault_control
     SET status='rotating',rotation_id=?1,updated_at=datetime('now')
     WHERE id=1 AND status='idle'`,
  ).bind(rotationId).run();
  if ((lock.meta.changes ?? 0) !== 1)
    throw new Error("já existe uma rotação do cofre em andamento");
  try {
    const rows = await db.prepare(
      "SELECT name,key_version FROM secret_vault ORDER BY name",
    ).all<{ name: string; key_version: number }>();
    const records: Array<{ name: string; value: unknown }> = [];
    for (const row of rows.results) {
      records.push({ name: row.name, value: await readVaultJson(db, currentKey, row.name) });
    }
    const nextVersion = Math.max(...rows.results.map((row) => row.key_version), 0) + 1;
    const encrypted = await Promise.all(
      records.map((record) => encryptVaultValue(nextKey, record.name, record.value, nextVersion)),
    );
    // D1 executa batch como uma transação. O estado só avança junto com todos os registros.
    const guardedRotationUpsert = (record: EncryptedVaultValue) => db.prepare(
      `INSERT INTO secret_vault(name,ciphertext,iv,key_version,updated_at)
       SELECT ?1,?2,?3,?4,datetime('now')
       WHERE EXISTS(
         SELECT 1 FROM vault_control
         WHERE id=1 AND status='rotating' AND rotation_id=?5
       )
       ON CONFLICT(name) DO UPDATE SET
         ciphertext=excluded.ciphertext,
         iv=excluded.iv,
         key_version=excluded.key_version,
         updated_at=excluded.updated_at
       WHERE EXISTS(
         SELECT 1 FROM vault_control
         WHERE id=1 AND status='rotating' AND rotation_id=?5
       )`,
    ).bind(record.name, record.ciphertext, record.iv, record.key_version, rotationId);
    const results = await db.batch([
      ...encrypted.map(guardedRotationUpsert),
      db.prepare(
        `UPDATE vault_control
         SET status='awaiting_promotion',active_key_version=?1,updated_at=datetime('now')
         WHERE id=1 AND status='rotating' AND rotation_id=?2`,
      ).bind(nextVersion, rotationId),
    ]);
    const transition = results.at(-1);
    if ((transition?.meta.changes ?? 0) !== 1)
      throw new Error("a rotação perdeu o bloqueio exclusivo; reinicie o procedimento");
    return records.length;
  } catch (error) {
    await db.prepare(
      `UPDATE vault_control
       SET status='idle',rotation_id=NULL,updated_at=datetime('now')
       WHERE id=1 AND status='rotating' AND rotation_id=?1`,
    ).bind(rotationId).run();
    throw error;
  }
}

export async function recoverStaleVaultRotation(
  db: D1Database,
  currentKey: string,
  staleAfterMinutes = 15,
): Promise<void> {
  if (!Number.isInteger(staleAfterMinutes) || staleAfterMinutes < 5 || staleAfterMinutes > 1440)
    throw new Error("janela de recuperação inválida");
  const control = await db.prepare(
    `SELECT status,rotation_id,updated_at,
            (unixepoch('now') - unixepoch(updated_at)) age_seconds
     FROM vault_control WHERE id=1`,
  ).first<{
    status: VaultRotationStatus;
    rotation_id: string | null;
    updated_at: string;
    age_seconds: number;
  }>();
  if (control?.status !== "rotating" || !control.rotation_id)
    throw new Error("não existe rotação interrompida para recuperar");
  if (Number(control.age_seconds) < staleAfterMinutes * 60)
    throw new Error(`aguarde ${staleAfterMinutes} minutos antes de recuperar a rotação`);

  // A troca dos registros e a transição para awaiting_promotion acontecem no
  // mesmo batch D1. Se ainda está em rotating, todos os registros devem abrir
  // com a chave ativa; isso impede liberar um cofre parcialmente recifrado.
  const rows = await db.prepare("SELECT name FROM secret_vault ORDER BY name")
    .all<{ name: string }>();
  for (const row of rows.results) await readVaultJson(db, currentKey, row.name);

  const result = await db.prepare(
    `UPDATE vault_control
     SET status='idle',rotation_id=NULL,updated_at=datetime('now')
     WHERE id=1 AND status='rotating' AND rotation_id=?1 AND updated_at=?2`,
  ).bind(control.rotation_id, control.updated_at).run();
  if ((result.meta.changes ?? 0) !== 1)
    throw new Error("o estado da rotação mudou durante a recuperação; atualize a página");
}

export async function finalizeVaultRotation(
  db: D1Database,
  promotedKey: string,
): Promise<void> {
  const status = await getVaultRotationStatus(db);
  if (status !== "awaiting_promotion")
    throw new Error("não existe rotação aguardando promoção");
  const rows = await db.prepare("SELECT name FROM secret_vault ORDER BY name")
    .all<{ name: string }>();
  for (const row of rows.results) await readVaultJson(db, promotedKey, row.name);
  const result = await db.prepare(
    `UPDATE vault_control SET status='idle',rotation_id=NULL,updated_at=datetime('now')
     WHERE id=1 AND status='awaiting_promotion'`,
  ).run();
  if ((result.meta.changes ?? 0) !== 1)
    throw new Error("a promoção do cofre mudou durante a validação; tente novamente");
}
