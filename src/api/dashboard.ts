import { Hono } from 'hono'

export const dashboardRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => {
    const agg = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(sent),0) as sent, COALESCE(SUM(delivered),0) as delivered,
              COALESCE(SUM(read),0) as read, COALESCE(SUM(failed),0) as failed
       FROM campaigns WHERE created_at > datetime('now', '-30 day')`
    ).first<{ sent: number; delivered: number; read: number; failed: number }>()
    const recent = (await c.env.DB.prepare(
      'SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 5').all()).results
    return c.json({
      sent30d: agg!.sent,
      deliveryRate: agg!.sent ? agg!.delivered / agg!.sent : 0,
      readRate: agg!.sent ? agg!.read / agg!.sent : 0,
      failed30d: agg!.failed,
      recentCampaigns: recent,
    })
  })
