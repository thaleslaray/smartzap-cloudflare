import { createHmac, createHash, publicEncrypt, randomBytes, constants } from "node:crypto";
import { readFile } from "node:fs/promises";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

const endpoint = required("SMARTZAP_FLOW_ENDPOINT");
const flowToken = required("SMARTZAP_FLOW_TOKEN");
const publicKey = await readFile(required("SMARTZAP_FLOW_PUBLIC_KEY_FILE"), "utf8");
const appSecret = (await readFile(required("SMARTZAP_META_APP_SECRET_FILE"), "utf8")).trim();

function toBase64(value) {
  return Buffer.from(value).toString("base64");
}

async function exchange(payload) {
  const aesKey = randomBytes(32);
  const initialVector = randomBytes(12);
  const imported = await crypto.subtle.importKey("raw", aesKey, "AES-GCM", false, ["encrypt", "decrypt"]);
  const encryptedFlowData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: initialVector, tagLength: 128 },
    imported,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const encryptedAesKey = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    aesKey,
  );
  const body = JSON.stringify({
    encrypted_flow_data: toBase64(encryptedFlowData),
    encrypted_aes_key: toBase64(encryptedAesKey),
    initial_vector: toBase64(initialVector),
  });
  const signature = createHmac("sha256", appSecret).update(body).digest("hex");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${signature}` },
    body,
  });
  const encryptedResponse = await response.text();
  if (!response.ok) throw new Error(`Flow endpoint respondeu HTTP ${response.status}`);
  const responseIv = Uint8Array.from(initialVector, (byte) => byte ^ 0xff);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: responseIv, tagLength: 128 },
    imported,
    Buffer.from(encryptedResponse, "base64"),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

const base = { flow_token: flowToken, version: "3.0" };
const initial = await exchange({ ...base, action: "INIT" });
const dates = Array.isArray(initial?.data?.dates) ? initial.data.dates : [];
const services = Array.isArray(initial?.data?.services) ? initial.data.services : [];
if (!dates.length || !services.length) throw new Error("Agenda não ofereceu datas ou serviços");

let selectedDate = null;
let selectedService = String(services[0].id);
let slots = [];
for (const date of dates) {
  const candidate = await exchange({
    ...base,
    action: "data_exchange",
    screen: "BOOKING_START",
    data: { selected_date: String(date.id), selected_service: selectedService },
  });
  if (candidate?.screen === "SELECT_TIME" && Array.isArray(candidate?.data?.slots) && candidate.data.slots.length) {
    selectedDate = String(date.id);
    slots = candidate.data.slots;
    break;
  }
}
if (!selectedDate || !slots.length) throw new Error("Agenda não ofereceu horário disponível");

const selectedSlot = String(slots[0].id);
await exchange({
  ...base,
  action: "data_exchange",
  screen: "SELECT_TIME",
  data: { selected_date: selectedDate, selected_service: selectedService, selected_slot: selectedSlot },
});
const customerName = `SmartZap QA ${new Date().toISOString().slice(0, 10)}`;
const completed = await exchange({
  ...base,
  action: "data_exchange",
  screen: "CUSTOMER_INFO",
  data: {
    selected_date: selectedDate,
    selected_service: selectedService,
    selected_slot: selectedSlot,
    customer_name: customerName,
    notes: "Teste automatizado da integração Google Calendar. Excluir após validação.",
  },
});
const params = completed?.data?.extension_message_response?.params;
if (completed?.screen !== "SUCCESS" || params?.status !== "confirmed" || !params?.event_id)
  throw new Error("O MiniApp não confirmou a criação do evento");

console.log(JSON.stringify({
  ok: true,
  customerName,
  selectedDate,
  selectedSlot,
  eventId: String(params.event_id),
  flowTokenHash: createHash("sha256").update(flowToken).digest("hex"),
}));
