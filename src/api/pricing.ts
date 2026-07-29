import { Hono } from "hono";
import { z } from "zod";
import { readJsonBody } from "./body";
import { parseMetaRateCardCsv, parseMetaVolumeTierCsv, sha256Hex } from "../domain/pricing";
import { pricingDb } from "../db/pricing";
import { getCredentials } from "../whatsapp/credentials";
import { fetchPricingAnalytics } from "../whatsapp/pricing-analytics";
import { settingsDb } from "../db/settings";
import { resolveUsdBrlRate } from "../domain/exchange-rate";

const ImportSchema = z.object({
  source: z.string().url().max(2_048).refine((value) => value.startsWith("https://")),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  csv: z.string().min(1).max(2_000_000),
  kind: z.enum(["rates", "volume_tiers"]).default("rates"),
}).strict();
const ImportFromUrlSchema = ImportSchema.omit({ csv: true });
const OfficialImportSchema = z.object({}).strict();
const OFFICIAL_PRICING_PAGE = "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing";
const OFFICIAL_CALCULATOR_PAGE = "https://business.whatsapp.com/products/platform-pricing#rates";
const OFFICIAL_CALCULATOR_HOST = "whatsappbusiness.com";
const RATE_CATEGORIES = ["Marketing", "Utility", "Authentication"] as const;

function officialCsvUrls(page: string): string[] {
  const matches = page.matchAll(/\\"href\\":\\"(https:[^"]+?\.csv[^"]*)\\"/g);
  const urls = new Set<string>();
  for (const match of matches) {
    try {
      urls.add(JSON.parse(`"${match[1]}"`).replaceAll("\\/", "/"));
    } catch {
      // Um link malformado não pode impedir a busca dos demais arquivos oficiais.
    }
  }
  return [...urls];
}

function effectiveDateFromOfficialCsv(csv: string): string | null {
  const match = csv.slice(0, 500).match(/effective\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i);
  if (!match) return null;
  const date = new Date(`${match[1]} ${match[2]}, ${match[3]} UTC`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function effectiveDateFromOfficialPage(page: string): string | null {
  const decoded = page.replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  const candidates: Date[] = [];
  for (const match of decoded.matchAll(/effective\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/gi)) {
    const date = new Date(`${match[1]} ${match[2]}, ${match[3]} UTC`);
    if (!Number.isNaN(date.getTime())) candidates.push(date);
  }
  const months: Record<string, number> = {
    janeiro: 0, fevereiro: 1, março: 2, abril: 3, maio: 4, junho: 5,
    julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
  };
  for (const match of decoded.matchAll(/(?:em vigor a partir de|a partir de)\s+(\d{1,2})(?:º|ª)?\s+de\s+([A-Za-zç]+)\s+de\s+(\d{4})/gi)) {
    const month = months[match[2].toLowerCase()];
    if (month !== undefined) candidates.push(new Date(Date.UTC(Number(match[3]), month, Number(match[1]))));
  }
  const today = new Date();
  const active = candidates.filter((date) => date <= today).sort((a, b) => b.getTime() - a.getTime())[0];
  return active?.toISOString().slice(0, 10) ?? null;
}

function pricingCalculatorConfig(page: string): { restUrl: string; restNonce: string; wpNonce: string } | null {
  const restUrl = page.match(/\\?"restUrl\\?"\s*:\s*\\?"([^"\\]+)\\?"/)?.[1];
  const restNonce = page.match(/\\?"restNonce\\?"\s*:\s*\\?"([^"\\]+)\\?"/)?.[1];
  const wpNonce = page.match(/\\?"wpNonce\\?"\s*:\s*\\?"([^"\\]+)\\?"/)?.[1];
  if (!restUrl || !restNonce || !wpNonce) return null;
  const decodedUrl = restUrl.replaceAll("\\/", "/");
  try {
    const url = new URL(decodedUrl);
    if (url.protocol !== "https:" || url.hostname !== OFFICIAL_CALCULATOR_HOST) return null;
  } catch {
    return null;
  }
  return { restUrl: decodedUrl, restNonce, wpNonce };
}

async function officialBrlRateCardCsv(): Promise<string | null> {
  let page: Response;
  try {
    page = await fetch(OFFICIAL_CALCULATOR_PAGE, {
      headers: {
        accept: "text/html",
        "user-agent": "Mozilla/5.0 (compatible; SmartZap/1.0; official-pricing-import)",
      },
    });
  } catch {
    return null;
  }
  if (!page.ok) return null;
  const config = pricingCalculatorConfig(await page.text());
  if (!config) return null;

  const quotes: Record<string, string> = {};
  for (const category of RATE_CATEGORIES) {
    const url = new URL(config.restUrl);
    url.searchParams.set("market", "BR");
    url.searchParams.set("currency", "BRL");
    url.searchParams.set("category", category);
    url.searchParams.set("_wab_nonce", config.restNonce);
    try {
      const response = await fetch(url, { headers: { "X-WP-Nonce": config.wpNonce, accept: "application/json" } });
      if (!response.ok) return null;
      const body = await response.json() as { quote?: unknown };
      const quote = typeof body.quote === "string" ? body.quote.trim() : "";
      if (!/^\d+(?:\.\d+)?$/.test(quote) || Number(quote) < 0) return null;
      quotes[category] = quote;
    } catch {
      return null;
    }
  }

  return [
    "Meta rate card,,,,,",
    'Market,Currency,Marketing,Utility,Authentication,"Authentication-\\nInternational",Service',
    `Brazil,BRL,${quotes.Marketing},${quotes.Utility},${quotes.Authentication},n/a,n/a`,
  ].join("\n");
}
const AnalyticsSyncSchema = z.object({
  start: z.number().int().positive(),
  end: z.number().int().positive(),
  granularity: z.enum(["DAILY", "HALF_HOUR", "MONTHLY"]).default("DAILY"),
  countryCodes: z.array(z.string().regex(/^[A-Z]{2}$/)).max(50).optional(),
}).strict().refine((value) => value.end > value.start, "intervalo inválido");

export const pricingRoutes = new Hono<{ Bindings: Env }>()
  .get("/exchange-rate", async (c) => {
    const result = await resolveUsdBrlRate(c.env.DB);
    if (!result)
      return c.json({ error: "Taxa de câmbio indisponível" }, 503);
    return c.json({ available: true, ...result });
  })
  .get("/analytics", async (c) => {
    const items = (
      await c.env.DB.prepare(
        `SELECT period_start,period_end,granularity,country,pricing_category,
                pricing_type,tier,phone_number_id,volume,cost,currency,fetched_at
         FROM pricing_analytics_points ORDER BY period_start DESC,id DESC LIMIT 500`,
      ).all()
    ).results;
    return c.json({ items, approximate: true, source: "meta_pricing_analytics" });
  })
  .post("/analytics/sync", async (c) => {
    const raw = await readJsonBody(c, 16_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = AnalyticsSyncSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "intervalo de analytics inválido" }, 400);
    const credentials = await getCredentials(c.env);
    if (!credentials?.wabaId)
      return c.json({ error: "Credenciais da Meta não configuradas" }, 400);
    try {
      const result = await fetchPricingAnalytics({
        token: credentials.token,
        version: credentials.graphVersion,
        wabaId: credentials.wabaId,
        ...body.data,
      });
      const changed = await pricingDb(c.env.DB).saveAnalyticsPoints({
        wabaId: credentials.wabaId,
        granularity: body.data.granularity,
        currency: result.currency,
        points: result.points,
        raw: result.raw,
      });
      let granularPoints = 0;
      if (body.data.granularity === "DAILY") {
        const granular = await fetchPricingAnalytics({
          token: credentials.token,
          version: credentials.graphVersion,
          wabaId: credentials.wabaId,
          ...body.data,
          granularity: "HALF_HOUR",
        });
        granularPoints = granular.points.length;
        await pricingDb(c.env.DB).saveAnalyticsPoints({
          wabaId: credentials.wabaId,
          granularity: "HALF_HOUR",
          currency: granular.currency,
          points: granular.points,
          raw: granular.raw,
        });
      }
      const reconciliation = await pricingDb(c.env.DB).reconcilePendingCampaignCosts();
      if (result.currency) await settingsDb(c.env.DB).set("pricing_currency", result.currency);
      return c.json({ ok: true, points: result.points.length + granularPoints, changed, currency: result.currency, reconciliation });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Falha ao sincronizar pricing analytics",
          code: (error as Error & { code?: number }).code,
        },
        502,
      );
    }
  })
  .get("/rate-cards/status", async (c) => {
    const imports = (
      await c.env.DB.prepare(
        `SELECT source,checksum,currency,effective_from,status,imported_at,row_count
         FROM pricing_rate_card_imports ORDER BY imported_at DESC LIMIT 20`,
      ).all()
    ).results;
    return c.json({ items: imports });
  })
  .post("/rate-cards/import", async (c) => {
    const raw = await readJsonBody(c, 2_100_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = ImportSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "rate card inválido" }, 400);
    const checksum = await sha256Hex(body.data.csv);
    let rows;
    try {
      rows = (body.data.kind === "volume_tiers" ? parseMetaVolumeTierCsv : parseMetaRateCardCsv)(body.data.csv, {
        source: body.data.source,
        checksum,
        effectiveFrom: body.data.effectiveFrom,
        currency: body.data.currency,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "CSV de rate card inválido" },
        400,
      );
    }
    const result = await pricingDb(c.env.DB).importRateCards({
      source: body.data.source,
      checksum,
      effectiveFrom: body.data.effectiveFrom,
      currency: body.data.currency,
      rows,
    });
    return c.json({ ok: true, checksum, ...result });
  })
  .post("/rate-cards/import-from-url", async (c) => {
    const raw = await readJsonBody(c, 16_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    const body = ImportFromUrlSchema.safeParse(raw.value);
    if (!body.success) return c.json({ error: "fonte de rate card inválida" }, 400);

    let response: Response;
    try {
      response = await fetch(body.data.source, {
        method: "GET",
        redirect: "follow",
        headers: { accept: "text/csv,text/plain;q=0.9,*/*;q=0.1" },
      });
    } catch {
      return c.json({ error: "não foi possível baixar a tabela pela URL informada" }, 502);
    }
    if (!response.ok)
      return c.json({ error: `a fonte respondeu HTTP ${response.status}` }, 502);
    const finalUrl = response.url || body.data.source;
    if (!finalUrl.startsWith("https://"))
      return c.json({ error: "a fonte redirecionou para uma URL não segura" }, 400);
    const csv = await response.text();
    if (!csv.trim()) return c.json({ error: "a fonte não retornou uma tabela" }, 400);
    if (csv.length > 2_000_000)
      return c.json({ error: "a tabela excede o limite de 2 MB" }, 413);

    const checksum = await sha256Hex(csv);
    let rows;
    try {
      rows = (body.data.kind === "volume_tiers" ? parseMetaVolumeTierCsv : parseMetaRateCardCsv)(csv, {
        source: finalUrl,
        checksum,
        effectiveFrom: body.data.effectiveFrom,
        currency: body.data.currency,
      });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error
            ? error.message
            : "a URL não aponta para um CSV de rate card compatível",
        },
        400,
      );
    }
    const result = await pricingDb(c.env.DB).importRateCards({
      source: finalUrl,
      checksum,
      effectiveFrom: body.data.effectiveFrom,
      currency: body.data.currency,
      rows,
    });
    return c.json({ ok: true, checksum, source: finalUrl, ...result });
  })
  .post("/rate-cards/import-official", async (c) => {
    const raw = await readJsonBody(c, 4_000);
    if (!raw.ok) return c.json({ error: raw.error }, raw.status);
    if (!OfficialImportSchema.safeParse(raw.value).success)
      return c.json({ error: "pedido de atualização oficial inválido" }, 400);

    let page: Response;
    try {
      page = await fetch(OFFICIAL_PRICING_PAGE, {
        headers: {
          accept: "text/html",
          "user-agent": "Mozilla/5.0 (compatible; SmartZap/1.0; official-pricing-import)",
        },
      });
    } catch {
      return c.json({ error: "não foi possível consultar a tabela oficial da Meta" }, 502);
    }
    if (!page.ok) return c.json({ error: `a página oficial respondeu HTTP ${page.status}` }, 502);
    const officialPage = await page.text();
    let csv: string | null = null;
    for (const url of officialCsvUrls(officialPage)) {
      try {
        const candidate = await fetch(url, { headers: { accept: "text/csv,text/plain;q=0.9" } });
        if (!candidate.ok) continue;
        const content = await candidate.text();
        const header = content.slice(0, 500);
        if (/Cost per message in BRL\b/i.test(header) && !/Reflecting volume tiers/i.test(header)) {
          csv = content;
          break;
        }
      } catch {
        // URLs de CDN podem expirar durante a leitura; tenta o próximo link da página atual.
      }
    }
    const source = csv ? OFFICIAL_PRICING_PAGE : OFFICIAL_CALCULATOR_PAGE;
    if (!csv) csv = await officialBrlRateCardCsv();
    if (!csv)
      return c.json({ error: "não foi possível obter as tarifas BRL na fonte oficial da Meta" }, 502);
    if (csv.length > 2_000_000)
      return c.json({ error: "a tabela oficial excede o limite de 2 MB" }, 413);
    const effectiveFrom = effectiveDateFromOfficialCsv(csv) ?? effectiveDateFromOfficialPage(officialPage);
    if (!effectiveFrom)
      return c.json({ error: "não foi possível identificar a vigência da tabela oficial" }, 502);
    const checksum = await sha256Hex(csv);
    let rows;
    try {
      rows = parseMetaRateCardCsv(csv, {
        source,
        checksum,
        effectiveFrom,
        currency: "BRL",
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "CSV oficial incompatível" }, 502);
    }
    const result = await pricingDb(c.env.DB).importRateCards({
      source,
      checksum,
      effectiveFrom,
      currency: "BRL",
      rows,
    });
    return c.json({ ok: true, checksum, source, effectiveFrom, ...result });
  });
