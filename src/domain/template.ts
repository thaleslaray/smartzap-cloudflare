export function templateRequiresParameters(components: unknown): boolean {
  try {
    if (!Array.isArray(components)) return true
    if (/{{\s*\d+\s*}}/.test(JSON.stringify(components))) return true
    for (const component of components) {
      if (!component || typeof component !== 'object') return true
      const value = component as { type?: unknown; format?: unknown; buttons?: unknown }
      const type = typeof value.type === 'string' ? value.type.toUpperCase() : ''
      const format = typeof value.format === 'string' ? value.format.toUpperCase() : ''
      // Headers de mídia/localização exigem componentes por envio, mesmo sem {{1}}.
      if (type === 'HEADER' && format && format !== 'TEXT') return true
      if (type === 'BUTTONS') {
        if (!Array.isArray(value.buttons)) return true
        for (const button of value.buttons) {
          if (!button || typeof button !== 'object') return true
          const buttonType = String((button as { type?: unknown }).type ?? '').toUpperCase()
          // Estes botões precisam de payload dinâmico ou contexto não modelado pelo MVP.
          if (['COPY_CODE', 'OTP', 'FLOW'].includes(buttonType)) return true
        }
      }
    }
    return false
  } catch {
    // Um payload que não pode ser serializado também não é seguro para o MVP,
    // que suporta exclusivamente templates estáticos.
    return true
  }
}
