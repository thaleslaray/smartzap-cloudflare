import { pricingDb } from "../db/pricing";
import { settingsDb } from "../db/settings";
import { getCredentials } from "../whatsapp/credentials";
import { fetchPricingAnalytics } from "../whatsapp/pricing-analytics";

export function nextQuarterStart(now: Date): Date {
  const quarter = Math.floor(now.getUTCMonth() / 3);
  const nextMonth = (quarter + 1) * 3;
  return new Date(Date.UTC(
    now.getUTCFullYear() + (nextMonth >= 12 ? 1 : 0),
    nextMonth % 12,
    1,
  ));
}

export async function checkUpcomingRateCard(env: Env, now = new Date()) {
  const next = nextQuarterStart(now);
  const daysUntil = Math.ceil((next.getTime() - now.getTime()) / 86_400_000);
  if (daysUntil > 35) return { required: false, covered: true, effectiveFrom: next.toISOString().slice(0, 10) };
  const effectiveFrom = next.toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    `SELECT id FROM pricing_rate_card_imports
     WHERE status='active' AND effective_from>=?1
     ORDER BY effective_from ASC LIMIT 1`,
  ).bind(effectiveFrom).first<{ id: string }>();
  return { required: true, covered: Boolean(row), effectiveFrom };
}

export async function reconcilePricingAnalytics(env: Env, now = new Date()) {
  const settings = settingsDb(env.DB);
  const day = now.toISOString().slice(0, 10);
  if ((await settings.get("pricing_analytics_last_sync_day")) === day) {
    const reconciliation = await pricingDb(env.DB).reconcilePendingCampaignCosts();
    return { skipped: true, points: 0, changed: 0, reconciliation };
  }
  const credentials = await getCredentials(env);
  if (!credentials?.wabaId) return { skipped: true, points: 0, changed: 0 };
  const monthStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const end = Math.floor(now.getTime() / 1000);
  const result = await fetchPricingAnalytics({
    token: credentials.token,
    version: credentials.graphVersion,
    wabaId: credentials.wabaId,
    start: monthStart,
    end,
    granularity: "DAILY",
  });
  const changed = await pricingDb(env.DB).saveAnalyticsPoints({
    wabaId: credentials.wabaId,
    granularity: "DAILY",
    currency: result.currency,
    points: result.points,
    raw: result.raw,
  });
  // A granularidade diária serve para volume tiers; a meia hora permite
  // atribuir o custo agregado a uma campanha sem misturar outros disparos do
  // mesmo dia.
  try {
    const granular = await fetchPricingAnalytics({
      token: credentials.token,
      version: credentials.graphVersion,
      wabaId: credentials.wabaId,
      start: monthStart,
      end,
      granularity: "HALF_HOUR",
    });
    await pricingDb(env.DB).saveAnalyticsPoints({
      wabaId: credentials.wabaId,
      granularity: "HALF_HOUR",
      currency: granular.currency,
      points: granular.points,
      raw: granular.raw,
    });
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      msg: "pricing analytics HALF_HOUR não sincronizado",
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  const reconciliation = await pricingDb(env.DB).reconcilePendingCampaignCosts();
  if (result.currency) await settings.set("pricing_currency", result.currency);
  await settings.set("pricing_analytics_last_sync_day", day);
  return { skipped: false, points: result.points.length, changed, reconciliation };
}
