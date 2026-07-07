const GRAPH = 'https://graph.facebook.com/v24.0'

export type MetaTemplate = { name: string; language: string; category: string; status: string; components: unknown[] }
export type SendResult = { ok: true; messageId: string } | { ok: false; code: number; detail: string }

export function whatsappClient(creds: { token: string; phoneId: string }) {
  const headers = { authorization: `Bearer ${creds.token}`, 'content-type': 'application/json' }
  return {
    async sendTemplate(
      to: string,
      template: { name: string; language: string; components?: unknown[] },
    ): Promise<SendResult> {
      const res = await fetch(`${GRAPH}/${creds.phoneId}/messages`, {
        method: 'POST', headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp', to, type: 'template',
          template: {
            name: template.name,
            language: { code: template.language },
            ...(template.components ? { components: template.components } : {}),
          },
        }),
      })
      const data = (await res.json()) as {
        messages?: { id: string }[]; error?: { code: number; message: string }
      }
      if (res.ok && data.messages?.[0]) return { ok: true, messageId: data.messages[0].id }
      return { ok: false, code: data.error?.code ?? res.status, detail: data.error?.message ?? 'erro desconhecido' }
    },
    async fetchTemplates(wabaId: string): Promise<MetaTemplate[]> {
      const out: MetaTemplate[] = []
      let url: string | null = `${GRAPH}/${wabaId}/message_templates?limit=100&fields=name,language,category,status,components`
      while (url) {
        const res = await fetch(url, { headers })
        if (!res.ok) throw new Error(`Meta templates: HTTP ${res.status}`)
        const page = (await res.json()) as { data: MetaTemplate[]; paging?: { next?: string } }
        out.push(...page.data)
        url = page.paging?.next ?? null
      }
      return out
    },
  }
}
