import type { PricingRateCard } from "../domain/pricing";
import type { PricingAnalyticsPoint } from "../whatsapp/pricing-analytics";
import { settingsDb } from "./settings";

type RateCardRow = {
  id: string;
  source: string;
  checksum: string;
  effective_from: string;
  effective_to: string | null;
  currency: string;
  market: string;
  country_iso: string | null;
  category: PricingRateCard["category"];
  tier_from: number;
  tier_to: number | null;
  unit_price: number;
};

function decodeRateCard(row: RateCardRow): PricingRateCard {
  return {
    id: row.id,
    source: row.source,
    checksum: row.checksum,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    currency: row.currency,
    market: row.market,
    countryIso: row.country_iso,
    category: row.category,
    tierFrom: row.tier_from,
    tierTo: row.tier_to,
    unitPrice: row.unit_price,
  };
}

async function analyticsPointKey(input: {
  wabaId: string;
  granularity: string;
  point: PricingAnalyticsPoint;
}): Promise<string> {
  const canonical = JSON.stringify([
    input.wabaId,
    input.point.start,
    input.point.end,
    input.granularity,
    input.point.country ?? "",
    input.point.pricingCategory ?? "",
    input.point.pricingType ?? "",
    input.point.tier ?? "",
    input.point.phoneNumber ?? "",
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)]
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

export function pricingDb(db: D1Database) {
  return {
    async activeRateCards(at: string, currency?: string): Promise<PricingRateCard[]> {
      const rows = (
        await db
          .prepare(
            `SELECT prc.id,prc.source,prc.checksum,prc.effective_from,prc.effective_to,
                    prc.currency,prc.market,prc.country_iso,prc.category,
                    prc.tier_from,prc.tier_to,prc.unit_price
             FROM pricing_rate_cards prc
             JOIN pricing_rate_card_imports pri ON pri.id=prc.import_id AND pri.status='active'
             WHERE prc.effective_from <= ?1
               AND (prc.effective_to IS NULL OR prc.effective_to >= ?1)
               AND (?2 IS NULL OR prc.currency=?2)
             ORDER BY prc.effective_from DESC,prc.market,prc.category,prc.tier_from`,
          )
          .bind(at.slice(0, 10), currency ?? null)
          .all<RateCardRow>()
      ).results;
      return rows.map(decodeRateCard);
    },

    async importRateCards(input: {
      source: string;
      checksum: string;
      effectiveFrom: string;
      currency: string;
      rows: PricingRateCard[];
    }): Promise<{ imported: boolean; rows: number }> {
      const existing = await db
        .prepare(
          `SELECT id,row_count,status,imported_at < datetime('now','-10 minutes') AS stale
           FROM pricing_rate_card_imports WHERE checksum=?1`,
        )
        .bind(input.checksum)
        .first<{ id: string; row_count: number; status: string; stale: number }>();
      if (existing?.status === "active") return { imported: false, rows: existing.row_count };
      if (existing?.status === "staging" && !existing.stale)
        throw new Error("Esta importação já está em processamento");
      if (existing) {
        await db.batch([
          db.prepare("DELETE FROM pricing_rate_cards WHERE import_id=?1").bind(existing.id),
          db.prepare("DELETE FROM pricing_rate_card_imports WHERE id=?1").bind(existing.id),
        ]);
      }
      if (!input.rows.length) throw new Error("Importação sem rate cards");
      if (input.rows.some((row) => row.currency !== input.currency))
        throw new Error("Rate card contém moeda divergente");
      const importId = crypto.randomUUID();
      const statements = [
        db
          .prepare(
            `INSERT INTO pricing_rate_card_imports
             (id,source,checksum,currency,effective_from,row_count)
             VALUES(?1,?2,?3,?4,?5,?6)`,
          )
          .bind(
            importId,
            input.source,
            input.checksum,
            input.currency,
            input.effectiveFrom,
            input.rows.length,
          ),
        ...input.rows.map((row) =>
          db
            .prepare(
              `INSERT INTO pricing_rate_cards
               (id,import_id,source,checksum,effective_from,effective_to,currency,
                market,country_iso,category,tier_from,tier_to,unit_price)
               VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`,
            )
            .bind(
              crypto.randomUUID(),
              importId,
              row.source,
              row.checksum,
              row.effectiveFrom,
              row.effectiveTo ?? null,
              row.currency,
              row.market,
              row.countryIso ?? null,
              row.category,
              row.tierFrom,
              row.tierTo ?? null,
              row.unitPrice,
            ),
        ),
      ];
      // D1 limita o tamanho de batch; a primeira transação cria o manifesto e
      // as seguintes gravam somente dados previamente validados em memória.
      try {
        await db.batch(statements.slice(0, 50));
        for (let offset = 50; offset < statements.length; offset += 50)
          await db.batch(statements.slice(offset, offset + 50));
        await db.prepare(
          "UPDATE pricing_rate_card_imports SET status='active' WHERE id=?1 AND status='staging'",
        ).bind(importId).run();
      } catch (error) {
        await db.prepare(
          "UPDATE pricing_rate_card_imports SET status='failed' WHERE id=?1",
        ).bind(importId).run();
        throw error;
      }
      return { imported: true, rows: input.rows.length };
    },

    async upsertTier(input: {
      wabaId: string;
      region: string;
      category: string;
      effectiveMonth: string;
      tier: string;
      tierFrom?: number | null;
      tierTo?: number | null;
      tierUpdateTime: number;
      eventKey?: string | null;
    }): Promise<boolean> {
      const id = `${input.wabaId}:${input.region}:${input.category}:${input.effectiveMonth}`;
      const result = await db
        .prepare(
          `INSERT INTO pricing_tiers
           (id,waba_id,region,pricing_category,effective_month,tier,tier_from,tier_to,
            tier_update_time,source_event_key)
           VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
           ON CONFLICT(waba_id,region,pricing_category,effective_month) DO UPDATE SET
             tier=excluded.tier,tier_from=excluded.tier_from,tier_to=excluded.tier_to,
             tier_update_time=excluded.tier_update_time,
             source_event_key=excluded.source_event_key,updated_at=datetime('now')
           WHERE excluded.tier_update_time < pricing_tiers.tier_update_time`,
        )
        .bind(
          id,
          input.wabaId,
          input.region,
          input.category,
          input.effectiveMonth,
          input.tier,
          input.tierFrom ?? null,
          input.tierTo ?? null,
          input.tierUpdateTime,
          input.eventKey ?? null,
        )
        .run();
      return (result.meta.changes ?? 0) > 0;
    },

    async saveAnalyticsPoints(input: {
      wabaId: string;
      granularity: string;
      currency: string | null;
      points: PricingAnalyticsPoint[];
      raw: unknown;
    }): Promise<number> {
      if (!input.points.length) return 0;
      let changed = 0;
      for (let offset = 0; offset < input.points.length; offset += 50) {
        const chunk = input.points.slice(offset, offset + 50);
        const keys = await Promise.all(chunk.map((point) => analyticsPointKey({
          wabaId: input.wabaId,
          granularity: input.granularity,
          point,
        })));
        const results = await db.batch(chunk.map((point, index) =>
          db.prepare(
            `INSERT INTO pricing_analytics_points
             (id,point_key,waba_id,period_start,period_end,granularity,country,pricing_category,
              pricing_type,tier,phone_number_id,volume,cost,currency,raw_json)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
             ON CONFLICT(point_key) DO UPDATE SET
               volume=excluded.volume,cost=excluded.cost,currency=excluded.currency,
               raw_json=excluded.raw_json,fetched_at=datetime('now')`,
          ).bind(
            crypto.randomUUID(), keys[index], input.wabaId, point.start, point.end,
            input.granularity, point.country ?? null, point.pricingCategory ?? null,
            point.pricingType ?? null, point.tier ?? null, point.phoneNumber ?? null,
            point.volume ?? null, point.cost ?? null, input.currency,
            JSON.stringify({ point, source: "pricing_analytics" }),
          ),
        ));
        changed += results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0);
      }
      return changed;
    },

    async recordMessagePricing(input: {
      messageId: string;
      campaignId?: string | null;
      contactId?: string | null;
      pricingModel?: string | null;
      pricingType?: string | null;
      pricingCategory?: string | null;
      countryIso?: string | null;
      currency?: string | null;
      eventKey?: string | null;
    }) {
      const free = ["free_customer_service", "free_entry_point"].includes(
        String(input.pricingType ?? "").toLowerCase(),
      );
      await db.prepare(
        `INSERT INTO message_cost_reconciliation
         (message_id,campaign_id,contact_id,pricing_model,pricing_type,
          pricing_category,country_iso,state,amount,currency,source_event_key)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
         ON CONFLICT(message_id) DO UPDATE SET
           campaign_id=COALESCE(excluded.campaign_id,message_cost_reconciliation.campaign_id),
           contact_id=COALESCE(excluded.contact_id,message_cost_reconciliation.contact_id),
           pricing_model=COALESCE(excluded.pricing_model,message_cost_reconciliation.pricing_model),
           pricing_type=COALESCE(excluded.pricing_type,message_cost_reconciliation.pricing_type),
           pricing_category=COALESCE(excluded.pricing_category,message_cost_reconciliation.pricing_category),
           country_iso=COALESCE(excluded.country_iso,message_cost_reconciliation.country_iso),
           currency=COALESCE(excluded.currency,message_cost_reconciliation.currency),
           state=CASE WHEN excluded.state='free' THEN 'free' ELSE message_cost_reconciliation.state END,
           amount=CASE WHEN excluded.state='free' THEN 0 ELSE message_cost_reconciliation.amount END,
           source_event_key=excluded.source_event_key,reconciled_at=datetime('now')`,
      ).bind(
        input.messageId,
        input.campaignId ?? null,
        input.contactId ?? null,
        input.pricingModel ?? null,
        input.pricingType ?? null,
        input.pricingCategory ?? null,
        input.countryIso ?? null,
        free ? "free" : "pending",
        free ? 0 : null,
        input.currency ?? null,
        input.eventKey ?? null,
      ).run();
    },

    async monthlyVolumeByMarket(start: number, end: number): Promise<Record<string, number>> {
      const rows = (
        await db.prepare(
          `SELECT country,SUM(COALESCE(volume,0)) volume
           FROM pricing_analytics_points
           WHERE period_start>=?1 AND period_end<=?2
             AND granularity='DAILY' AND pricing_type='REGULAR'
           GROUP BY country`,
        ).bind(start, end).all<{ country: string | null; volume: number }>()
      ).results;
      return Object.fromEntries(rows.filter((row) => row.country).map((row) => [row.country!, row.volume]));
    },

    async latestConfirmedCampaignCost(campaignId: string) {
      return db
        .prepare(
          `SELECT state,amount,currency,breakdown_json,assumptions_json,source,effective_from,created_at
           FROM campaign_cost_snapshots WHERE campaign_id=?1
             AND state IN ('actual_from_meta','invoice')
           ORDER BY created_at DESC,id DESC LIMIT 1`,
        )
        .bind(campaignId)
        .first<Record<string, unknown>>();
    },

    async reconcilePendingCampaignCosts(): Promise<{
      scanned: number;
      reconciled: number;
      ambiguous: number;
    }> {
      const rows = (
        await db.prepare(
          `SELECT DISTINCT campaign_id FROM message_cost_reconciliation
           WHERE campaign_id IS NOT NULL AND state='pending'`,
        ).all<{ campaign_id: string }>()
      ).results;
      let reconciled = 0;
      let ambiguous = 0;
      for (const row of rows) {
        const result = await this.reconcileCampaignCostFromAnalytics(row.campaign_id);
        if (result === "reconciled") reconciled += 1;
        if (result === "ambiguous") ambiguous += 1;
      }
      return { scanned: rows.length, reconciled, ambiguous };
    },

    async reconcileCampaignCostFromAnalytics(
      campaignId: string,
    ): Promise<"reconciled" | "not_ready" | "ambiguous"> {
      const campaign = await db.prepare(
        "SELECT created_at FROM campaigns WHERE id=?1",
      ).bind(campaignId).first<{ created_at: string }>();
      if (!campaign) return "not_ready";

      const pending = (
        await db.prepare(
          `SELECT m.message_id,m.pricing_category,m.pricing_type,m.country_iso
           FROM message_cost_reconciliation m
           JOIN campaign_contacts cc ON cc.message_id=m.message_id
           WHERE m.campaign_id=?1 AND m.state='pending'
             AND cc.status IN ('sent','delivered','read')`,
        ).bind(campaignId).all<{
          message_id: string;
          pricing_category: string | null;
          pricing_type: string | null;
          country_iso: string | null;
        }>()
      ).results;
      if (!pending.length) return "not_ready";

      const category = String(pending[0].pricing_category ?? "").toUpperCase();
      const pricingType = String(pending[0].pricing_type ?? "").toUpperCase();
      const country = pending[0].country_iso;
      if (!category || !pricingType || !country) return "not_ready";
      if (pending.some((row) =>
        String(row.pricing_category ?? "").toUpperCase() !== category ||
        String(row.pricing_type ?? "").toUpperCase() !== pricingType ||
        row.country_iso !== country,
      )) return "ambiguous";

      const createdAt = Date.parse(`${campaign.created_at.replace(" ", "T")}Z`);
      if (!Number.isFinite(createdAt)) return "not_ready";
      const campaignTimestamp = Math.floor(createdAt / 1_000);
      const wabaId = await settingsDb(db).get("whatsapp_waba_id");
      const analytics = (
        await db.prepare(
          `SELECT granularity,period_start,period_end,country,pricing_category,pricing_type,
                  volume,cost,currency
           FROM pricing_analytics_points
           WHERE (?1 IS NULL OR waba_id=?1)
             AND country=?2 AND UPPER(pricing_category)=?3
             AND UPPER(pricing_type)=?4 AND cost IS NOT NULL
             AND period_start <= ?5 AND period_end > ?5`,
        ).bind(wabaId ?? null, country, category, pricingType, campaignTimestamp)
          .all<{
            granularity: string;
            period_start: number;
            period_end: number;
            country: string;
            pricing_category: string;
            pricing_type: string;
            volume: number | null;
            cost: number;
            currency: string | null;
          }>()
      ).results;
      const preferredGranularity = analytics.some((point) => point.granularity === "HALF_HOUR")
        ? "HALF_HOUR"
        : "DAILY";
      const matching = analytics.filter((point) =>
        point.granularity === preferredGranularity &&
        point.volume === pending.length && point.cost >= 0 && point.currency,
      );
      if (matching.length !== 1) return matching.length > 1 ? "ambiguous" : "not_ready";

      const point = matching[0];
      const unitAmount = point.cost / pending.length;
      if (!Number.isFinite(unitAmount) || unitAmount < 0) return "not_ready";
      await db.batch(pending.map((row) =>
        db.prepare(
          `UPDATE message_cost_reconciliation
           SET state='actual_from_meta',amount=?2,currency=?3,reconciled_at=datetime('now')
           WHERE message_id=?1 AND state='pending'`,
        ).bind(row.message_id, unitAmount, point.currency),
      ));
      const result = await this.reconcileCampaignCost(campaignId, "meta_pricing_analytics");
      return result.reconciled ? "reconciled" : "not_ready";
    },

    async saveCampaignEstimate(campaignId: string, estimate: {
      state: "estimated" | "unavailable";
      amount: number | null;
      currency: string | null;
      breakdown: unknown;
      assumptions: string[];
      source: string;
      effectiveFrom: string | null;
    }) {
      await db
        .prepare(
          `INSERT INTO campaign_cost_snapshots
           (id,campaign_id,state,amount,currency,breakdown_json,assumptions_json,source,effective_from)
           VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
        )
        .bind(
          crypto.randomUUID(),
          campaignId,
          estimate.state,
          estimate.amount,
          estimate.currency,
          JSON.stringify(estimate.breakdown),
          JSON.stringify(estimate.assumptions),
          estimate.source,
          estimate.effectiveFrom,
        )
        .run();
    },

    async reconcileCampaignCost(campaignId: string, source = "meta_message_status_pricing"): Promise<{
      reconciled: boolean;
      amount: number | null;
      currency: string | null;
    }> {
      const summary = await db.prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN m.state IN ('free','actual_from_meta','invoice')
                              AND m.amount IS NOT NULL THEN 1 ELSE 0 END) AS known,
                SUM(CASE WHEN m.state IN ('free','actual_from_meta','invoice')
                         THEN COALESCE(m.amount,0) ELSE 0 END) AS amount,
                MIN(m.currency) AS currency,
                MAX(m.currency) AS max_currency
         FROM campaign_contacts cc
         LEFT JOIN message_cost_reconciliation m ON m.message_id=cc.message_id
         WHERE cc.campaign_id=?1 AND cc.message_id IS NOT NULL
           AND cc.status IN ('sent','delivered','read')`,
      ).bind(campaignId).first<{
        total: number;
        known: number;
        amount: number;
        currency: string | null;
        max_currency: string | null;
      }>();
      if (!summary || summary.total === 0 || summary.known !== summary.total)
        return { reconciled: false, amount: null, currency: null };
      if (summary.currency !== summary.max_currency)
        return { reconciled: false, amount: null, currency: null };

      const amount = Number(summary.amount ?? 0);
      const existing = await db.prepare(
        `SELECT amount,currency FROM campaign_cost_snapshots
         WHERE campaign_id=?1 AND state='actual_from_meta'
         ORDER BY created_at DESC,id DESC LIMIT 1`,
      ).bind(campaignId).first<{ amount: number; currency: string | null }>();
      if (existing && existing.amount === amount && existing.currency === summary.currency)
        return { reconciled: true, amount, currency: summary.currency };

      await db.prepare(
        `INSERT INTO campaign_cost_snapshots
         (id,campaign_id,state,amount,currency,breakdown_json,assumptions_json,source)
         VALUES(?1,?2,'actual_from_meta',?3,?4,'[]','[]',?5)`,
      ).bind(crypto.randomUUID(), campaignId, amount, summary.currency, source).run();
      return { reconciled: true, amount, currency: summary.currency };
    },
  };
}
