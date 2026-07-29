#!/usr/bin/env node

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const source = arg("url");
const currency = (arg("currency") ?? "").toUpperCase();
const effectiveFrom = arg("effective-from");
const kind = arg("kind") ?? "rates";
const apiBase = (arg("api") ?? process.env.SMARTZAP_API_URL ?? "").replace(/\/$/, "");
const apiKey = process.env.SMARTZAP_API_KEY;

if (!source || !currency || !effectiveFrom || !apiBase || !apiKey) {
  console.error(
    "Uso: SMARTZAP_API_KEY=<chave> node scripts/sync-meta-rate-card.mjs " +
      "--url <CSV_OFICIAL> --currency BRL --effective-from 2026-07-01 " +
      "--kind rates|volume_tiers --api https://app",
  );
  process.exit(2);
}
if (!/^https:\/\//.test(source) || !/^[A-Z]{3}$/.test(currency) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || !["rates", "volume_tiers"].includes(kind)) {
  console.error("Argumentos inválidos");
  process.exit(2);
}

const download = await fetch(source, { redirect: "follow" });
if (!download.ok) throw new Error(`Falha ao baixar rate card: HTTP ${download.status}`);
const csv = await download.text();
if (!csv || csv.length > 2_000_000) throw new Error("Rate card vazio ou acima de 2 MB");

const response = await fetch(`${apiBase}/api/pricing/rate-cards/import`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    origin: apiBase,
  },
  body: JSON.stringify({ source, currency, effectiveFrom, csv, kind }),
});
const data = await response.json();
if (!response.ok) throw new Error(String(data.error ?? `HTTP ${response.status}`));
console.log(JSON.stringify(data, null, 2));
