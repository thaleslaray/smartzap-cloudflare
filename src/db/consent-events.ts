// Evidência de consentimento (LGPD art. 8º): todo caminho que cria contato opt_in grava um evento.
export function consentEventsDb(db: D1Database) {
  return {
    async record(input: { source: 'import' | 'manual'; declarationText: string; contactCount: number }): Promise<void> {
      await db.prepare(
        'INSERT INTO consent_events (id, source, declaration_text, contact_count) VALUES (?1, ?2, ?3, ?4)'
      ).bind(crypto.randomUUID(), input.source, input.declarationText, input.contactCount).run()
    },
  }
}
