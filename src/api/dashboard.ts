import { Hono } from "hono";

export const dashboardRoutes = new Hono<{ Bindings: Env }>()
  .get("/performance", async (c) => {
    const days = Math.min(
      365,
      Math.max(1, Number(c.req.query("rangeDays")) || 30),
    );
    const runs = (
      await c.env.DB.prepare(
        `SELECT c.id AS campaign_id,c.name,c.template_name,c.total,c.sent,c.delivered,c.read,c.failed,c.status,c.created_at,
          MIN(b.started_at) AS started_at,COALESCE(c.completed_at,MAX(b.completed_at)) AS completed_at,
          COUNT(b.id) AS batches,COALESCE(SUM(b.accepted_count),0) AS accepted
         FROM campaigns c LEFT JOIN campaign_batches b ON b.campaign_id=c.id
         WHERE c.created_at>=datetime('now',?1)
         GROUP BY c.id ORDER BY c.created_at DESC LIMIT 200`,
      )
        .bind(`-${days} day`)
        .all()
    ).results as Record<string, unknown>[];
    const throughputs = runs.map((run) => {
      const start = run.started_at ? Date.parse(String(run.started_at)) : NaN,
        end = run.completed_at ? Date.parse(String(run.completed_at)) : NaN,
        duration =
          Number.isFinite(start) && Number.isFinite(end)
            ? Math.max(0, end - start)
            : null;
      return {
        ...run,
        dispatch_duration_ms: duration,
        throughput_mps:
          duration && Number(run.sent) > 0
            ? Number(run.sent) / (duration / 1000)
            : null,
      };
    });
    const numeric = throughputs
      .map((run) => Number(run.throughput_mps))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const percentile = (p: number) =>
      numeric.length ? numeric[Math.floor((numeric.length - 1) * p)] : null;
    return c.json({
      rangeDays: days,
      totals: {
        runs: runs.length,
        throughput_mps: {
          median: percentile(0.5),
          p90: percentile(0.9),
          samples: numeric.length,
        },
        sent: runs.reduce((sum, row) => sum + Number(row.sent || 0), 0),
        failed: runs.reduce((sum, row) => sum + Number(row.failed || 0), 0),
      },
      runs: throughputs,
      hint: numeric.length
        ? "Métricas calculadas a partir das execuções registradas no D1."
        : "Execute campanhas para formar uma linha de base de performance.",
    });
  })
  .get("/", async (c) => {
    const agg = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(sent),0) as sent, COALESCE(SUM(delivered),0) as delivered,
              COALESCE(SUM(read),0) as read, COALESCE(SUM(failed),0) as failed
       FROM campaigns WHERE created_at > datetime('now', '-30 day')`,
    ).first<{
      sent: number;
      delivered: number;
      read: number;
      failed: number;
    }>();
    const recent = (
      await c.env.DB.prepare(
        "SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 5",
      ).all()
    ).results;
    const activeCampaigns =
      (
        await c.env.DB.prepare(
          "SELECT COUNT(*) AS n FROM campaigns WHERE status IN('scheduled','queued','sending')",
        ).first<{ n: number }>()
      )?.n ?? 0;
    const latestFailure = await c.env.DB.prepare(
      `SELECT c.id AS campaign_id, c.name AS campaign_name, c.failed AS failed_count,
              cc.error_code, cc.error_detail, cc.updated_at
       FROM campaigns c
       LEFT JOIN campaign_contacts cc
         ON cc.campaign_id = c.id AND cc.status = 'failed'
       WHERE c.created_at > datetime('now', '-30 day') AND c.failed > 0
       ORDER BY cc.updated_at DESC, c.created_at DESC
       LIMIT 1`,
    ).first<{
      campaign_id: string;
      campaign_name: string;
      failed_count: number;
      error_code: string | null;
      error_detail: string | null;
      updated_at: string | null;
    }>();
    const volume = (
      await c.env.DB.prepare(
        "SELECT substr(created_at,1,10) AS day,COALESCE(SUM(sent),0) AS sent,COALESCE(SUM(delivered),0) AS delivered FROM campaigns WHERE created_at>datetime('now','-30 day') GROUP BY substr(created_at,1,10) ORDER BY day",
      ).all()
    ).results;
    return c.json({
      sent30d: agg!.sent,
      deliveryRate: agg!.sent ? agg!.delivered / agg!.sent : 0,
      readRate: agg!.sent ? agg!.read / agg!.sent : 0,
      failed30d: agg!.failed,
      latestFailure: latestFailure
        ? {
            ...latestFailure,
            error_detail: latestFailure.error_detail?.slice(0, 180) ?? null,
          }
        : null,
      activeCampaigns,
      volume,
      recentCampaigns: recent,
    });
  });
