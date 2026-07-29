// Evidência de consentimento (LGPD art. 8º): todo caminho que cria contato opt_in grava um evento.
export function consentEventsDb(db: D1Database) {
  return {
    async record(input: {
      source: 'import' | 'manual'; declarationText: string; contactId: string
      sourceDetail: string; purpose?: string; declarationVersion?: string
    }): Promise<void> {
      await db.prepare(
        `INSERT INTO consent_events
           (id, source, declaration_text, contact_count, contact_id, source_detail, purpose, declaration_version)
         VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?7)`
      ).bind(crypto.randomUUID(), input.source, input.declarationText, input.contactId,
        input.sourceDetail, input.purpose ?? 'marketing_messages',
        input.declarationVersion ?? 'smartzap-opt-in-v1').run()
    },
  }
}
