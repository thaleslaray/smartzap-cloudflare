export function statusEventsDb(db: D1Database) {
  return {
    async insertMany(events: { message_id: string | null; status: string; raw: string }[]) {
      if (!events.length) return
      await db.batch(events.map((e) =>
        db.prepare('INSERT INTO status_events (message_id, status, raw) VALUES (?1, ?2, ?3)')
          .bind(e.message_id, e.status, e.raw)))
    },
  }
}
